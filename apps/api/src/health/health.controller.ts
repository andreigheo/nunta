import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { ApiEnvironment } from "@weddingos/config";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { AsyncHealthService } from "./async-health.service";

@ApiTags("infrastructure")
@Controller()
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncHealthService)
    private readonly asyncHealth: AsyncHealthService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  @Get("health")
  @HttpCode(200)
  @ApiOperation({ summary: "Process liveness" })
  health() {
    return { status: "ok", service: "weddingos-api" };
  }

  @Get("ready")
  @ApiOperation({ summary: "Database-backed readiness" })
  async ready() {
    if (!(await this.database.isReady())) {
      throw new ServiceUnavailableException("Database is not ready");
    }
    const asyncState = await this.asyncHealth.state();
    const [identity, referenceState] = await Promise.all([
      this.database.databaseIdentity.findUnique({ where: { id: "singleton" } }),
      this.database.$queryRaw<Array<{ healthy: boolean }>>`
        SELECT public.weddingos_reference_data_healthy() AS healthy
      `,
    ]);
    const referencesHealthy = referenceState[0]?.healthy === true;
    const identityHealthy =
      identity?.databasePurpose === this.environment.DATABASE_PURPOSE &&
      identity?.environment === this.environment.NODE_ENV;
    return {
      status:
        asyncState.redis &&
        asyncState.worker &&
        referencesHealthy &&
        identityHealthy
          ? "ready"
          : "degraded",
      database: "connected",
      redis: asyncState.redis ? "connected" : "unavailable",
      worker: asyncState.worker ? "healthy" : "stale",
      lastWorkerHeartbeat: asyncState.lastWorkerHeartbeat,
      outbox:
        asyncState.redis && asyncState.worker ? "dispatching" : "buffering",
      databaseIdentity: identityHealthy ? "verified" : "mismatch",
      referenceData: referencesHealthy ? "verified" : "missing",
    };
  }

  @Get("api/v1/internal/metrics")
  @ApiOperation({
    summary: "Prometheus metrics for the protected internal network",
  })
  async metrics(
    @Headers("authorization") authorization: string | undefined,
    @Res() response: Response,
  ) {
    if (authorization !== `Bearer ${this.environment.METRICS_TOKEN}`) {
      response.status(403).type("text/plain").send("forbidden\n");
      return;
    }
    const [database, asyncState] = await Promise.all([
      this.database.isReady(),
      this.asyncHealth.state(),
    ]);
    const lines = [
      "# HELP weddingos_up Process health by dependency.",
      "# TYPE weddingos_up gauge",
      `weddingos_up{component="api"} 1`,
      `weddingos_up{component="database"} ${database ? 1 : 0}`,
      `weddingos_up{component="redis"} ${asyncState.redis ? 1 : 0}`,
      `weddingos_up{component="worker"} ${asyncState.worker ? 1 : 0}`,
      "# HELP weddingos_build_info Static build metadata with bounded labels.",
      "# TYPE weddingos_build_info gauge",
      `weddingos_build_info{environment="${this.environment.NODE_ENV}"} 1`,
      "",
    ];
    response
      .status(200)
      .type("text/plain; version=0.0.4")
      .send(lines.join("\n"));
  }
}

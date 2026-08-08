import type { OnModuleDestroy } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import IORedis from "ioredis";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";

@Injectable()
export class AsyncHealthService implements OnModuleDestroy {
  private readonly redis: IORedis;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {
    this.redis = new IORedis(environment.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      enableOfflineQueue: false,
    });
    this.redis.on("error", () => undefined);
  }

  async state() {
    const redis = await this.redisReady();
    const latest = await this.database.workerHeartbeat.findFirst({
      orderBy: { lastSeenAt: "desc" },
    });
    const worker = Boolean(
      latest &&
      Date.now() - latest.lastSeenAt.getTime() <=
        this.environment.WORKER_STALE_AFTER_SECONDS * 1_000,
    );
    return {
      redis,
      worker,
      lastWorkerHeartbeat: latest?.lastSeenAt.toISOString() ?? null,
    };
  }

  async onModuleDestroy() {
    if (this.redis.status !== "end")
      await this.redis.quit().catch(() => undefined);
  }

  private async redisReady(): Promise<boolean> {
    try {
      if (this.redis.status === "wait") await this.redis.connect();
      return (await this.redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}

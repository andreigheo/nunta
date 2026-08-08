import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import { apiResponse } from "../common/api-response";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import type { WeddingOsRequest } from "../common/http.types";

@Controller("api/v1/status")
export class PublicStatusController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  @Get()
  async status(@Req() request: WeddingOsRequest) {
    const maintenance = await this.database.platformMaintenanceWindow.findFirst(
      {
        where: {
          environment: this.environment.NODE_ENV,
          status: "ACTIVE",
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        select: {
          scope: true,
          scopeKey: true,
          message: true,
          supportUrl: true,
          endsAt: true,
        },
        orderBy: { startsAt: "desc" },
      },
    );
    return apiResponse(request, {
      status:
        maintenance?.scope === "FULL_PLATFORM" ? "MAINTENANCE" : "OPERATIONAL",
      maintenance: maintenance
        ? { ...maintenance, endsAt: maintenance.endsAt?.toISOString() ?? null }
        : null,
    });
  }
}

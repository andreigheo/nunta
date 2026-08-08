import {
  Controller,
  Get,
  Inject,
  Param,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { parseUuid } from "../common/validation";
import { JobsService } from "./jobs.service";

@ApiTags("jobs")
@ApiCookieAuth()
@Controller("api/v1/jobs")
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Get(":jobId")
  @UseGuards(SessionAuthGuard)
  async get(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("jobId") jobId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.jobs.get(auth.userId, parseUuid(jobId, "jobId")),
    );
  }

  @Get(":jobId/artifact")
  @UseGuards(SessionAuthGuard)
  async artifact(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("jobId") jobId: string,
    @Res() response: Response,
  ) {
    const artifact = await this.jobs.artifact(
      auth.userId,
      parseUuid(jobId, "jobId"),
    );
    response.type(artifact.mediaType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${artifact.fileName.replaceAll('"', "")}"`,
    );
    return response.sendFile(artifact.path);
  }
}

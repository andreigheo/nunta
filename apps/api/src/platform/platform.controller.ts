import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  createBackupSchema,
  createFeatureFlagSchema,
  createLegalDocumentSchema,
  createLegalHoldSchema,
  createRestoreSchema,
  createSupportCaseSchema,
  dataSubjectTransitionSchema,
  platformReasonSchema,
  releaseLegalHoldSchema,
  supportCaseTransitionSchema,
  supportNoteSchema,
  updateFeatureFlagSchema,
} from "@weddingos/contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AdminStepUpGuard, RequireAdminStepUp } from "../auth/step-up.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { parseUuid, parseWithSchema } from "../common/validation";
import { PlatformService } from "./platform.service";

const maintenanceWindowSchema = z.object({
  scope: z.enum(["FULL_PLATFORM", "MUTATIONS", "MODULE", "PROVIDER"]),
  scopeKey: z.string().trim().min(1).max(120).nullable().optional(),
  message: z.string().trim().min(8).max(1000),
  supportUrl: z.string().url().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(8).max(1000),
});

const maintenanceTransitionSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(8).max(1000),
});

const retentionRunSchema = z.object({
  policyId: z.string().uuid(),
  mode: z.enum(["DRY_RUN", "EXECUTE"]),
  limit: z.number().int().min(1).max(1000).default(250),
  confirmation: z.literal("EXECUTE_RETENTION").optional(),
  reason: z.string().trim().min(8).max(2000),
});

const deletionExecutionSchema = z.object({
  confirmation: z.literal("EXECUTE_DELETION"),
  reason: z.string().trim().min(8).max(2000),
});

const backupScheduleSchema = z.object({
  cronExpression: z.string().trim().min(5).max(80),
  timezone: z.string().trim().min(3).max(80),
  retentionDays: z.number().int().min(2).max(3650),
  minimumVerified: z.number().int().min(2).max(100),
  reason: z.string().trim().min(8).max(2000),
  version: z.number().int().positive(),
});

@ApiTags("platform-admin")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/platform")
export class PlatformController {
  constructor(
    @Inject(PlatformService) private readonly service: PlatformService,
  ) {}

  @Get("dashboard")
  async dashboard(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.dashboard(auth.userId));
  }

  @Get("system-status")
  async status(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.systemStatus(auth.userId));
  }

  @Get("maintenance-windows")
  async maintenanceWindows(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.maintenanceWindows(auth.userId),
    );
  }

  @Post("maintenance-windows")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("MAINTENANCE_CHANGE")
  async createMaintenanceWindow(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createMaintenanceWindow(
        auth.userId,
        parseWithSchema(maintenanceWindowSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("maintenance-windows/:windowId/activate")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("MAINTENANCE_CHANGE")
  async activateMaintenanceWindow(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("windowId") windowId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(maintenanceTransitionSchema, body);
    return apiResponse(
      request,
      await this.service.transitionMaintenanceWindow(
        auth.userId,
        parseUuid(windowId),
        "ACTIVE",
        input.version,
        input.reason,
        request.correlationId,
      ),
    );
  }

  @Post("maintenance-windows/:windowId/complete")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("MAINTENANCE_CHANGE")
  async completeMaintenanceWindow(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("windowId") windowId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(maintenanceTransitionSchema, body);
    return apiResponse(
      request,
      await this.service.transitionMaintenanceWindow(
        auth.userId,
        parseUuid(windowId),
        "COMPLETED",
        input.version,
        input.reason,
        request.correlationId,
      ),
    );
  }

  @Get("users")
  async users(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.users(auth.userId));
  }

  @Get("users/:userId")
  async user(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("userId") targetUserId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.user(auth.userId, parseUuid(targetUserId, "userId")),
    );
  }

  @Post("users/:userId/suspend")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("USER_SUSPEND")
  async suspendUser(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("userId") targetUserId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    const data = await this.service.changeUserStatus(
      auth.userId,
      parseUuid(targetUserId, "userId"),
      "SUSPENDED",
      resourceVersion(ifMatch, input.version),
      input.reason,
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("users/:userId/reactivate")
  async reactivateUser(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("userId") targetUserId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    const data = await this.service.changeUserStatus(
      auth.userId,
      parseUuid(targetUserId, "userId"),
      "ACTIVE",
      resourceVersion(ifMatch, input.version),
      input.reason,
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("workspaces")
  async workspaces(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.workspaces(auth.userId));
  }

  @Get("workspaces/:workspaceId")
  async workspace(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.workspace(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
      ),
    );
  }

  @Post("workspaces/:workspaceId/suspend")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("WORKSPACE_SUSPEND")
  async suspendWorkspace(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    const data = await this.service.changeWorkspaceStatus(
      auth.userId,
      parseUuid(workspaceId),
      "SUSPENDED",
      resourceVersion(ifMatch, input.version),
      input.reason,
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("workspaces/:workspaceId/reactivate")
  async reactivateWorkspace(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    const data = await this.service.changeWorkspaceStatus(
      auth.userId,
      parseUuid(workspaceId),
      "ACTIVE",
      resourceVersion(ifMatch, input.version),
      input.reason,
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("vendor-organizations")
  async vendors(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.vendors(auth.userId));
  }

  @Get("vendor-organizations/:organizationId")
  async vendor(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.vendor(auth.userId, parseUuid(organizationId)),
    );
  }

  @Post("vendor-organizations/:organizationId/suspend")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("VENDOR_SUSPEND")
  async suspendVendor(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    const data = await this.service.changeVendorStatus(
      auth.userId,
      parseUuid(organizationId),
      "SUSPENDED",
      resourceVersion(ifMatch, input.version),
      input.reason,
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("vendor-organizations/:organizationId/reactivate")
  async reactivateVendor(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    const data = await this.service.changeVendorStatus(
      auth.userId,
      parseUuid(organizationId),
      "ACTIVE",
      resourceVersion(ifMatch, input.version),
      input.reason,
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("support-cases")
  async supportCases(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.supportCases(auth.userId));
  }

  @Post("support-cases")
  async createSupportCase(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createSupportCase(
        auth.userId,
        parseWithSchema(createSupportCaseSchema, body),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Get("support-cases/:caseId")
  async supportCase(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("caseId") caseId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.supportCase(auth.userId, parseUuid(caseId)),
    );
  }

  @Post("support-cases/:caseId/transitions")
  async transitionSupportCase(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("caseId") caseId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionSupportCase(
      auth.userId,
      parseUuid(caseId),
      parseWithSchema(supportCaseTransitionSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("support-cases/:caseId/notes")
  async addSupportNote(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("caseId") caseId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(supportNoteSchema, body);
    return apiResponse(
      request,
      await this.service.addSupportNote(
        auth.userId,
        parseUuid(caseId),
        input.body,
        input.private,
      ),
    );
  }

  @Get("security-alerts")
  async securityAlerts(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.securityAlerts(auth.userId));
  }

  @Get("incidents")
  async incidents(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.incidents(auth.userId));
  }

  @Get("feature-flags")
  async featureFlags(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.featureFlags(auth.userId));
  }

  @Post("feature-flags")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("GLOBAL_FEATURE_FLAG")
  async createFeatureFlag(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createFeatureFlag(
        auth.userId,
        parseWithSchema(createFeatureFlagSchema, body),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Patch("feature-flags/:flagId")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("GLOBAL_FEATURE_FLAG")
  async updateFeatureFlag(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("flagId") flagId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateFeatureFlag(
      auth.userId,
      parseUuid(flagId),
      resourceVersion(ifMatch),
      parseWithSchema(updateFeatureFlagSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("legal-documents")
  async legalDocuments(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.legalDocuments(auth.userId));
  }

  @Post("legal-documents")
  async createLegalDocument(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createLegalDocument(
        auth.userId,
        parseWithSchema(createLegalDocumentSchema, body),
      ),
    );
  }

  @Post("legal-documents/:documentId/publish")
  async publishLegalDocument(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    return apiResponse(
      request,
      await this.service.publishLegalDocument(
        auth.userId,
        parseUuid(documentId),
        resourceVersion(ifMatch, input.version),
        input.reason,
        request.correlationId,
      ),
    );
  }

  @Get("data-subject-requests")
  async dataSubjectRequests(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.dataSubjectRequests(auth.userId),
    );
  }

  @Post("data-subject-requests/:requestId/transitions")
  async transitionDataSubjectRequest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionDataSubjectRequest(
      auth.userId,
      parseUuid(requestId),
      parseWithSchema(dataSubjectTransitionSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("legal-holds")
  async createLegalHold(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createLegalHold(
        auth.userId,
        parseWithSchema(createLegalHoldSchema, body),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Post("legal-holds/:holdId/release")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("LEGAL_HOLD_RELEASE")
  async releaseLegalHold(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("holdId") holdId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(releaseLegalHoldSchema, body);
    const data = await this.service.releaseLegalHold(
      auth.userId,
      parseUuid(holdId),
      input.version,
      input.reason,
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("retention-runs")
  async retentionRuns(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.retentionRuns(auth.userId));
  }

  @Post("retention-runs")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("RETENTION_EXECUTION")
  async createRetentionRun(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(retentionRunSchema, body);
    return apiResponse(
      request,
      await this.service.createRetentionRun(
        auth.userId,
        input,
        resourceVersion(ifMatch),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Post("deletion-requests/:requestId/execute")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("RETENTION_EXECUTION")
  async executeDeletion(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("requestId") requestId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(deletionExecutionSchema, body);
    return apiResponse(
      request,
      await this.service.executeDeletion(
        auth.userId,
        parseUuid(requestId),
        input.reason,
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Get("backups")
  async backups(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.backups(auth.userId));
  }

  @Get("backup-schedules")
  async backupSchedules(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.backupSchedules(auth.userId),
    );
  }

  @Patch("backup-schedules/:scheduleId")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("BACKUP_POLICY_CHANGE")
  async updateBackupSchedule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("scheduleId") scheduleId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.updateBackupSchedule(
        auth.userId,
        parseUuid(scheduleId),
        parseWithSchema(backupScheduleSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("backup-schedules/:scheduleId/pause")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("BACKUP_POLICY_CHANGE")
  async pauseBackupSchedule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("scheduleId") scheduleId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    return apiResponse(
      request,
      await this.service.setBackupScheduleEnabled(
        auth.userId,
        parseUuid(scheduleId),
        input.version,
        false,
        input.reason,
        request.correlationId,
      ),
    );
  }

  @Post("backup-schedules/:scheduleId/resume")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("BACKUP_POLICY_CHANGE")
  async resumeBackupSchedule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("scheduleId") scheduleId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    return apiResponse(
      request,
      await this.service.setBackupScheduleEnabled(
        auth.userId,
        parseUuid(scheduleId),
        input.version,
        true,
        input.reason,
        request.correlationId,
      ),
    );
  }

  @Post("backups")
  async createBackup(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(createBackupSchema, body);
    return apiResponse(
      request,
      await this.service.createBackup(
        auth.userId,
        input.backupType,
        input.reason,
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Get("backups/:backupId")
  async backup(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("backupId") backupId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.backup(auth.userId, parseUuid(backupId)),
    );
  }

  @Post("backups/:backupId/verify")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("RESTORE_APPROVAL")
  async verifyBackup(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("backupId") backupId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(platformReasonSchema, body);
    return apiResponse(
      request,
      await this.service.verifyBackup(
        auth.userId,
        parseUuid(backupId),
        input.reason,
        request.correlationId,
      ),
    );
  }

  @Get("restores")
  async restores(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.restores(auth.userId));
  }

  @Post("restores")
  @UseGuards(AdminStepUpGuard)
  @RequireAdminStepUp("RESTORE_APPROVAL")
  async createRestore(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(createRestoreSchema, body);
    return apiResponse(
      request,
      await this.service.createRestore(
        auth.userId,
        input.backupRunId,
        input.target,
        input.reason,
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Get("restores/:restoreId")
  async restore(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("restoreId") restoreId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.restore(auth.userId, parseUuid(restoreId)),
    );
  }

  @Get("releases")
  async releases(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.releaseCandidates(auth.userId),
    );
  }
}

function resourceVersion(header: string | undefined, fallback?: number) {
  if (header) {
    const normalized = header.replace(/^W\//, "").replace(/^"|"$/g, "");
    const value = Number(normalized);
    if (Number.isInteger(value) && value > 0) return value;
  }
  if (fallback && Number.isInteger(fallback) && fallback > 0) return fallback;
  return parseWithSchema(platformReasonSchema.shape.version, undefined);
}

function idempotencyKey(value: string | undefined) {
  return parseWithSchema(z.string().trim().min(8).max(200), value);
}

function versionOf(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    typeof value.version === "number"
  )
    return value.version;
  return undefined;
}

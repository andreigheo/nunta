import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  cancelSignatureEnvelopeSchema,
  completeUploadSessionSchema,
  createDocumentFolderSchema,
  createDocumentGrantSchema,
  createDocumentSchema,
  createDocumentVersionSchema,
  createOnlinePaymentRefundSchema,
  createPaymentCheckoutSchema,
  createSignatureEnvelopeSchema,
  createUploadSessionSchema,
  fakeSignatureActionSchema,
  fakePaymentActionSchema,
  paymentReconciliationSchema,
  updateDocumentFolderSchema,
  updateDocumentRetentionSchema,
  updateDocumentSchema,
} from "@weddingos/contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { problem } from "../common/problem";
import { parseUuid, parseWithSchema } from "../common/validation";
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { SecureCommerceService } from "./secure-commerce.service";

function uuid(value: string, name = "id") {
  return parseUuid(value, name);
}
function key(value: string | undefined) {
  if (!value?.trim() || value.length > 200)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key is required",
    );
  return value.trim();
}
function version(value: string | undefined) {
  const match = value?.trim().match(/^(?:W\/)?"?(\d+)"?$/);
  if (!match)
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match is required",
    );
  return Number(match[1]);
}
function owner(workspaceId?: string, vendorOrganizationId?: string) {
  if (Boolean(workspaceId) === Boolean(vendorOrganizationId))
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Exactly one tenant owner is required",
    );
  return {
    workspaceId: workspaceId ? uuid(workspaceId, "workspaceId") : undefined,
    vendorOrganizationId: vendorOrganizationId
      ? uuid(vendorOrganizationId, "vendorOrganizationId")
      : undefined,
  };
}

@ApiTags("secure-uploads")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/uploads")
export class UploadController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createUpload(
        auth.userId,
        key(idempotencyKey),
        parseWithSchema(createUploadSessionSchema, body),
      ),
    );
  }

  @Get(":uploadId")
  async get(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("uploadId") uploadId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.upload(auth.userId, uuid(uploadId, "uploadId")),
    );
  }

  @Post(":uploadId/complete")
  async complete(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("uploadId") uploadId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(completeUploadSessionSchema, body);
    return apiResponse(
      request,
      await this.service.completeUpload(
        auth.userId,
        uuid(uploadId, "uploadId"),
        input.checksumSha256,
        input.etag,
        request.correlationId,
      ),
    );
  }

  @Delete(":uploadId")
  async cancel(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("uploadId") uploadId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.cancelUpload(auth.userId, uuid(uploadId, "uploadId")),
    );
  }
}

@ApiTags("invitation-media")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/workspaces/:workspaceId/invitation-media")
export class InvitationMediaController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Get(":objectId")
  async view(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("objectId") objectId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.service.invitationMediaForWorkspace(
      auth.userId,
      uuid(workspaceId, "workspaceId"),
      uuid(objectId, "objectId"),
    );
    response.setHeader("Content-Type", media.contentType);
    response.setHeader("Cache-Control", "private, max-age=300");
    response.setHeader("Content-Disposition", "inline");
    return new StreamableFile(media.buffer);
  }
}

@ApiTags("guest-invitation-media")
@Controller("api/v1/guest/invitation-media")
export class GuestInvitationMediaController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Get(":objectId")
  async view(
    @Param("objectId") objectId: string,
    @Query("token") token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!token?.trim() || token.length > 512)
      problem(
        "TOKEN_INVALID",
        HttpStatus.UNAUTHORIZED,
        "Guest token is invalid",
      );
    const media = await this.service.invitationMediaForGuest(
      token.trim(),
      uuid(objectId, "objectId"),
    );
    response.setHeader("Content-Type", media.contentType);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.setHeader("Content-Disposition", "inline");
    return new StreamableFile(media.buffer);
  }
}

@ApiTags("vendor-portfolio-assets")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/vendor-organizations/:organizationId/portfolio-assets")
export class VendorPortfolioAssetController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.vendorPortfolioAssets(
        auth.userId,
        uuid(organizationId, "organizationId"),
      ),
    );
  }

  @Patch(":assetId")
  async update(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("assetId") assetId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = body as Record<string, unknown>;
    const title =
      input.title === undefined ? undefined : String(input.title).trim();
    const altText =
      input.altText === undefined ? undefined : String(input.altText).trim();
    const position =
      input.position === undefined ? undefined : Number(input.position);
    const published =
      input.published === undefined ? undefined : input.published === true;
    if (title !== undefined && (title.length < 1 || title.length > 180))
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Portfolio title is invalid",
      );
    if (altText !== undefined && (altText.length < 1 || altText.length > 500))
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Portfolio alternative text is invalid",
      );
    if (
      position !== undefined &&
      (!Number.isInteger(position) || position < 0 || position > 10_000)
    )
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Portfolio position is invalid",
      );
    const data = await this.service.updateVendorPortfolioAsset(
      auth.userId,
      uuid(organizationId, "organizationId"),
      uuid(assetId, "assetId"),
      version(ifMatch),
      { title, altText, position, published },
    );
    return apiResponse(request, data, { version: data.version });
  }
}

@ApiTags("marketplace")
@Controller("api/v1/marketplace/portfolio-assets")
export class PublicPortfolioAssetController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Get(":derivativeId")
  async asset(
    @Param("derivativeId") derivativeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const asset = await this.service.publicPortfolioAsset(
      uuid(derivativeId, "derivativeId"),
    );
    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("Content-Length", String(asset.bytes.byteLength));
    response.setHeader(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=60",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(asset.bytes);
  }
}

@ApiTags("document-vault")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/documents")
export class DocumentController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Query("search") search: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.documents(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        search,
      ),
    );
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    key(idempotencyKey);
    const raw = body as Record<string, unknown>;
    const tenant = owner(
      typeof raw.workspaceId === "string" ? raw.workspaceId : undefined,
      typeof raw.vendorOrganizationId === "string"
        ? raw.vendorOrganizationId
        : undefined,
    );
    const parsed = parseWithSchema(createDocumentSchema, raw);
    return apiResponse(
      request,
      await this.service.createDocument(
        auth.userId,
        tenant,
        parsed,
        request.correlationId,
      ),
    );
  }

  @Get(":documentId")
  async get(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.document(
      auth.userId,
      owner(workspaceId, vendorOrganizationId),
      uuid(documentId, "documentId"),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Patch(":documentId")
  async patch(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateDocument(
      auth.userId,
      owner(workspaceId, vendorOrganizationId),
      uuid(documentId, "documentId"),
      version(ifMatch),
      parseWithSchema(updateDocumentSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Post(":documentId/versions")
  async addVersion(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    key(idempotencyKey);
    const input = parseWithSchema(createDocumentVersionSchema, body);
    return apiResponse(
      request,
      await this.service.createDocumentVersion(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        uuid(documentId, "documentId"),
        input.uploadSessionId,
        version(ifMatch),
        request.correlationId,
      ),
    );
  }

  @Get(":documentId/versions")
  async versions(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.documentVersions(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        uuid(documentId, "documentId"),
      ),
    );
  }

  @Put(":documentId/retention")
  async retention(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const rawIfMatch = ifMatch?.trim();
    const expectedVersion = rawIfMatch ? version(rawIfMatch) : null;
    const data = await this.service.updateRetention(
      auth.userId,
      owner(workspaceId, vendorOrganizationId),
      uuid(documentId, "documentId"),
      expectedVersion,
      parseWithSchema(updateDocumentRetentionSchema, body),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Post(":documentId/downloads")
  async download(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.download(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        uuid(documentId, "documentId"),
        request.correlationId,
        request.ip,
        request.headers["user-agent"],
      ),
    );
  }

  @Post(":documentId/grants")
  async grant(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    key(idempotencyKey);
    return apiResponse(
      request,
      await this.service.grant(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        uuid(documentId, "documentId"),
        parseWithSchema(createDocumentGrantSchema, body),
        request.correlationId,
      ),
    );
  }

  @Delete(":documentId/grants/:grantId")
  async revoke(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Param("grantId") grantId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.revokeGrant(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        uuid(documentId, "documentId"),
        uuid(grantId, "grantId"),
        request.correlationId,
      ),
    );
  }

  @Get(":documentId/access-events")
  async access(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.accessLog(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        uuid(documentId, "documentId"),
      ),
    );
  }

  @Delete(":documentId")
  async remove(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("documentId") documentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.deleteDocument(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        uuid(documentId, "documentId"),
        request.correlationId,
      ),
    );
  }
}

@ApiTags("document-folders")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/document-folders")
export class DocumentFolderController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}
  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.folders(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
      ),
    );
  }
  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createFolder(
        auth.userId,
        owner(workspaceId, vendorOrganizationId),
        parseWithSchema(createDocumentFolderSchema, body),
      ),
    );
  }
  @Patch(":folderId")
  async update(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("folderId") folderId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateFolder(
      auth.userId,
      owner(workspaceId, vendorOrganizationId),
      uuid(folderId, "folderId"),
      version(ifMatch),
      parseWithSchema(updateDocumentFolderSchema, body),
    );
    return apiResponse(request, data, { version: data.version });
  }
  @Delete(":folderId")
  async remove(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("folderId") folderId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("vendorOrganizationId") vendorOrganizationId: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.deleteFolder(
      auth.userId,
      owner(workspaceId, vendorOrganizationId),
      uuid(folderId, "folderId"),
      version(ifMatch),
    );
    return apiResponse(request, data, { version: data.version });
  }
}

@ApiTags("contract-documents")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/workspaces/:workspaceId/contracts/:contractId/documents")
export class WorkspaceContractDocumentController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}
  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contractId") contractId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.contractDocuments(
        auth.userId,
        { workspaceId: uuid(workspaceId, "workspaceId") },
        uuid(contractId, "contractId"),
      ),
    );
  }
  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contractId") contractId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    key(idempotencyKey);
    const parsed = parseWithSchema(createDocumentSchema, body);
    return apiResponse(
      request,
      await this.service.createDocument(
        auth.userId,
        { workspaceId: uuid(workspaceId, "workspaceId") },
        {
          ...parsed,
          resourceType: "CONTRACT",
          resourceId: uuid(contractId, "contractId"),
        },
        request.correlationId,
      ),
    );
  }
  @Post("materializations")
  async materialize(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contractId") contractId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    key(idempotencyKey);
    const raw = body as Record<string, unknown>;
    return apiResponse(
      request,
      await this.service.materializeContractDocument(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(contractId, "contractId"),
        uuid(String(raw.contractVersionId ?? ""), "contractVersionId"),
        request.correlationId,
      ),
    );
  }
}

@ApiTags("vendor-contract-documents")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller(
  "api/v1/vendor-organizations/:organizationId/contracts/:contractId/documents",
)
export class VendorContractDocumentController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}
  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("contractId") contractId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.contractDocuments(
        auth.userId,
        { vendorOrganizationId: uuid(organizationId, "organizationId") },
        uuid(contractId, "contractId"),
      ),
    );
  }
  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("contractId") contractId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    key(idempotencyKey);
    const parsed = parseWithSchema(createDocumentSchema, body);
    return apiResponse(
      request,
      await this.service.createDocument(
        auth.userId,
        { vendorOrganizationId: uuid(organizationId, "organizationId") },
        {
          ...parsed,
          resourceType: "CONTRACT",
          resourceId: uuid(contractId, "contractId"),
        },
        request.correlationId,
      ),
    );
  }
}

@ApiTags("contract-signatures")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("signature.read")
@Controller(
  "api/v1/workspaces/:workspaceId/contracts/:contractId/signature-envelopes",
)
export class ContractSignatureController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}
  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contractId") contractId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.signaturesForContract(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(contractId, "contractId"),
      ),
    );
  }
  @Post()
  @RequireCapability("signature.create")
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contractId") contractId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createSignatureEnvelope(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        key(idempotencyKey),
        parseWithSchema(createSignatureEnvelopeSchema, body),
        request.correlationId,
        uuid(contractId, "contractId"),
      ),
    );
  }
}

@ApiTags("vendor-contract-signatures")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/vendor-organizations/:organizationId/signature-envelopes")
export class VendorSignatureController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}
  @Get(":envelopeId")
  async get(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("envelopeId") envelopeId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.signatureEnvelopeForVendor(
      auth.userId,
      uuid(organizationId, "organizationId"),
      uuid(envelopeId, "envelopeId"),
    );
    return apiResponse(request, data, { version: data.version });
  }
  @Post(":envelopeId/signing-link")
  async signingLink(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("envelopeId") envelopeId: string,
    @Req() request: WeddingOsRequest,
  ) {
    await this.service.signatureEnvelopeForVendor(
      auth.userId,
      uuid(organizationId, "organizationId"),
      uuid(envelopeId, "envelopeId"),
    );
    return apiResponse(
      request,
      await this.service.signerSession(
        auth.userId,
        uuid(envelopeId, "envelopeId"),
      ),
    );
  }
}

@ApiTags("online-payments")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("online_payment.read")
@Controller("api/v1/workspaces/:workspaceId")
export class OnlinePaymentController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}
  @Post("payment-checkouts")
  @RequireCapability("online_payment.create_checkout")
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createCheckout(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        key(idempotencyKey),
        parseWithSchema(createPaymentCheckoutSchema, body),
        request.correlationId,
      ),
    );
  }
  @Get("payment-checkouts")
  async checkouts(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.checkouts(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
      ),
    );
  }
  @Get("payment-checkouts/:checkoutId")
  async checkout(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("checkoutId") checkoutId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.checkout(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(checkoutId, "checkoutId"),
      ),
    );
  }
  @Post("payment-checkouts/:checkoutId/expire")
  @RequireCapability("online_payment.expire_checkout")
  async expire(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("checkoutId") checkoutId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.expireCheckout(
      auth.userId,
      uuid(workspaceId, "workspaceId"),
      uuid(checkoutId, "checkoutId"),
      version(ifMatch),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }
  @Get("online-payment-transactions")
  async transactions(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.transactions(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
      ),
    );
  }
  @Get("online-payment-transactions/:transactionId")
  async transaction(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("transactionId") transactionId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.transaction(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(transactionId, "transactionId"),
      ),
    );
  }
  @Get("online-payment-refunds")
  async refunds(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.refunds(auth.userId, uuid(workspaceId, "workspaceId")),
    );
  }
  @Get("online-payment-refunds/:refundId")
  async refundDetail(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("refundId") refundId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.refundDetail(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(refundId, "refundId"),
      ),
    );
  }

  @Post("payment-checkouts/:checkoutId/fake-actions")
  @RequireCapability("online_payment.create_checkout")
  async fakeAction(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("checkoutId") checkoutId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(fakePaymentActionSchema, body);
    return apiResponse(
      request,
      await this.service.fakePaymentAction(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(checkoutId, "checkoutId"),
        input.action,
        request.correlationId,
      ),
    );
  }

  @Post("online-payment-transactions/:transactionId/refunds")
  @RequireCapability("online_payment.request_refund")
  async refund(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("transactionId") transactionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(createOnlinePaymentRefundSchema, body);
    return apiResponse(
      request,
      await this.service.refund(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(transactionId, "transactionId"),
        key(idempotencyKey),
        version(ifMatch),
        input.amountMinor,
        input.reason,
        request.correlationId,
      ),
    );
  }
}

@ApiTags("provider-webhooks")
@Controller("api/v1/provider-webhooks")
export class ProviderWebhookController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Post("payments")
  async payment(
    @Headers("x-provider-signature") signature: string | undefined,
    @Headers("x-provider-timestamp") timestamp: string | undefined,
    @Req() request: WeddingOsRequest & { rawBody?: Buffer },
  ) {
    if (!request.rawBody)
      problem(
        "PAYMENT_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Raw provider payload is required",
      );
    const event = this.service.verifyPaymentWebhook(
      request.rawBody,
      signature,
      timestamp,
    );
    return apiResponse(
      request,
      await this.service.applyPaymentProviderEvent(
        event,
        request.correlationId,
      ),
    );
  }

  @Post("signatures")
  async signature(
    @Headers("x-provider-signature") signature: string | undefined,
    @Headers("x-provider-timestamp") timestamp: string | undefined,
    @Req() request: WeddingOsRequest & { rawBody?: Buffer },
  ) {
    if (!request.rawBody)
      problem(
        "SIGNATURE_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Raw provider payload is required",
      );
    const event = this.service.verifySignatureWebhook(
      request.rawBody,
      signature,
      timestamp,
    );
    return apiResponse(
      request,
      await this.service.applySignatureProviderEvent(
        event,
        request.correlationId,
      ),
    );
  }
}

@ApiTags("provider-webhooks")
@Controller("api/v1/webhooks")
export class CanonicalProviderWebhookController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Post("payments/:provider")
  async payment(
    @Param("provider") provider: string,
    @Headers("x-provider-signature") signature: string | undefined,
    @Headers("x-provider-timestamp") timestamp: string | undefined,
    @Req() request: WeddingOsRequest & { rawBody?: Buffer },
  ) {
    if (!request.rawBody)
      problem(
        "PAYMENT_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Raw provider payload is required",
      );
    const event = this.service.verifyPaymentProviderWebhook(
      provider,
      request.rawBody,
      signature,
      timestamp,
    );
    return apiResponse(
      request,
      await this.service.applyPaymentProviderEvent(
        event,
        request.correlationId,
      ),
    );
  }

  @Post("electronic-signature/:provider")
  async signature(
    @Param("provider") provider: string,
    @Headers("x-provider-signature") signature: string | undefined,
    @Headers("x-provider-timestamp") timestamp: string | undefined,
    @Req() request: WeddingOsRequest & { rawBody?: Buffer },
  ) {
    if (!request.rawBody)
      problem(
        "SIGNATURE_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Raw provider payload is required",
      );
    const event = this.service.verifySignatureProviderWebhook(
      provider,
      request.rawBody,
      signature,
      timestamp,
    );
    return apiResponse(
      request,
      await this.service.applySignatureProviderEvent(
        event,
        request.correlationId,
      ),
    );
  }
}

@ApiTags("internal-reconciliation")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/internal")
export class PaymentReconciliationController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}
  @Post("payment-reconciliation")
  async reconcile(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(paymentReconciliationSchema, body);
    return apiResponse(
      request,
      await this.service.reconcilePayments(
        auth.userId,
        input.workspaceId,
        request.correlationId,
      ),
    );
  }
}

@ApiTags("electronic-signatures")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("signature.read")
@Controller("api/v1/workspaces/:workspaceId/signature-envelopes")
export class SignatureController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.signaturesForWorkspace(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
      ),
    );
  }

  @Get("signer-candidates")
  @RequireCapability("signature.create")
  async candidates(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("contractVersionId") contractVersionId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.signatureCandidates(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(contractVersionId, "contractVersionId"),
      ),
    );
  }

  @Post()
  @RequireCapability("signature.create")
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createSignatureEnvelope(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        key(idempotencyKey),
        parseWithSchema(createSignatureEnvelopeSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get(":envelopeId")
  async get(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("envelopeId") envelopeId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.signatureEnvelope(
      auth.userId,
      uuid(workspaceId, "workspaceId"),
      uuid(envelopeId, "envelopeId"),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Post(":envelopeId/send")
  @RequireCapability("signature.send")
  async send(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("envelopeId") envelopeId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    key(idempotencyKey);
    const data = await this.service.sendEnvelope(
      auth.userId,
      uuid(workspaceId, "workspaceId"),
      uuid(envelopeId, "envelopeId"),
      version(ifMatch),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Post(":envelopeId/cancel")
  @RequireCapability("signature.cancel")
  async cancel(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("envelopeId") envelopeId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(cancelSignatureEnvelopeSchema, body);
    const data = await this.service.cancelEnvelope(
      auth.userId,
      uuid(workspaceId, "workspaceId"),
      uuid(envelopeId, "envelopeId"),
      version(ifMatch),
      input.reason,
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Get(":envelopeId/evidence")
  @RequireCapability("signature.download_evidence")
  async evidence(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("envelopeId") envelopeId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.signatureEvidence(
        auth.userId,
        { workspaceId: uuid(workspaceId, "workspaceId") },
        uuid(envelopeId, "envelopeId"),
      ),
    );
  }

  @Post(":envelopeId/signing-session")
  @RequireCapability("signature.sign")
  async signingSession(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("envelopeId") envelopeId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.signingSession(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(envelopeId, "envelopeId"),
      ),
    );
  }

  @Post(":envelopeId/fake-actions")
  @RequireCapability("signature.sign")
  async fakeAction(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("envelopeId") envelopeId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(fakeSignatureActionSchema, body);
    return apiResponse(
      request,
      await this.service.fakeSignatureAction(
        auth.userId,
        uuid(workspaceId, "workspaceId"),
        uuid(envelopeId, "envelopeId"),
        input.signerId,
        input.action,
        input.reason,
        request.correlationId,
      ),
    );
  }
}

@ApiTags("electronic-signature-signer")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/signature-signing-sessions")
export class SignatureSignerController {
  constructor(
    @Inject(SecureCommerceService)
    private readonly service: SecureCommerceService,
  ) {}

  @Post(":envelopeId")
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("envelopeId") envelopeId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.signerSession(
        auth.userId,
        uuid(envelopeId, "envelopeId"),
      ),
    );
  }

  @Post(":envelopeId/fake-actions")
  async fakeAction(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("envelopeId") envelopeId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(fakeSignatureActionSchema, body);
    return apiResponse(
      request,
      await this.service.signerFakeAction(
        auth.userId,
        uuid(envelopeId, "envelopeId"),
        input.signerId,
        input.action,
        input.reason,
        request.correlationId,
      ),
    );
  }
}

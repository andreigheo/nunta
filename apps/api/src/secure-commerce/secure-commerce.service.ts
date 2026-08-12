import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import {
  capabilityKeySchema,
  normalizeUploadFileName,
  type CapabilityKey,
  type CreateUploadSession,
} from "@weddingos/contracts";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { resolveCapabilities } from "../workspaces/capability.guard";
import {
  capabilityAllowedByWorkspacePlan,
  effectiveWorkspacePlanKey,
  minimumPlanForCapability,
  workspacePlan,
} from "../workspace-billing/workspace-billing.catalog";
import {
  OBJECT_STORAGE,
  PAYMENT_PROVIDER,
  SIGNATURE_PROVIDER,
  type ElectronicSignatureProvider,
  type ObjectStorageProvider,
  type OnlinePaymentProvider,
  type VerifiedProviderEvent,
} from "./providers";
import { hashToken } from "../guests/sensitive.crypto";
import { resolvedInvitationContainsMedia } from "../guests/invitation-resolution";

type Owner = { workspaceId?: string; vendorOrganizationId?: string };
type DocumentInput = {
  uploadSessionId: string;
  title: string;
  description?: string | null;
  folderId?: string | null;
  documentType:
    | "CONTRACT"
    | "CONTRACT_ATTACHMENT"
    | "BOOKING_DOCUMENT"
    | "PAYMENT_EVIDENCE"
    | "EXPENSE_RECEIPT"
    | "VENDOR_LEGAL_DOCUMENT"
    | "VENDOR_PORTFOLIO_ASSET"
    | "OTHER";
  classification:
    | "GENERAL"
    | "COMMERCIAL"
    | "FINANCIAL"
    | "CONTRACTUAL"
    | "SENSITIVE"
    | "VENDOR_PRIVATE"
    | "WEDDING_PRIVATE"
    | "SHARED_PARTIES";
  resourceType?: string;
  resourceId?: string;
};

const uploadPolicy = {
  CONTRACT_ATTACHMENT: {
    types: ["application/pdf"],
    maximum: 25 * 1024 * 1024,
  },
  BOOKING_DOCUMENT: { types: ["application/pdf"], maximum: 25 * 1024 * 1024 },
  EXPENSE_RECEIPT: {
    types: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maximum: 15 * 1024 * 1024,
  },
  PAYMENT_EVIDENCE: {
    types: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maximum: 15 * 1024 * 1024,
  },
  VENDOR_PORTFOLIO_IMAGE: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maximum: 20 * 1024 * 1024,
  },
  VENDOR_LEGAL_DOCUMENT: {
    types: ["application/pdf"],
    maximum: 25 * 1024 * 1024,
  },
  GENERAL_COMMERCIAL_DOCUMENT: {
    types: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/plain",
    ],
    maximum: 25 * 1024 * 1024,
  },
  INVITATION_MEDIA: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maximum: 20 * 1024 * 1024,
  },
  PROFILE_IMAGE: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maximum: 10 * 1024 * 1024,
  },
} as const;

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as T;
}

function onboardingCoupleContainsMedia(value: unknown, objectId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const couple = value as Record<string, unknown>;
  return (
    couple.partnerOnePhotoId === objectId ||
    couple.partnerTwoPhotoId === objectId
  );
}

function deterministicPdf(title: string, lines: string[]): Buffer {
  const escape = (value: string) =>
    value
      .normalize("NFKC")
      .replace(/[^\x20-\x7e]/g, "?")
      .replace(/[\\()]/g, "\\$&");
  const content = [
    `BT /F1 16 Tf 50 790 Td (${escape(title)}) Tj`,
    ...lines
      .slice(0, 38)
      .map((line) => `0 -18 Td /F1 9 Tf (${escape(line.slice(0, 110))}) Tj`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

@Injectable()
export class SecureCommerceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageProvider,
    @Inject(SIGNATURE_PROVIDER)
    private readonly signatures: ElectronicSignatureProvider,
    @Inject(PAYMENT_PROVIDER) private readonly payments: OnlinePaymentProvider,
  ) {}

  private context(userId: string, owner: Owner) {
    return { userId, ...owner };
  }

  private async requireCapability(
    userId: string,
    owner: Owner,
    capability: CapabilityKey,
  ): Promise<void> {
    if (owner.workspaceId) {
      const membership = await this.database.withContext(
        this.context(userId, owner),
        (tx) =>
          tx.workspaceMembership.findFirst({
            where: { workspaceId: owner.workspaceId, userId, status: "ACTIVE" },
            include: {
              roleTemplate: true,
              overrides: true,
              workspace: { include: { subscription: true } },
            },
          }),
      );
      if (!membership)
        problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Workspace access denied");
      const roleAllowed = resolveCapabilities(
        membership.roleTemplate.capabilities,
        membership.overrides,
      ).includes(capability);
      if (!roleAllowed)
        problem(
          "FORBIDDEN",
          HttpStatus.FORBIDDEN,
          "Workspace capability required",
          undefined,
          undefined,
          { requiredCapability: capability },
        );
      const planKey = effectiveWorkspacePlanKey(
        membership.workspace.subscription?.planKey,
        membership.workspace.subscription?.status,
      );
      if (!capabilityAllowedByWorkspacePlan(capability, planKey)) {
        const minimumPlan = minimumPlanForCapability(capability);
        problem(
          "PLAN_UPGRADE_REQUIRED",
          HttpStatus.PAYMENT_REQUIRED,
          "Funcția nu este inclusă în planul curent",
          minimumPlan
            ? `Acțiunea necesită planul ${workspacePlan(minimumPlan).name}.`
            : "Această acțiune nu este disponibilă prin abonamentele Sarbato.",
        );
      }
      return;
    }
    if (owner.vendorOrganizationId) {
      const authorization = await this.database.withContext(
        this.context(userId, owner),
        async (tx) => {
          const membership = await tx.vendorOrganizationMembership.findFirst({
            where: {
              vendorOrganizationId: owner.vendorOrganizationId,
              userId,
              status: "ACTIVE",
            },
          });
          if (!membership) return null;
          const [role, overrides] = await Promise.all([
            tx.vendorRoleTemplate.findUnique({
              where: { id: membership.roleTemplateId },
            }),
            tx.vendorMembershipCapabilityOverride.findMany({
              where: { membershipId: membership.id },
            }),
          ]);
          return { role, overrides };
        },
      );
      const effective = new Set<CapabilityKey>();
      if (
        authorization?.role &&
        Array.isArray(authorization.role.capabilities)
      ) {
        for (const candidate of authorization.role.capabilities) {
          const parsed = capabilityKeySchema.safeParse(candidate);
          if (parsed.success) effective.add(parsed.data);
        }
        for (const override of authorization.overrides) {
          const parsed = capabilityKeySchema.safeParse(override.capability);
          if (parsed.success) {
            if (override.effect === "ALLOW") effective.add(parsed.data);
            else effective.delete(parsed.data);
          }
        }
      }
      if (!effective.has(capability))
        problem(
          "FORBIDDEN",
          HttpStatus.FORBIDDEN,
          "Vendor capability required",
          undefined,
          undefined,
          { requiredCapability: capability },
        );
      return;
    }
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "A tenant owner is required",
    );
  }

  private async documentAccessContext(
    userId: string,
    actingOwner: Owner,
    documentId: string,
    capability: "document.read" | "document.download",
    acceptedPermissions: Array<"READ" | "DOWNLOAD" | "MANAGE" | "SHARE">,
  ) {
    await this.requireCapability(userId, actingOwner, capability);
    const rows = await this.database.$queryRaw<
      Array<{
        workspace_id: string | null;
        vendor_organization_id: string | null;
      }>
    >`
      SELECT * FROM public.weddingos_resolve_document_tenant(${documentId}::uuid, ${userId}::uuid)
    `;
    const resolved = rows[0];
    if (!resolved)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
    const context = {
      userId,
      workspaceId: resolved.workspace_id ?? actingOwner.workspaceId,
      vendorOrganizationId:
        resolved.vendor_organization_id ?? actingOwner.vendorOrganizationId,
    };
    const authorized = await this.database.withContext(context, async (tx) => {
      const document = await tx.vaultDocument.findUnique({
        where: { id: documentId },
      });
      if (!document || document.deletedAt) return false;
      const isOwner =
        (actingOwner.workspaceId &&
          document.workspaceId === actingOwner.workspaceId) ||
        (actingOwner.vendorOrganizationId &&
          document.vendorOrganizationId === actingOwner.vendorOrganizationId);
      if (isOwner) return true;
      const actingTenantId =
        actingOwner.workspaceId ?? actingOwner.vendorOrganizationId!;
      return Boolean(
        await tx.documentAccessGrant.findFirst({
          where: {
            documentId,
            granteeId: actingTenantId,
            permission: { in: acceptedPermissions },
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        }),
      );
    });
    if (!authorized)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
    return {
      ...context,
      sourceOwner: {
        workspaceId: resolved.workspace_id ?? undefined,
        vendorOrganizationId: resolved.vendor_organization_id ?? undefined,
      },
    };
  }

  async createUpload(
    userId: string,
    idempotencyKey: string,
    input: CreateUploadSession,
  ) {
    const owner: Owner = {
      workspaceId: input.workspaceId,
      vendorOrganizationId: input.vendorOrganizationId,
    };
    await this.requireCapability(
      userId,
      owner,
      input.purpose === "INVITATION_MEDIA"
        ? "invitation.write"
        : input.purpose === "PROFILE_IMAGE"
          ? "workspace.update"
          : "document.upload",
    );
    const policy = uploadPolicy[input.purpose];
    if (!(policy.types as readonly string[]).includes(input.contentType))
      problem(
        "UNSUPPORTED_MEDIA_TYPE",
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "This file type is not allowed for the selected purpose",
      );
    if (
      input.sizeBytes >
      Math.min(policy.maximum, this.environment.DOCUMENT_MAX_BYTES)
    )
      problem(
        "UPLOAD_MISMATCH",
        HttpStatus.PAYLOAD_TOO_LARGE,
        "File exceeds the upload limit",
      );
    const fileName = normalizeUploadFileName(input.originalFileName);
    if (!fileName)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "File name is invalid",
      );
    const created = await this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const replay = await tx.fileUploadSession.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        if (replay) {
          const object = replay.storageObjectId
            ? await tx.storedObject.findUnique({
                where: { id: replay.storageObjectId },
              })
            : null;
          return { session: replay, object, replay: true };
        }
        if (owner.workspaceId) {
          const [subscription, stored] = await Promise.all([
            tx.workspaceSubscription.findUnique({
              where: { workspaceId: owner.workspaceId },
              select: { planKey: true, status: true },
            }),
            tx.storedObject.aggregate({
              where: {
                workspaceId: owner.workspaceId,
                deletedAt: null,
                status: { not: "DELETED" },
              },
              _sum: { sizeBytes: true },
            }),
          ]);
          const planKey = effectiveWorkspacePlanKey(
            subscription?.planKey,
            subscription?.status,
          );
          const storageLimit = Number(
            workspacePlan(planKey).entitlements.STORAGE_BYTES ?? 0,
          );
          const storageUsed = Number(stored._sum.sizeBytes ?? 0n);
          if (storageUsed + input.sizeBytes > storageLimit)
            problem(
              "USAGE_LIMIT_REACHED",
              HttpStatus.CONFLICT,
              "Limita de stocare a planului a fost atinsă",
              `Planul curent permite ${Math.round(storageLimit / 1024 / 1024)} MB. Poți schimba planul din Setări → Abonament.`,
            );
        }
        const sessionId = randomUUID();
        const objectId = randomUUID();
        const tenant = owner.workspaceId ?? owner.vendorOrganizationId!;
        const objectKey = `private/${owner.workspaceId ? "workspaces" : "vendors"}/${tenant}/${new Date().toISOString().slice(0, 10)}/${objectId}`;
        const object = await tx.storedObject.create({
          data: {
            id: objectId,
            ...owner,
            storageProvider: this.environment.OBJECT_STORAGE_PROVIDER,
            bucket: this.environment.OBJECT_STORAGE_BUCKET,
            objectKey,
            originalFileName: fileName,
            contentTypeClaimed: input.contentType,
            sizeBytes: BigInt(input.sizeBytes),
            checksumSha256: input.checksumSha256,
            createdByUserId: userId,
          },
        });
        const session = await tx.fileUploadSession.create({
          data: {
            id: sessionId,
            userId,
            ...owner,
            purpose: input.purpose,
            expectedContentTypes: [...policy.types],
            maximumSizeBytes: BigInt(policy.maximum),
            originalFileName: fileName,
            claimedContentType: input.contentType,
            expectedChecksum: input.checksumSha256,
            status: "UPLOADING",
            storageObjectId: object.id,
            expiresAt: new Date(
              Date.now() +
                this.environment.OBJECT_STORAGE_UPLOAD_TTL_SECONDS * 1000,
            ),
            idempotencyKey,
          },
        });
        return { session, object, replay: false };
      },
    );
    if (!created.object)
      problem(
        "INTERNAL_ERROR",
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Upload storage record is missing",
      );
    if (created.session.expiresAt <= new Date())
      problem("UPLOAD_EXPIRED", HttpStatus.GONE, "Upload session expired");
    const target = await this.storage.createUpload({
      key: created.object.objectKey,
      contentType: created.session.claimedContentType,
      expiresInSeconds: Math.max(
        1,
        Math.floor((created.session.expiresAt.getTime() - Date.now()) / 1000),
      ),
    });
    return jsonSafe({
      id: created.session.id,
      purpose: created.session.purpose,
      status: created.session.status,
      fileName: created.session.originalFileName,
      maximumSizeBytes: created.session.maximumSizeBytes,
      expiresAt: created.session.expiresAt,
      version: created.session.version,
      upload: target,
      replayed: created.replay,
    });
  }

  async upload(userId: string, uploadId: string) {
    const result = await this.database.withContext({ userId }, async (tx) => {
      const session = await tx.fileUploadSession.findUnique({
        where: { id: uploadId },
      });
      const object = session?.storageObjectId
        ? await tx.storedObject.findUnique({
            where: { id: session.storageObjectId },
          })
        : null;
      return { session, object };
    });
    const { session, object } = result;
    if (!session || session.userId !== userId)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Upload session not found");
    return jsonSafe({
      ...session,
      objectStatus: object?.status ?? null,
      scanStatus: object?.scanStatus ?? null,
      contentType:
        object?.contentTypeDetected ?? object?.contentTypeClaimed ?? null,
    });
  }

  async invitationMediaForWorkspace(
    userId: string,
    workspaceId: string,
    objectId: string,
  ) {
    const result = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const object = await tx.storedObject.findFirst({
          where: { id: objectId, workspaceId, deletedAt: null },
        });
        const session = object
          ? await tx.fileUploadSession.findFirst({
              where: { storageObjectId: object.id, workspaceId },
            })
          : null;
        const onboarding =
          session?.purpose === "PROFILE_IMAGE"
            ? await tx.onboardingDraft.findUnique({
                where: { workspaceId },
                select: { couple: true },
              })
            : null;
        return { object, session, onboarding };
      },
    );
    if (result.session?.purpose === "PROFILE_IMAGE") {
      await this.requireCapability(userId, { workspaceId }, "workspace.read");
      if (!onboardingCoupleContainsMedia(result.onboarding?.couple, objectId))
        problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Profile image not found");
    } else {
      await this.requireCapability(userId, { workspaceId }, "invitation.write");
    }
    return this.readInvitationMedia(result.object);
  }

  async invitationMediaForGuest(token: string, objectId: string) {
    const tokenHash = hashToken(token);
    const object = await this.database.withContext(
      { guestTokenHash: tokenHash },
      async (tx) => {
        const grant = await tx.guestAccessGrant.findUnique({
          where: { tokenHash },
        });
        if (
          !grant ||
          grant.revokedAt ||
          (grant.expiresAt && grant.expiresAt <= new Date())
        )
          problem(
            "TOKEN_INVALID",
            HttpStatus.UNAUTHORIZED,
            "Guest token is invalid",
          );
        await this.database.setTransactionContext(tx, {
          workspaceId: grant.workspaceId,
          guestTokenHash: tokenHash,
          guestAccessGrantId: grant.id,
        });
        const recipient = await tx.invitationRecipient.findUnique({
          where: { id: grant.invitationRecipientId },
        });
        const site = recipient
          ? await tx.invitationSite.findFirst({
              where: {
                id: recipient.invitationSiteId,
                workspaceId: grant.workspaceId,
                status: "PUBLISHED",
              },
            })
          : null;
        const version = site?.publishedVersionId
          ? await tx.invitationVersion.findUnique({
              where: { id: site.publishedVersionId },
            })
          : null;
        const variant = recipient?.invitationVariantId
          ? await tx.invitationVariant.findFirst({
              where: {
                id: recipient.invitationVariantId,
                invitationSiteId: recipient.invitationSiteId,
                workspaceId: grant.workspaceId,
                status: "ACTIVE",
              },
            })
          : null;
        const variantVersion = variant?.publishedVersionId
          ? await tx.invitationVariantVersion.findUnique({
              where: { id: variant.publishedVersionId },
            })
          : null;
        if (
          !version ||
          (variantVersion &&
            (variantVersion.invitationVariantId !== variant?.id ||
              variantVersion.baseInvitationVersionId !== version.id ||
              variantVersion.workspaceId !== grant.workspaceId ||
              !variantVersion.publishedAt)) ||
          !resolvedInvitationContainsMedia(
            version.document,
            version.settings,
            variantVersion?.overrides,
            objectId,
          )
        )
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Invitation media not found",
          );
        await this.database.setTransactionContext(tx, {
          workspaceId: grant.workspaceId,
          guestTokenHash: tokenHash,
          guestAccessGrantId: grant.id,
          invitationMediaObjectId: objectId,
        });
        return tx.storedObject.findFirst({
          where: {
            id: objectId,
            workspaceId: grant.workspaceId,
            deletedAt: null,
          },
        });
      },
    );
    return this.readInvitationMedia(object);
  }

  private async readInvitationMedia(
    object: {
      objectKey: string;
      status: string;
      contentTypeDetected: string | null;
      contentTypeClaimed: string;
      sizeBytes: bigint | null;
    } | null,
  ) {
    if (!object)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation media not found");
    if (object.status !== "AVAILABLE")
      problem(
        "DOCUMENT_NOT_AVAILABLE",
        HttpStatus.CONFLICT,
        "Invitation media is still being verified",
      );
    const contentType = object.contentTypeDetected ?? object.contentTypeClaimed;
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType))
      problem(
        "UNSUPPORTED_MEDIA_TYPE",
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "Invitation media type is not supported",
      );
    return {
      buffer: await this.storage.downloadBuffer(
        object.objectKey,
        Math.min(Number(object.sizeBytes ?? 20_971_520n), 20_971_520),
      ),
      contentType,
    };
  }

  async cancelUpload(userId: string, uploadId: string) {
    const session = await this.database.withContext({ userId }, (tx) =>
      tx.fileUploadSession.findUnique({ where: { id: uploadId } }),
    );
    if (!session || session.userId !== userId || !session.storageObjectId)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Upload session not found");
    if (session.status === "COMPLETED")
      problem(
        "VERSION_CONFLICT",
        HttpStatus.CONFLICT,
        "A completed upload cannot be cancelled",
      );
    if (session.status === "CANCELLED") return jsonSafe(session);
    const owner = {
      workspaceId: session.workspaceId ?? undefined,
      vendorOrganizationId: session.vendorOrganizationId ?? undefined,
    };
    const result = await this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const updated = await tx.fileUploadSession.update({
          where: { id: uploadId },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        const object = await tx.storedObject.update({
          where: { id: session.storageObjectId! },
          data: { status: "REJECTED" },
        });
        return { updated, objectKey: object.objectKey };
      },
    );
    await this.storage.deleteObject(result.objectKey);
    await this.database.withContext(this.context(userId, owner), (tx) =>
      tx.storedObject.update({
        where: { id: session.storageObjectId! },
        data: { status: "DELETED", deletedAt: new Date() },
      }),
    );
    return jsonSafe(result.updated);
  }

  async completeUpload(
    userId: string,
    uploadId: string,
    checksum: string,
    etag: string | undefined,
    correlationId: string,
  ) {
    const session = await this.database.withContext({ userId }, (tx) =>
      tx.fileUploadSession.findUnique({ where: { id: uploadId } }),
    );
    if (!session || session.userId !== userId || !session.storageObjectId)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Upload session not found");
    if (session.status === "COMPLETED") return jsonSafe(session);
    if (session.expiresAt <= new Date())
      problem("UPLOAD_EXPIRED", HttpStatus.GONE, "Upload session expired");
    if (checksum !== session.expectedChecksum)
      problem(
        "UPLOAD_MISMATCH",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Upload checksum does not match the authorization",
      );
    const owner = {
      workspaceId: session.workspaceId ?? undefined,
      vendorOrganizationId: session.vendorOrganizationId ?? undefined,
    };
    const object = await this.database.withContext(
      this.context(userId, owner),
      (tx) =>
        tx.storedObject.findUnique({ where: { id: session.storageObjectId! } }),
    );
    if (!object)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Stored object not found");
    const head = await this.storage.headObject(object.objectKey);
    if (
      head.sizeBytes <= 0 ||
      head.sizeBytes > Number(session.maximumSizeBytes) ||
      head.sizeBytes !== Number(object.sizeBytes)
    )
      problem(
        "UPLOAD_MISMATCH",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Uploaded object size does not match the authorization",
      );
    if (
      head.contentType &&
      !session.expectedContentTypes.includes(head.contentType)
    )
      problem(
        "UPLOAD_MISMATCH",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Uploaded object content type does not match the authorization",
      );
    const result = await this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const updated = await tx.fileUploadSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await tx.storedObject.update({
          where: { id: object.id },
          data: {
            status: "VERIFYING",
            scanStatus: "PENDING",
            etag: head.etag ?? etag,
            sizeBytes: BigInt(head.sizeBytes),
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "storage.upload_completed.v1",
          aggregateType: "StoredObject",
          aggregateId: object.id,
          workspaceId: session.workspaceId ?? undefined,
          vendorOrganizationId: session.vendorOrganizationId ?? undefined,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `scan:${object.id}:${session.version + 1}`,
          payload: {
            subject: { uploadSessionId: session.id },
            documentScan: {
              storedObjectId: object.id,
              uploadSessionId: session.id,
            },
          },
        });
        return updated;
      },
    );
    return jsonSafe(result);
  }

  async vendorPortfolioAssets(userId: string, vendorOrganizationId: string) {
    const owner = { vendorOrganizationId };
    await this.requireCapability(userId, owner, "document.read");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const references = await tx.vendorPortfolioReference.findMany({
          where: { vendorOrganizationId, deletedAt: null },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        });
        const items = await Promise.all(
          references.map(async (reference) => {
            const derivative = await tx.documentDerivative.findFirst({
              where: { id: reference.artifactId, vendorOrganizationId },
            });
            const source = derivative
              ? await tx.storedObject.findUnique({
                  where: { id: derivative.sourceStoredObjectId },
                })
              : null;
            return {
              ...reference,
              derivative: derivative
                ? {
                    id: derivative.id,
                    kind: derivative.kind,
                    width: derivative.width,
                    height: derivative.height,
                    status: derivative.status,
                  }
                : null,
              sourceStatus: source?.status ?? "PROCESSING",
              scanStatus: source?.scanStatus ?? "PENDING",
              url:
                reference.published && derivative?.status === "AVAILABLE"
                  ? `/api/v1/marketplace/portfolio-assets/${reference.artifactId}`
                  : null,
            };
          }),
        );
        return { items };
      },
    );
  }

  async updateVendorPortfolioAsset(
    userId: string,
    vendorOrganizationId: string,
    assetId: string,
    expectedVersion: number,
    input: {
      title?: string;
      altText?: string;
      position?: number;
      published?: boolean;
    },
  ) {
    const owner = { vendorOrganizationId };
    await this.requireCapability(userId, owner, "document.write");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const current = await tx.vendorPortfolioReference.findFirst({
          where: { id: assetId, vendorOrganizationId, deletedAt: null },
        });
        if (!current)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Portfolio asset not found",
          );
        if (current.version !== expectedVersion)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Portfolio asset version is stale",
          );
        if (input.published) {
          const derivative = await tx.documentDerivative.findFirst({
            where: {
              id: current.artifactId,
              vendorOrganizationId,
              status: "AVAILABLE",
            },
          });
          const source = derivative
            ? await tx.storedObject.findFirst({
                where: {
                  id: derivative.sourceStoredObjectId,
                  status: "AVAILABLE",
                  scanStatus: "CLEAN",
                },
              })
            : null;
          if (!derivative || !source)
            problem(
              "DOCUMENT_NOT_AVAILABLE",
              HttpStatus.CONFLICT,
              "Only a clean generated derivative can be published",
            );
        }
        const updated = await tx.vendorPortfolioReference.update({
          where: { id: current.id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.altText !== undefined ? { altText: input.altText } : {}),
            ...(input.position !== undefined
              ? { position: input.position }
              : {}),
            ...(input.published !== undefined
              ? { published: input.published }
              : {}),
            version: { increment: 1 },
          },
        });
        return {
          ...updated,
          url: updated.published
            ? `/api/v1/marketplace/portfolio-assets/${updated.artifactId}`
            : null,
        };
      },
    );
  }

  async publicPortfolioAsset(derivativeId: string) {
    const rows = await this.database.$queryRaw<
      Array<{ object_key: string; content_type: string }>
    >`
      SELECT * FROM public.weddingos_public_portfolio_asset(${derivativeId}::uuid)
    `;
    const asset = rows[0];
    if (!asset)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Portfolio asset not found");
    return {
      bytes: await this.storage.downloadBuffer(
        asset.object_key,
        15 * 1024 * 1024,
      ),
      contentType: asset.content_type,
    };
  }

  async createDocument(
    userId: string,
    owner: Owner,
    input: DocumentInput,
    correlationId: string,
  ) {
    await this.requireCapability(userId, owner, "document.write");
    return jsonSafe(
      await this.database.withContext(
        this.context(userId, owner),
        async (tx) => {
          const session = await tx.fileUploadSession.findUnique({
            where: { id: input.uploadSessionId },
          });
          if (
            !session ||
            session.status !== "COMPLETED" ||
            !session.storageObjectId ||
            session.workspaceId !== (owner.workspaceId ?? null) ||
            session.vendorOrganizationId !==
              (owner.vendorOrganizationId ?? null)
          )
            problem(
              "UPLOAD_MISMATCH",
              HttpStatus.CONFLICT,
              "A completed upload owned by this tenant is required",
            );
          const candidateObject = await tx.storedObject.findUnique({
            where: { id: session.storageObjectId },
          });
          if (!candidateObject)
            problem(
              "NOT_FOUND",
              HttpStatus.NOT_FOUND,
              "Stored object not found",
            );
          // Serialize document materialization with the worker's terminal scan
          // update. Without this lock the scan can finish after our first read
          // but before the document version is visible, leaving the document in
          // PROCESSING even though its object is already AVAILABLE/QUARANTINED.
          await tx.$queryRaw`
            SELECT id
            FROM stored_objects
            WHERE id = ${candidateObject.id}::uuid
            FOR UPDATE
          `;
          const object = await tx.storedObject.findUnique({
            where: { id: candidateObject.id },
          });
          if (!object)
            problem(
              "NOT_FOUND",
              HttpStatus.NOT_FOUND,
              "Stored object not found",
            );
          const existingVersion = await tx.documentVersion.findFirst({
            where: { storedObjectId: object.id },
          });
          if (existingVersion) {
            const existingDocument = await tx.vaultDocument.findUnique({
              where: { id: existingVersion.documentId },
            });
            if (existingDocument)
              return {
                ...existingDocument,
                currentVersion: existingVersion,
                replayed: true,
              };
          }
          const document = await tx.vaultDocument.create({
            data: {
              ...owner,
              title: input.title,
              description: input.description,
              folderId: input.folderId,
              documentType: input.documentType,
              classification: input.classification,
              status:
                object.status === "AVAILABLE"
                  ? "AVAILABLE"
                  : object.status === "QUARANTINED"
                    ? "QUARANTINED"
                    : "PROCESSING",
              createdById: userId,
            },
          });
          const version = await tx.documentVersion.create({
            data: {
              ...owner,
              documentId: document.id,
              versionNumber: 1,
              storedObjectId: object.id,
              contentHash: object.checksumSha256!,
              fileNameSnapshot: object.originalFileName,
              contentType:
                object.contentTypeDetected ?? object.contentTypeClaimed,
              sizeBytes: object.sizeBytes!,
              createdById: userId,
            },
          });
          await tx.vaultDocument.update({
            where: { id: document.id },
            data: { currentVersionId: version.id },
          });
          if (input.resourceType && input.resourceId)
            await tx.documentResourceLink.create({
              data: {
                ...owner,
                documentId: document.id,
                resourceType: input.resourceType,
                resourceId: input.resourceId,
                createdById: userId,
              },
            });
          await this.asyncEvents.record(tx, {
            eventName: "document.created.v1",
            aggregateType: "VaultDocument",
            aggregateId: document.id,
            workspaceId: owner.workspaceId,
            vendorOrganizationId: owner.vendorOrganizationId,
            actorUserId: userId,
            correlationId,
            deduplicationKey: `document-created:${document.id}`,
            payload: {
              subject: {
                documentId: document.id,
                documentVersionId: version.id,
              },
              documentNotificationProjection: { documentId: document.id },
              ...(owner.workspaceId
                ? {
                    documentTextExtraction: {
                      documentId: document.id,
                      documentVersionId: version.id,
                    },
                  }
                : {}),
            },
          });
          return { ...document, currentVersion: version, replayed: false };
        },
      ),
    );
  }

  async documents(userId: string, owner: Owner, search?: string) {
    await this.requireCapability(userId, owner, "document.read");
    const rows = await this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const actingTenantId = owner.workspaceId ?? owner.vendorOrganizationId!;
        const grants = await tx.documentAccessGrant.findMany({
          where: {
            granteeId: actingTenantId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { documentId: true },
        });
        return tx.vaultDocument.findMany({
          where: {
            deletedAt: null,
            OR: [
              { ...owner },
              { id: { in: grants.map((grant) => grant.documentId) } },
            ],
            ...(search
              ? { title: { contains: search, mode: "insensitive" } }
              : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        });
      },
    );
    return jsonSafe({ items: rows, nextCursor: null });
  }

  async document(userId: string, owner: Owner, documentId: string) {
    const access = await this.documentAccessContext(
      userId,
      owner,
      documentId,
      "document.read",
      ["READ", "DOWNLOAD", "MANAGE", "SHARE"],
    );
    const row = await this.database.withContext(access, (tx) =>
      tx.vaultDocument.findFirst({
        where: { id: documentId, deletedAt: null },
      }),
    );
    if (!row) problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
    const details = await this.database.withContext(access, async (tx) => ({
      ...row,
      versions: await tx.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNumber: "desc" },
      }),
      links: await tx.documentResourceLink.findMany({ where: { documentId } }),
      grants: await tx.documentAccessGrant.findMany({
        where: { documentId, revokedAt: null },
      }),
    }));
    return jsonSafe(details);
  }

  async updateDocument(
    userId: string,
    owner: Owner,
    documentId: string,
    expectedVersion: number,
    input: {
      title?: string;
      description?: string | null;
      folderId?: string | null;
      classification?:
        | "GENERAL"
        | "COMMERCIAL"
        | "FINANCIAL"
        | "CONTRACTUAL"
        | "SENSITIVE"
        | "VENDOR_PRIVATE"
        | "WEDDING_PRIVATE"
        | "SHARED_PARTIES";
      status?: "ARCHIVED" | "AVAILABLE";
    },
    correlationId: string,
  ) {
    await this.requireCapability(userId, owner, "document.write");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        if (input.status === "AVAILABLE") {
          const current = await tx.vaultDocument.findFirst({
            where: { id: documentId, ...owner, deletedAt: null },
          });
          if (!current)
            problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
          const currentVersion = current.currentVersionId
            ? await tx.documentVersion.findUnique({
                where: { id: current.currentVersionId },
              })
            : null;
          const storedObject = currentVersion
            ? await tx.storedObject.findUnique({
                where: { id: currentVersion.storedObjectId },
              })
            : null;
          if (
            !storedObject ||
            storedObject.status !== "AVAILABLE" ||
            !["CLEAN", "NOT_REQUIRED"].includes(storedObject.scanStatus)
          )
            problem(
              "DOCUMENT_NOT_AVAILABLE",
              HttpStatus.CONFLICT,
              "Document cannot be restored until its content is verified",
            );
        }
        const updated = await tx.vaultDocument.updateMany({
          where: {
            id: documentId,
            ...owner,
            version: expectedVersion,
            deletedAt: null,
          },
          data: { ...input, version: { increment: 1 } },
        });
        if (!updated.count) {
          const exists = await tx.vaultDocument.findFirst({
            where: { id: documentId, ...owner, deletedAt: null },
            select: { version: true },
          });
          if (!exists)
            problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Document version is stale",
            undefined,
            undefined,
            { latestVersion: exists.version },
          );
        }
        const document = await tx.vaultDocument.findUniqueOrThrow({
          where: { id: documentId },
        });
        if (input.status === "ARCHIVED")
          await this.asyncEvents.record(tx, {
            eventName: "document.archived.v1",
            aggregateType: "VaultDocument",
            aggregateId: documentId,
            aggregateVersion: document.version,
            workspaceId: owner.workspaceId,
            vendorOrganizationId: owner.vendorOrganizationId,
            actorUserId: userId,
            correlationId,
            deduplicationKey: `document-archived:${documentId}:${document.version}`,
            payload: { subject: { documentId } },
          });
        return document;
      },
    );
  }

  async createDocumentVersion(
    userId: string,
    owner: Owner,
    documentId: string,
    uploadSessionId: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    await this.requireCapability(userId, owner, "document.write");
    return jsonSafe(
      await this.database.withContext(
        this.context(userId, owner),
        async (tx) => {
          const document = await tx.vaultDocument.findFirst({
            where: { id: documentId, ...owner, deletedAt: null },
          });
          if (!document)
            problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
          if (document.version !== expectedVersion)
            problem(
              "VERSION_CONFLICT",
              HttpStatus.PRECONDITION_FAILED,
              "Document version is stale",
              undefined,
              undefined,
              { latestVersion: document.version },
            );
          const session = await tx.fileUploadSession.findUnique({
            where: { id: uploadSessionId },
          });
          if (
            !session ||
            session.status !== "COMPLETED" ||
            !session.storageObjectId ||
            session.workspaceId !== (owner.workspaceId ?? null) ||
            session.vendorOrganizationId !==
              (owner.vendorOrganizationId ?? null)
          )
            problem(
              "UPLOAD_MISMATCH",
              HttpStatus.CONFLICT,
              "A completed upload owned by this tenant is required",
            );
          const object = await tx.storedObject.findUnique({
            where: { id: session.storageObjectId },
          });
          if (!object?.checksumSha256 || object.sizeBytes === null)
            problem(
              "DOCUMENT_NOT_AVAILABLE",
              HttpStatus.CONFLICT,
              "Uploaded object metadata is incomplete",
            );
          const replay = await tx.documentVersion.findFirst({
            where: { documentId, storedObjectId: object.id },
          });
          if (replay) return replay;
          const latest = await tx.documentVersion.findFirst({
            where: { documentId },
            orderBy: { versionNumber: "desc" },
          });
          const version = await tx.documentVersion.create({
            data: {
              ...owner,
              documentId,
              versionNumber: (latest?.versionNumber ?? 0) + 1,
              storedObjectId: object.id,
              contentHash: object.checksumSha256,
              fileNameSnapshot: object.originalFileName,
              contentType:
                object.contentTypeDetected ?? object.contentTypeClaimed,
              sizeBytes: object.sizeBytes,
              createdById: userId,
            },
          });
          await tx.vaultDocument.update({
            where: { id: documentId },
            data: {
              currentVersionId: version.id,
              status:
                object.status === "AVAILABLE" ? "AVAILABLE" : "PROCESSING",
              version: { increment: 1 },
            },
          });
          await this.asyncEvents.record(tx, {
            eventName: "document.version_created.v1",
            aggregateType: "VaultDocument",
            aggregateId: documentId,
            aggregateVersion: document.version + 1,
            workspaceId: owner.workspaceId,
            vendorOrganizationId: owner.vendorOrganizationId,
            actorUserId: userId,
            correlationId,
            deduplicationKey: `document-version:${version.id}`,
            payload: {
              subject: { documentId, documentVersionId: version.id },
              ...(owner.workspaceId
                ? {
                    documentTextExtraction: {
                      documentId,
                      documentVersionId: version.id,
                    },
                  }
                : {}),
            },
          });
          return version;
        },
      ),
    );
  }

  async documentVersions(userId: string, owner: Owner, documentId: string) {
    const access = await this.documentAccessContext(
      userId,
      owner,
      documentId,
      "document.read",
      ["READ", "DOWNLOAD", "MANAGE", "SHARE"],
    );
    return jsonSafe(
      await this.database.withContext(access, (tx) =>
        tx.documentVersion.findMany({
          where: { documentId },
          orderBy: { versionNumber: "desc" },
        }),
      ),
    );
  }

  async download(
    userId: string,
    owner: Owner,
    documentId: string,
    correlationId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const access = await this.documentAccessContext(
      userId,
      owner,
      documentId,
      "document.download",
      ["DOWNLOAD", "MANAGE", "SHARE"],
    );
    const data = await this.database.withContext(access, async (tx) => {
      const document = await tx.vaultDocument.findFirst({
        where: { id: documentId, deletedAt: null },
      });
      if (!document?.currentVersionId)
        problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
      const version = await tx.documentVersion.findUnique({
        where: { id: document.currentVersionId },
      });
      const object = version
        ? await tx.storedObject.findUnique({
            where: { id: version.storedObjectId },
          })
        : null;
      if (!version || !object)
        problem(
          "NOT_FOUND",
          HttpStatus.NOT_FOUND,
          "Document content not found",
        );
      if (object.status === "QUARANTINED" || object.scanStatus === "INFECTED")
        problem(
          "DOCUMENT_QUARANTINED",
          HttpStatus.LOCKED,
          "Document is quarantined",
        );
      if (
        object.status !== "AVAILABLE" ||
        !["CLEAN", "NOT_REQUIRED"].includes(object.scanStatus)
      )
        problem(
          "DOCUMENT_NOT_AVAILABLE",
          HttpStatus.CONFLICT,
          "Document is still being verified",
        );
      await tx.documentAccessEvent.create({
        data: {
          workspaceId: access.sourceOwner.workspaceId,
          vendorOrganizationId:
            access.sourceOwner.vendorOrganizationId ??
            owner.vendorOrganizationId,
          documentId,
          documentVersionId: version.id,
          actorUserId: userId,
          actorType: "USER",
          action: "DOWNLOAD",
          ipHash: ip
            ? createHash("sha256").update(ip).digest("hex")
            : undefined,
          userAgentHash: userAgent
            ? createHash("sha256").update(userAgent).digest("hex")
            : undefined,
          correlationId,
        },
      });
      await this.asyncEvents.record(tx, {
        eventName: "document.downloaded.v1",
        aggregateType: "VaultDocument",
        aggregateId: documentId,
        workspaceId: access.sourceOwner.workspaceId,
        vendorOrganizationId: access.sourceOwner.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        deduplicationKey: `document-download:${correlationId}`,
        payload: { subject: { documentId, documentVersionId: version.id } },
      });
      return { object, version };
    });
    return this.storage.createDownload({
      key: data.object.objectKey,
      fileName: data.version.fileNameSnapshot,
      contentType: data.version.contentType,
      expiresInSeconds: this.environment.OBJECT_STORAGE_DOWNLOAD_TTL_SECONDS,
    });
  }

  async folders(userId: string, owner: Owner) {
    await this.requireCapability(userId, owner, "document.read");
    return this.database.withContext(this.context(userId, owner), (tx) =>
      tx.documentFolder.findMany({
        where: { ...owner, deletedAt: null },
        orderBy: { name: "asc" },
      }),
    );
  }

  async createFolder(
    userId: string,
    owner: Owner,
    input: {
      name: string;
      parentFolderId?: string | null;
      classification:
        | "GENERAL"
        | "COMMERCIAL"
        | "FINANCIAL"
        | "CONTRACTUAL"
        | "SENSITIVE"
        | "VENDOR_PRIVATE"
        | "WEDDING_PRIVATE"
        | "SHARED_PARTIES";
    },
  ) {
    await this.requireCapability(userId, owner, "document.write");
    return this.database.withContext(this.context(userId, owner), (tx) =>
      tx.documentFolder.create({ data: { ...owner, ...input } }),
    );
  }

  async updateFolder(
    userId: string,
    owner: Owner,
    folderId: string,
    expectedVersion: number,
    input: {
      name?: string;
      parentFolderId?: string | null;
      classification?:
        | "GENERAL"
        | "COMMERCIAL"
        | "FINANCIAL"
        | "CONTRACTUAL"
        | "SENSITIVE"
        | "VENDOR_PRIVATE"
        | "WEDDING_PRIVATE"
        | "SHARED_PARTIES";
    },
  ) {
    await this.requireCapability(userId, owner, "document.write");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        if (input.parentFolderId === folderId)
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "A folder cannot be its own parent",
          );
        const result = await tx.documentFolder.updateMany({
          where: {
            id: folderId,
            ...owner,
            version: expectedVersion,
            deletedAt: null,
          },
          data: { ...input, version: { increment: 1 } },
        });
        if (!result.count)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Folder version is stale or unavailable",
          );
        return tx.documentFolder.findUniqueOrThrow({ where: { id: folderId } });
      },
    );
  }

  async deleteFolder(
    userId: string,
    owner: Owner,
    folderId: string,
    expectedVersion: number,
  ) {
    await this.requireCapability(userId, owner, "document.write");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const [children, documents] = await Promise.all([
          tx.documentFolder.count({
            where: { parentFolderId: folderId, ...owner, deletedAt: null },
          }),
          tx.vaultDocument.count({
            where: { folderId, ...owner, deletedAt: null },
          }),
        ]);
        if (children || documents)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            `Folder must be empty before deletion (${children} child folders, ${documents} documents)`,
          );
        const result = await tx.documentFolder.updateMany({
          where: {
            id: folderId,
            ...owner,
            version: expectedVersion,
            deletedAt: null,
          },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (!result.count)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Folder version is stale or unavailable",
          );
        return tx.documentFolder.findUniqueOrThrow({ where: { id: folderId } });
      },
    );
  }

  async updateRetention(
    userId: string,
    owner: Owner,
    documentId: string,
    expectedVersion: number | null,
    input: {
      retentionDays: number;
      legalHold: boolean;
      reviewAt?: string | null;
    },
  ) {
    await this.requireCapability(userId, owner, "document.manage_retention");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const document = await tx.vaultDocument.findFirst({
          where: { id: documentId, ...owner, deletedAt: null },
        });
        if (!document)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
        const existing = await tx.documentRetentionPolicy.findUnique({
          where: { documentId },
        });
        if (existing && expectedVersion === null)
          problem(
            "PRECONDITION_REQUIRED",
            HttpStatus.PRECONDITION_REQUIRED,
            "If-Match is required",
          );
        if (existing && existing.version !== expectedVersion)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Retention version is stale",
            undefined,
            undefined,
            { latestVersion: existing.version },
          );
        const purgeAfter = new Date(
          Date.now() + input.retentionDays * 86_400_000,
        );
        return existing
          ? tx.documentRetentionPolicy.update({
              where: { documentId },
              data: {
                retentionDays: input.retentionDays,
                legalHold: input.legalHold,
                reviewAt: input.reviewAt ? new Date(input.reviewAt) : null,
                purgeAfter,
                updatedById: userId,
                version: { increment: 1 },
              },
            })
          : tx.documentRetentionPolicy.create({
              data: {
                ...owner,
                documentId,
                retentionDays: input.retentionDays,
                legalHold: input.legalHold,
                reviewAt: input.reviewAt ? new Date(input.reviewAt) : null,
                purgeAfter,
                updatedById: userId,
              },
            });
      },
    );
  }

  async grant(
    userId: string,
    owner: Owner,
    documentId: string,
    input: {
      granteeType:
        | "USER"
        | "WORKSPACE"
        | "VENDOR_ORGANIZATION"
        | "CONTRACT_PARTY"
        | "BOOKING_PARTY";
      granteeId: string;
      permission: "READ" | "DOWNLOAD" | "MANAGE" | "SHARE";
      expiresAt?: string | null;
    },
    correlationId: string,
  ) {
    await this.requireCapability(userId, owner, "document.share");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const document = await tx.vaultDocument.findFirst({
          where: { id: documentId, ...owner, deletedAt: null },
        });
        if (!document)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
        const links = await tx.documentResourceLink.findMany({
          where: { documentId },
        });
        const relatedWorkspaceIds = new Set<string>(
          owner.workspaceId ? [owner.workspaceId] : [],
        );
        const relatedVendorIds = new Set<string>(
          owner.vendorOrganizationId ? [owner.vendorOrganizationId] : [],
        );
        for (const link of links) {
          if (link.resourceType === "CONTRACT") {
            const contract = await tx.vendorContract.findUnique({
              where: { id: link.resourceId },
              select: { workspaceId: true, vendorOrganizationId: true },
            });
            if (contract) {
              relatedWorkspaceIds.add(contract.workspaceId);
              relatedVendorIds.add(contract.vendorOrganizationId);
            }
          } else if (link.resourceType === "CONTRACT_VERSION") {
            const contractVersion = await tx.vendorContractVersion.findUnique({
              where: { id: link.resourceId },
              select: { workspaceId: true, contractId: true },
            });
            const contract = contractVersion
              ? await tx.vendorContract.findUnique({
                  where: { id: contractVersion.contractId },
                  select: { vendorOrganizationId: true },
                })
              : null;
            if (contractVersion)
              relatedWorkspaceIds.add(contractVersion.workspaceId);
            if (contract) relatedVendorIds.add(contract.vendorOrganizationId);
          } else if (link.resourceType === "BOOKING") {
            const booking = await tx.vendorBooking.findUnique({
              where: { id: link.resourceId },
              select: { workspaceId: true, vendorOrganizationId: true },
            });
            if (booking) {
              relatedWorkspaceIds.add(booking.workspaceId);
              relatedVendorIds.add(booking.vendorOrganizationId);
            }
          } else if (
            ["VENDOR_PROFILE", "VENDOR_ORGANIZATION"].includes(
              link.resourceType,
            )
          )
            relatedVendorIds.add(link.resourceId);
        }
        let validGrantee = false;
        if (input.granteeType === "WORKSPACE")
          validGrantee = relatedWorkspaceIds.has(input.granteeId);
        else if (input.granteeType === "VENDOR_ORGANIZATION")
          validGrantee = relatedVendorIds.has(input.granteeId);
        else if (
          ["CONTRACT_PARTY", "BOOKING_PARTY"].includes(input.granteeType)
        )
          validGrantee =
            relatedWorkspaceIds.has(input.granteeId) ||
            relatedVendorIds.has(input.granteeId);
        else {
          const [workspaceMembership, vendorMembership] = await Promise.all([
            tx.workspaceMembership.findFirst({
              where: {
                userId: input.granteeId,
                workspaceId: { in: [...relatedWorkspaceIds] },
                status: "ACTIVE",
              },
            }),
            tx.vendorOrganizationMembership.findFirst({
              where: {
                userId: input.granteeId,
                vendorOrganizationId: { in: [...relatedVendorIds] },
                status: "ACTIVE",
              },
            }),
          ]);
          validGrantee = Boolean(workspaceMembership || vendorMembership);
        }
        if (!validGrantee)
          problem(
            "FORBIDDEN",
            HttpStatus.FORBIDDEN,
            "Document can only be shared with a persisted related party",
          );
        const grant = await tx.documentAccessGrant.upsert({
          where: {
            documentId_granteeType_granteeId_permission: {
              documentId,
              granteeType: input.granteeType,
              granteeId: input.granteeId,
              permission: input.permission,
            },
          },
          create: {
            ...owner,
            documentId,
            ...input,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            createdById: userId,
          },
          update: {
            revokedAt: null,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "document.shared.v1",
          aggregateType: "VaultDocument",
          aggregateId: documentId,
          workspaceId: owner.workspaceId,
          vendorOrganizationId: owner.vendorOrganizationId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `document-grant:${grant.id}:${grant.createdAt.toISOString()}`,
          payload: { subject: { documentId, grantId: grant.id } },
        });
        return grant;
      },
    );
  }

  async revokeGrant(
    userId: string,
    owner: Owner,
    documentId: string,
    grantId: string,
    correlationId: string,
  ) {
    await this.requireCapability(userId, owner, "document.share");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const grant = await tx.documentAccessGrant.findFirst({
          where: { id: grantId, documentId, ...owner },
        });
        if (!grant)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Document grant not found",
          );
        const result = await tx.documentAccessGrant.update({
          where: { id: grantId },
          data: { revokedAt: new Date() },
        });
        await this.asyncEvents.record(tx, {
          eventName: "document.grant_revoked.v1",
          aggregateType: "VaultDocument",
          aggregateId: documentId,
          workspaceId: owner.workspaceId,
          vendorOrganizationId: owner.vendorOrganizationId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `document-revoke:${grantId}`,
          payload: { subject: { documentId, grantId } },
        });
        return result;
      },
    );
  }

  async accessLog(userId: string, owner: Owner, documentId: string) {
    await this.requireCapability(userId, owner, "document.view_access_log");
    return this.database.withContext(this.context(userId, owner), (tx) =>
      tx.documentAccessEvent.findMany({
        where: { documentId, ...owner },
        orderBy: { occurredAt: "desc" },
        take: 200,
      }),
    );
  }

  async deleteDocument(
    userId: string,
    owner: Owner,
    documentId: string,
    correlationId: string,
  ) {
    await this.requireCapability(userId, owner, "document.delete");
    return this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const document = await tx.vaultDocument.findFirst({
          where: { id: documentId, ...owner, deletedAt: null },
        });
        if (!document)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Document not found");
        const retention = await tx.documentRetentionPolicy.findUnique({
          where: { documentId },
        });
        if (
          retention?.legalHold ||
          (retention?.purgeAfter && retention.purgeAfter > new Date())
        )
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            "Document retention policy prevents deletion",
          );
        const updated = await tx.vaultDocument.update({
          where: { id: documentId },
          data: {
            status: "DELETED",
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "document.delete_requested.v1",
          aggregateType: "VaultDocument",
          aggregateId: documentId,
          workspaceId: owner.workspaceId,
          vendorOrganizationId: owner.vendorOrganizationId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `document-delete:${documentId}`,
          payload: { subject: { documentId }, documentCleanup: { documentId } },
        });
        return updated;
      },
    );
  }

  private async materializeContract(
    userId: string,
    workspaceId: string,
    contractVersionId: string,
  ) {
    const source = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const version = await tx.vendorContractVersion.findFirst({
          where: { id: contractVersionId, workspaceId },
        });
        if (!version)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Contract version not found",
          );
        const contract = await tx.vendorContract.findFirst({
          where: { id: version.contractId, workspaceId },
        });
        if (!contract)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Contract not found");
        const existing = await tx.contractDocumentMaterialization.findUnique({
          where: { contractVersionId },
        });
        return { version, contract, existing };
      },
    );
    if (source.existing) return source.existing;
    const serialized = JSON.stringify(source.version.document, null, 2);
    const bytes = deterministicPdf(
      `Sarbato contract v${source.version.versionNumber}`,
      [source.version.summary, ...serialized.split("\n")],
    );
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const objectId = randomUUID();
    const objectKey = `private/workspaces/${workspaceId}/generated/contracts/${source.contract.id}/${source.version.id}.pdf`;
    await this.storage.putObject({
      key: objectKey,
      body: bytes,
      contentType: "application/pdf",
    });
    return this.database.withContext(
      {
        userId,
        workspaceId,
        vendorOrganizationId: source.contract.vendorOrganizationId,
      },
      async (tx) => {
        const replay = await tx.contractDocumentMaterialization.findUnique({
          where: { contractVersionId },
        });
        if (replay) return replay;
        const object = await tx.storedObject.create({
          data: {
            id: objectId,
            workspaceId,
            storageProvider: this.environment.OBJECT_STORAGE_PROVIDER,
            bucket: this.environment.OBJECT_STORAGE_BUCKET,
            objectKey,
            originalFileName: `contract-${source.contract.id}-v${source.version.versionNumber}.pdf`,
            contentTypeClaimed: "application/pdf",
            contentTypeDetected: "application/pdf",
            sizeBytes: BigInt(bytes.byteLength),
            checksumSha256: contentHash,
            encryptionState: "PROVIDER_MANAGED",
            status: "AVAILABLE",
            scanStatus: "NOT_REQUIRED",
            availableAt: new Date(),
            createdByUserId: userId,
          },
        });
        const document = await tx.vaultDocument.create({
          data: {
            workspaceId,
            title: `Contract ${source.version.summary.slice(0, 120)}`,
            description: `Immutable materialization of contract version ${source.version.versionNumber}`,
            documentType: "CONTRACT",
            classification: "SHARED_PARTIES",
            status: "AVAILABLE",
            createdById: userId,
          },
        });
        const documentVersion = await tx.documentVersion.create({
          data: {
            workspaceId,
            documentId: document.id,
            versionNumber: 1,
            storedObjectId: object.id,
            contentHash,
            fileNameSnapshot: object.originalFileName,
            contentType: "application/pdf",
            sizeBytes: BigInt(bytes.byteLength),
            createdById: userId,
          },
        });
        await tx.vaultDocument.update({
          where: { id: document.id },
          data: { currentVersionId: documentVersion.id },
        });
        await tx.documentResourceLink.create({
          data: {
            workspaceId,
            documentId: document.id,
            resourceType: "CONTRACT_VERSION",
            resourceId: source.version.id,
            createdById: userId,
          },
        });
        await tx.documentAccessGrant.createMany({
          data: [
            {
              workspaceId,
              documentId: document.id,
              granteeType: "WORKSPACE",
              granteeId: workspaceId,
              permission: "DOWNLOAD",
              createdById: userId,
            },
            {
              workspaceId,
              documentId: document.id,
              granteeType: "VENDOR_ORGANIZATION",
              granteeId: source.contract.vendorOrganizationId,
              permission: "DOWNLOAD",
              createdById: userId,
            },
          ],
          skipDuplicates: true,
        });
        return tx.contractDocumentMaterialization.create({
          data: {
            workspaceId,
            vendorOrganizationId: source.contract.vendorOrganizationId,
            contractId: source.contract.id,
            contractVersionId: source.version.id,
            documentId: document.id,
            documentVersionId: documentVersion.id,
            contractContentHash: source.version.contentHash,
            documentContentHash: contentHash,
            rendererVersion: "weddingos-pdf-v1",
          },
        });
      },
    );
  }

  async materializeContractDocument(
    userId: string,
    workspaceId: string,
    contractId: string,
    contractVersionId: string,
    correlationId: string,
  ) {
    await this.requireCapability(userId, { workspaceId }, "signature.create");
    const version = await this.database.withContext(
      { userId, workspaceId },
      (tx) =>
        tx.vendorContractVersion.findFirst({
          where: { id: contractVersionId, contractId, workspaceId },
        }),
    );
    if (!version)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Contract version not found");
    const materialization = await this.materializeContract(
      userId,
      workspaceId,
      contractVersionId,
    );
    await this.database.withContext(
      {
        userId,
        workspaceId,
        vendorOrganizationId: materialization.vendorOrganizationId,
      },
      async (tx) => {
        await this.asyncEvents.record(tx, {
          eventName: "document.contract_materialized.v1",
          aggregateType: "VaultDocument",
          aggregateId: materialization.documentId,
          workspaceId,
          vendorOrganizationId: materialization.vendorOrganizationId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `contract-materialized:${contractVersionId}`,
          payload: {
            subject: {
              documentId: materialization.documentId,
              contractId,
              contractVersionId,
            },
          },
        });
      },
    );
    return jsonSafe(materialization);
  }

  async contractDocuments(userId: string, owner: Owner, contractId: string) {
    await this.requireCapability(userId, owner, "document.read");
    const rows = await this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const links = await tx.documentResourceLink.findMany({
          where: { resourceType: "CONTRACT", resourceId: contractId },
        });
        const materializations =
          await tx.contractDocumentMaterialization.findMany({
            where: { contractId },
          });
        const ids = [
          ...new Set([
            ...links.map((link) => link.documentId),
            ...materializations.map((item) => item.documentId),
          ]),
        ];
        return tx.vaultDocument.findMany({
          where: { id: { in: ids }, deletedAt: null },
          orderBy: { updatedAt: "desc" },
        });
      },
    );
    return jsonSafe({ items: rows });
  }

  async createSignatureEnvelope(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: {
      contractVersionId: string;
      weddingSignerMembershipId: string;
      vendorSignerMembershipId: string;
      expiresAt?: string;
    },
    correlationId: string,
    expectedContractId?: string,
  ) {
    await this.requireCapability(userId, { workspaceId }, "signature.create");
    if (expectedContractId) {
      const belongs = await this.database.withContext(
        { userId, workspaceId },
        (tx) =>
          tx.vendorContractVersion.findFirst({
            where: {
              id: input.contractVersionId,
              workspaceId,
              contractId: expectedContractId,
            },
            select: { id: true },
          }),
      );
      if (!belongs)
        problem(
          "NOT_FOUND",
          HttpStatus.NOT_FOUND,
          "Contract version does not belong to the requested contract",
        );
    }
    const materialization = await this.materializeContract(
      userId,
      workspaceId,
      input.contractVersionId,
    );
    const prepared = await this.database.withContext(
      {
        userId,
        workspaceId,
        vendorOrganizationId: materialization.vendorOrganizationId,
      },
      async (tx) => {
        const contractVersion = await tx.vendorContractVersion.findFirst({
          where: { id: input.contractVersionId, workspaceId },
        });
        if (!contractVersion)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Contract version not found",
          );
        if (
          expectedContractId &&
          contractVersion.contractId !== expectedContractId
        )
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Contract version does not belong to the requested contract",
          );
        const existing = await tx.electronicSignatureEnvelope.findFirst({
          where: {
            workspaceId,
            contractVersionId: input.contractVersionId,
            status: {
              in: [
                "DRAFT",
                "CREATING",
                "READY",
                "SENT",
                "VIEWED",
                "PARTIALLY_SIGNED",
              ],
            },
          },
        });
        if (existing)
          return {
            envelope: existing,
            signerIds: (
              await tx.electronicSignatureSigner.findMany({
                where: { envelopeId: existing.id },
                select: { id: true },
              })
            ).map((item) => item.id),
            replay: true,
          };
        const weddingMembership = await tx.workspaceMembership.findFirst({
          where: {
            id: input.weddingSignerMembershipId,
            workspaceId,
            status: "ACTIVE",
          },
          include: { user: { include: { profile: true } } },
        });
        const vendorMembership =
          await tx.vendorOrganizationMembership.findFirst({
            where: {
              id: input.vendorSignerMembershipId,
              vendorOrganizationId: materialization.vendorOrganizationId,
              status: "ACTIVE",
            },
          });
        const vendorUser = vendorMembership
          ? await tx.user.findUnique({
              where: { id: vendorMembership.userId },
              include: { profile: true },
            })
          : null;
        if (!weddingMembership || !vendorMembership || !vendorUser)
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Both active contract-party signer memberships are required",
          );
        const envelope = await tx.electronicSignatureEnvelope.create({
          data: {
            workspaceId,
            vendorOrganizationId: materialization.vendorOrganizationId,
            contractId: contractVersion.contractId,
            contractVersionId: contractVersion.id,
            documentVersionId: materialization.documentVersionId,
            provider: this.environment.SIGNATURE_PROVIDER,
            signatureLevel:
              this.environment.SIGNATURE_PROVIDER === "fake"
                ? "TEST"
                : "STANDARD",
            status: "CREATING",
            createdById: userId,
            expiresAt: input.expiresAt
              ? new Date(input.expiresAt)
              : new Date(Date.now() + 7 * 86_400_000),
          },
        });
        const signerRows = await Promise.all([
          tx.electronicSignatureSigner.create({
            data: {
              workspaceId,
              vendorOrganizationId: materialization.vendorOrganizationId,
              envelopeId: envelope.id,
              partyType: "WEDDING",
              partyId: workspaceId,
              userId: weddingMembership.userId,
              nameSnapshot: weddingMembership.user.profile
                ? `${weddingMembership.user.profile.firstName} ${weddingMembership.user.profile.lastName}`
                : weddingMembership.user.email,
              emailSnapshot: weddingMembership.user.email,
              signingOrder: 1,
            },
          }),
          tx.electronicSignatureSigner.create({
            data: {
              workspaceId,
              vendorOrganizationId: materialization.vendorOrganizationId,
              envelopeId: envelope.id,
              partyType: "VENDOR",
              partyId: materialization.vendorOrganizationId,
              userId: vendorUser.id,
              nameSnapshot: vendorUser.profile
                ? `${vendorUser.profile.firstName} ${vendorUser.profile.lastName}`
                : vendorUser.email,
              emailSnapshot: vendorUser.email,
              signingOrder: 2,
            },
          }),
        ]);
        return {
          envelope,
          signerIds: signerRows.map((item) => item.id),
          replay: false,
        };
      },
    );
    if (prepared.replay)
      return jsonSafe({ ...prepared.envelope, replayed: true });
    const provider = await this.signatures.createEnvelope({
      envelopeId: prepared.envelope.id,
      documentHash: materialization.documentContentHash,
      signerIds: prepared.signerIds,
      expiresAt: prepared.envelope.expiresAt,
    });
    const envelope = await this.database.withContext(
      {
        userId,
        workspaceId,
        vendorOrganizationId: prepared.envelope.vendorOrganizationId,
      },
      async (tx) => {
        const updated = await tx.electronicSignatureEnvelope.update({
          where: { id: prepared.envelope.id },
          data: {
            providerEnvelopeId: provider.providerEnvelopeId,
            signatureLevel: provider.signatureLevel,
            status: "READY",
            version: { increment: 1 },
          },
        });
        // Provider contracts receive these stable signer IDs when the envelope is
        // created and must echo the same value in signer webhook events.
        await Promise.all(
          prepared.signerIds.map((id) =>
            tx.electronicSignatureSigner.update({
              where: { id },
              data: { providerSignerId: id },
            }),
          ),
        );
        await tx.vendorContract.update({
          where: { id: updated.contractId },
          data: {
            signaturePolicy: "ELECTRONIC_SIGNATURE",
            signatureEnvelopeId: updated.id,
            version: { increment: 1 },
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "signature.envelope_created.v1",
          aggregateType: "ElectronicSignatureEnvelope",
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          workspaceId,
          vendorOrganizationId: updated.vendorOrganizationId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `signature-envelope:${updated.id}`,
          payload: {
            subject: { envelopeId: updated.id, contractId: updated.contractId },
            signatureStatusProjection: { envelopeId: updated.id },
          },
        });
        return updated;
      },
    );
    return jsonSafe({ ...envelope, replayed: false });
  }

  async signaturesForWorkspace(userId: string, workspaceId: string) {
    await this.requireCapability(userId, { workspaceId }, "signature.read");
    return jsonSafe(
      await this.database.withContext({ userId, workspaceId }, (tx) =>
        tx.electronicSignatureEnvelope.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ),
    );
  }

  async signaturesForContract(
    userId: string,
    workspaceId: string,
    contractId: string,
  ) {
    await this.requireCapability(userId, { workspaceId }, "signature.read");
    return jsonSafe(
      await this.database.withContext({ userId, workspaceId }, (tx) =>
        tx.electronicSignatureEnvelope.findMany({
          where: { workspaceId, contractId },
          orderBy: { createdAt: "desc" },
        }),
      ),
    );
  }

  async signatureCandidates(
    userId: string,
    workspaceId: string,
    contractVersionId: string,
  ) {
    await this.requireCapability(userId, { workspaceId }, "signature.create");
    const contract = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const version = await tx.vendorContractVersion.findFirst({
          where: { id: contractVersionId, workspaceId },
        });
        if (!version)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Contract version not found",
          );
        return tx.vendorContract.findFirst({
          where: { id: version.contractId, workspaceId },
        });
      },
    );
    if (!contract)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Contract not found");
    return this.database.withContext(
      {
        userId,
        workspaceId,
        vendorOrganizationId: contract.vendorOrganizationId,
      },
      async (tx) => {
        const wedding = await tx.workspaceMembership.findMany({
          where: { workspaceId, status: "ACTIVE" },
          include: { user: { include: { profile: true } } },
          orderBy: { joinedAt: "asc" },
        });
        const vendorMemberships =
          await tx.vendorOrganizationMembership.findMany({
            where: {
              vendorOrganizationId: contract.vendorOrganizationId,
              status: "ACTIVE",
            },
            orderBy: { joinedAt: "asc" },
          });
        const vendorUsers = await tx.user.findMany({
          where: { id: { in: vendorMemberships.map((item) => item.userId) } },
          include: { profile: true },
        });
        return {
          wedding: wedding.map((item) => ({
            membershipId: item.id,
            userId: item.userId,
            name: item.user.profile
              ? `${item.user.profile.firstName} ${item.user.profile.lastName}`
              : item.user.email,
            email: item.user.email,
          })),
          vendor: vendorMemberships.map((item) => {
            const candidate = vendorUsers.find(
              (user) => user.id === item.userId,
            );
            return {
              membershipId: item.id,
              userId: item.userId,
              name: candidate?.profile
                ? `${candidate.profile.firstName} ${candidate.profile.lastName}`
                : (candidate?.email ?? "Vendor member"),
              email: candidate?.email ?? "",
            };
          }),
        };
      },
    );
  }

  async signatureEnvelope(
    userId: string,
    workspaceId: string,
    envelopeId: string,
  ) {
    await this.requireCapability(userId, { workspaceId }, "signature.read");
    const envelope = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const row = await tx.electronicSignatureEnvelope.findFirst({
          where: { id: envelopeId, workspaceId },
        });
        if (!row)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Signature envelope not found",
          );
        return {
          ...row,
          signers: await tx.electronicSignatureSigner.findMany({
            where: { envelopeId },
            orderBy: { signingOrder: "asc" },
          }),
          evidence: await tx.electronicSignatureEvidence.findUnique({
            where: { envelopeId },
          }),
        };
      },
    );
    return jsonSafe(envelope);
  }

  async signatureEnvelopeForVendor(
    userId: string,
    vendorOrganizationId: string,
    envelopeId: string,
  ) {
    await this.requireCapability(
      userId,
      { vendorOrganizationId },
      "signature.read",
    );
    return jsonSafe(
      await this.database.withContext(
        { userId, vendorOrganizationId },
        async (tx) => {
          const envelope = await tx.electronicSignatureEnvelope.findFirst({
            where: { id: envelopeId, vendorOrganizationId },
          });
          if (!envelope)
            problem(
              "NOT_FOUND",
              HttpStatus.NOT_FOUND,
              "Signature envelope not found",
            );
          return {
            ...envelope,
            signers: await tx.electronicSignatureSigner.findMany({
              where: { envelopeId },
              orderBy: { signingOrder: "asc" },
            }),
            evidence: await tx.electronicSignatureEvidence.findUnique({
              where: { envelopeId },
            }),
          };
        },
      ),
    );
  }

  async cancelEnvelope(
    userId: string,
    workspaceId: string,
    envelopeId: string,
    expectedVersion: number,
    reason: string,
    correlationId: string,
  ) {
    await this.requireCapability(userId, { workspaceId }, "signature.cancel");
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const envelope = await tx.electronicSignatureEnvelope.findFirst({
        where: { id: envelopeId, workspaceId },
      });
      if (!envelope)
        problem(
          "NOT_FOUND",
          HttpStatus.NOT_FOUND,
          "Signature envelope not found",
        );
      if (envelope.version !== expectedVersion)
        problem(
          "SIGNATURE_VERSION_MISMATCH",
          HttpStatus.PRECONDITION_FAILED,
          "Signature envelope version is stale",
          undefined,
          undefined,
          { latestVersion: envelope.version },
        );
      if (
        ["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED", "FAILED"].includes(
          envelope.status,
        )
      )
        problem(
          "SIGNATURE_VERSION_MISMATCH",
          HttpStatus.CONFLICT,
          "Terminal signature envelope cannot be cancelled",
        );
      const updated = await tx.electronicSignatureEnvelope.update({
        where: { id: envelopeId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.electronicSignatureSigner.updateMany({
        where: {
          envelopeId,
          status: { notIn: ["SIGNED", "DECLINED", "EXPIRED", "CANCELLED"] },
        },
        data: { status: "CANCELLED", version: { increment: 1 } },
      });
      await this.asyncEvents.record(tx, {
        eventName: "signature.envelope_cancelled.v1",
        aggregateType: "ElectronicSignatureEnvelope",
        aggregateId: envelopeId,
        aggregateVersion: updated.version,
        workspaceId,
        vendorOrganizationId: envelope.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        deduplicationKey: `signature-cancelled:${envelopeId}`,
        payload: {
          subject: { envelopeId, contractId: envelope.contractId, reason },
          signatureStatusProjection: { envelopeId },
        },
      });
      return updated;
    });
  }

  async signatureEvidence(userId: string, owner: Owner, envelopeId: string) {
    await this.requireCapability(userId, owner, "signature.download_evidence");
    return jsonSafe(
      await this.database.withContext(
        this.context(userId, owner),
        async (tx) => {
          const evidence = await tx.electronicSignatureEvidence.findUnique({
            where: { envelopeId },
          });
          if (!evidence)
            problem(
              "NOT_FOUND",
              HttpStatus.NOT_FOUND,
              "Signature evidence is not available",
            );
          return evidence;
        },
      ),
    );
  }

  async sendEnvelope(
    userId: string,
    workspaceId: string,
    envelopeId: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    await this.requireCapability(userId, { workspaceId }, "signature.send");
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const envelope = await tx.electronicSignatureEnvelope.findFirst({
        where: { id: envelopeId, workspaceId },
      });
      if (!envelope)
        problem(
          "NOT_FOUND",
          HttpStatus.NOT_FOUND,
          "Signature envelope not found",
        );
      if (envelope.version !== expectedVersion)
        problem(
          "SIGNATURE_VERSION_MISMATCH",
          HttpStatus.PRECONDITION_FAILED,
          "Signature envelope version is stale",
          undefined,
          undefined,
          { latestVersion: envelope.version },
        );
      if (envelope.status !== "READY")
        problem(
          "SIGNATURE_VERSION_MISMATCH",
          HttpStatus.CONFLICT,
          "Only a ready envelope can be sent",
        );
      const contract = await tx.vendorContract.findUnique({
        where: { id: envelope.contractId },
        select: { currentVersionNumber: true },
      });
      const currentVersion = contract
        ? await tx.vendorContractVersion.findUnique({
            where: {
              contractId_versionNumber: {
                contractId: envelope.contractId,
                versionNumber: contract.currentVersionNumber,
              },
            },
            select: { id: true },
          })
        : null;
      if (!currentVersion || currentVersion.id !== envelope.contractVersionId)
        problem(
          "SIGNATURE_VERSION_MISMATCH",
          HttpStatus.CONFLICT,
          "Contract changed after the envelope was created",
        );
      const updated = await tx.electronicSignatureEnvelope.update({
        where: { id: envelopeId },
        data: { status: "SENT", sentAt: new Date(), version: { increment: 1 } },
      });
      await tx.electronicSignatureSigner.updateMany({
        where: { envelopeId, status: "PENDING" },
        data: { status: "SENT", version: { increment: 1 } },
      });
      await this.asyncEvents.record(tx, {
        eventName: "signature.envelope_sent.v1",
        aggregateType: "ElectronicSignatureEnvelope",
        aggregateId: envelopeId,
        aggregateVersion: updated.version,
        workspaceId,
        vendorOrganizationId: envelope.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        deduplicationKey: `signature-sent:${envelopeId}:${updated.version}`,
        payload: {
          subject: { envelopeId },
          signatureEnvelopeSend: { envelopeId },
        },
      });
      return updated;
    });
  }

  async signingSession(
    userId: string,
    workspaceId: string,
    envelopeId: string,
  ) {
    await this.requireCapability(userId, { workspaceId }, "signature.sign");
    const signer = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const envelope = await tx.electronicSignatureEnvelope.findFirst({
          where: { id: envelopeId, workspaceId },
        });
        if (
          !envelope ||
          !["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(envelope.status)
        )
          problem(
            "SIGNATURE_VERSION_MISMATCH",
            HttpStatus.CONFLICT,
            "Envelope is not open for signing",
          );
        const row = await tx.electronicSignatureSigner.findFirst({
          where: { envelopeId, userId },
        });
        if (!row)
          problem(
            "FORBIDDEN",
            HttpStatus.FORBIDDEN,
            "Current user is not an envelope signer",
          );
        return row;
      },
    );
    return this.signatures.createSigningLink({
      envelopeId,
      signerId: signer.id,
    });
  }

  private async signingContext(userId: string, envelopeId: string) {
    const rows = await this.database.$queryRaw<
      Array<{
        workspace_id: string;
        vendor_organization_id: string;
        envelope_id: string;
        signer_id: string;
        party_type: "WEDDING" | "VENDOR";
      }>
    >`
      SELECT * FROM public.weddingos_resolve_signature_signer_context(${envelopeId}::uuid, ${userId}::uuid)
    `;
    const context = rows[0];
    if (!context)
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Current user is not an envelope signer",
      );
    const owner: Owner =
      context.party_type === "VENDOR"
        ? { vendorOrganizationId: context.vendor_organization_id }
        : { workspaceId: context.workspace_id };
    await this.requireCapability(userId, owner, "signature.sign");
    return context;
  }

  async signerSession(userId: string, envelopeId: string) {
    const context = await this.signingContext(userId, envelopeId);
    const signer = await this.database.withContext(
      {
        userId,
        workspaceId: context.workspace_id,
        vendorOrganizationId: context.vendor_organization_id,
      },
      async (tx) => {
        const envelope = await tx.electronicSignatureEnvelope.findUnique({
          where: { id: envelopeId },
        });
        if (
          !envelope ||
          !["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(envelope.status)
        )
          problem(
            "SIGNATURE_VERSION_MISMATCH",
            HttpStatus.CONFLICT,
            "Envelope is not open for signing",
          );
        return tx.electronicSignatureSigner.findUniqueOrThrow({
          where: { id: context.signer_id },
        });
      },
    );
    return this.signatures.createSigningLink({
      envelopeId,
      signerId: signer.id,
    });
  }

  async signerFakeAction(
    userId: string,
    envelopeId: string,
    signerId: string,
    action: "VIEW" | "SIGN" | "DECLINE",
    reason: string | undefined,
    correlationId: string,
  ) {
    const context = await this.signingContext(userId, envelopeId);
    if (context.signer_id !== signerId)
      problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Signer access denied");
    return this.fakeSignatureActionInternal(
      userId,
      context.workspace_id,
      context.vendor_organization_id,
      envelopeId,
      signerId,
      action,
      reason,
      correlationId,
    );
  }

  async fakeSignatureAction(
    userId: string,
    workspaceId: string,
    envelopeId: string,
    signerId: string,
    action: "VIEW" | "SIGN" | "DECLINE",
    reason: string | undefined,
    correlationId: string,
  ) {
    if (this.environment.SIGNATURE_PROVIDER !== "fake")
      problem(
        "NOT_FOUND",
        HttpStatus.NOT_FOUND,
        "Fake signature provider is disabled",
      );
    await this.requireCapability(userId, { workspaceId }, "signature.sign");
    const envelope = await this.database.withContext(
      { userId, workspaceId },
      (tx) =>
        tx.electronicSignatureEnvelope.findFirst({
          where: { id: envelopeId, workspaceId },
          select: { vendorOrganizationId: true },
        }),
    );
    if (!envelope)
      problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Signer access denied");
    return this.fakeSignatureActionInternal(
      userId,
      workspaceId,
      envelope.vendorOrganizationId,
      envelopeId,
      signerId,
      action,
      reason,
      correlationId,
    );
  }

  private async fakeSignatureActionInternal(
    userId: string,
    workspaceId: string,
    vendorOrganizationId: string,
    envelopeId: string,
    signerId: string,
    action: "VIEW" | "SIGN" | "DECLINE",
    reason: string | undefined,
    correlationId: string,
  ) {
    if (this.environment.SIGNATURE_PROVIDER !== "fake")
      problem(
        "NOT_FOUND",
        HttpStatus.NOT_FOUND,
        "Fake signature provider is disabled",
      );
    return this.database.withContext(
      { userId, workspaceId, vendorOrganizationId },
      async (tx) => {
        const envelope = await tx.electronicSignatureEnvelope.findFirst({
          where: { id: envelopeId, workspaceId },
        });
        const signer = envelope
          ? await tx.electronicSignatureSigner.findFirst({
              where: { id: signerId, envelopeId, userId },
            })
          : null;
        if (!envelope || !signer)
          problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Signer access denied");
        if (
          ["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED", "FAILED"].includes(
            envelope.status,
          )
        )
          return envelope;
        const now = new Date();
        const signerStatus =
          action === "VIEW"
            ? "VIEWED"
            : action === "SIGN"
              ? "SIGNED"
              : "DECLINED";
        await tx.electronicSignatureSigner.update({
          where: { id: signer.id },
          data: {
            status: signerStatus,
            viewedAt: action === "VIEW" ? now : signer.viewedAt,
            signedAt: action === "SIGN" ? now : null,
            declinedAt: action === "DECLINE" ? now : null,
            version: { increment: 1 },
          },
        });
        const signers = await tx.electronicSignatureSigner.findMany({
          where: { envelopeId },
        });
        const allSigned = signers.every((item) =>
          item.id === signer.id ? action === "SIGN" : item.status === "SIGNED",
        );
        const nextStatus =
          action === "DECLINE"
            ? "DECLINED"
            : allSigned
              ? "COMPLETED"
              : action === "SIGN"
                ? "PARTIALLY_SIGNED"
                : "VIEWED";
        const updated = await tx.electronicSignatureEnvelope.update({
          where: { id: envelopeId },
          data: {
            status: nextStatus,
            completedAt: allSigned ? now : null,
            version: { increment: 1 },
          },
        });
        const eventName =
          action === "VIEW"
            ? "signature.signer_viewed.v1"
            : action === "SIGN"
              ? "signature.signer_signed.v1"
              : "signature.signer_declined.v1";
        await this.asyncEvents.record(tx, {
          eventName,
          aggregateType: "ElectronicSignatureEnvelope",
          aggregateId: envelopeId,
          aggregateVersion: updated.version,
          workspaceId,
          vendorOrganizationId: envelope.vendorOrganizationId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `${eventName}:${signer.id}`,
          payload: {
            subject: { envelopeId, signerId: signer.id, reason },
            signatureStatusProjection: { envelopeId },
          },
        });
        if (allSigned) {
          const materialization =
            await tx.contractDocumentMaterialization.findUnique({
              where: { contractVersionId: envelope.contractVersionId },
            });
          await tx.vendorContract.update({
            where: { id: envelope.contractId },
            data: {
              status: "ACKNOWLEDGED",
              agreedVersionId: envelope.contractVersionId,
              acknowledgedAt: now,
              electronicallySignedAt: now,
              version: { increment: 1 },
            },
          });
          if (materialization)
            await tx.electronicSignatureEvidence.upsert({
              where: { envelopeId },
              create: {
                workspaceId,
                vendorOrganizationId: envelope.vendorOrganizationId,
                envelopeId,
                provider: envelope.provider,
                evidenceType: "FAKE_TEST_CERTIFICATE",
                documentHash: materialization.documentContentHash,
                providerCertificateReference: `fake-certificate-${envelope.id}`,
                providerMetadataRedacted: { testProvider: true },
              },
              update: {},
            });
          await this.asyncEvents.record(tx, {
            eventName: "signature.envelope_completed.v1",
            aggregateType: "ElectronicSignatureEnvelope",
            aggregateId: envelopeId,
            aggregateVersion: updated.version,
            workspaceId,
            vendorOrganizationId: envelope.vendorOrganizationId,
            actorUserId: userId,
            correlationId,
            deduplicationKey: `signature-completed:${envelopeId}`,
            payload: {
              subject: { envelopeId, contractId: envelope.contractId },
              signatureEvidenceDownload: { envelopeId },
            },
          });
        }
        return updated;
      },
    );
  }

  verifySignatureWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    return this.signatures.verifyWebhook(rawBody, signature, timestamp);
  }

  verifySignatureProviderWebhook(
    provider: string,
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    if (provider !== this.environment.SIGNATURE_PROVIDER)
      problem(
        "SIGNATURE_EVENT_INVALID",
        HttpStatus.NOT_FOUND,
        "Signature provider is not enabled",
      );
    return this.verifySignatureWebhook(rawBody, signature, timestamp);
  }

  async applySignatureProviderEvent(
    event: VerifiedProviderEvent,
    correlationId: string,
  ) {
    if (
      !["signer.viewed", "signer.signed", "signer.declined"].includes(
        event.type,
      )
    )
      problem(
        "SIGNATURE_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Unsupported signature provider event type",
      );
    const providerEnvelopeId =
      typeof event.data.providerEnvelopeId === "string"
        ? event.data.providerEnvelopeId
        : "";
    if (!providerEnvelopeId)
      problem(
        "SIGNATURE_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Provider envelope identifier is required",
      );
    const contextRows = await this.database.$queryRaw<
      Array<{
        workspace_id: string;
        vendor_organization_id: string;
        envelope_id: string;
        actor_user_id: string;
      }>
    >`
      SELECT * FROM public.weddingos_resolve_signature_provider_context(${this.environment.SIGNATURE_PROVIDER}, ${providerEnvelopeId})
    `;
    const context = contextRows[0];
    if (!context)
      problem(
        "SIGNATURE_EVENT_INVALID",
        HttpStatus.NOT_FOUND,
        "Provider envelope is unknown",
      );
    return jsonSafe(
      await this.database.withContext(
        {
          userId: context.actor_user_id,
          workspaceId: context.workspace_id,
          vendorOrganizationId: context.vendor_organization_id,
        },
        async (tx) => {
          const replay = await tx.electronicSignatureEvent.findUnique({
            where: {
              provider_providerEventId: {
                provider: this.environment.SIGNATURE_PROVIDER,
                providerEventId: event.id,
              },
            },
          });
          if (replay)
            return { eventId: replay.id, effectApplied: false, replayed: true };
          const envelope = await tx.electronicSignatureEnvelope.findUnique({
            where: { id: context.envelope_id },
          });
          if (!envelope)
            problem(
              "SIGNATURE_EVENT_INVALID",
              HttpStatus.NOT_FOUND,
              "Signature envelope context is unavailable",
            );
          const materialization =
            await tx.contractDocumentMaterialization.findUnique({
              where: { contractVersionId: envelope.contractVersionId },
            });
          if (
            !materialization ||
            (typeof event.data.documentHash === "string" &&
              event.data.documentHash !== materialization.documentContentHash)
          )
            problem(
              "SIGNATURE_EVENT_INVALID",
              HttpStatus.UNPROCESSABLE_ENTITY,
              "Signed document hash does not match the immutable contract materialization",
            );
          const providerEvent = await tx.electronicSignatureEvent.create({
            data: {
              provider: envelope.provider,
              providerEventId: event.id,
              envelopeId: envelope.id,
              eventType: event.type,
              payloadHash: event.payloadHash,
              occurredAt: event.occurredAt,
            },
          });
          const providerSignerId =
            typeof event.data.providerSignerId === "string"
              ? event.data.providerSignerId
              : "";
          const signer = providerSignerId
            ? await tx.electronicSignatureSigner.findUnique({
                where: { providerSignerId },
              })
            : null;
          if (
            event.type.startsWith("signer.") &&
            (!signer || signer.envelopeId !== envelope.id)
          )
            problem(
              "SIGNATURE_EVENT_INVALID",
              HttpStatus.UNPROCESSABLE_ENTITY,
              "Provider signer does not belong to the envelope",
            );
          if (signer) {
            if (
              event.type === "signer.viewed" &&
              ["PENDING", "SENT"].includes(signer.status)
            )
              await tx.electronicSignatureSigner.update({
                where: { id: signer.id },
                data: {
                  status: "VIEWED",
                  viewedAt: event.occurredAt,
                  version: { increment: 1 },
                },
              });
            if (
              event.type === "signer.signed" &&
              !["SIGNED", "DECLINED", "EXPIRED", "CANCELLED"].includes(
                signer.status,
              )
            )
              await tx.electronicSignatureSigner.update({
                where: { id: signer.id },
                data: {
                  status: "SIGNED",
                  viewedAt: signer.viewedAt ?? event.occurredAt,
                  signedAt: event.occurredAt,
                  version: { increment: 1 },
                },
              });
            if (
              event.type === "signer.declined" &&
              !["SIGNED", "DECLINED", "EXPIRED", "CANCELLED"].includes(
                signer.status,
              )
            )
              await tx.electronicSignatureSigner.update({
                where: { id: signer.id },
                data: {
                  status: "DECLINED",
                  declinedAt: event.occurredAt,
                  version: { increment: 1 },
                },
              });
          }
          const signers = await tx.electronicSignatureSigner.findMany({
            where: { envelopeId: envelope.id },
          });
          const allSigned =
            signers.length >= 2 &&
            signers.every((item) => item.status === "SIGNED");
          const anyDeclined = signers.some(
            (item) => item.status === "DECLINED",
          );
          const terminal = [
            "COMPLETED",
            "DECLINED",
            "EXPIRED",
            "CANCELLED",
            "FAILED",
          ].includes(envelope.status);
          const nextStatus = terminal
            ? envelope.status
            : anyDeclined
              ? "DECLINED"
              : allSigned
                ? "COMPLETED"
                : signers.some((item) => item.status === "SIGNED")
                  ? "PARTIALLY_SIGNED"
                  : signers.some((item) => item.status === "VIEWED")
                    ? "VIEWED"
                    : envelope.status;
          const updated =
            nextStatus === envelope.status
              ? envelope
              : await tx.electronicSignatureEnvelope.update({
                  where: { id: envelope.id },
                  data: {
                    status: nextStatus,
                    completedAt:
                      nextStatus === "COMPLETED" ? event.occurredAt : null,
                    version: { increment: 1 },
                  },
                });
          if (nextStatus === "COMPLETED") {
            await tx.vendorContract.update({
              where: { id: envelope.contractId },
              data: {
                status: "ACKNOWLEDGED",
                agreedVersionId: envelope.contractVersionId,
                acknowledgedAt: event.occurredAt,
                electronicallySignedAt: event.occurredAt,
                version: { increment: 1 },
              },
            });
            await tx.electronicSignatureEvidence.upsert({
              where: { envelopeId: envelope.id },
              create: {
                workspaceId: envelope.workspaceId,
                vendorOrganizationId: envelope.vendorOrganizationId,
                envelopeId: envelope.id,
                provider: envelope.provider,
                evidenceType: "PROVIDER_CERTIFICATE",
                documentHash: materialization.documentContentHash,
                providerCertificateReference:
                  typeof event.data.certificateReference === "string"
                    ? event.data.certificateReference
                    : null,
                providerMetadataRedacted: { providerEventId: event.id },
              },
              update: {},
            });
          }
          const semanticEvent =
            nextStatus === "COMPLETED"
              ? "signature.envelope_completed.v1"
              : event.type === "signer.signed"
                ? "signature.signer_signed.v1"
                : event.type === "signer.declined"
                  ? "signature.signer_declined.v1"
                  : "signature.signer_viewed.v1";
          await this.asyncEvents.record(tx, {
            eventName: semanticEvent,
            aggregateType: "ElectronicSignatureEnvelope",
            aggregateId: envelope.id,
            aggregateVersion: updated.version,
            workspaceId: envelope.workspaceId,
            vendorOrganizationId: envelope.vendorOrganizationId,
            correlationId,
            deduplicationKey: `signature-provider-event:${providerEvent.id}`,
            payload: {
              subject: { envelopeId: envelope.id, signerId: signer?.id },
              signatureStatusProjection: { envelopeId: envelope.id },
            },
          });
          return {
            eventId: providerEvent.id,
            envelopeId: envelope.id,
            status: nextStatus,
            effectApplied: nextStatus !== envelope.status || Boolean(signer),
            replayed: false,
          };
        },
      ),
    );
  }

  async createCheckout(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: {
      paymentScheduleEntryId: string;
      amountMode: "FULL_OUTSTANDING" | "CUSTOM";
      customAmountMinor?: number;
      successReturnPath: string;
      cancelReturnPath: string;
    },
    correlationId: string,
  ) {
    const owner = { workspaceId };
    await this.requireCapability(
      userId,
      owner,
      "online_payment.create_checkout",
    );
    const prepared = await this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const replay = await tx.onlinePaymentCheckout.findUnique({
          where: {
            workspaceId_createdById_idempotencyKey: {
              workspaceId,
              createdById: userId,
              idempotencyKey,
            },
          },
        });
        if (replay) return { checkout: replay, replay: true };
        const schedule = await tx.paymentScheduleEntry.findFirst({
          where: {
            id: input.paymentScheduleEntryId,
            workspaceId,
            deletedAt: null,
          },
        });
        if (!schedule)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Payment schedule entry not found",
          );
        const outstanding = schedule.amountMinor - schedule.paidMinor;
        const amount =
          input.amountMode === "CUSTOM"
            ? BigInt(input.customAmountMinor ?? 0)
            : outstanding;
        if (amount <= 0n || amount > outstanding)
          problem(
            "PAYMENT_AMOUNT_INVALID",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Checkout amount must be within the outstanding balance",
          );
        const checkout = await tx.onlinePaymentCheckout.create({
          data: {
            workspaceId,
            paymentScheduleEntryId: schedule.id,
            budgetItemId: schedule.budgetItemId,
            bookingId: schedule.bookingId,
            contractId: schedule.contractId,
            vendorOrganizationId: schedule.vendorOrganizationId,
            provider: this.environment.PAYMENT_PROVIDER,
            amountMinor: amount,
            currency: schedule.currency,
            successReturnPath: input.successReturnPath,
            cancelReturnPath: input.cancelReturnPath,
            expiresAt: new Date(Date.now() + 30 * 60_000),
            createdById: userId,
            idempotencyKey,
          },
        });
        return { checkout, replay: false };
      },
    );
    if (prepared.replay && prepared.checkout.providerCheckoutId)
      return jsonSafe({
        ...prepared.checkout,
        checkoutUrl: prepared.checkout.hostedUrl,
        replayed: true,
      });
    const hosted = await this.payments.createCheckout({
      checkoutId: prepared.checkout.id,
      amountMinor: Number(prepared.checkout.amountMinor),
      currency: prepared.checkout.currency,
      expiresAt: prepared.checkout.expiresAt,
    });
    const checkout = await this.database.withContext(
      this.context(userId, owner),
      async (tx) => {
        const updated = await tx.onlinePaymentCheckout.update({
          where: { id: prepared.checkout.id },
          data: {
            providerCheckoutId: hosted.providerCheckoutId,
            hostedUrl: hosted.url,
            status: "OPEN",
            version: { increment: 1 },
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "payment.checkout_created.v1",
          aggregateType: "OnlinePaymentCheckout",
          aggregateId: updated.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `payment-checkout:${updated.id}`,
          payload: {
            subject: { checkoutId: updated.id },
            paymentStatusProjection: { checkoutId: updated.id },
          },
        });
        return updated;
      },
    );
    return jsonSafe({ ...checkout, checkoutUrl: hosted.url, replayed: false });
  }

  async checkouts(userId: string, workspaceId: string) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.read",
    );
    return jsonSafe(
      await this.database.withContext({ userId, workspaceId }, (tx) =>
        tx.onlinePaymentCheckout.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ),
    );
  }

  async checkout(userId: string, workspaceId: string, checkoutId: string) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.read",
    );
    return jsonSafe(
      await this.database.withContext({ userId, workspaceId }, async (tx) => {
        const checkout = await tx.onlinePaymentCheckout.findFirst({
          where: { id: checkoutId, workspaceId },
        });
        if (!checkout)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Payment checkout not found",
          );
        return {
          ...checkout,
          checkoutUrl: checkout.hostedUrl,
          attempts: await tx.onlinePaymentAttempt.findMany({
            where: { checkoutId },
            orderBy: { attemptNumber: "asc" },
          }),
        };
      }),
    );
  }

  async expireCheckout(
    userId: string,
    workspaceId: string,
    checkoutId: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.expire_checkout",
    );
    const checkout = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const row = await tx.onlinePaymentCheckout.findFirst({
          where: { id: checkoutId, workspaceId },
        });
        if (!row)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Payment checkout not found",
          );
        if (row.version !== expectedVersion)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Payment checkout version is stale",
            undefined,
            undefined,
            { latestVersion: row.version },
          );
        if (!["CREATING", "OPEN"].includes(row.status))
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            "Only an open checkout can be expired",
          );
        if (!row.providerCheckoutId)
          problem(
            "PAYMENT_PROVIDER_NOT_CONFIGURED",
            HttpStatus.CONFLICT,
            "Provider checkout is unavailable",
          );
        return row;
      },
    );
    await this.payments.expireCheckout({
      providerCheckoutId: checkout.providerCheckoutId!,
    });
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const updated = await tx.onlinePaymentCheckout.update({
        where: { id: checkoutId },
        data: { status: "EXPIRED", version: { increment: 1 } },
      });
      await this.asyncEvents.record(tx, {
        eventName: "payment.checkout_expired.v1",
        aggregateType: "OnlinePaymentCheckout",
        aggregateId: checkoutId,
        aggregateVersion: updated.version,
        workspaceId,
        actorUserId: userId,
        correlationId,
        deduplicationKey: `payment-checkout-expired:${checkoutId}`,
        payload: {
          subject: { checkoutId },
          paymentStatusProjection: { checkoutId },
        },
      });
      return updated;
    });
  }

  async transactions(userId: string, workspaceId: string) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.read",
    );
    return jsonSafe(
      await this.database.withContext({ userId, workspaceId }, (tx) =>
        tx.onlinePaymentTransaction.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ),
    );
  }

  async transaction(
    userId: string,
    workspaceId: string,
    transactionId: string,
  ) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.read",
    );
    return jsonSafe(
      await this.database.withContext({ userId, workspaceId }, async (tx) => {
        const transaction = await tx.onlinePaymentTransaction.findFirst({
          where: { id: transactionId, workspaceId },
        });
        if (!transaction)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Online payment transaction not found",
          );
        return {
          ...transaction,
          refunds: await tx.onlinePaymentRefund.findMany({
            where: { transactionId },
            orderBy: { requestedAt: "desc" },
          }),
        };
      }),
    );
  }

  async refunds(userId: string, workspaceId: string) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.read",
    );
    return jsonSafe(
      await this.database.withContext({ userId, workspaceId }, (tx) =>
        tx.onlinePaymentRefund.findMany({
          where: { workspaceId },
          orderBy: { requestedAt: "desc" },
          take: 100,
        }),
      ),
    );
  }

  async refundDetail(userId: string, workspaceId: string, refundId: string) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.read",
    );
    const refund = await this.database.withContext(
      { userId, workspaceId },
      (tx) =>
        tx.onlinePaymentRefund.findFirst({
          where: { id: refundId, workspaceId },
        }),
    );
    if (!refund)
      problem(
        "NOT_FOUND",
        HttpStatus.NOT_FOUND,
        "Online payment refund not found",
      );
    return jsonSafe(refund);
  }

  async reconcilePayments(
    userId: string,
    workspaceId: string,
    correlationId: string,
  ) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.reconcile",
    );
    return jsonSafe(
      await this.database.withContext({ userId, workspaceId }, async (tx) => {
        const run = await tx.paymentReconciliationRun.create({
          data: {
            provider: this.environment.PAYMENT_PROVIDER,
            status: "RUNNING",
          },
        });
        const transactions = await tx.onlinePaymentTransaction.findMany({
          where: {
            workspaceId,
            status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] },
          },
        });
        const errors: Array<{ transactionId: string; code: string }> = [];
        for (const transaction of transactions) {
          const original = await tx.paymentRecord.findUnique({
            where: {
              sourceType_sourceId: {
                sourceType: "ONLINE_PAYMENT",
                sourceId: transaction.id,
              },
            },
          });
          const ledger = await tx.paymentRecord.aggregate({
            where: {
              workspaceId,
              OR: [
                { sourceType: "ONLINE_PAYMENT", sourceId: transaction.id },
                ...(original
                  ? [
                      {
                        sourceType: "ONLINE_REFUND",
                        originalPaymentId: original.id,
                      },
                    ]
                  : []),
              ],
            },
            _sum: { amountMinor: true },
          });
          const expected =
            transaction.amountCapturedMinor - transaction.amountRefundedMinor;
          if ((ledger._sum.amountMinor ?? 0n) !== expected)
            errors.push({
              transactionId: transaction.id,
              code: "LEDGER_MISMATCH",
            });
        }
        const completed = await tx.paymentReconciliationRun.update({
          where: { id: run.id },
          data: {
            status: errors.length ? "ATTENTION_REQUIRED" : "COMPLETED",
            completedAt: new Date(),
            checkedTransactions: transactions.length,
            errors,
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "payment.reconciliation_completed.v1",
          aggregateType: "PaymentReconciliationRun",
          aggregateId: run.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `payment-reconciliation:${run.id}`,
          payload: {
            subject: {
              reconciliationRunId: run.id,
              attentionRequired: errors.length > 0,
            },
            paymentStatusProjection: { reconciliationRunId: run.id },
          },
        });
        return completed;
      }),
    );
  }

  async fakePaymentAction(
    userId: string,
    workspaceId: string,
    checkoutId: string,
    action: "CAPTURE" | "FAIL" | "DISPUTE",
    correlationId: string,
  ) {
    if (this.environment.PAYMENT_PROVIDER !== "fake")
      problem(
        "NOT_FOUND",
        HttpStatus.NOT_FOUND,
        "Fake payment provider is disabled",
      );
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.create_checkout",
    );
    const checkout = await this.database.withContext(
      { userId, workspaceId },
      (tx) =>
        tx.onlinePaymentCheckout.findFirst({
          where: { id: checkoutId, workspaceId },
        }),
    );
    if (!checkout?.providerCheckoutId)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Payment checkout not found");
    const now = new Date();
    return this.applyPaymentProviderEvent(
      {
        id: `fake-${action.toLowerCase()}-${checkout.id}`,
        type:
          action === "CAPTURE"
            ? "payment.captured"
            : action === "FAIL"
              ? "payment.failed"
              : "payment.disputed",
        occurredAt: now,
        payloadHash: createHash("sha256")
          .update(`${checkout.id}:${action}`)
          .digest("hex"),
        data: {
          providerCheckoutId: checkout.providerCheckoutId,
          providerPaymentId: `fake-payment-${checkout.id}`,
          amountMinor: Number(checkout.amountMinor),
          currency: checkout.currency,
        },
      },
      correlationId,
    );
  }

  verifyPaymentWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    return this.payments.verifyWebhook(rawBody, signature, timestamp);
  }

  verifyPaymentProviderWebhook(
    provider: string,
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    if (provider !== this.environment.PAYMENT_PROVIDER)
      problem(
        "PAYMENT_EVENT_INVALID",
        HttpStatus.NOT_FOUND,
        "Payment provider is not enabled",
      );
    return this.verifyPaymentWebhook(rawBody, signature, timestamp);
  }

  async applyPaymentProviderEvent(
    event: VerifiedProviderEvent,
    correlationId: string,
  ) {
    const providerCheckoutId =
      typeof event.data.providerCheckoutId === "string"
        ? event.data.providerCheckoutId
        : "";
    const providerPaymentId =
      typeof event.data.providerPaymentId === "string"
        ? event.data.providerPaymentId
        : "";
    if (!providerCheckoutId || !providerPaymentId)
      problem(
        "PAYMENT_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Provider payment identifiers are required",
      );
    const contextRows = await this.database.$queryRaw<
      Array<{
        workspace_id: string;
        checkout_id: string;
        actor_user_id: string;
      }>
    >`
      SELECT * FROM public.weddingos_resolve_payment_provider_context(${this.environment.PAYMENT_PROVIDER}, ${providerCheckoutId})
    `;
    const context = contextRows[0];
    if (!context)
      problem(
        "PAYMENT_EVENT_INVALID",
        HttpStatus.NOT_FOUND,
        "Provider checkout is unknown",
      );
    return jsonSafe(
      await this.database.withContext(
        { userId: context.actor_user_id, workspaceId: context.workspace_id },
        async (tx) => {
          const replay = await tx.paymentProviderEvent.findUnique({
            where: {
              provider_providerEventId: {
                provider: this.environment.PAYMENT_PROVIDER,
                providerEventId: event.id,
              },
            },
          });
          if (replay)
            return { eventId: replay.id, effectApplied: false, replayed: true };
          const checkout = await tx.onlinePaymentCheckout.findFirst({
            where: {
              id: context.checkout_id,
              workspaceId: context.workspace_id,
            },
          });
          if (!checkout)
            problem(
              "PAYMENT_EVENT_INVALID",
              HttpStatus.NOT_FOUND,
              "Checkout context is unavailable",
            );
          const amount =
            typeof event.data.amountMinor === "number" &&
            Number.isSafeInteger(event.data.amountMinor)
              ? BigInt(event.data.amountMinor)
              : checkout.amountMinor;
          const currency =
            typeof event.data.currency === "string"
              ? event.data.currency
              : checkout.currency;
          if (amount !== checkout.amountMinor || currency !== checkout.currency)
            problem(
              "PAYMENT_EVENT_INVALID",
              HttpStatus.UNPROCESSABLE_ENTITY,
              "Provider amount or currency does not match checkout",
            );
          const providerEvent = await tx.paymentProviderEvent.create({
            data: {
              provider: checkout.provider,
              providerEventId: event.id,
              providerPaymentId,
              providerCheckoutId,
              eventType: event.type,
              payloadHash: event.payloadHash,
              status: "PROCESSING",
            },
          });
          const existingTransaction =
            await tx.onlinePaymentTransaction.findUnique({
              where: { providerPaymentId },
            });
          const transaction =
            existingTransaction ??
            (await tx.onlinePaymentTransaction.create({
              data: {
                workspaceId: checkout.workspaceId,
                checkoutId: checkout.id,
                provider: checkout.provider,
                providerPaymentId,
                status: "PENDING",
                currency: checkout.currency,
                providerCreatedAt: event.occurredAt,
                paymentMethodSummary: {
                  type: "card",
                  provider: checkout.provider,
                },
              },
            }));
          const captured = event.type === "payment.captured";
          const failed = event.type === "payment.failed";
          const disputed = event.type === "payment.disputed";
          const disputeWon = event.type === "payment.dispute_won";
          const disputeLost = event.type === "payment.dispute_lost";
          if (!captured && !failed && !disputed && !disputeWon && !disputeLost)
            problem(
              "PAYMENT_EVENT_INVALID",
              HttpStatus.BAD_REQUEST,
              "Unsupported payment provider event type",
            );
          const captureAllowed =
            captured &&
            ["PENDING", "REQUIRES_ACTION", "AUTHORIZED", "CAPTURED"].includes(
              transaction.status,
            );
          const failureAllowed =
            failed &&
            ["PENDING", "REQUIRES_ACTION", "AUTHORIZED", "FAILED"].includes(
              transaction.status,
            );
          const disputeAllowed =
            disputed && !["REFUNDED", "CANCELLED"].includes(transaction.status);
          const disputeWonAllowed =
            disputeWon && transaction.status === "DISPUTED";
          const disputeLostAllowed =
            disputeLost && transaction.status === "DISPUTED";
          const nextStatus = captureAllowed
            ? "CAPTURED"
            : failureAllowed
              ? "FAILED"
              : disputeAllowed
                ? "DISPUTED"
                : disputeWonAllowed
                  ? "CAPTURED"
                  : disputeLostAllowed
                    ? "REFUNDED"
                    : transaction.status;
          const stateChanged = nextStatus !== transaction.status;
          const existingLedgerEntry = await tx.paymentRecord.findUnique({
            where: {
              sourceType_sourceId: {
                sourceType: "ONLINE_PAYMENT",
                sourceId: transaction.id,
              },
            },
          });
          const captureEffect = captureAllowed && !existingLedgerEntry;
          const updatedTransaction = stateChanged
            ? await tx.onlinePaymentTransaction.update({
                where: { id: transaction.id },
                data: {
                  status: nextStatus,
                  amountAuthorizedMinor: captureAllowed
                    ? amount
                    : transaction.amountAuthorizedMinor,
                  amountCapturedMinor: captureAllowed
                    ? amount
                    : transaction.amountCapturedMinor,
                  capturedAt: captureAllowed
                    ? event.occurredAt
                    : transaction.capturedAt,
                  failedAt: failureAllowed
                    ? event.occurredAt
                    : transaction.failedAt,
                  amountRefundedMinor: disputeLostAllowed
                    ? transaction.amountCapturedMinor
                    : transaction.amountRefundedMinor,
                  version: { increment: 1 },
                },
              })
            : transaction;
          await tx.onlinePaymentAttempt.upsert({
            where: {
              checkoutId_attemptNumber: {
                checkoutId: checkout.id,
                attemptNumber: 1,
              },
            },
            create: {
              workspaceId: checkout.workspaceId,
              checkoutId: checkout.id,
              providerAttemptId: `${providerPaymentId}:1`,
              attemptNumber: 1,
              status: nextStatus,
              completedAt: new Date(),
            },
            update: stateChanged
              ? { status: nextStatus, completedAt: new Date() }
              : {},
          });
          if (captureEffect) {
            await tx.paymentRecord.upsert({
              where: {
                sourceType_sourceId: {
                  sourceType: "ONLINE_PAYMENT",
                  sourceId: transaction.id,
                },
              },
              create: {
                workspaceId: checkout.workspaceId,
                paymentScheduleEntryId: checkout.paymentScheduleEntryId,
                budgetItemId: checkout.budgetItemId,
                bookingId: checkout.bookingId,
                contractId: checkout.contractId,
                vendorOrganizationId: checkout.vendorOrganizationId,
                amountMinor: amount,
                currency: checkout.currency,
                entryType: "PAYMENT",
                paidAt: event.occurredAt,
                method: "CARD_EXTERNAL",
                status: "CONFIRMED",
                reference: providerPaymentId,
                sourceType: "ONLINE_PAYMENT",
                sourceId: transaction.id,
                createdById: checkout.createdById,
                confirmedById: checkout.createdById,
                confirmedAt: event.occurredAt,
              },
              update: {},
            });
            const paid = await tx.paymentRecord.aggregate({
              where: {
                workspaceId: checkout.workspaceId,
                paymentScheduleEntryId: checkout.paymentScheduleEntryId,
                status: { in: ["CONFIRMED", "REFUNDED"] },
              },
              _sum: { amountMinor: true },
            });
            const paidMinor = paid._sum.amountMinor ?? 0n;
            const schedule = await tx.paymentScheduleEntry.findUniqueOrThrow({
              where: { id: checkout.paymentScheduleEntryId },
            });
            await tx.paymentScheduleEntry.update({
              where: { id: schedule.id },
              data: {
                paidMinor,
                status:
                  paidMinor >= schedule.amountMinor
                    ? "PAID"
                    : paidMinor > 0n
                      ? "PARTIALLY_PAID"
                      : "UPCOMING",
                version: { increment: 1 },
              },
            });
            const budgetPaid = await tx.paymentRecord.aggregate({
              where: {
                workspaceId: checkout.workspaceId,
                budgetItemId: checkout.budgetItemId,
                status: { in: ["CONFIRMED", "REFUNDED"] },
              },
              _sum: { amountMinor: true },
            });
            await tx.budgetItem.update({
              where: { id: checkout.budgetItemId },
              data: {
                paidMinor: budgetPaid._sum.amountMinor ?? 0n,
                version: { increment: 1 },
              },
            });
            await tx.onlinePaymentCheckout.update({
              where: { id: checkout.id },
              data: { status: "COMPLETED", version: { increment: 1 } },
            });
          } else if (failureAllowed)
            await tx.onlinePaymentCheckout.update({
              where: { id: checkout.id },
              data: { status: "FAILED", version: { increment: 1 } },
            });
          await tx.paymentProviderEvent.update({
            where: { id: providerEvent.id },
            data: { status: "PROCESSED", processedAt: new Date() },
          });
          const semanticEvent = captured
            ? "payment.transaction_captured.v1"
            : failed
              ? "payment.transaction_failed.v1"
              : "payment.transaction_disputed.v1";
          await this.asyncEvents.record(tx, {
            eventName: semanticEvent,
            aggregateType: "OnlinePaymentTransaction",
            aggregateId: transaction.id,
            aggregateVersion: updatedTransaction.version,
            workspaceId: checkout.workspaceId,
            actorUserId: checkout.createdById,
            correlationId,
            deduplicationKey: `payment-provider-event:${providerEvent.id}`,
            payload: {
              subject: {
                transactionId: transaction.id,
                checkoutId: checkout.id,
              },
              paymentStatusProjection: { transactionId: transaction.id },
            },
          });
          return {
            eventId: providerEvent.id,
            transactionId: transaction.id,
            status: nextStatus,
            effectApplied: stateChanged || captureEffect,
            replayed: false,
          };
        },
      ),
    );
  }

  async refund(
    userId: string,
    workspaceId: string,
    transactionId: string,
    idempotencyKey: string,
    expectedVersion: number,
    amountMinor: number,
    reason: string,
    correlationId: string,
  ) {
    await this.requireCapability(
      userId,
      { workspaceId },
      "online_payment.request_refund",
    );
    const prepared = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const replay = await tx.onlinePaymentRefund.findUnique({
          where: {
            workspaceId_requestedById_idempotencyKey: {
              workspaceId,
              requestedById: userId,
              idempotencyKey,
            },
          },
        });
        if (replay)
          return {
            refund: replay,
            transaction: await tx.onlinePaymentTransaction.findUniqueOrThrow({
              where: { id: replay.transactionId },
            }),
            replay: true,
          };
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${transactionId}, 0))
        `;
        const transaction = await tx.onlinePaymentTransaction.findFirst({
          where: { id: transactionId, workspaceId },
        });
        if (
          !transaction ||
          !["CAPTURED", "PARTIALLY_REFUNDED"].includes(transaction.status)
        )
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Captured online payment not found",
          );
        if (transaction.version !== expectedVersion)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Online payment transaction version is stale",
            undefined,
            undefined,
            { latestVersion: transaction.version },
          );
        const amount = BigInt(amountMinor);
        const reserved = await tx.onlinePaymentRefund.aggregate({
          where: {
            transactionId,
            status: { in: ["REQUESTED", "PROCESSING", "SUCCEEDED"] },
          },
          _sum: { amountMinor: true },
        });
        if (
          amount <= 0n ||
          (reserved._sum.amountMinor ?? 0n) + amount >
            transaction.amountCapturedMinor
        )
          problem(
            "REFUND_EXCEEDS_CAPTURED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Refund exceeds the captured balance",
          );
        const refund = await tx.onlinePaymentRefund.create({
          data: {
            workspaceId,
            transactionId,
            provider: transaction.provider,
            amountMinor: amount,
            currency: transaction.currency,
            reason,
            requestedById: userId,
            idempotencyKey,
          },
        });
        await tx.onlinePaymentTransaction.update({
          where: { id: transaction.id },
          data: { version: { increment: 1 } },
        });
        await this.asyncEvents.record(tx, {
          eventName: "payment.refund_requested.v1",
          aggregateType: "OnlinePaymentRefund",
          aggregateId: refund.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `refund-requested:${refund.id}`,
          payload: {
            subject: { refundId: refund.id, transactionId },
            paymentRefund: { refundId: refund.id },
          },
        });
        return { refund, transaction, replay: false };
      },
    );
    if (
      prepared.replay &&
      !["REQUESTED", "PROCESSING"].includes(prepared.refund.status)
    )
      return jsonSafe({ ...prepared.refund, replayed: true });
    const provider = await this.payments.refundPayment({
      transactionId: prepared.transaction.providerPaymentId,
      refundId: prepared.refund.id,
      amountMinor,
      currency: prepared.refund.currency,
    });
    const result = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${prepared.transaction.id}, 0))
        `;
        const refund = await tx.onlinePaymentRefund.update({
          where: { id: prepared.refund.id },
          data: {
            providerRefundId: provider.providerRefundId,
            status: provider.status,
            completedAt: provider.status === "SUCCEEDED" ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (provider.status === "SUCCEEDED") {
          const currentTransaction =
            await tx.onlinePaymentTransaction.findUniqueOrThrow({
              where: { id: prepared.transaction.id },
            });
          const checkout = await tx.onlinePaymentCheckout.findUniqueOrThrow({
            where: { id: prepared.transaction.checkoutId },
          });
          const totalRefunded =
            currentTransaction.amountRefundedMinor + refund.amountMinor;
          if (totalRefunded > currentTransaction.amountCapturedMinor)
            problem(
              "REFUND_EXCEEDS_CAPTURED",
              HttpStatus.UNPROCESSABLE_ENTITY,
              "Refund exceeds the captured balance",
            );
          await tx.onlinePaymentTransaction.update({
            where: { id: currentTransaction.id },
            data: {
              amountRefundedMinor: totalRefunded,
              status:
                totalRefunded === currentTransaction.amountCapturedMinor
                  ? "REFUNDED"
                  : "PARTIALLY_REFUNDED",
              version: { increment: 1 },
            },
          });
          const original = await tx.paymentRecord.findUnique({
            where: {
              sourceType_sourceId: {
                sourceType: "ONLINE_PAYMENT",
                sourceId: prepared.transaction.id,
              },
            },
          });
          await tx.paymentRecord.upsert({
            where: {
              sourceType_sourceId: {
                sourceType: "ONLINE_REFUND",
                sourceId: refund.id,
              },
            },
            create: {
              workspaceId,
              paymentScheduleEntryId: checkout.paymentScheduleEntryId,
              budgetItemId: checkout.budgetItemId,
              bookingId: checkout.bookingId,
              contractId: checkout.contractId,
              vendorOrganizationId: checkout.vendorOrganizationId,
              amountMinor: refund.amountMinor,
              currency: refund.currency,
              entryType: "REFUND",
              paidAt: new Date(),
              method: "CARD_EXTERNAL",
              status: "CONFIRMED",
              reference: provider.providerRefundId,
              originalPaymentId: original?.id,
              sourceType: "ONLINE_REFUND",
              sourceId: refund.id,
              createdById: userId,
              confirmedById: userId,
              confirmedAt: new Date(),
            },
            update: {},
          });
          const scheduleLedger = await tx.paymentRecord.findMany({
            where: {
              workspaceId,
              paymentScheduleEntryId: checkout.paymentScheduleEntryId,
              status: "CONFIRMED",
            },
            select: { amountMinor: true, entryType: true },
          });
          const paidMinor = scheduleLedger.reduce(
            (sum, entry) =>
              sum +
              (entry.entryType === "PAYMENT"
                ? entry.amountMinor
                : -entry.amountMinor),
            0n,
          );
          const schedule = await tx.paymentScheduleEntry.findUniqueOrThrow({
            where: { id: checkout.paymentScheduleEntryId },
          });
          await tx.paymentScheduleEntry.update({
            where: { id: schedule.id },
            data: {
              paidMinor,
              status:
                paidMinor >= schedule.amountMinor
                  ? "PAID"
                  : paidMinor > 0n
                    ? "PARTIALLY_PAID"
                    : "UPCOMING",
              version: { increment: 1 },
            },
          });
          const budgetLedger = await tx.paymentRecord.findMany({
            where: {
              workspaceId,
              budgetItemId: checkout.budgetItemId,
              status: "CONFIRMED",
            },
            select: { amountMinor: true, entryType: true },
          });
          const budgetPaidMinor = budgetLedger.reduce(
            (sum, entry) =>
              sum +
              (entry.entryType === "PAYMENT"
                ? entry.amountMinor
                : -entry.amountMinor),
            0n,
          );
          await tx.budgetItem.update({
            where: { id: checkout.budgetItemId },
            data: {
              paidMinor: budgetPaidMinor,
              version: { increment: 1 },
            },
          });
          await this.asyncEvents.record(tx, {
            eventName: "payment.refund_completed.v1",
            aggregateType: "OnlinePaymentRefund",
            aggregateId: refund.id,
            aggregateVersion: refund.version,
            workspaceId,
            actorUserId: userId,
            correlationId,
            deduplicationKey: `refund-completed:${refund.id}`,
            payload: {
              subject: { refundId: refund.id, transactionId },
              paymentStatusProjection: { transactionId },
            },
          });
        }
        return refund;
      },
    );
    return jsonSafe({ ...result, replayed: false });
  }
}

import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable, type HttpStatus } from "@nestjs/common";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import QRCode from "qrcode";
import {
  eventMediaStorageConfiguration,
  type ApiEnvironment,
} from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import type {
  ApiProblemCode,
  mediaPortalLiveGallerySchema,
  mediaPortalSettingsSchema,
  mediaPortalUploadSchema,
} from "@weddingos/contracts";
import type { z } from "zod";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { AsyncService } from "../async/async.service";
import { problem } from "../common/problem";
import {
  createOpaqueToken,
  hashToken,
  encryptSensitive,
  decryptSensitive,
} from "../guests/sensitive.crypto";
import {
  capabilityAllowedByWorkspacePlan,
  effectiveWorkspacePlanKey,
  workspacePlan,
} from "../workspace-billing/workspace-billing.catalog";

export const MEDIA_LIMITS = {
  imageMaxBytes: 20 * 1024 * 1024,
  videoMaxBytes: 100 * 1024 * 1024,
  maximumBytes: 5 * 1024 * 1024 * 1024,
  maximumFiles: 1000,
  contentTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ],
};
type Tx = Prisma.TransactionClient;
type Portal = Awaited<ReturnType<Tx["eventMediaPortal"]["findFirstOrThrow"]>>;
type Upload = z.infer<typeof mediaPortalUploadSchema>;
type LiveGallerySettings = z.infer<typeof mediaPortalLiveGallerySchema>;
function fail(status: number, code: string, detail: string): never {
  const codes: Record<string, ApiProblemCode> = {
    MEDIA_COLLECTION_FULL: "USAGE_LIMIT_REACHED",
    MEDIA_UPLOAD_EXPIRED: "UPLOAD_EXPIRED",
    MEDIA_UPLOAD_MISMATCH: "UPLOAD_MISMATCH",
    UPLOAD_CONFLICT: "IDEMPOTENCY_CONFLICT",
    MEDIA_SCAN_PENDING: "DOCUMENT_NOT_AVAILABLE",
    MEDIA_KEY_UNAVAILABLE: "ASYNC_DEPENDENCY_UNAVAILABLE",
  };
  return problem(
    codes[code] ??
      (status === 404
        ? "NOT_FOUND"
        : status === 409
          ? "VERSION_CONFLICT"
          : status === 410
            ? "TOKEN_EXPIRED"
            : "VALIDATION_FAILED"),
    status as HttpStatus,
    "Colectarea momentelor",
    detail,
  );
}
export function validatePortalFile(
  input: Pick<Upload, "mediaType" | "contentType" | "sizeBytes">,
) {
  const max =
    input.mediaType === "IMAGE"
      ? MEDIA_LIMITS.imageMaxBytes
      : MEDIA_LIMITS.videoMaxBytes;
  if (
    !MEDIA_LIMITS.contentTypes.includes(input.contentType) ||
    !input.contentType.startsWith(
      input.mediaType === "IMAGE" ? "image/" : "video/",
    ) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > max
  )
    fail(
      422,
      "MEDIA_FILE_INVALID",
      "Alege o fotografie de maximum 20 MB sau un video de maximum 100 MB.",
    );
  return max;
}

@Injectable()
export class MediaPortalService {
  private readonly defaultStorage: S3Client;
  private readonly defaultPublicStorage: S3Client;
  private readonly eventMediaStorage: S3Client;
  private readonly eventMediaPublicStorage: S3Client;
  private readonly eventStorage: ReturnType<
    typeof eventMediaStorageConfiguration
  >;
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly events: AsyncService,
    @Inject(API_ENVIRONMENT) private readonly env: ApiEnvironment,
  ) {
    const defaultConfig = {
      region: env.OBJECT_STORAGE_REGION,
      forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
      },
    };
    this.defaultStorage = new S3Client({
      ...defaultConfig,
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
    });
    this.defaultPublicStorage = new S3Client({
      ...defaultConfig,
      endpoint: env.OBJECT_STORAGE_PUBLIC_ENDPOINT,
    });
    this.eventStorage = eventMediaStorageConfiguration(env);
    const eventConfig = {
      region: this.eventStorage.region,
      forcePathStyle: this.eventStorage.forcePathStyle,
      credentials: {
        accessKeyId: this.eventStorage.accessKey,
        secretAccessKey: this.eventStorage.secretKey,
      },
    };
    this.eventMediaStorage = new S3Client({
      ...eventConfig,
      endpoint: this.eventStorage.endpoint,
    });
    this.eventMediaPublicStorage = new S3Client({
      ...eventConfig,
      endpoint: this.eventStorage.publicEndpoint,
    });
  }
  private client(provider: string, publicEndpoint = false) {
    if (provider === "bunny-s3")
      return publicEndpoint
        ? this.eventMediaPublicStorage
        : this.eventMediaStorage;
    return publicEndpoint ? this.defaultPublicStorage : this.defaultStorage;
  }
  private bunnyDeliveryUrl(objectKey: string, expiresInSeconds: number) {
    if (!this.eventStorage.cdnHostname || !this.eventStorage.cdnTokenKey)
      throw new Error("Bunny CDN delivery is not configured");
    const path = `/${objectKey}`;
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = createHash("sha256")
      .update(`${this.eventStorage.cdnTokenKey}${path}${expires}`)
      .digest("base64url");
    return `https://${this.eventStorage.cdnHostname}${path}?token=${token}&expires=${expires}`;
  }
  private get key() {
    return {
      keyId: this.env.OUTBOX_ENCRYPTION_KEY_ID,
      secret: this.env.OUTBOX_ENCRYPTION_KEY,
    };
  }
  private async resource(tx: Tx, row: Portal) {
    const token = decryptSensitive(row.tokenEncrypted, this.key);
    if (!token)
      fail(
        503,
        "MEDIA_KEY_UNAVAILABLE",
        "Linkul nu poate fi încărcat momentan.",
      );
    // Fragment keeps the bearer token out of HTTP access logs and referrer headers.
    const url = `${this.env.WEB_URL}/event-upload#${token}`;
    const gallery = row.liveGalleryId
      ? await tx.galleryCollection.findFirst({
          where: {
            id: row.liveGalleryId,
            workspaceId: row.workspaceId,
            weddingEventId: row.weddingEventId,
          },
        })
      : null;
    return {
      id: row.id,
      weddingEventId: row.weddingEventId,
      eventName: row.eventName,
      active: row.active,
      expiresAt: row.expiresAt.toISOString(),
      version: row.version,
      uploadCount: row.uploadCount,
      reservedBytes: Number(row.reservedBytes),
      maximumBytes: MEDIA_LIMITS.maximumBytes,
      maximumFiles: MEDIA_LIMITS.maximumFiles,
      liveGalleryEnabled: row.liveGalleryEnabled,
      liveGallery: gallery
        ? {
            id: gallery.id,
            name: gallery.name,
            status: gallery.status,
            itemCount: await tx.galleryCollectionItem.count({
              where: { collectionId: gallery.id },
            }),
            updatedAt: gallery.updatedAt.toISOString(),
          }
        : null,
      url,
      qrDataUrl: await QRCode.toDataURL(url, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: "M",
      }),
    };
  }
  list(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: await Promise.all(
        (
          await tx.eventMediaPortal.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
          })
        ).map((row) => this.resource(tx, row)),
      ),
      events: (
        await tx.weddingEvent.findMany({
          where: { workspaceId, deletedAt: null },
          select: { id: true, title: true },
        })
      ).map((e) => ({ id: e.id, name: e.title })),
    }));
  }
  save(
    userId: string,
    workspaceId: string,
    input: z.infer<typeof mediaPortalSettingsSchema>,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const event = await tx.weddingEvent.findFirst({
        where: { id: input.weddingEventId, workspaceId, deletedAt: null },
      });
      if (!event) fail(404, "EVENT_NOT_FOUND", "Evenimentul nu există.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${event.id}, 0))`;
      const row = await tx.eventMediaPortal.findUnique({
        where: { weddingEventId: event.id },
      });
      if (row && input.version !== row.version)
        fail(
          409,
          "VERSION_CONFLICT",
          "Setările s-au schimbat. Actualizează pagina și reîncearcă.",
        );
      const expiresAt = input.expiresAt
        ? new Date(input.expiresAt)
        : (row?.expiresAt ?? new Date(Date.now() + 30 * 86400_000));
      if (expiresAt <= new Date() && input.active !== false)
        fail(
          422,
          "MEDIA_EXPIRY_INVALID",
          "Alege o dată de expirare în viitor.",
        );
      if (expiresAt.getTime() > Date.now() + 366 * 86400_000)
        fail(
          422,
          "MEDIA_EXPIRY_INVALID",
          "Colectarea poate rămâne activă cel mult un an.",
        );
      const token = createOpaqueToken();
      const credentials = {
        tokenHash: hashToken(token),
        tokenEncrypted: encryptSensitive(token, this.key)!,
      };
      const saved = row
        ? await tx.eventMediaPortal.update({
            where: { id: row.id },
            data: {
              active: input.active ?? row.active,
              expiresAt,
              eventName: event.title,
              ...(input.rotate ? credentials : {}),
              version: { increment: 1 },
            },
          })
        : await tx.eventMediaPortal.create({
            data: {
              ...credentials,
              workspaceId,
              weddingEventId: event.id,
              eventName: event.title,
              createdById: userId,
              active: true,
              expiresAt,
            },
          });
      return this.resource(tx, saved);
    });
  }
  saveLiveGallery(
    userId: string,
    workspaceId: string,
    input: LiveGallerySettings,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const portal = await tx.eventMediaPortal.findFirst({
        where: {
          workspaceId,
          weddingEventId: input.weddingEventId,
        },
      });
      if (!portal)
        fail(
          404,
          "MEDIA_LINK_INVALID",
          "Activează mai întâi codul QR al evenimentului.",
        );
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${portal.id}, 0))`;
      let gallery = portal.liveGalleryId
        ? await tx.galleryCollection.findFirst({
            where: {
              id: portal.liveGalleryId,
              workspaceId,
              weddingEventId: portal.weddingEventId,
              status: { not: "ARCHIVED" },
            },
          })
        : null;
      if (input.enabled && !gallery) {
        gallery = await tx.galleryCollection.create({
          data: {
            workspaceId,
            weddingEventId: portal.weddingEventId,
            name: "Momentele evenimentului",
            description:
              "Fotografii și clipuri aprobate de organizator, adunate prin codul QR Sarbato.",
            visibility: "GUESTS_WITH_ACCESS",
            createdById: userId,
          },
        });
      }
      if (gallery && input.enabled) {
        const candidates = await tx.guestMoment.findMany({
          where: {
            workspaceId,
            weddingEventId: portal.weddingEventId,
            status: { in: ["APPROVED", "PUBLISHED"] },
          },
          orderBy: { submittedAt: "asc" },
        });
        const approvedMedia = await tx.guestMomentMedia.findMany({
          where: {
            workspaceId,
            guestMomentId: { in: candidates.map((moment) => moment.id) },
            moderationStatus: "APPROVED",
          },
          select: { guestMomentId: true },
        });
        const approved = new Set(
          approvedMedia.map((medium) => medium.guestMomentId),
        );
        const momentIds = candidates
          .map((moment) => moment.id)
          .filter((id) => approved.has(id));
        await tx.galleryCollectionItem.deleteMany({
          where: { collectionId: gallery.id },
        });
        if (momentIds.length)
          await tx.galleryCollectionItem.createMany({
            data: momentIds.map((guestMomentId, position) => ({
              workspaceId,
              collectionId: gallery!.id,
              guestMomentId,
              position,
            })),
          });
        const publishedAt = new Date();
        gallery = await tx.galleryCollection.update({
          where: { id: gallery.id },
          data: {
            status: "PUBLISHED",
            visibility: "GUESTS_WITH_ACCESS",
            publishedAt,
            version: { increment: 1 },
          },
        });
        if (momentIds.length)
          await tx.guestMoment.updateMany({
            where: { id: { in: momentIds }, workspaceId },
            data: { status: "PUBLISHED", publishedAt },
          });
      } else if (gallery) {
        gallery = await tx.galleryCollection.update({
          where: { id: gallery.id },
          data: {
            status: "DRAFT",
            publishedAt: null,
            version: { increment: 1 },
          },
        });
      }
      const updated = await tx.eventMediaPortal.update({
        where: { id: portal.id },
        data: {
          liveGalleryEnabled: input.enabled,
          liveGalleryId: gallery?.id ?? null,
          version: { increment: 1 },
        },
      });
      return this.resource(tx, updated);
    });
  }
  private withPortal<T>(
    token: string,
    uploadToken: string | undefined,
    action: (tx: Tx, portal: Portal) => Promise<T>,
  ) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      fail(404, "MEDIA_LINK_INVALID", "Linkul de încărcare nu este valid.");
    return this.database.withContext(
      {
        mediaPortalTokenHash: hashToken(token),
        mediaUploadTokenHash: uploadToken ? hashToken(uploadToken) : undefined,
      },
      async (tx) => {
        const portal = await tx.eventMediaPortal.findUnique({
          where: { tokenHash: hashToken(token) },
        });
        if (!portal)
          fail(
            404,
            "MEDIA_LINK_INVALID",
            "Linkul nu mai este disponibil. Solicită codul QR actual de la organizator.",
          );
        return action(tx, portal);
      },
      { timeout: 20_000 },
    );
  }
  private active(portal: Portal) {
    if (!portal.active || portal.expiresAt <= new Date())
      fail(
        410,
        "MEDIA_COLLECTION_CLOSED",
        "Organizatorul a închis colectarea momentelor.",
      );
  }
  private async capacity(tx: Tx, portal: Portal) {
    const [row] = await tx.$queryRaw<
      {
        plan_key: "FREE" | "PLUS" | "PRO" | null;
        status: string | null;
        grace_period_end_at: Date | null;
        used_bytes: bigint;
      }[]
    >`
      SELECT * FROM public.weddingos_media_portal_capacity(${portal.id}::uuid)`;
    const plan = effectiveWorkspacePlanKey(
      row?.plan_key,
      row?.status,
      row?.grace_period_end_at,
    );
    return {
      allowed: capabilityAllowedByWorkspacePlan("guest_moment.upload", plan),
      maximum: Number(workspacePlan(plan).entitlements.STORAGE_BYTES),
      used: Number(row?.used_bytes ?? 0n),
    };
  }
  bootstrap(token: string) {
    return this.withPortal(token, undefined, async (tx, portal) => ({
      eventName: portal.eventName,
      active:
        portal.active &&
        portal.expiresAt > new Date() &&
        (await this.capacity(tx, portal)).allowed,
      expiresAt: portal.expiresAt.toISOString(),
      imageMaxBytes: MEDIA_LIMITS.imageMaxBytes,
      videoMaxBytes: MEDIA_LIMITS.videoMaxBytes,
      contentTypes: MEDIA_LIMITS.contentTypes,
      liveGalleryEnabled:
        portal.liveGalleryEnabled && portal.expiresAt > new Date(),
    }));
  }
  gallery(token: string) {
    return this.withPortal(token, undefined, async (tx, portal) => {
      if (
        !portal.liveGalleryEnabled ||
        !portal.liveGalleryId ||
        portal.expiresAt <= new Date()
      )
        return { enabled: false, gallery: null };
      const gallery = await tx.galleryCollection.findFirst({
        where: {
          id: portal.liveGalleryId,
          workspaceId: portal.workspaceId,
          weddingEventId: portal.weddingEventId,
          status: "PUBLISHED",
          visibility: "GUESTS_WITH_ACCESS",
        },
      });
      if (!gallery) return { enabled: true, gallery: null };
      const items = await tx.galleryCollectionItem.findMany({
        where: { collectionId: gallery.id, workspaceId: portal.workspaceId },
        orderBy: { position: "asc" },
      });
      const moments = await tx.guestMoment.findMany({
        where: {
          id: { in: items.map((item) => item.guestMomentId) },
          workspaceId: portal.workspaceId,
          weddingEventId: portal.weddingEventId,
          status: "PUBLISHED",
        },
      });
      const media = await tx.guestMomentMedia.findMany({
        where: {
          guestMomentId: { in: moments.map((moment) => moment.id) },
          workspaceId: portal.workspaceId,
          moderationStatus: "APPROVED",
        },
      });
      const stored = await tx.storedObject.findMany({
        where: {
          id: {
            in: media.flatMap((medium) =>
              [medium.storedObjectId, medium.derivativeObjectId].filter(
                (id): id is string => Boolean(id),
              ),
            ),
          },
          workspaceId: portal.workspaceId,
          status: "AVAILABLE",
          OR: [
            {
              id: {
                in: media.map((medium) => medium.storedObjectId),
              },
              scanStatus: "CLEAN",
            },
            {
              id: {
                in: media.flatMap((medium) =>
                  medium.derivativeObjectId ? [medium.derivativeObjectId] : [],
                ),
              },
              scanStatus: { in: ["CLEAN", "NOT_REQUIRED"] },
            },
          ],
        },
      });
      const publicItems = await Promise.all(
        items
          .flatMap((item) => {
            const moment = moments.find(
              (candidate) => candidate.id === item.guestMomentId,
            );
            const medium = media.find(
              (candidate) => candidate.guestMomentId === item.guestMomentId,
            );
            const original = stored.find(
              (candidate) => candidate.id === medium?.storedObjectId,
            );
            const preview = stored.find(
              (candidate) => candidate.id === medium?.derivativeObjectId,
            );
            return moment && medium && original && preview
              ? [{ item, moment, medium, original, preview }]
              : [];
          })
          .map(async ({ item, moment, medium, original, preview }) => ({
            id: item.id,
            momentId: moment.id,
            position: item.position,
            caption: moment.caption,
            contributorName: moment.contributorName,
            mediaType: medium.mediaType,
            width: medium.width,
            height: medium.height,
            durationMs: medium.durationMs,
            previewUrl: await this.inlineUrl(preview, 900),
            contentUrl: await this.inlineUrl(original, 900),
          })),
      );
      return {
        enabled: true,
        gallery: {
          id: gallery.id,
          name: gallery.name,
          description: gallery.description,
          updatedAt: gallery.updatedAt.toISOString(),
          items: publicItems,
        },
      };
    });
  }
  private inlineUrl(
    stored: {
      storageProvider: string;
      bucket: string;
      objectKey: string;
      contentTypeDetected: string | null;
      contentTypeClaimed: string;
    },
    expiresIn: number,
  ) {
    return stored.storageProvider === "bunny-s3"
      ? this.bunnyDeliveryUrl(stored.objectKey, expiresIn)
      : getSignedUrl(
          this.client(stored.storageProvider, true),
          new GetObjectCommand({
            Bucket: stored.bucket,
            Key: stored.objectKey,
            ResponseContentType:
              stored.contentTypeDetected ?? stored.contentTypeClaimed,
          }),
          { expiresIn },
        );
  }
  create(token: string, input: Upload) {
    const maximum = validatePortalFile(input);
    return this.withPortal(token, input.uploadToken, async (tx, portal) => {
      this.active(portal);
      // Serialize reservations and idempotent retries, including simultaneous mobile requests.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${portal.id}, 0))`;
      // Same workspace storage lock used by documents and other quota consumers.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sarbato-workspace-quota:${portal.workspaceId}:STORAGE_BYTES`}, 0))`;
      const capacity = await this.capacity(tx, portal);
      if (!capacity.allowed)
        fail(
          410,
          "MEDIA_COLLECTION_CLOSED",
          "Colectarea nu mai este disponibilă pentru acest eveniment.",
        );
      const existing = await tx.guestMoment.findUnique({
        where: { uploadTokenHash: hashToken(input.uploadToken) },
      });
      if (existing) {
        const session = await tx.guestMomentUploadSession.findFirstOrThrow({
          where: { guestMomentId: existing.id },
        });
        const stored = await tx.storedObject.findUniqueOrThrow({
          where: { id: session.storedObjectId },
        });
        if (
          existing.mediaPortalId !== portal.id ||
          stored.checksumSha256 !== input.checksumSha256.toLowerCase() ||
          Number(stored.sizeBytes) !== input.sizeBytes ||
          stored.contentTypeClaimed !== input.contentType
        )
          fail(
            409,
            "UPLOAD_CONFLICT",
            "Acest fișier are deja o altă sesiune de încărcare.",
          );
        if (session.status === "COMPLETED")
          return { momentId: existing.id, completed: true as const };
        const expiresAt = new Date(Date.now() + 15 * 60_000);
        await tx.guestMomentUploadSession.update({
          where: { id: session.id },
          data: { expiresAt },
        });
        return this.uploadResponse(
          existing.id,
          stored.storageProvider,
          stored.bucket,
          stored.objectKey,
          input.contentType,
          expiresAt,
        );
      }
      if (capacity.used + input.sizeBytes > capacity.maximum)
        fail(
          409,
          "MEDIA_COLLECTION_FULL",
          "Spațiul evenimentului este plin. Anunță organizatorul.",
        );
      const reserved = await tx.eventMediaPortal.updateMany({
        where: {
          id: portal.id,
          active: true,
          expiresAt: { gt: new Date() },
          reservedBytes: {
            lte: BigInt(MEDIA_LIMITS.maximumBytes - input.sizeBytes),
          },
          uploadCount: { lt: MEDIA_LIMITS.maximumFiles },
        },
        data: {
          reservedBytes: { increment: BigInt(input.sizeBytes) },
          uploadCount: { increment: 1 },
        },
      });
      if (!reserved.count)
        fail(
          409,
          "MEDIA_COLLECTION_FULL",
          "Spațiul de colectare este plin. Anunță organizatorul.",
        );
      const moment = await tx.guestMoment.create({
        data: {
          workspaceId: portal.workspaceId,
          weddingEventId: portal.weddingEventId,
          mediaPortalId: portal.id,
          uploadTokenHash: hashToken(input.uploadToken),
          contributorName: input.contributorName,
          caption: input.caption,
          status: "UPLOADING",
        },
      });
      const storedId = randomUUID();
      const objectKey = `private/guest-moments/${portal.workspaceId}/${moment.id}/${randomUUID()}`;
      await tx.$executeRaw`INSERT INTO stored_objects (id, workspace_id, storage_provider, bucket, object_key, original_file_name,
        content_type_claimed, size_bytes, checksum_sha256, status, scan_status, updated_at)
        VALUES (${storedId}::uuid, ${portal.workspaceId}::uuid, ${this.eventStorage.provider}, ${this.eventStorage.bucket},
        ${objectKey}, ${input.originalFileName}, ${input.contentType}, ${BigInt(input.sizeBytes)}, ${input.checksumSha256.toLowerCase()},
        'UPLOADING'::"StoredObjectStatus", 'PENDING'::"StoredObjectScanStatus", NOW())`;
      const media = await tx.guestMomentMedia.create({
        data: {
          workspaceId: portal.workspaceId,
          guestMomentId: moment.id,
          storedObjectId: storedId,
          mediaType: input.mediaType,
        },
      });
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      await tx.guestMomentUploadSession.create({
        data: {
          workspaceId: portal.workspaceId,
          guestMomentId: moment.id,
          guestMomentMediaId: media.id,
          storedObjectId: storedId,
          expectedContentTypes: [input.contentType],
          maximumSizeBytes: BigInt(maximum),
          expectedChecksum: input.checksumSha256.toLowerCase(),
          expiresAt,
          idempotencyKey: hashToken(input.uploadToken),
        },
      });
      return this.uploadResponse(
        moment.id,
        this.eventStorage.provider,
        this.eventStorage.bucket,
        objectKey,
        input.contentType,
        expiresAt,
      );
    });
  }
  private async uploadResponse(
    momentId: string,
    storageProvider: string,
    bucket: string,
    objectKey: string,
    contentType: string,
    expiresAt: Date,
  ) {
    return {
      momentId,
      completed: false as const,
      upload: {
        method: "PUT" as const,
        url: await getSignedUrl(
          this.client(storageProvider, true),
          new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            ContentType: contentType,
          }),
          { expiresIn: 900 },
        ),
        headers: { "content-type": contentType },
        expiresAt: expiresAt.toISOString(),
      },
    };
  }
  complete(
    token: string,
    uploadToken: string,
    momentId: string,
    correlationId: string,
  ) {
    return this.withPortal(token, uploadToken, async (tx, portal) => {
      this.active(portal);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${momentId}, 0))`;
      const moment = await tx.guestMoment.findFirst({
        where: {
          id: momentId,
          mediaPortalId: portal.id,
          uploadTokenHash: hashToken(uploadToken),
        },
      });
      if (!moment)
        fail(404, "MEDIA_UPLOAD_NOT_FOUND", "Încărcarea nu a fost găsită.");
      const session = await tx.guestMomentUploadSession.findFirstOrThrow({
        where: { guestMomentId: moment.id },
      });
      if (session.status === "COMPLETED")
        return { id: moment.id, status: moment.status };
      if (session.expiresAt <= new Date())
        fail(
          409,
          "MEDIA_UPLOAD_EXPIRED",
          "Sesiunea a expirat. Reîncearcă încărcarea.",
        );
      const stored = await tx.storedObject.findUniqueOrThrow({
        where: { id: session.storedObjectId },
      });
      const head = await this.client(stored.storageProvider)
        .send(
          new HeadObjectCommand({
            Bucket: stored.bucket,
            Key: stored.objectKey,
          }),
        )
        .catch((error: unknown) => {
          if (
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode === 404
          )
            fail(
              422,
              "MEDIA_UPLOAD_MISMATCH",
              "Fișierul nu a ajuns complet. Reîncearcă încărcarea.",
            );
          throw error;
        });
      if (
        Number(head.ContentLength) !== Number(stored.sizeBytes) ||
        !session.expectedContentTypes.includes(head.ContentType ?? "")
      )
        fail(
          422,
          "MEDIA_UPLOAD_MISMATCH",
          "Fișierul încărcat nu corespunde celui selectat.",
        );
      await tx.storedObject.update({
        where: { id: stored.id },
        data: { status: "UPLOADED", etag: head.ETag },
      });
      await tx.guestMomentUploadSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      const updated = await tx.guestMoment.update({
        where: { id: moment.id },
        data: { status: "PROCESSING", version: { increment: 1 } },
      });
      await this.events.record(tx, {
        eventName: "guest_moment.uploaded.v1",
        aggregateType: "GuestMoment",
        aggregateId: moment.id,
        aggregateVersion: updated.version,
        workspaceId: portal.workspaceId,
        correlationId,
        deduplicationKey: `guest-moment-uploaded:${moment.id}`,
        payload: {
          subject: { momentId: moment.id },
          guestMomentScan: {
            momentId: moment.id,
            mediaId: session.guestMomentMediaId,
            storedObjectId: stored.id,
          },
        },
      });
      return { id: moment.id, status: updated.status };
    });
  }
  download(
    userId: string,
    workspaceId: string,
    momentId: string,
    attachment = true,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const moment = await tx.guestMoment.findFirst({
        where: {
          id: momentId,
          workspaceId,
          status: { notIn: ["DELETED", "UPLOADING", "PROCESSING", "REJECTED"] },
        },
      });
      if (!moment)
        fail(
          404,
          "MEDIA_UNAVAILABLE",
          "Materialul nu este disponibil pentru descărcare.",
        );
      const media = await tx.guestMomentMedia.findUniqueOrThrow({
        where: { guestMomentId: moment.id },
      });
      const stored = await tx.storedObject.findFirst({
        where: {
          id: media.storedObjectId,
          workspaceId,
          status: "AVAILABLE",
          scanStatus: "CLEAN",
        },
      });
      if (!stored)
        fail(
          409,
          "MEDIA_SCAN_PENDING",
          "Materialul nu a trecut încă de verificarea de siguranță.",
        );
      return {
        url:
          stored.storageProvider === "bunny-s3"
            ? this.bunnyDeliveryUrl(stored.objectKey, attachment ? 60 : 900)
            : await getSignedUrl(
                this.client(stored.storageProvider, true),
                new GetObjectCommand({
                  Bucket: stored.bucket,
                  Key: stored.objectKey,
                  ResponseContentType:
                    stored.contentTypeDetected ?? stored.contentTypeClaimed,
                  ResponseContentDisposition: `${attachment ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(stored.originalFileName)}`,
                }),
                { expiresIn: attachment ? 60 : 900 },
              ),
        fileName: stored.originalFileName,
      };
    });
  }
}

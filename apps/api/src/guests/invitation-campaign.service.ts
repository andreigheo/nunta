import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  invitationContainsStarterContent,
  type ApplyInvitationSync,
  type CreateCampaign,
  type CreateInvitationVariant,
  type InvitationVariantOverrides,
  type SaveInvitationDraft,
  type SaveInvitationVariantDraft,
} from "@weddingos/contracts";
import type { ApiEnvironment } from "@weddingos/config";
import { Prisma } from "@weddingos/database";
import QRCode from "qrcode";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";
import { WorkspaceEntitlementService } from "../workspace-billing/workspace-entitlement.service";
import {
  invitationMediaReferences,
  resolveInvitationVariant,
  visibleInvitationDocument,
} from "./invitation-resolution";
import { hashToken, stableHash } from "./sensitive.crypto";

type Transaction = Prisma.TransactionClient;

@Injectable()
export class InvitationCampaignService {
  private readonly webUrl: string;
  private readonly webhookSecret: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(WorkspaceEntitlementService)
    private readonly entitlements: WorkspaceEntitlementService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.webUrl = environment.WEB_URL;
    this.webhookSecret = environment.OUTBOX_ENCRYPTION_KEY;
  }

  async site(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, (tx) =>
      this.siteInTransaction(tx, workspaceId),
    );
  }

  async saveDraft(
    userId: string,
    workspaceId: string,
    expectedVersion: number | null,
    input: SaveInvitationDraft,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        let site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        if (site && expectedVersion === null)
          precondition("If-Match is required for an existing invitation");
        if (site && site.version !== expectedVersion) conflict(site.version);
        if (!site) {
          const existingSlug = await tx.invitationSite.findUnique({
            where: { slug: input.slug },
          });
          if (existingSlug) validation("Invitation slug is already in use");
          site = await tx.invitationSite.create({
            data: {
              workspaceId,
              slug: input.slug,
              defaultLanguage: input.defaultLanguage,
              availableLanguages: input.availableLanguages,
              accessPolicy: input.accessPolicy,
            },
          });
        }
        const latest = await tx.invitationVersion.findFirst({
          where: { invitationSiteId: site.id },
          orderBy: { versionNumber: "desc" },
        });
        const version = await tx.invitationVersion.create({
          data: {
            workspaceId,
            invitationSiteId: site.id,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            document: input.document as Prisma.InputJsonValue,
            settings: input.settings as Prisma.InputJsonValue,
            language: input.defaultLanguage,
            createdById: userId,
            contentHash: stableHash({
              document: input.document,
              settings: input.settings,
              language: input.defaultLanguage,
            }),
          },
        });
        const updatedSite = await tx.invitationSite.update({
          where: { id: site.id },
          data: {
            slug: input.slug,
            currentDraftVersionId: version.id,
            defaultLanguage: input.defaultLanguage,
            availableLanguages: input.availableLanguages,
            accessPolicy: input.accessPolicy,
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          eventName: "invitation.draft_updated.v1",
          aggregateId: site.id,
          aggregateVersion: updatedSite.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_draft_updated",
          summary: "Draftul invitației digitale a fost salvat.",
        });
        return this.siteInTransaction(tx, workspaceId);
      },
    );
  }

  async publish(
    userId: string,
    workspaceId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const prior = await replay(
          tx,
          userId,
          "invitation.publish",
          idempotencyKey,
          { workspaceId, expectedVersion },
        );
        if (prior) return prior;
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        if (!site) notFound("Invitation site not found");
        if (site.version !== expectedVersion) conflict(site.version);
        if (!site.currentDraftVersionId)
          validation("Save an invitation draft before publishing");
        const preflight = await this.preflightInTransaction(tx, workspaceId);
        if (!preflight.ready)
          validation(preflight.errors.map((issue) => issue.message).join(" "));
        const [draft, form, eventCount] = await Promise.all([
          tx.invitationVersion.findUnique({
            where: { id: site.currentDraftVersionId },
          }),
          tx.rsvpFormDefinition.findUnique({ where: { workspaceId } }),
          tx.weddingEvent.count({
            where: {
              workspaceId,
              guestVisible: true,
              rsvpEnabled: true,
              status: { not: "CANCELLED" },
              deletedAt: null,
            },
          }),
        ]);
        if (!draft) notFound("Invitation draft not found");
        if (!form?.publishedVersionId)
          validation("Publish the RSVP form before the invitation");
        if (!eventCount)
          validation("At least one guest-visible RSVP event is required");
        const now = new Date();
        await tx.invitationVersion.update({
          where: { id: draft.id },
          data: { publishedAt: now },
        });
        const activeVariants = await tx.invitationVariant.findMany({
          where: { invitationSiteId: site.id, workspaceId, status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
        });
        for (const variant of activeVariants) {
          const sourceVersionId =
            variant.currentDraftVersionId ?? variant.publishedVersionId;
          if (!sourceVersionId)
            validation(`Variant ${variant.name} has no publishable draft`);
          const source = await tx.invitationVariantVersion.findFirst({
            where: {
              id: sourceVersionId,
              workspaceId,
              invitationVariantId: variant.id,
            },
          });
          if (!source)
            validation(`Variant ${variant.name} has no publishable draft`);
          let publishedVariantVersionId = source.id;
          if (source.baseInvitationVersionId !== draft.id) {
            const latest = await tx.invitationVariantVersion.findFirst({
              where: { invitationVariantId: variant.id },
              orderBy: { versionNumber: "desc" },
            });
            const snapshot = await tx.invitationVariantVersion.create({
              data: {
                workspaceId,
                invitationVariantId: variant.id,
                baseInvitationVersionId: draft.id,
                versionNumber: (latest?.versionNumber ?? 0) + 1,
                overrides: source.overrides as Prisma.InputJsonValue,
                createdById: userId,
                publishedAt: now,
                contentHash: stableHash({
                  baseInvitationVersionId: draft.id,
                  overrides: source.overrides,
                }),
              },
            });
            publishedVariantVersionId = snapshot.id;
          } else {
            await tx.invitationVariantVersion.update({
              where: { id: source.id },
              data: { publishedAt: now },
            });
          }
          await tx.invitationVariant.update({
            where: { id: variant.id },
            data: {
              currentDraftVersionId: publishedVariantVersionId,
              publishedVersionId: publishedVariantVersionId,
              version: { increment: 1 },
            },
          });
        }
        const updated = await tx.invitationSite.update({
          where: { id: site.id },
          data: {
            publishedVersionId: draft.id,
            status: "PUBLISHED",
            publishedAt: now,
            version: { increment: 1 },
          },
        });
        const recipientCount = await tx.invitationRecipient.count({
          where: {
            workspaceId,
            invitationSiteId: site.id,
            revokedAt: null,
          },
        });
        await this.event(tx, {
          eventName: "invitation.site_published.v1",
          aggregateId: site.id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_published",
          summary: "Invitația digitală a fost publicată.",
        });
        const response = {
          ...(await this.siteInTransaction(tx, workspaceId)),
          publication: {
            baseVersionId: draft.id,
            variantCount: activeVariants.length,
            recipientCount,
          },
        };
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "invitation.publish",
          idempotencyKey,
          { workspaceId, expectedVersion },
          response,
        );
        return response;
      },
    );
  }

  async unpublish(
    userId: string,
    workspaceId: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        if (!site) notFound("Invitation site not found");
        if (site.version !== expectedVersion) conflict(site.version);
        const updated = await tx.invitationSite.update({
          where: { id: site.id },
          data: { status: "UNPUBLISHED", version: { increment: 1 } },
        });
        await this.event(tx, {
          eventName: "invitation.site_unpublished.v1",
          aggregateId: site.id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_unpublished",
          summary: "Invitația digitală a fost retrasă.",
        });
        return this.siteInTransaction(tx, workspaceId);
      },
    );
  }

  async preview(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const site = await this.siteInTransaction(tx, workspaceId);
      if (!site) notFound("Invitation site not found");
      return {
        invitation: site.draft ?? site.published,
        events: await this.visibleEvents(tx, workspaceId),
        previewOnly: true,
      };
    });
  }

  async versions(userId: string, workspaceId: string, cursor?: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const site = await tx.invitationSite.findUnique({
        where: { workspaceId },
      });
      if (!site) notFound("Invitation site not found");
      const rows = await tx.invitationVersion.findMany({
        where: { workspaceId, invitationSiteId: site.id },
        orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
        take: 21,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      return {
        items: rows.slice(0, 20).map((row) => ({
          id: row.id,
          versionNumber: row.versionNumber,
          document: row.document,
          settings: row.settings,
          language: row.language,
          contentHash: row.contentHash,
          createdAt: row.createdAt.toISOString(),
          publishedAt: iso(row.publishedAt),
          isCurrentDraft: site.currentDraftVersionId === row.id,
          isPublished: site.publishedVersionId === row.id,
        })),
        nextCursor: rows.length > 20 ? rows[19]!.id : null,
      };
    });
  }

  async restoreVersion(
    userId: string,
    workspaceId: string,
    versionId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const input = { workspaceId, versionId, expectedVersion };
        const prior = await replay(
          tx,
          userId,
          "invitation.version.restore",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        if (!site) notFound("Invitation site not found");
        if (site.version !== expectedVersion) conflict(site.version);
        const source = await tx.invitationVersion.findFirst({
          where: { id: versionId, workspaceId, invitationSiteId: site.id },
        });
        if (!source) notFound("Invitation version not found");
        const latest = await tx.invitationVersion.findFirst({
          where: { invitationSiteId: site.id },
          orderBy: { versionNumber: "desc" },
        });
        const restored = await tx.invitationVersion.create({
          data: {
            workspaceId,
            invitationSiteId: site.id,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            document: source.document as Prisma.InputJsonValue,
            settings: source.settings as Prisma.InputJsonValue,
            language: source.language,
            createdById: userId,
            contentHash: source.contentHash,
          },
        });
        const updated = await tx.invitationSite.update({
          where: { id: site.id },
          data: {
            currentDraftVersionId: restored.id,
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          eventName: "invitation.version_restored.v1",
          aggregateId: site.id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_version_restored",
          summary: `Versiunea ${source.versionNumber} a fost copiată într-un draft nou.`,
        });
        const response = await this.siteInTransaction(tx, workspaceId);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "invitation.version.restore",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async variants(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: await this.variantsInTransaction(tx, workspaceId),
    }));
  }

  async createVariant(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateInvitationVariant,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const prior = await replay(
          tx,
          userId,
          "invitation.variant.create",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        if (!site?.currentDraftVersionId)
          validation("Save an invitation draft before creating variants");
        const duplicate = await tx.invitationVariant.findFirst({
          where: { invitationSiteId: site.id, code: input.code },
        });
        if (duplicate) validation("Invitation variant code is already in use");
        this.validateVariantOverrides(
          input.overrides,
          await this.draftSectionIds(tx, site),
        );
        const variant = await tx.invitationVariant.create({
          data: {
            workspaceId,
            invitationSiteId: site.id,
            name: input.name,
            code: input.code,
            createdById: userId,
          },
        });
        const draft = await tx.invitationVariantVersion.create({
          data: {
            workspaceId,
            invitationVariantId: variant.id,
            baseInvitationVersionId: site.currentDraftVersionId,
            versionNumber: 1,
            overrides: input.overrides as Prisma.InputJsonValue,
            createdById: userId,
            contentHash: stableHash(input.overrides),
          },
        });
        const updated = await tx.invitationVariant.update({
          where: { id: variant.id },
          data: { currentDraftVersionId: draft.id, version: { increment: 1 } },
        });
        await this.event(tx, {
          eventName: "invitation.variant_created.v1",
          aggregateType: "InvitationVariant",
          aggregateId: updated.id,
          invitationSiteId: site.id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_variant_created",
          summary: `Varianta ${updated.name} a fost creată.`,
        });
        const response = await this.mapVariant(tx, updated);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "invitation.variant.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async saveVariantDraft(
    userId: string,
    workspaceId: string,
    variantId: string,
    expectedVersion: number,
    input: SaveInvitationVariantDraft,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const variant = await tx.invitationVariant.findFirst({
          where: { id: variantId, workspaceId },
        });
        if (!variant) notFound("Invitation variant not found");
        if (variant.version !== expectedVersion) conflict(variant.version);
        if (variant.status !== "ACTIVE")
          validation("Archived variants cannot be edited");
        const site = await tx.invitationSite.findFirst({
          where: { id: variant.invitationSiteId, workspaceId },
        });
        if (!site?.currentDraftVersionId)
          validation("Save an invitation draft before editing variants");
        this.validateVariantOverrides(
          input.overrides,
          await this.draftSectionIds(tx, site),
        );
        const latest = await tx.invitationVariantVersion.findFirst({
          where: { invitationVariantId: variant.id },
          orderBy: { versionNumber: "desc" },
        });
        const draft = await tx.invitationVariantVersion.create({
          data: {
            workspaceId,
            invitationVariantId: variant.id,
            baseInvitationVersionId: site.currentDraftVersionId,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            overrides: input.overrides as Prisma.InputJsonValue,
            createdById: userId,
            contentHash: stableHash(input.overrides),
          },
        });
        const updated = await tx.invitationVariant.update({
          where: { id: variant.id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            currentDraftVersionId: draft.id,
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          eventName: "invitation.variant_draft_updated.v1",
          aggregateType: "InvitationVariant",
          aggregateId: updated.id,
          invitationSiteId: site.id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_variant_draft_updated",
          summary: `Draftul variantei ${updated.name} a fost salvat.`,
        });
        return this.mapVariant(tx, updated);
      },
    );
  }

  async archiveVariant(
    userId: string,
    workspaceId: string,
    variantId: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const variant = await tx.invitationVariant.findFirst({
          where: { id: variantId, workspaceId },
        });
        if (!variant) notFound("Invitation variant not found");
        if (variant.version !== expectedVersion) conflict(variant.version);
        const assignedRecipients = await tx.invitationRecipient.count({
          where: {
            workspaceId,
            invitationVariantId: variant.id,
            revokedAt: null,
          },
        });
        if (assignedRecipients)
          validation(
            `Mută cei ${assignedRecipients} destinatari pe invitația de bază sau pe altă variantă înainte de arhivare.`,
          );
        const updated = await tx.invitationVariant.update({
          where: { id: variant.id },
          data: { status: "ARCHIVED", version: { increment: 1 } },
        });
        await this.event(tx, {
          eventName: "invitation.variant_archived.v1",
          aggregateType: "InvitationVariant",
          aggregateId: updated.id,
          invitationSiteId: variant.invitationSiteId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_variant_archived",
          summary: `Varianta ${updated.name} a fost arhivată.`,
        });
        return this.mapVariant(tx, updated);
      },
    );
  }

  async preflight(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, (tx) =>
      this.preflightInTransaction(tx, workspaceId),
    );
  }

  async syncPreview(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const site = await tx.invitationSite.findUnique({
        where: { workspaceId },
      });
      if (!site?.currentDraftVersionId) notFound("Invitation draft not found");
      return this.syncPreviewInTransaction(
        tx,
        workspaceId,
        site.currentDraftVersionId,
      );
    });
  }

  async syncApply(
    userId: string,
    workspaceId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: ApplyInvitationSync,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replayInput = { workspaceId, expectedVersion, ...input };
        const prior = await replay(
          tx,
          userId,
          "invitation.sync.apply",
          idempotencyKey,
          replayInput,
        );
        if (prior) return prior;
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        if (!site?.currentDraftVersionId)
          notFound("Invitation draft not found");
        if (site.version !== expectedVersion) conflict(site.version);
        const preview = await this.syncPreviewInTransaction(
          tx,
          workspaceId,
          site.currentDraftVersionId,
        );
        if (preview.sourceRevision !== input.sourceRevision)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            "Connected invitation sources changed; review the preview again",
          );
        const selected = new Set(input.paths);
        const applicable = preview.differences.filter((item) =>
          selected.has(item.path),
        );
        if (applicable.length !== selected.size)
          validation("One or more selected sync paths are no longer available");
        const draft = await tx.invitationVersion.findUniqueOrThrow({
          where: { id: site.currentDraftVersionId },
        });
        const document = cloneRecord(draft.document);
        applySyncDifferences(document, applicable);
        const latest = await tx.invitationVersion.findFirst({
          where: { invitationSiteId: site.id },
          orderBy: { versionNumber: "desc" },
        });
        const synced = await tx.invitationVersion.create({
          data: {
            workspaceId,
            invitationSiteId: site.id,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            document: document as Prisma.InputJsonValue,
            settings: draft.settings as Prisma.InputJsonValue,
            language: draft.language,
            createdById: userId,
            contentHash: stableHash({
              document,
              settings: draft.settings,
              language: draft.language,
            }),
          },
        });
        const updated = await tx.invitationSite.update({
          where: { id: site.id },
          data: {
            currentDraftVersionId: synced.id,
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          eventName: "invitation.connected_data_applied.v1",
          aggregateId: site.id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_connected_data_applied",
          summary: `${applicable.length} câmpuri conectate au fost aplicate într-un draft nou.`,
        });
        const response = await this.siteInTransaction(tx, workspaceId);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "invitation.sync.apply",
          idempotencyKey,
          replayInput,
          response,
        );
        return response;
      },
    );
  }

  async createRecipients(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    householdIds: string[],
    guestIds: string[],
    invitationVersionId: string | undefined,
    invitationVariantId: string | null | undefined,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const input = {
          householdIds,
          guestIds,
          invitationVersionId,
          invitationVariantId,
        };
        const prior = await replay(
          tx,
          userId,
          "invitation.recipients.create",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        const versionId = invitationVersionId ?? site?.publishedVersionId;
        if (!versionId) validation("A published invitation is required");
        const version = await tx.invitationVersion.findFirst({
          where: { id: versionId, workspaceId, publishedAt: { not: null } },
        });
        if (!version) validation("Invitation version is not published");
        if (!site || version.invitationSiteId !== site.id)
          validation("Invitation version does not belong to the active site");
        if (invitationVariantId) {
          const variant = await tx.invitationVariant.findFirst({
            where: {
              id: invitationVariantId,
              workspaceId,
              invitationSiteId: site.id,
              status: "ACTIVE",
            },
          });
          if (!variant) validation("Invitation variant is unavailable");
          const publishedVariant = variant.publishedVersionId
            ? await tx.invitationVariantVersion.findFirst({
                where: {
                  id: variant.publishedVersionId,
                  invitationVariantId: variant.id,
                  workspaceId,
                  baseInvitationVersionId: version.id,
                  publishedAt: { not: null },
                },
              })
            : null;
          if (!publishedVariant)
            validation(
              "Publică varianta împreună cu invitația curentă înainte să o atribui destinatarilor.",
            );
        }
        const uniqueHouseholdIds = [...new Set(householdIds)];
        const uniqueGuestIds = [...new Set(guestIds)];
        const guests = await tx.guest.findMany({
          where: {
            id: { in: uniqueGuestIds },
            workspaceId,
            status: "ACTIVE",
          },
        });
        const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
        for (const guestId of uniqueGuestIds)
          if (!guestsById.has(guestId)) notFound("Guest not found");

        const resolvedHouseholdIds = [
          ...new Set([
            ...uniqueHouseholdIds,
            ...guests.map((guest) => guest.householdId).filter(Boolean),
          ]),
        ];
        const households = await tx.household.findMany({
          where: { id: { in: resolvedHouseholdIds }, workspaceId },
        });
        const householdsById = new Map(
          households.map((household) => [household.id, household]),
        );
        for (const householdId of uniqueHouseholdIds) {
          const household = householdsById.get(householdId);
          if (!household || household.deletedAt)
            notFound("Household not found");
        }

        type RecipientTarget =
          { kind: "household"; id: string } | { kind: "guest"; id: string };
        const targets: RecipientTarget[] = [];
        const targetKeys = new Set<string>();
        const addTarget = (target: RecipientTarget) => {
          const key = `${target.kind}:${target.id}`;
          if (targetKeys.has(key)) return;
          targetKeys.add(key);
          targets.push(target);
        };
        for (const householdId of uniqueHouseholdIds)
          addTarget({ kind: "household", id: householdId });
        for (const guestId of uniqueGuestIds) {
          const guest = guestsById.get(guestId)!;
          const household = householdsById.get(guest.householdId);
          addTarget(
            household
              ? { kind: "household", id: household.id }
              : { kind: "guest", id: guest.id },
          );
        }
        if (targets.length > 500)
          validation(
            "Poți pregăti cel mult 500 de destinatari într-o singură operațiune.",
          );

        // Nullable identity columns cannot provide cross-column uniqueness in
        // PostgreSQL. Serialize every canonical site-scoped identity before
        // looking it up so concurrent household/member requests cannot create
        // two active delivery rows. Sorting prevents overlapping batches from
        // taking the same advisory locks in a different order.
        for (const targetKey of [...targetKeys].sort())
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`invitation-recipient:${site.id}:${targetKey}`}, 0)
            )
          `;

        const targetHouseholdIds = targets
          .filter(
            (
              target,
            ): target is Extract<RecipientTarget, { kind: "household" }> =>
              target.kind === "household",
          )
          .map((target) => target.id);
        const householdMembers = targetHouseholdIds.length
          ? await tx.guest.findMany({
              where: {
                workspaceId,
                householdId: { in: targetHouseholdIds },
              },
              select: { id: true, householdId: true },
            })
          : [];
        const memberIdsByHousehold = new Map<string, string[]>();
        for (const member of householdMembers) {
          const memberIds = memberIdsByHousehold.get(member.householdId) ?? [];
          memberIds.push(member.id);
          memberIdsByHousehold.set(member.householdId, memberIds);
        }

        let created = 0;
        const recipientIds: string[] = [];
        for (const target of targets) {
          const household =
            target.kind === "household" ? householdsById.get(target.id)! : null;
          const guest =
            target.kind === "guest" ? guestsById.get(target.id)! : null;
          const memberGuestIds = household
            ? (memberIdsByHousehold.get(household.id) ?? [])
            : [];
          const identityWhere = household
            ? {
                OR: [
                  { householdId: household.id },
                  { guestId: { in: memberGuestIds } },
                ],
              }
            : { guestId: guest!.id };
          const identityRows = await tx.invitationRecipient.findMany({
            where: {
              workspaceId,
              invitationSiteId: site.id,
              revokedAt: null,
              ...identityWhere,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
          const directHouseholdRecipient = household
            ? identityRows.find(
                (recipient) => recipient.householdId === household.id,
              )
            : null;
          const existing = directHouseholdRecipient ?? identityRows[0];
          const preferredLanguage =
            household?.preferredLanguage ?? guest!.preferredLanguage;
          if (household && existing && !directHouseholdRecipient)
            await tx.invitationRecipient.update({
              where: { id: existing.id },
              data: {
                householdId: household.id,
                guestId: null,
                personalizationSnapshot: { householdName: household.name },
              },
            });
          if (existing)
            await tx.invitationRecipient.updateMany({
              where: {
                id: { in: identityRows.map((recipient) => recipient.id) },
              },
              data: {
                invitationVersionId: versionId,
                ...(invitationVariantId === undefined
                  ? {}
                  : { invitationVariantId }),
                preferredLanguage,
                version: { increment: 1 },
              },
            });
          const recipient = existing
            ? await tx.invitationRecipient.findUniqueOrThrow({
                where: { id: existing.id },
              })
            : await tx.invitationRecipient.create({
                data: {
                  workspaceId,
                  householdId: household?.id,
                  guestId: guest?.id,
                  invitationSiteId: site.id,
                  invitationVersionId: versionId,
                  invitationVariantId: invitationVariantId ?? null,
                  preferredLanguage,
                  personalizationSnapshot: household
                    ? { householdName: household.name }
                    : {
                        guestName:
                          `${guest!.firstName} ${guest!.lastName}`.trim(),
                      },
                },
              });
          if (!existing) created += 1;
          recipientIds.push(recipient.id);
        }
        await this.event(tx, {
          eventName: "invitation.recipients_created.v1",
          aggregateId: site!.id,
          deduplicationKey: `invitation-recipients:${workspaceId}:${idempotencyKey}`,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_recipients_created",
          summary: `Au fost pregătite ${created} invitații securizate.`,
        });
        const response = { created, recipientIds };
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "invitation.recipients.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  async addGuestsToCampaign(
    userId: string,
    workspaceId: string,
    campaignId: string,
    guestIds: string[],
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const input = { campaignId, guestIds: [...new Set(guestIds)] };
        const prior = await replay(
          tx,
          userId,
          "campaign.audience.add-guests",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const campaign = await tx.campaign.findFirst({
          where: { id: campaignId, workspaceId },
        });
        if (!campaign) notFound("Campaign not found");
        if (campaign.status !== "DRAFT")
          validation("Guests can only be added to a draft campaign");
        const uniqueGuestIds = [...new Set(guestIds)];
        const guests = await tx.guest.findMany({
          where: {
            workspaceId,
            id: { in: uniqueGuestIds },
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (guests.length !== uniqueGuestIds.length)
          validation("One or more guests are unavailable");
        const audienceFilter = jsonRecord(campaign.audienceFilter);
        const selected = [
          ...new Set([
            ...stringArray(audienceFilter.guestIds),
            ...uniqueGuestIds,
          ]),
        ];
        const updated = await tx.campaign.update({
          where: { id: campaign.id },
          data: {
            audienceFilter: {
              ...audienceFilter,
              guestIds: selected,
            } as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        const response = {
          campaign: await this.mapCampaign(tx, updated),
          affected: uniqueGuestIds.length,
        };
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "campaign.audience.add-guests",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async prepareRsvpReminder(
    userId: string,
    workspaceId: string,
    guestIds: string[],
    idempotencyKey: string,
    correlationId: string,
  ) {
    const invitationSite = await this.site(userId, workspaceId);
    if (!invitationSite?.published?.id)
      validation("A published invitation is required");
    const campaign = await this.createCampaign(
      userId,
      workspaceId,
      `${idempotencyKey}:campaign`,
      {
        name: `Reminder RSVP ${new Date().toISOString().slice(0, 10)}`,
        purpose: "RSVP_REMINDER",
        channel: "EMAIL",
        invitationVersionId: invitationSite.published.id,
        template: {
          subject: "Te rugăm să confirmi participarea",
          body: "Confirmă participarea folosind linkul securizat din invitația ta.",
        },
        audienceFilter: { guestIds: [...new Set(guestIds)] },
      },
      correlationId,
    );
    if (
      typeof campaign !== "object" ||
      campaign === null ||
      Array.isArray(campaign) ||
      !("id" in campaign) ||
      typeof campaign.id !== "string" ||
      !("version" in campaign) ||
      typeof campaign.version !== "number"
    )
      throw new Error("Campaign replay response is invalid");
    const audience = await this.audiencePreview(
      userId,
      workspaceId,
      campaign.id,
    );
    return { campaign, audience };
  }

  async recipients(userId: string, workspaceId: string, cursor?: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const cursorRow = cursor
        ? await tx.invitationRecipient.findFirst({
            where: { id: cursor, workspaceId, revokedAt: null },
            select: { id: true, createdAt: true },
          })
        : null;
      if (cursor && !cursorRow) validation("Recipient cursor is invalid");
      const afterCursor = cursorRow
        ? Prisma.sql`AND (ranked."created_at", ranked."id") > (${cursorRow.createdAt}, ${cursorRow.id}::uuid)`
        : Prisma.empty;
      const canonicalIds = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          WITH ranked AS (
            SELECT
              recipient."id",
              recipient."created_at",
              ROW_NUMBER() OVER (
                PARTITION BY
                  recipient."invitation_site_id",
                  CASE
                    WHEN COALESCE(recipient."household_id", member."household_id") IS NOT NULL
                      THEN 'household:' || COALESCE(recipient."household_id", member."household_id")::text
                    WHEN recipient."guest_id" IS NOT NULL
                      THEN 'guest:' || recipient."guest_id"::text
                    ELSE 'recipient:' || recipient."id"::text
                  END
                ORDER BY
                  CASE WHEN recipient."household_id" IS NOT NULL THEN 0 ELSE 1 END ASC,
                  recipient."created_at" ASC,
                  recipient."id" ASC
              ) AS identity_position
            FROM "invitation_recipients" recipient
            LEFT JOIN "guests" member
              ON member."id" = recipient."guest_id"
              AND member."workspace_id" = recipient."workspace_id"
            WHERE recipient."workspace_id" = ${workspaceId}::uuid
              AND recipient."revoked_at" IS NULL
          )
          SELECT ranked."id"
          FROM ranked
          WHERE ranked.identity_position = 1
            ${afterCursor}
          ORDER BY ranked."created_at" ASC, ranked."id" ASC
          LIMIT 51
        `,
      );
      const pageIds = canonicalIds.slice(0, 50).map((row) => row.id);
      const unorderedRows = await tx.invitationRecipient.findMany({
        where: { id: { in: pageIds }, workspaceId, revokedAt: null },
      });
      const byId = new Map(unorderedRows.map((row) => [row.id, row]));
      const rows = pageIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      const guestIds = rows
        .map((row) => row.guestId)
        .filter((id): id is string => Boolean(id));
      const guestRows = await tx.guest.findMany({
        where: { id: { in: guestIds }, workspaceId },
        select: {
          id: true,
          householdId: true,
          firstName: true,
          lastName: true,
          displayName: true,
        },
      });
      const guests = new Map(guestRows.map((row) => [row.id, row]));
      const canonicalHouseholdId = (row: (typeof rows)[number]) =>
        row.householdId ??
        (row.guestId ? guests.get(row.guestId)?.householdId : null) ??
        null;
      const householdIds = rows
        .map(canonicalHouseholdId)
        .filter((id): id is string => Boolean(id));
      const households = new Map(
        (
          await tx.household.findMany({
            where: { id: { in: householdIds }, workspaceId },
          })
        ).map((row) => [row.id, row.name]),
      );
      const variantIds = rows
        .map((row) => row.invitationVariantId)
        .filter((id): id is string => Boolean(id));
      const variants = new Map(
        (
          await tx.invitationVariant.findMany({
            where: { id: { in: variantIds }, workspaceId },
          })
        ).map((row) => [row.id, row.name]),
      );
      return {
        items: rows.map((row) => {
          const householdId = canonicalHouseholdId(row);
          const guest = row.guestId ? guests.get(row.guestId) : null;
          return {
            id: row.id,
            invitationSiteId: row.invitationSiteId,
            householdId,
            guestId: householdId ? null : row.guestId,
            householdName: householdId
              ? (households.get(householdId) ?? null)
              : null,
            guestName:
              !householdId && guest
                ? (guest.displayName ??
                  `${guest.firstName} ${guest.lastName}`.trim())
                : null,
            invitationVersionId: row.invitationVersionId,
            invitationVariantId: row.invitationVariantId,
            invitationVariantName: row.invitationVariantId
              ? (variants.get(row.invitationVariantId) ?? null)
              : null,
            preferredLanguage: row.preferredLanguage,
            status: row.status.toLowerCase(),
            openedAt: iso(row.openedAt),
            lastAccessedAt: iso(row.lastAccessedAt),
            rsvpCompletedAt: iso(row.rsvpCompletedAt),
            version: row.version,
          };
        }),
        nextCursor: canonicalIds.length > 50 ? pageIds[49]! : null,
      };
    });
  }

  async assignVariant(
    userId: string,
    workspaceId: string,
    recipientId: string,
    expectedVersion: number,
    variantId: string | null,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const recipient = await tx.invitationRecipient.findFirst({
          where: { id: recipientId, workspaceId, revokedAt: null },
        });
        if (!recipient) notFound("Invitation recipient not found");
        if (recipient.version !== expectedVersion) conflict(recipient.version);
        let variantName: string | null = null;
        if (variantId) {
          const variant = await tx.invitationVariant.findFirst({
            where: {
              id: variantId,
              workspaceId,
              invitationSiteId: recipient.invitationSiteId,
              status: "ACTIVE",
            },
          });
          if (!variant) validation("Invitation variant is unavailable");
          const site = await tx.invitationSite.findFirst({
            where: {
              id: recipient.invitationSiteId,
              workspaceId,
              status: "PUBLISHED",
            },
          });
          const publishedVariant =
            site?.publishedVersionId && variant.publishedVersionId
              ? await tx.invitationVariantVersion.findFirst({
                  where: {
                    id: variant.publishedVersionId,
                    invitationVariantId: variant.id,
                    workspaceId,
                    baseInvitationVersionId: site.publishedVersionId,
                    publishedAt: { not: null },
                  },
                })
              : null;
          if (!publishedVariant)
            validation(
              "Publică varianta împreună cu invitația curentă înainte să o atribui destinatarului.",
            );
          variantName = variant.name;
        }
        const identityRows = await this.recipientIdentityRows(tx, recipient);
        await tx.invitationRecipient.updateMany({
          where: { id: { in: identityRows.map((row) => row.id) } },
          data: {
            invitationVariantId: variantId,
            version: { increment: 1 },
          },
        });
        const updated = await tx.invitationRecipient.findUniqueOrThrow({
          where: { id: recipient.id },
        });
        await this.event(tx, {
          eventName: "invitation.recipient_variant_assigned.v1",
          aggregateType: "InvitationRecipient",
          aggregateId: recipient.id,
          invitationSiteId: recipient.invitationSiteId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "invitation_recipient_variant_assigned",
          summary: variantName
            ? `Destinatarul folosește varianta ${variantName}.`
            : "Destinatarul folosește invitația de bază.",
        });
        return {
          id: updated.id,
          invitationSiteId: updated.invitationSiteId,
          householdId: updated.householdId,
          guestId: updated.guestId,
          invitationVersionId: updated.invitationVersionId,
          invitationVariantId: updated.invitationVariantId,
          invitationVariantName: variantName,
          preferredLanguage: updated.preferredLanguage,
          status: updated.status.toLowerCase(),
          openedAt: iso(updated.openedAt),
          lastAccessedAt: iso(updated.lastAccessedAt),
          rsvpCompletedAt: iso(updated.rsvpCompletedAt),
          version: updated.version,
        };
      },
    );
  }

  async accessLinks(
    userId: string,
    workspaceId: string,
    recipientId: string,
    channels: Array<"MANUAL" | "WHATSAPP">,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const recipient = await tx.invitationRecipient.findFirst({
        where: { id: recipientId, workspaceId, revokedAt: null },
      });
      if (!recipient) notFound("Invitation recipient not found");
      const householdId = await this.recipientHouseholdId(
        tx,
        workspaceId,
        recipient,
      );
      const items = [];
      for (const channel of [...new Set(channels)]) {
        const grant = await this.ensureChannelGrant(
          tx,
          workspaceId,
          recipient.id,
          householdId,
          channel,
        );
        const url = new URL("/guest", this.webUrl);
        url.searchParams.set("token", grant.token);
        items.push({ channel, url: url.toString(), reused: grant.reused });
      }
      return { items };
    });
  }

  async qr(
    userId: string,
    workspaceId: string,
    recipientId: string,
    format: "svg" | "png",
  ) {
    let token = "";
    const url = new URL("/guest", this.webUrl);
    await this.database.withContext({ userId, workspaceId }, async (tx) => {
      const recipient = await tx.invitationRecipient.findFirst({
        where: { id: recipientId, workspaceId, revokedAt: null },
      });
      if (!recipient) notFound("Invitation recipient not found");
      const householdId = await this.recipientHouseholdId(
        tx,
        workspaceId,
        recipient,
      );
      token = (
        await this.ensureChannelGrant(
          tx,
          workspaceId,
          recipient.id,
          householdId,
          "QR",
        )
      ).token;
    });
    url.searchParams.set("token", token);
    if (format === "png") {
      return {
        body: await QRCode.toBuffer(url.toString(), {
          type: "png",
          width: 720,
          errorCorrectionLevel: "H",
        }),
        contentType: "image/png",
        fileName: `invitation-${recipientId}.png`,
      };
    }
    return {
      body: await QRCode.toString(url.toString(), {
        type: "svg",
        width: 720,
        errorCorrectionLevel: "H",
      }),
      contentType: "image/svg+xml",
      fileName: `invitation-${recipientId}.svg`,
    };
  }

  async campaigns(userId: string, workspaceId: string, cursor?: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.campaign.findMany({
        where: { workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      return {
        items: await Promise.all(
          rows.slice(0, 50).map((row) => this.mapCampaign(tx, row)),
        ),
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
      };
    });
  }

  async createCampaign(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateCampaign,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const prior = await replay(
          tx,
          userId,
          "campaign.create",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        const row = await tx.campaign.create({
          data: {
            workspaceId,
            createdById: userId,
            name: input.name,
            purpose: input.purpose,
            channel: "EMAIL",
            invitationVersionId: input.invitationVersionId,
            template: input.template as Prisma.InputJsonValue,
            audienceFilter: input.audienceFilter as Prisma.InputJsonValue,
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          },
        });
        await this.event(tx, {
          eventName: "campaign.created.v1",
          aggregateId: row.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "campaign_created",
          summary: `Campania ${row.name} a fost creată.`,
        });
        const response = await this.mapCampaign(tx, row);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "campaign.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async campaign(userId: string, workspaceId: string, campaignId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.campaign.findFirst({
        where: { id: campaignId, workspaceId },
      });
      if (!row) notFound("Campaign not found");
      return this.mapCampaign(tx, row);
    });
  }

  async updateCampaign(
    userId: string,
    workspaceId: string,
    campaignId: string,
    expectedVersion: number,
    input: Partial<CreateCampaign>,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.lockInvitationSiteLifecycle(tx, workspaceId);
      const row = await tx.campaign.findFirst({
        where: { id: campaignId, workspaceId },
      });
      if (!row) notFound("Campaign not found");
      if (row.version !== expectedVersion) conflict(row.version);
      if (row.status !== "DRAFT")
        validation("Only draft campaigns can be edited");
      const updated = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
          ...(input.invitationVersionId === undefined
            ? {}
            : { invitationVersionId: input.invitationVersionId }),
          ...(input.template === undefined
            ? {}
            : { template: input.template as Prisma.InputJsonValue }),
          ...(input.audienceFilter === undefined
            ? {}
            : {
                audienceFilter: input.audienceFilter as Prisma.InputJsonValue,
              }),
          ...(input.scheduledAt === undefined
            ? {}
            : {
                scheduledAt: input.scheduledAt
                  ? new Date(input.scheduledAt)
                  : null,
              }),
          version: { increment: 1 },
        },
      });
      return this.mapCampaign(tx, updated);
    });
  }

  async discardCampaignDraft(
    userId: string,
    workspaceId: string,
    campaignId: string,
    expectedVersion: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.lockInvitationSiteLifecycle(tx, workspaceId);
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, workspaceId },
      });
      if (!campaign) notFound("Campaign not found");
      if (campaign.version !== expectedVersion) conflict(campaign.version);
      if (campaign.status !== "DRAFT")
        validation("Only an unsent draft campaign can be discarded");
      const recipients = await tx.campaignRecipient.count({
        where: { workspaceId, campaignId },
      });
      if (recipients || campaign.backgroundJobId)
        validation("Campaign delivery has already started");
      await tx.campaign.delete({ where: { id: campaignId } });
      return { deleted: true as const };
    });
  }

  async audiencePreview(
    userId: string,
    workspaceId: string,
    campaignId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const campaign = await tx.campaign.findFirst({
          where: { id: campaignId, workspaceId },
        });
        if (!campaign) notFound("Campaign not found");
        const audience = await this.resolveCampaignAudience(tx, campaign);
        return {
          total: audience.total,
          valid: audience.valid.length,
          invalid: audience.invalid.length,
          invalidRecipients: audience.invalid,
          audienceRevision: audience.revision,
        };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  async transition(
    userId: string,
    workspaceId: string,
    campaignId: string,
    expectedVersion: number,
    idempotencyKey: string,
    transition: string,
    scheduledAt: string | undefined,
    audienceRevision: string | undefined,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const input = {
          campaignId,
          expectedVersion,
          transition,
          scheduledAt,
          audienceRevision,
        };
        const prior = await replay(
          tx,
          userId,
          "campaign.transition",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        await this.lockInvitationSiteLifecycle(tx, workspaceId);
        const campaign = await tx.campaign.findFirst({
          where: { id: campaignId, workspaceId },
        });
        if (!campaign) notFound("Campaign not found");
        if (campaign.version !== expectedVersion) conflict(campaign.version);
        if (["SEND_NOW", "SCHEDULE", "RETRY_FAILED"].includes(transition)) {
          if (
            transition === "RETRY_FAILED"
              ? !["FAILED", "PARTIAL"].includes(campaign.status)
              : !["DRAFT", "FAILED", "PARTIAL"].includes(campaign.status)
          )
            validation("Campaign cannot be queued from its current state");
          let newRecipients = 0;
          let queuedRecipients = 0;
          if (transition === "RETRY_FAILED") {
            const activeRecipients = await tx.campaignRecipient.count({
              where: {
                campaignId: campaign.id,
                status: { in: ["PENDING", "QUEUED"] },
              },
            });
            if (activeRecipients)
              validation(
                "Campaign still has active deliveries and cannot be retried yet",
              );
            const retried = await tx.campaignRecipient.updateMany({
              where: { campaignId: campaign.id, status: "FAILED" },
              data: {
                status: "PENDING",
                failureCode: null,
                failedAt: null,
                version: { increment: 1 },
              },
            });
            queuedRecipients = retried.count;
          } else {
            const resolvedAudience = await this.resolveCampaignAudience(
              tx,
              campaign,
            );
            if (audienceRevision !== resolvedAudience.revision)
              audienceChanged();
            const preview = await this.snapshotAudience(
              tx,
              campaign,
              resolvedAudience,
            );
            newRecipients = preview.created;
            if (["FAILED", "PARTIAL"].includes(campaign.status)) {
              const confirmedRecipientIds = resolvedAudience.valid.map(
                ({ recipient }) => recipient.id,
              );
              await tx.campaignRecipient.updateMany({
                where: {
                  campaignId: campaign.id,
                  invitationRecipientId: { in: confirmedRecipientIds },
                  status: "FAILED",
                },
                data: {
                  status: "PENDING",
                  failureCode: null,
                  failedAt: null,
                  version: { increment: 1 },
                },
              });
            }
            queuedRecipients = await tx.campaignRecipient.count({
              where: { campaignId: campaign.id, status: "PENDING" },
            });
          }
          if (!queuedRecipients)
            validation("Campaign has no valid e-mail recipients");
          const otherActiveCampaign = await tx.campaign.findFirst({
            where: {
              workspaceId,
              id: { not: campaign.id },
              status: { in: ["QUEUED", "SCHEDULED", "SENDING"] },
            },
            select: { id: true },
          });
          if (otherActiveCampaign)
            problem(
              "CAMPAIGN_ALREADY_ACTIVE",
              HttpStatus.CONFLICT,
              "Există deja o campanie activă",
              "Așteaptă finalizarea campaniei active înainte de a porni alta.",
            );
          await this.assertWorkspaceEmailHealth(tx, workspaceId);
          const availableAt =
            transition === "SCHEDULE"
              ? new Date(scheduledAt ?? "")
              : new Date();
          if (
            transition === "SCHEDULE" &&
            (Number.isNaN(availableAt.getTime()) || availableAt <= new Date())
          )
            validation("A future schedule time is required");
          const pendingRecipients = await tx.campaignRecipient.findMany({
            where: { campaignId: campaign.id, status: "PENDING" },
            select: { id: true, address: true },
          });
          await this.assertRecipientFrequencyCap(
            tx,
            workspaceId,
            pendingRecipients.map((recipient) => recipient.address),
          );
          await this.entitlements.reserveEmailDeliveries(
            tx,
            workspaceId,
            pendingRecipients.map((recipient) => recipient.id),
            availableAt,
          );
          const jobId = await this.asyncEvents.record(tx, {
            eventName:
              transition === "SCHEDULE"
                ? "campaign.scheduled.v1"
                : "campaign.send_requested.v1",
            aggregateType: "Campaign",
            aggregateId: campaign.id,
            aggregateVersion: campaign.version + 1,
            workspaceId,
            actorUserId: userId,
            correlationId,
            idempotencyKey,
            deduplicationKey: `campaign-send:${campaign.id}:v${campaign.version + 1}`,
            userVisibleJob: true,
            availableAt,
            payload: {
              subject: { campaignId: campaign.id },
              campaignFanout: { campaignId: campaign.id },
              activity: {
                category: "campaigns",
                action:
                  transition === "SCHEDULE"
                    ? "campaign_scheduled"
                    : "campaign_send_requested",
                summary:
                  transition === "SCHEDULE"
                    ? "Campania a fost programată."
                    : "Campania a fost pusă durabil în coada de trimitere.",
                entityType: "Campaign",
                entityId: campaign.id,
              },
            },
          });
          if (!jobId) throw new Error("Campaign job missing");
          const updated = await tx.campaign.update({
            where: { id: campaign.id },
            data: {
              status: transition === "SCHEDULE" ? "SCHEDULED" : "QUEUED",
              scheduledAt: transition === "SCHEDULE" ? availableAt : null,
              backgroundJobId: jobId,
              version: { increment: 1 },
            },
          });
          const job = await tx.backgroundJob.findUniqueOrThrow({
            where: { id: jobId },
          });
          const response = {
            campaign: await this.mapCampaign(tx, updated),
            job: mapJob(job),
            queuedRecipients,
            newRecipients,
          };
          await saveReplay(
            tx,
            userId,
            workspaceId,
            "campaign.transition",
            idempotencyKey,
            input,
            response,
          );
          return response;
        }
        const next = campaignTransition(campaign.status, transition);
        const updated = await tx.campaign.update({
          where: { id: campaign.id },
          data: { status: next, version: { increment: 1 } },
        });
        if (transition === "CANCEL") {
          const pending = await tx.campaignRecipient.findMany({
            where: { campaignId, status: { in: ["PENDING", "QUEUED"] } },
            select: { id: true },
          });
          await this.entitlements.releaseEmailDeliveries(
            tx,
            workspaceId,
            pending.map((recipient) => recipient.id),
          );
          await tx.campaignRecipient.updateMany({
            where: { campaignId, status: { in: ["PENDING", "QUEUED"] } },
            data: { status: "CANCELLED", version: { increment: 1 } },
          });
        }
        const response = { campaign: await this.mapCampaign(tx, updated) };
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "campaign.transition",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  private async assertRecipientFrequencyCap(
    tx: Transaction,
    workspaceId: string,
    addresses: string[],
  ) {
    const normalized = [
      ...new Set(addresses.map((address) => address.trim().toLowerCase())),
    ];
    if (!normalized.length) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const recent = await tx.campaignRecipient.groupBy({
      by: ["address"],
      where: {
        workspaceId,
        address: { in: normalized },
        sentAt: { gte: since },
        status: { in: ["SENT", "DELIVERED", "OPENED"] },
      },
      _count: { address: true },
    });
    const blocked = recent.find((item) => item._count.address >= 5);
    if (blocked)
      problem(
        "RECIPIENT_FREQUENCY_LIMIT_REACHED",
        HttpStatus.TOO_MANY_REQUESTS,
        "Un destinatar a atins limita de frecvență",
        "Nu trimitem mai mult de 5 mesaje comerciale aceluiași destinatar în 24 de ore.",
      );
  }

  private async assertWorkspaceEmailHealth(
    tx: Transaction,
    workspaceId: string,
  ) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [attempted, bounced] = await Promise.all([
      tx.campaignRecipient.count({
        where: { workspaceId, sentAt: { gte: since } },
      }),
      tx.campaignRecipient.count({
        where: {
          workspaceId,
          sentAt: { gte: since },
          status: "FAILED",
          failureCode: "PROVIDER_REPORTED",
        },
      }),
    ]);
    if (attempted >= 25 && bounced / attempted >= 0.04)
      problem(
        "CAMPAIGN_DELIVERY_PAUSED",
        HttpStatus.CONFLICT,
        "Trimiterile comerciale sunt temporar oprite",
        "Rata de respingere a depășit 4% în ultimele 30 de zile. Verifică lista de destinatari înainte de reluare.",
      );
  }

  async campaignRecipients(
    userId: string,
    workspaceId: string,
    campaignId: string,
    cursor?: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, workspaceId },
      });
      if (!campaign) notFound("Campaign not found");
      const rows = await tx.campaignRecipient.findMany({
        where: { campaignId, workspaceId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      return {
        items: rows.slice(0, 100).map(mapCampaignRecipient),
        nextCursor: rows.length > 100 ? rows[99]!.id : null,
      };
    });
  }

  async statistics(userId: string, workspaceId: string, campaignId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, workspaceId },
      });
      if (!campaign) notFound("Campaign not found");
      const rows = await tx.campaignRecipient.groupBy({
        by: ["status"],
        where: { campaignId },
        _count: true,
      });
      return {
        campaignId,
        total: rows.reduce((sum, item) => sum + item._count, 0),
        byStatus: Object.fromEntries(
          rows.map((item) => [item.status.toLowerCase(), item._count]),
        ),
      };
    });
  }

  async webhook(
    provider: string,
    signature: string | undefined,
    payload: Record<string, unknown>,
  ) {
    if (provider !== "fake" && provider !== "smtp")
      validation("Unsupported e-mail provider");
    const body = JSON.stringify(payload);
    const expected = createHmac("sha256", this.webhookSecret)
      .update(body)
      .digest("hex");
    if (
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Webhook signature is invalid",
      );
    const eventId = string(payload.eventId);
    const messageId = string(payload.messageId);
    const eventType = string(payload.type).toLowerCase();
    if (
      !eventId ||
      !messageId ||
      !["delivered", "opened", "failed"].includes(eventType)
    )
      validation("Webhook payload is invalid");
    const occurredAt = payload.occurredAt
      ? new Date(String(payload.occurredAt))
      : new Date();
    if (Number.isNaN(occurredAt.getTime()))
      validation("Webhook occurrence time is invalid");
    const providerMessageId =
      provider === "smtp" &&
      !(messageId.startsWith("<") && messageId.endsWith(">"))
        ? `<${messageId}>`
        : messageId;
    const rows = await this.database.$queryRaw<
      Array<{
        accepted: boolean;
        duplicate: boolean;
        recipient_id: string;
        workspace_id: string;
      }>
    >`
      SELECT * FROM public.weddingos_apply_provider_webhook(
        ${provider}, ${eventId}, ${providerMessageId}, ${eventType},
        ${stableHash(payload)}, ${occurredAt}::timestamp without time zone
      )
    `;
    if (!rows[0]) notFound("Provider message was not found");
    return { accepted: rows[0].accepted, duplicate: rows[0].duplicate };
  }

  private async siteInTransaction(tx: Transaction, workspaceId: string) {
    const site = await tx.invitationSite.findUnique({ where: { workspaceId } });
    if (!site) return null;
    const [draft, published] = await Promise.all([
      site.currentDraftVersionId
        ? tx.invitationVersion.findUnique({
            where: { id: site.currentDraftVersionId },
          })
        : null,
      site.publishedVersionId
        ? tx.invitationVersion.findUnique({
            where: { id: site.publishedVersionId },
          })
        : null,
    ]);
    return {
      id: site.id,
      workspaceId,
      slug: site.slug,
      status: site.status.toLowerCase(),
      defaultLanguage: site.defaultLanguage,
      availableLanguages: stringArray(site.availableLanguages),
      accessPolicy: site.accessPolicy.toLowerCase(),
      draft: draft ? mapVersion(draft) : null,
      published: published ? mapVersion(published) : null,
      publishedAt: iso(site.publishedAt),
      version: site.version,
    };
  }

  private async visibleEvents(tx: Transaction, workspaceId: string) {
    return (
      await tx.weddingEvent.findMany({
        where: {
          workspaceId,
          guestVisible: true,
          deletedAt: null,
          status: { not: "CANCELLED" },
        },
        orderBy: [{ position: "asc" }, { startAt: "asc" }],
      })
    ).map((event) => ({
      id: event.id,
      type: event.type.toLowerCase(),
      title: event.title,
      description: event.description,
      startAt: iso(event.startAt),
      endAt: iso(event.endAt),
      timezone: event.timezone,
      locationName: event.locationName,
      locationAddress: event.locationAddress,
      dressCode: event.dressCode,
      rsvpEnabled: event.rsvpEnabled,
    }));
  }

  private async snapshotAudience(
    tx: Transaction,
    campaign: {
      id: string;
      workspaceId: string;
      invitationVersionId: string | null;
      purpose: string;
      audienceFilter: unknown;
    },
    audience: Awaited<
      ReturnType<InvitationCampaignService["resolveCampaignAudience"]>
    >,
  ) {
    const result = audience.valid.length
      ? await tx.campaignRecipient.createMany({
          data: audience.valid.map(
            ({ recipient, address, invitationVariantVersionId }) => ({
              workspaceId: campaign.workspaceId,
              campaignId: campaign.id,
              invitationRecipientId: recipient.id,
              invitationVariantVersionId,
              guestId: recipient.guestId,
              householdId: recipient.householdId,
              address,
              personalizationSnapshot:
                recipient.personalizationSnapshot as Prisma.InputJsonValue,
              dedupeKey: `${campaign.id}:${recipient.id}:EMAIL`,
            }),
          ),
          skipDuplicates: true,
        })
      : { count: 0 };
    return { created: result.count, total: audience.total };
  }

  private async resolveCampaignAudience(
    tx: Transaction,
    campaign: {
      id: string;
      workspaceId: string;
      invitationVersionId: string | null;
      purpose: string;
      audienceFilter: unknown;
    },
  ) {
    const invitationSiteId = campaign.invitationVersionId
      ? (
          await tx.invitationVersion.findFirst({
            where: {
              id: campaign.invitationVersionId,
              workspaceId: campaign.workspaceId,
            },
            select: { invitationSiteId: true },
          })
        )?.invitationSiteId
      : null;
    const candidates = await tx.invitationRecipient.findMany({
      where: {
        workspaceId: campaign.workspaceId,
        revokedAt: null,
        ...(invitationSiteId ? { invitationSiteId } : {}),
        ...(campaign.purpose === "RSVP_REMINDER"
          ? {
              status: {
                in: ["READY", "SENT", "OPENED", "PARTIALLY_RESPONDED"],
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const guestHouseholds = await this.recipientGuestHouseholds(
      tx,
      campaign.workspaceId,
      candidates,
    );
    const recipients = dedupeRecipientsByIdentity(
      await this.filterAudience(tx, campaign, candidates, guestHouseholds),
      guestHouseholds,
    );
    const directGuestIds = recipients
      .map((recipient) => recipient.guestId)
      .filter((id): id is string => Boolean(id));
    const householdIds = [
      ...new Set(
        recipients
          .map(
            (recipient) =>
              recipient.householdId ??
              (recipient.guestId
                ? guestHouseholds.get(recipient.guestId)
                : undefined),
          )
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const variantIds = [
      ...new Set(
        recipients
          .map((recipient) => recipient.invitationVariantId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [audienceGuests, households, variants] = await Promise.all([
      tx.guest.findMany({
        where: {
          workspaceId: campaign.workspaceId,
          OR: [
            { id: { in: directGuestIds } },
            { householdId: { in: householdIds } },
          ],
        },
        orderBy: [{ isChild: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
      tx.household.findMany({
        where: { workspaceId: campaign.workspaceId, id: { in: householdIds } },
        select: { id: true, primaryGuestId: true, deletedAt: true },
      }),
      tx.invitationVariant.findMany({
        where: {
          workspaceId: campaign.workspaceId,
          id: { in: variantIds },
          status: "ACTIVE",
        },
        select: { id: true, invitationSiteId: true, publishedVersionId: true },
      }),
    ]);
    const guestById = new Map(audienceGuests.map((guest) => [guest.id, guest]));
    const guestsByHousehold = new Map<string, typeof audienceGuests>();
    for (const guest of audienceGuests) {
      const rows = guestsByHousehold.get(guest.householdId) ?? [];
      rows.push(guest);
      guestsByHousehold.set(guest.householdId, rows);
    }
    const householdById = new Map(
      households.map((household) => [household.id, household]),
    );
    const variantById = new Map(
      variants.map((variant) => [variant.id, variant]),
    );
    const valid: Array<{
      recipient: (typeof recipients)[number];
      address: string;
      invitationVariantVersionId: string | null;
    }> = [];
    const invalid: Array<{ recipientId: string; reason: string }> = [];
    for (const recipient of recipients) {
      const directGuest = recipient.guestId
        ? guestById.get(recipient.guestId)
        : undefined;
      const householdId = recipient.householdId ?? directGuest?.householdId;
      const household = householdId
        ? householdById.get(householdId)
        : undefined;
      const members = householdId
        ? (guestsByHousehold.get(householdId) ?? [])
        : [];
      const primary = household?.primaryGuestId
        ? guestById.get(household.primaryGuestId)
        : undefined;
      const target =
        householdId && !household?.deletedAt
          ? primary?.householdId === householdId &&
            primary.status === "ACTIVE" &&
            !primary.deletedAt &&
            primary.emailNormalized
            ? primary
            : members.find(
                (guest) =>
                  guest.status === "ACTIVE" &&
                  !guest.deletedAt &&
                  Boolean(guest.emailNormalized),
              )
          : directGuest?.status === "ACTIVE" && !directGuest.deletedAt
            ? directGuest
            : undefined;
      const address = target?.emailNormalized ?? null;
      if (!address) {
        invalid.push({ recipientId: recipient.id, reason: "missing_email" });
        continue;
      }
      const variant = recipient.invitationVariantId
        ? variantById.get(recipient.invitationVariantId)
        : undefined;
      const invitationVariantVersionId =
        variant?.invitationSiteId === recipient.invitationSiteId
          ? (variant.publishedVersionId ?? null)
          : null;
      valid.push({ recipient, address, invitationVariantVersionId });
    }
    return {
      total: recipients.length,
      valid,
      invalid,
      revision: stableHash({
        campaignId: campaign.id,
        invitationVersionId: campaign.invitationVersionId,
        purpose: campaign.purpose,
        valid: valid.map(
          ({ recipient, address, invitationVariantVersionId }) => ({
            recipientId: recipient.id,
            guestId: recipient.guestId,
            householdId: recipient.householdId,
            address,
            invitationVariantVersionId,
            personalizationSnapshot: recipient.personalizationSnapshot,
          }),
        ),
        invalid,
      }),
    };
  }

  private async filterAudience<
    T extends {
      id: string;
      workspaceId: string;
      guestId: string | null;
      householdId: string | null;
      status: string;
      preferredLanguage: string;
    },
  >(
    tx: Transaction,
    campaign: { workspaceId: string; audienceFilter: unknown },
    recipients: T[],
    recipientGuestHouseholds: ReadonlyMap<string, string>,
  ): Promise<T[]> {
    const filter = jsonRecord(campaign.audienceFilter);
    if (!Object.keys(filter).length) return recipients;

    const guests = await tx.guest.findMany({
      where: { workspaceId: campaign.workspaceId, status: "ACTIVE" },
      select: {
        id: true,
        householdId: true,
        side: true,
        category: true,
        preferredLanguage: true,
        isChild: true,
        isPlusOne: true,
      },
    });
    const guestIds = guests.map((guest) => guest.id);
    const householdIds = [...new Set(guests.map((guest) => guest.householdId))];
    const [tagAssignments, responses, households] = await Promise.all([
      tx.guestTagAssignment.findMany({
        where: { workspaceId: campaign.workspaceId, guestId: { in: guestIds } },
        select: { guestId: true, tagId: true },
      }),
      tx.guestEventResponse.findMany({
        where: { workspaceId: campaign.workspaceId, guestId: { in: guestIds } },
        select: { guestId: true, attendance: true },
      }),
      tx.household.findMany({
        where: { workspaceId: campaign.workspaceId, id: { in: householdIds } },
        select: { id: true, country: true, preferredLanguage: true },
      }),
    ]);
    const tagsByGuest = new Map<string, Set<string>>();
    for (const assignment of tagAssignments) {
      const tags = tagsByGuest.get(assignment.guestId) ?? new Set<string>();
      tags.add(assignment.tagId);
      tagsByGuest.set(assignment.guestId, tags);
    }
    const attendanceByGuest = new Map<string, Set<string>>();
    for (const response of responses) {
      const statuses =
        attendanceByGuest.get(response.guestId) ?? new Set<string>();
      statuses.add(response.attendance);
      attendanceByGuest.set(response.guestId, statuses);
    }
    const selectedGuestIds = new Set(stringArray(filter.guestIds));
    const selectedHouseholdIds = new Set(stringArray(filter.householdIds));
    const selectedTagIds = new Set(stringArray(filter.tagIds));
    const sides = new Set(stringArray(filter.sides));
    const categories = new Set(stringArray(filter.categories));
    const countries = new Set(
      stringArray(filter.countries).map((country) =>
        country.toLocaleLowerCase("ro-RO"),
      ),
    );
    const preferredLanguages = new Set(
      stringArray(filter.preferredLanguages).map((language) =>
        language.toLocaleLowerCase(),
      ),
    );
    const invitationStatuses = new Set(
      stringArray(filter.invitationStatuses).map((status) =>
        status.toUpperCase(),
      ),
    );
    const rsvpStatuses = new Set(stringArray(filter.rsvpStatuses));
    const householdById = new Map(
      households.map((household) => [household.id, household]),
    );

    return recipients.filter((recipient) => {
      const householdId =
        recipient.householdId ??
        (recipient.guestId
          ? recipientGuestHouseholds.get(recipient.guestId)
          : undefined);
      const members = guests.filter((guest) =>
        householdId
          ? guest.householdId === householdId
          : guest.id === recipient.guestId,
      );
      if (
        selectedGuestIds.size &&
        !members.some((guest) => selectedGuestIds.has(guest.id))
      )
        return false;
      if (
        selectedHouseholdIds.size &&
        (!householdId || !selectedHouseholdIds.has(householdId))
      )
        return false;
      if (
        selectedTagIds.size &&
        !members.some((guest) =>
          [...(tagsByGuest.get(guest.id) ?? [])].some((tagId) =>
            selectedTagIds.has(tagId),
          ),
        )
      )
        return false;
      if (sides.size && !members.some((guest) => sides.has(guest.side)))
        return false;
      if (
        categories.size &&
        !members.some(
          (guest) => guest.category && categories.has(guest.category),
        )
      )
        return false;
      const household = householdId
        ? householdById.get(householdId)
        : undefined;
      if (
        countries.size &&
        (!household?.country ||
          !countries.has(household.country.toLocaleLowerCase("ro-RO")))
      )
        return false;
      if (
        preferredLanguages.size &&
        !preferredLanguages.has(
          (
            recipient.preferredLanguage ||
            household?.preferredLanguage ||
            "ro"
          ).toLocaleLowerCase(),
        )
      )
        return false;
      if (invitationStatuses.size && !invitationStatuses.has(recipient.status))
        return false;
      if (
        rsvpStatuses.size &&
        !members.some((guest) => {
          const statuses = attendanceByGuest.get(guest.id);
          return statuses?.size
            ? [...statuses].some((status) => rsvpStatuses.has(status))
            : rsvpStatuses.has("NO_RESPONSE");
        })
      )
        return false;
      if (
        filter.includeChildren === false &&
        members.length &&
        members.every((guest) => guest.isChild)
      )
        return false;
      if (
        filter.includePlusOnes === false &&
        members.length &&
        members.every((guest) => guest.isPlusOne)
      )
        return false;
      return true;
    });
  }

  private async recipientGuestHouseholds<T extends { guestId: string | null }>(
    tx: Transaction,
    workspaceId: string,
    recipients: T[],
  ): Promise<Map<string, string>> {
    const guestIds = [
      ...new Set(
        recipients
          .map((recipient) => recipient.guestId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!guestIds.length) return new Map();
    const guests = await tx.guest.findMany({
      where: { workspaceId, id: { in: guestIds } },
      select: { id: true, householdId: true },
    });
    return new Map(guests.map((guest) => [guest.id, guest.householdId]));
  }

  private async recipientIdentityRows(
    tx: Transaction,
    recipient: {
      id: string;
      workspaceId: string;
      invitationSiteId: string;
      householdId: string | null;
      guestId: string | null;
    },
  ) {
    const guest = recipient.guestId
      ? await tx.guest.findFirst({
          where: { id: recipient.guestId, workspaceId: recipient.workspaceId },
          select: { householdId: true },
        })
      : null;
    const householdId = recipient.householdId ?? guest?.householdId;
    const memberIds = householdId
      ? (
          await tx.guest.findMany({
            where: { workspaceId: recipient.workspaceId, householdId },
            select: { id: true },
          })
        ).map((member) => member.id)
      : [];
    const rows = await tx.invitationRecipient.findMany({
      where: {
        workspaceId: recipient.workspaceId,
        invitationSiteId: recipient.invitationSiteId,
        revokedAt: null,
        ...(householdId
          ? {
              OR: [{ householdId }, { guestId: { in: memberIds } }],
            }
          : { guestId: recipient.guestId }),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!householdId) return rows.length ? rows : [recipient];
    return rows.sort((left, right) => {
      const leftIsHousehold = left.householdId === householdId ? 0 : 1;
      const rightIsHousehold = right.householdId === householdId ? 0 : 1;
      return leftIsHousehold - rightIsHousehold;
    });
  }

  private async mapCampaign(
    tx: Transaction,
    row: {
      id: string;
      workspaceId: string;
      name: string;
      purpose: string;
      channel: string;
      status: string;
      invitationVersionId: string | null;
      template: unknown;
      audienceFilter: unknown;
      scheduledAt: Date | null;
      startedAt: Date | null;
      completedAt: Date | null;
      backgroundJobId: string | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    },
  ) {
    const grouped = await tx.campaignRecipient.groupBy({
      by: ["status"],
      where: { campaignId: row.id },
      _count: true,
    });
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      purpose: row.purpose.toLowerCase(),
      channel: row.channel.toLowerCase(),
      status: row.status.toLowerCase(),
      invitationVersionId: row.invitationVersionId,
      template: row.template,
      audienceFilter: row.audienceFilter,
      scheduledAt: iso(row.scheduledAt),
      startedAt: iso(row.startedAt),
      completedAt: iso(row.completedAt),
      backgroundJobId: row.backgroundJobId,
      statistics: {
        total: grouped.reduce((sum, item) => sum + item._count, 0),
        byStatus: Object.fromEntries(
          grouped.map((item) => [item.status.toLowerCase(), item._count]),
        ),
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }

  private async variantsInTransaction(tx: Transaction, workspaceId: string) {
    const rows = await tx.invitationVariant.findMany({
      where: { workspaceId },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    return Promise.all(rows.map((row) => this.mapVariant(tx, row)));
  }

  private async mapVariant(
    tx: Transaction,
    row: {
      id: string;
      workspaceId: string;
      invitationSiteId: string;
      name: string;
      code: string;
      status: string;
      currentDraftVersionId: string | null;
      publishedVersionId: string | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    },
  ) {
    const [draft, published, assignedRecipients] = await Promise.all([
      row.currentDraftVersionId
        ? tx.invitationVariantVersion.findUnique({
            where: { id: row.currentDraftVersionId },
          })
        : null,
      row.publishedVersionId
        ? tx.invitationVariantVersion.findUnique({
            where: { id: row.publishedVersionId },
          })
        : null,
      tx.invitationRecipient.count({
        where: {
          workspaceId: row.workspaceId,
          invitationVariantId: row.id,
          revokedAt: null,
        },
      }),
    ]);
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      invitationSiteId: row.invitationSiteId,
      name: row.name,
      code: row.code,
      status: row.status.toLowerCase(),
      assignedRecipients,
      draft: draft ? mapVariantVersion(draft) : null,
      published: published ? mapVariantVersion(published) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }

  private async preflightInTransaction(tx: Transaction, workspaceId: string) {
    const errors: PreflightIssue[] = [];
    const warnings: PreflightIssue[] = [];
    const site = await tx.invitationSite.findUnique({ where: { workspaceId } });
    if (!site) {
      errors.push({
        code: "INVITATION_SITE_MISSING",
        message: "Invitation site not found",
      });
      return {
        ready: false,
        errors,
        warnings,
        baseVersionId: null,
        activeVariants: 0,
        assignedRecipients: 0,
      };
    }
    if (!site.currentDraftVersionId)
      errors.push({
        code: "INVITATION_DRAFT_MISSING",
        message: "Save an invitation draft before publishing",
      });
    const [form, eventCount, activeVariants, recipientRows, draft] =
      await Promise.all([
        tx.rsvpFormDefinition.findUnique({ where: { workspaceId } }),
        tx.weddingEvent.count({
          where: {
            workspaceId,
            guestVisible: true,
            rsvpEnabled: true,
            status: { not: "CANCELLED" },
            deletedAt: null,
          },
        }),
        tx.invitationVariant.findMany({
          where: { workspaceId, invitationSiteId: site.id, status: "ACTIVE" },
        }),
        tx.invitationRecipient.findMany({
          where: { workspaceId, invitationSiteId: site.id, revokedAt: null },
          select: {
            id: true,
            invitationSiteId: true,
            householdId: true,
            guestId: true,
            invitationVariantId: true,
          },
        }),
        site.currentDraftVersionId
          ? tx.invitationVersion.findFirst({
              where: {
                id: site.currentDraftVersionId,
                workspaceId,
                invitationSiteId: site.id,
              },
            })
          : Promise.resolve(null),
      ]);
    const recipientGuestHouseholds = await this.recipientGuestHouseholds(
      tx,
      workspaceId,
      recipientRows,
    );
    const assignedRecipients = dedupeRecipientsByIdentity(
      recipientRows,
      recipientGuestHouseholds,
    );
    const mediaScopes: Array<{
      variantId?: string;
      references: Set<string>;
    }> = [];
    const requiresRsvp = invitationRequiresRsvp(draft?.document);
    if (requiresRsvp && !form?.publishedVersionId)
      errors.push({
        code: "RSVP_FORM_NOT_PUBLISHED",
        message: "Publish the RSVP form before the invitation",
      });
    if (requiresRsvp && !eventCount)
      errors.push({
        code: "GUEST_EVENT_MISSING",
        message: "At least one guest-visible RSVP event is required",
      });
    if (
      draft &&
      invitationContainsStarterContent(
        visibleInvitationDocument(draft.document),
      )
    )
      errors.push({
        code: "INVITATION_STARTER_CONTENT",
        message:
          "Înlocuiește sau ascunde conținutul demonstrativ înainte de publicare.",
      });
    if (draft)
      mediaScopes.push({
        references: invitationMediaReferences(draft.document, draft.settings),
      });
    const sectionIds = new Set(
      invitationSections(draft?.document).map((section) => section.id),
    );
    const variantsById = new Map(activeVariants.map((row) => [row.id, row]));
    for (const variant of activeVariants) {
      const sourceId =
        variant.currentDraftVersionId ?? variant.publishedVersionId;
      const source = sourceId
        ? await tx.invitationVariantVersion.findFirst({
            where: {
              id: sourceId,
              workspaceId,
              invitationVariantId: variant.id,
            },
          })
        : null;
      if (!source) {
        errors.push({
          code: "VARIANT_DRAFT_MISSING",
          message: `Variant ${variant.name} has no publishable draft`,
          variantId: variant.id,
        });
        continue;
      }
      const resolvedVariant = draft
        ? resolveInvitationVariant(
            draft.document,
            draft.settings,
            source.overrides,
          )
        : null;
      if (
        resolvedVariant &&
        invitationContainsStarterContent({
          document: visibleInvitationDocument(resolvedVariant.document),
          settings: resolvedVariant.settings,
        })
      )
        errors.push({
          code: "VARIANT_STARTER_CONTENT",
          message: `Varianta ${variant.name} conține încă exemple demonstrative.`,
          variantId: variant.id,
        });
      if (draft)
        mediaScopes.push({
          variantId: variant.id,
          references: invitationMediaReferences(
            draft.document,
            draft.settings,
            source.overrides,
          ),
        });
      const invalidSectionIds = variantOverrideSectionIds(
        source.overrides,
      ).filter((id) => !sectionIds.has(id));
      if (invalidSectionIds.length)
        errors.push({
          code: "VARIANT_SECTION_MISSING",
          message: `Variant ${variant.name} references missing sections: ${invalidSectionIds.join(", ")}`,
          variantId: variant.id,
        });
    }
    for (const recipient of assignedRecipients) {
      if (
        recipient.invitationVariantId &&
        !variantsById.has(recipient.invitationVariantId)
      )
        errors.push({
          code: "RECIPIENT_VARIANT_UNAVAILABLE",
          message:
            "A recipient is assigned to an archived or unavailable variant",
          recipientId: recipient.id,
          variantId: recipient.invitationVariantId,
        });
    }
    if (!assignedRecipients.length)
      warnings.push({
        code: "NO_RECIPIENTS",
        message: "Invitation has no recipients yet",
      });
    for (const scope of mediaScopes) {
      if (![...scope.references].some((id) => !isUuid(id))) continue;
      errors.push({
        code: scope.variantId
          ? "VARIANT_MEDIA_INVALID"
          : "INVITATION_MEDIA_INVALID",
        message: scope.variantId
          ? "Varianta conține o referință de imagine invalidă."
          : "Invitația conține o referință de imagine invalidă.",
        ...(scope.variantId ? { variantId: scope.variantId } : {}),
      });
    }
    const referencedMediaIds = [
      ...new Set(
        mediaScopes.flatMap((scope) => [...scope.references]).filter(isUuid),
      ),
    ];
    if (referencedMediaIds.length) {
      const [objects, sessions] = await Promise.all([
        tx.storedObject.findMany({
          where: {
            id: { in: referencedMediaIds },
            workspaceId,
            status: "AVAILABLE",
            deletedAt: null,
          },
          select: { id: true },
        }),
        tx.fileUploadSession.findMany({
          where: {
            storageObjectId: { in: referencedMediaIds },
            workspaceId,
            purpose: "INVITATION_MEDIA",
            status: "COMPLETED",
          },
          select: { storageObjectId: true },
        }),
      ]);
      const availableObjects = new Set(objects.map((row) => row.id));
      const invitationUploads = new Set(
        sessions
          .map((row) => row.storageObjectId)
          .filter((id): id is string => Boolean(id)),
      );
      for (const scope of mediaScopes) {
        const invalid = [...scope.references].filter(
          (id) => !availableObjects.has(id) || !invitationUploads.has(id),
        );
        if (!invalid.length) continue;
        errors.push({
          code: scope.variantId
            ? "VARIANT_MEDIA_UNAVAILABLE"
            : "INVITATION_MEDIA_UNAVAILABLE",
          message: scope.variantId
            ? "Varianta folosește imagini care nu sunt încă disponibile sau nu provin din biblioteca invitației."
            : "Invitația folosește imagini care nu sunt încă disponibile sau nu provin din biblioteca invitației.",
          ...(scope.variantId ? { variantId: scope.variantId } : {}),
        });
      }
    }
    return {
      ready: errors.length === 0,
      errors,
      warnings,
      baseVersionId: site.currentDraftVersionId,
      activeVariants: activeVariants.length,
      assignedRecipients: assignedRecipients.length,
    };
  }

  private async draftSectionIds(
    tx: Transaction,
    site: { currentDraftVersionId: string | null },
  ) {
    if (!site.currentDraftVersionId) return new Set<string>();
    const draft = await tx.invitationVersion.findUnique({
      where: { id: site.currentDraftVersionId },
    });
    return new Set(
      invitationSections(draft?.document).map((section) => section.id),
    );
  }

  private validateVariantOverrides(
    overrides: InvitationVariantOverrides,
    baseSectionIds: Set<string>,
  ) {
    const sectionIds = variantOverrideSectionIds(overrides);
    if (new Set(sectionIds).size !== sectionIds.length)
      validation("Invitation variant section overrides must be unique");
    const unavailable = sectionIds.filter((id) => !baseSectionIds.has(id));
    if (unavailable.length)
      validation(
        `Variant references missing sections: ${unavailable.join(", ")}`,
      );
  }

  private async syncPreviewInTransaction(
    tx: Transaction,
    workspaceId: string,
    draftVersionId: string,
  ) {
    const draft = await tx.invitationVersion.findFirst({
      where: { id: draftVersionId, workspaceId },
    });
    if (!draft) notFound("Invitation draft not found");
    const source = await connectedInvitationSources(tx, workspaceId);
    const sections = invitationSections(draft.document);
    const differences: SyncDifference[] = [];
    for (const candidate of source.values) {
      const section = sections.find(
        (item) => item.type === candidate.sectionType,
      );
      if (!section) continue;
      const currentValue = jsonRecord(section.content)[candidate.field];
      if (
        stableHash(currentValue ?? null) === stableHash(candidate.value ?? null)
      )
        continue;
      differences.push({
        path: candidate.path,
        sectionId: section.id,
        source: candidate.source,
        currentValue,
        sourceValue: candidate.value,
      });
    }
    return {
      sourceRevision: source.revision,
      draftVersionId,
      differences,
    };
  }

  private async recipientHouseholdId(
    tx: Transaction,
    workspaceId: string,
    recipient: { householdId: string | null; guestId: string | null },
  ) {
    const householdId =
      recipient.householdId ??
      (
        await tx.guest.findFirst({
          where: { id: recipient.guestId ?? "", workspaceId },
        })
      )?.householdId;
    if (!householdId) validation("Recipient has no household scope");
    return householdId;
  }

  private async lockInvitationSiteLifecycle(
    tx: Transaction,
    workspaceId: string,
  ) {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`invitation-site-workspace:${workspaceId}`}, 0)
      )
    `;
  }

  private async ensureChannelGrant(
    tx: Transaction,
    workspaceId: string,
    recipientId: string,
    householdId: string,
    channel: "EMAIL" | "QR" | "MANUAL" | "WHATSAPP",
  ) {
    const token = createHmac("sha256", this.webhookSecret)
      .update(`guest-access:v2:${recipientId}:${channel}`)
      .digest("base64url");
    const tokenHash = hashToken(token);
    const existing = await tx.guestAccessGrant.findUnique({
      where: { tokenHash },
    });
    if (
      existing &&
      existing.workspaceId === workspaceId &&
      existing.invitationRecipientId === recipientId &&
      existing.channel === channel &&
      existing.householdId === householdId &&
      !existing.expiresAt &&
      !existing.revokedAt
    )
      return { token, reused: true };
    await tx.guestAccessGrant.updateMany({
      where: {
        invitationRecipientId: recipientId,
        channel,
        revokedAt: null,
        tokenHash: { not: tokenHash },
      },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    if (existing) {
      if (
        existing.invitationRecipientId !== recipientId ||
        existing.workspaceId !== workspaceId
      )
        throw new Error("Deterministic guest grant collision");
      await tx.guestAccessGrant.update({
        where: { id: existing.id },
        data: {
          channel,
          householdId,
          revokedAt: null,
          expiresAt: null,
          version: { increment: 1 },
        },
      });
      return { token, reused: false };
    }
    await tx.guestAccessGrant.create({
      data: {
        workspaceId,
        invitationRecipientId: recipientId,
        householdId,
        channel,
        tokenHash,
      },
    });
    return { token, reused: false };
  }

  private async event(
    tx: Transaction,
    input: {
      eventName: string;
      aggregateType?: string;
      aggregateId: string;
      invitationSiteId?: string;
      aggregateVersion?: number;
      deduplicationKey?: string;
      workspaceId: string;
      actorUserId: string;
      correlationId: string;
      action: string;
      summary: string;
    },
  ) {
    await this.asyncEvents.record(tx, {
      eventName: input.eventName,
      aggregateType:
        input.aggregateType ??
        (input.eventName.startsWith("campaign")
          ? "Campaign"
          : "InvitationSite"),
      aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      deduplicationKey:
        input.deduplicationKey ??
        `${input.eventName}:${input.aggregateId}:v${input.aggregateVersion ?? 1}`,
      payload: {
        subject: {
          entityId: input.aggregateId,
          ...(input.invitationSiteId
            ? { invitationSiteId: input.invitationSiteId }
            : {}),
        },
        activity: {
          category: input.eventName.startsWith("campaign")
            ? "campaigns"
            : "invitations",
          action: input.action,
          summary: input.summary,
          entityId: input.aggregateId,
        },
      },
    });
  }
}

type PreflightIssue = {
  code: string;
  message: string;
  recipientId?: string;
  variantId?: string;
};

type SyncPath =
  | "hero.names"
  | "hero.date"
  | "hero.venue"
  | "schedule.items"
  | "locations.items"
  | "rsvp.deadline"
  | "accommodation.items";
type SyncSource =
  | "wedding_profile"
  | "wedding_events"
  | "rsvp_form"
  | "accommodation_recommendations";
type SyncDifference = {
  path: SyncPath;
  sectionId: string;
  source: SyncSource;
  currentValue: unknown;
  sourceValue: unknown;
};
type SyncCandidate = {
  path: SyncPath;
  sectionType: string;
  field: string;
  source: SyncSource;
  value: unknown;
};

async function connectedInvitationSources(
  tx: Transaction,
  workspaceId: string,
) {
  const [workspace, profile, events, form] = await Promise.all([
    tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { timezone: true },
    }),
    tx.eventProfile.findUnique({ where: { workspaceId } }),
    tx.weddingEvent.findMany({
      where: {
        workspaceId,
        status: "CONFIRMED",
        guestVisible: true,
        deletedAt: null,
      },
      orderBy: [{ position: "asc" }, { startAt: "asc" }, { id: "asc" }],
    }),
    tx.rsvpFormDefinition.findUnique({ where: { workspaceId } }),
  ]);
  const [formVersion, accommodations] = await Promise.all([
    form?.publishedVersionId
      ? tx.rsvpFormVersion.findUnique({
          where: { id: form.publishedVersionId },
        })
      : null,
    tx.accommodationRecommendation.findMany({
      where: {
        workspaceId,
        weddingEventId: { in: events.map((event) => event.id) },
        status: "PUBLISHED",
        deletedAt: null,
      },
      orderBy: [
        { weddingEventId: "asc" },
        { position: "asc" },
        { createdAt: "asc" },
      ],
    }),
  ]);
  const values: SyncCandidate[] = [];
  const names = [profile?.partnerOneName, profile?.partnerTwoName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" & ");
  if (names)
    values.push({
      path: "hero.names",
      sectionType: "hero",
      field: "names",
      source: "wedding_profile",
      value: names,
    });
  if (profile?.eventDate)
    values.push({
      path: "hero.date",
      sectionType: "hero",
      field: "date",
      source: "wedding_profile",
      value: connectedInvitationDateLabel(
        profile.eventDate,
        // weddingDate is a calendar date persisted at UTC midnight, not an
        // instant. Formatting it in a negative-offset workspace would move it
        // to the previous day.
        "UTC",
        false,
      ),
    });
  if (profile?.location)
    values.push({
      path: "hero.venue",
      sectionType: "hero",
      field: "venue",
      source: "wedding_profile",
      value: profile.location,
    });
  if (events.length) {
    values.push({
      path: "schedule.items",
      sectionType: "schedule",
      field: "items",
      source: "wedding_events",
      value: events.map((event) => ({
        id: event.id,
        // Onboarding stores the intended local wall-clock value in the UTC
        // fields and keeps the actual timezone separately. Preserve HH:mm
        // here instead of shifting it a second time during invitation sync.
        time: event.startAt?.toISOString().slice(11, 16) ?? "",
        title: event.title,
        detail: event.locationName ?? event.locationAddress ?? "",
        startAt: event.startAt?.toISOString() ?? null,
        endAt: event.endAt?.toISOString() ?? null,
        timezone: event.timezone,
        dressCode: event.dressCode,
      })),
    });
    const locations = events
      .filter((event) => event.locationName || event.locationAddress)
      .map((event) => ({
        eventId: event.id,
        name: event.locationName ?? event.title,
        address: event.locationAddress ?? "",
      }));
    if (locations.length)
      values.push({
        path: "locations.items",
        sectionType: "locations",
        field: "items",
        source: "wedding_events",
        value: locations,
      });
  }
  const deadline = jsonRecord(formVersion?.config).deadline;
  if (typeof deadline === "string" && deadline)
    values.push({
      path: "rsvp.deadline",
      sectionType: "rsvp",
      field: "deadline",
      source: "rsvp_form",
      value: connectedInvitationDateLabel(
        new Date(deadline),
        workspace?.timezone ?? "Europe/Bucharest",
        true,
      ),
    });
  if (accommodations.length)
    values.push({
      path: "accommodation.items",
      sectionType: "accommodation",
      field: "items",
      source: "accommodation_recommendations",
      value: accommodations.map((item) => ({
        id: item.id,
        name: item.name,
        detail: item.organizerNote ?? item.address ?? "",
        address: item.address,
        city: item.city,
        distanceKm: item.distanceKm?.toString() ?? null,
        url: item.bookingUrl ?? item.contactUrl ?? item.sourceUrl,
        contactPhone: item.contactPhone,
        groupCode: item.groupCode,
        deadline: item.deadline?.toISOString() ?? null,
      })),
    });
  const revision = stableHash({
    profile: profile
      ? {
          id: profile.id,
          version: profile.version,
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
    events: events.map((event) => ({
      id: event.id,
      version: event.version,
      updatedAt: event.updatedAt.toISOString(),
    })),
    rsvpForm: formVersion
      ? { id: formVersion.id, contentHash: formVersion.contentHash }
      : null,
    accommodations: accommodations.map((item) => ({
      id: item.id,
      version: item.version,
      updatedAt: item.updatedAt.toISOString(),
    })),
    values,
  });
  return { revision, values };
}

function connectedInvitationDateLabel(
  value: Date,
  timeZone: string,
  includeTime: boolean,
) {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("ro-RO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      ...(includeTime
        ? {
            hour: "2-digit" as const,
            minute: "2-digit" as const,
            hour12: false,
          }
        : {}),
      timeZone: zone,
    }).format(value);
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

function invitationSections(value: unknown) {
  const sections = jsonRecord(value).sections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    const record = jsonRecord(section);
    const id = string(record.id);
    const type = string(record.type);
    if (!id || !type) return [];
    return [{ id, type, content: jsonRecord(record.content) }];
  });
}

export function invitationRequiresRsvp(value: unknown) {
  const sections = jsonRecord(value).sections;
  if (!Array.isArray(sections)) return false;
  return sections.some((section) => {
    const record = jsonRecord(section);
    if (record.visible === false) return false;
    const type = string(record.type);
    const content = jsonRecord(record.content);
    if (type === "rsvp") return true;
    return type === "hero" && Boolean(string(content.buttonLabel).trim());
  });
}

function variantOverrideSectionIds(value: unknown) {
  const sections = jsonRecord(jsonRecord(value).document).sections;
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section) => string(jsonRecord(section).id))
    .filter(Boolean);
}

function applySyncDifferences(
  document: Record<string, unknown>,
  differences: SyncDifference[],
) {
  const sections = Array.isArray(document.sections)
    ? document.sections.map((section) => cloneRecord(section))
    : [];
  for (const difference of differences) {
    const index = sections.findIndex(
      (section) => string(section.id) === difference.sectionId,
    );
    if (index < 0) continue;
    const section = sections[index]!;
    const content = cloneRecord(section.content);
    const field = difference.path.split(".")[1]!;
    content[field] = difference.sourceValue;
    section.content = content;
  }
  document.sections = sections;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return structuredClone(value as Record<string, unknown>);
}

function mapVariantVersion(row: {
  id: string;
  versionNumber: number;
  baseInvitationVersionId: string;
  overrides: unknown;
  contentHash: string;
  publishedAt: Date | null;
}) {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    baseInvitationVersionId: row.baseInvitationVersionId,
    overrides: row.overrides,
    contentHash: row.contentHash,
    publishedAt: iso(row.publishedAt),
  };
}

function dedupeRecipientsByIdentity<
  T extends {
    id: string;
    invitationSiteId: string;
    householdId: string | null;
    guestId: string | null;
  },
>(
  recipients: T[],
  recipientGuestHouseholds: ReadonlyMap<string, string> = new Map(),
) {
  const selected = new Map<string, T>();
  for (const recipient of recipients) {
    const householdId =
      recipient.householdId ??
      (recipient.guestId
        ? recipientGuestHouseholds.get(recipient.guestId)
        : undefined);
    const target = householdId
      ? `household:${householdId}`
      : `guest:${recipient.guestId ?? recipient.id}`;
    const key = `${recipient.invitationSiteId}:${target}`;
    const existing = selected.get(key);
    if (!existing || (!existing.householdId && recipient.householdId))
      selected.set(key, recipient);
  }
  return [...selected.values()];
}

function mapVersion(row: {
  id: string;
  versionNumber: number;
  document: unknown;
  settings: unknown;
  language: string;
  contentHash: string;
  publishedAt: Date | null;
}) {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    document: row.document,
    settings: row.settings,
    language: row.language,
    contentHash: row.contentHash,
    publishedAt: iso(row.publishedAt),
  };
}
function mapCampaignRecipient(row: {
  id: string;
  invitationRecipientId: string;
  guestId: string | null;
  householdId: string | null;
  address: string;
  status: string;
  queuedAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
  version: number;
}) {
  return {
    id: row.id,
    invitationRecipientId: row.invitationRecipientId,
    guestId: row.guestId,
    householdId: row.householdId,
    address: redactAddress(row.address),
    status: row.status.toLowerCase(),
    queuedAt: iso(row.queuedAt),
    sentAt: iso(row.sentAt),
    deliveredAt: iso(row.deliveredAt),
    openedAt: iso(row.openedAt),
    failedAt: iso(row.failedAt),
    failureCode: row.failureCode,
    version: row.version,
  };
}
function redactAddress(value: string) {
  const [local, domain] = value.split("@");
  return domain ? `${local?.slice(0, 2) ?? "**"}***@${domain}` : "[redacted]";
}
export function campaignTransition(
  status: string,
  transition: string,
): "CANCELLED" | "ARCHIVED" {
  const allowed: Record<string, Record<string, "CANCELLED" | "ARCHIVED">> = {
    SENDING: { CANCEL: "CANCELLED" },
    QUEUED: { CANCEL: "CANCELLED" },
    SCHEDULED: { CANCEL: "CANCELLED" },
    PAUSED: { CANCEL: "CANCELLED" },
    COMPLETED: { ARCHIVE: "ARCHIVED" },
    PARTIAL: { ARCHIVE: "ARCHIVED" },
    FAILED: { ARCHIVE: "ARCHIVED" },
  };
  const next = allowed[status]?.[transition];
  if (!next) validation("Invalid campaign transition");
  return next;
}
async function replay(
  tx: Transaction,
  actorUserId: string,
  operation: string,
  key: string,
  input: unknown,
) {
  const row = await tx.idempotencyRecord.findUnique({
    where: { actorUserId_operation_key: { actorUserId, operation, key } },
  });
  if (!row) return null;
  if (row.requestHash !== stableHash(input))
    problem(
      "IDEMPOTENCY_CONFLICT",
      HttpStatus.CONFLICT,
      "Idempotency key reused with different input",
    );
  return row.responseBody;
}
async function saveReplay(
  tx: Transaction,
  actorUserId: string,
  workspaceId: string,
  operation: string,
  key: string,
  input: unknown,
  response: unknown,
) {
  await tx.idempotencyRecord.create({
    data: {
      workspaceId,
      actorUserId,
      operation,
      key,
      requestHash: stableHash(input),
      responseStatus: 200,
      responseBody: response as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}
function string(value: unknown) {
  return typeof value === "string" ? value : "";
}
function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}
function validation(detail: string): never {
  problem(
    "VALIDATION_FAILED",
    HttpStatus.UNPROCESSABLE_ENTITY,
    "Validation failed",
    detail,
  );
}
function notFound(title: string): never {
  problem("NOT_FOUND", HttpStatus.NOT_FOUND, title);
}
function conflict(latestVersion: number): never {
  problem(
    "VERSION_CONFLICT",
    HttpStatus.PRECONDITION_FAILED,
    "Version conflict",
    "Resursa a fost modificată. Reîncarcă datele curente.",
    undefined,
    { latestVersion },
  );
}
function precondition(detail: string): never {
  problem(
    "PRECONDITION_REQUIRED",
    HttpStatus.PRECONDITION_REQUIRED,
    "Precondition required",
    detail,
  );
}
function audienceChanged(): never {
  problem(
    "CAMPAIGN_AUDIENCE_CHANGED",
    HttpStatus.CONFLICT,
    "Campaign audience changed",
    "Destinatarii s-au modificat după verificare. Verifică din nou audiența înainte de trimitere.",
  );
}

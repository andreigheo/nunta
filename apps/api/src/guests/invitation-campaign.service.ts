import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { CreateCampaign, SaveInvitationDraft } from "@weddingos/contracts";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import QRCode from "qrcode";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";
import { createOpaqueToken, hashToken, stableHash } from "./sensitive.crypto";

type Transaction = Prisma.TransactionClient;

@Injectable()
export class InvitationCampaignService {
  private readonly webUrl: string;
  private readonly webhookSecret: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
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
        const site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        if (!site) notFound("Invitation site not found");
        if (site.version !== expectedVersion) conflict(site.version);
        if (!site.currentDraftVersionId)
          validation("Save an invitation draft before publishing");
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
        const updated = await tx.invitationSite.update({
          where: { id: site.id },
          data: {
            publishedVersionId: draft.id,
            status: "PUBLISHED",
            publishedAt: now,
            version: { increment: 1 },
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
        const response = await this.siteInTransaction(tx, workspaceId);
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

  async createRecipients(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    householdIds: string[],
    guestIds: string[],
    invitationVersionId: string | undefined,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const input = { householdIds, guestIds, invitationVersionId };
        const prior = await replay(
          tx,
          userId,
          "invitation.recipients.create",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        const site = await tx.invitationSite.findUnique({
          where: { workspaceId },
        });
        const versionId = invitationVersionId ?? site?.publishedVersionId;
        if (!versionId) validation("A published invitation is required");
        const version = await tx.invitationVersion.findFirst({
          where: { id: versionId, workspaceId, publishedAt: { not: null } },
        });
        if (!version) validation("Invitation version is not published");
        let created = 0;
        const recipientIds: string[] = [];
        for (const householdId of [...new Set(householdIds)]) {
          const household = await tx.household.findFirst({
            where: { id: householdId, workspaceId, deletedAt: null },
          });
          if (!household) notFound("Household not found");
          const existing = await tx.invitationRecipient.findFirst({
            where: { invitationVersionId: versionId, householdId },
          });
          const recipient =
            existing ??
            (await tx.invitationRecipient.create({
              data: {
                workspaceId,
                householdId,
                invitationVersionId: versionId,
                preferredLanguage: household.preferredLanguage,
                personalizationSnapshot: {
                  householdName: household.name,
                },
              },
            }));
          if (!existing) created += 1;
          recipientIds.push(recipient.id);
          if (!existing)
            await tx.guestAccessGrant.create({
              data: {
                workspaceId,
                invitationRecipientId: recipient.id,
                householdId,
                tokenHash: hashToken(createOpaqueToken()),
              },
            });
        }
        for (const guestId of [...new Set(guestIds)]) {
          const guest = await tx.guest.findFirst({
            where: { id: guestId, workspaceId, status: "ACTIVE" },
          });
          if (!guest) notFound("Guest not found");
          const existing = await tx.invitationRecipient.findFirst({
            where: { invitationVersionId: versionId, guestId },
          });
          const recipient =
            existing ??
            (await tx.invitationRecipient.create({
              data: {
                workspaceId,
                guestId,
                invitationVersionId: versionId,
                preferredLanguage: guest.preferredLanguage,
                personalizationSnapshot: {
                  guestName: `${guest.firstName} ${guest.lastName}`.trim(),
                },
              },
            }));
          if (!existing) created += 1;
          recipientIds.push(recipient.id);
          if (!existing)
            await tx.guestAccessGrant.create({
              data: {
                workspaceId,
                invitationRecipientId: recipient.id,
                householdId: guest.householdId,
                tokenHash: hashToken(createOpaqueToken()),
              },
            });
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

  async sendRsvpReminder(
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
    return this.transition(
      userId,
      workspaceId,
      campaign.id,
      campaign.version,
      `${idempotencyKey}:send`,
      "SEND_NOW",
      undefined,
      correlationId,
    );
  }

  async recipients(userId: string, workspaceId: string, cursor?: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.invitationRecipient.findMany({
        where: { workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const householdIds = rows
        .map((row) => row.householdId)
        .filter((id): id is string => Boolean(id));
      const households = new Map(
        (
          await tx.household.findMany({ where: { id: { in: householdIds } } })
        ).map((row) => [row.id, row.name]),
      );
      return {
        items: rows.slice(0, 50).map((row) => ({
          id: row.id,
          householdId: row.householdId,
          guestId: row.guestId,
          householdName: row.householdId
            ? households.get(row.householdId)
            : undefined,
          invitationVersionId: row.invitationVersionId,
          status: row.status.toLowerCase(),
          openedAt: iso(row.openedAt),
          rsvpCompletedAt: iso(row.rsvpCompletedAt),
          version: row.version,
        })),
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
      };
    });
  }

  async qr(
    userId: string,
    workspaceId: string,
    recipientId: string,
    format: "svg" | "png",
  ) {
    const token = createOpaqueToken();
    const url = new URL("/guest", this.webUrl);
    url.searchParams.set("token", token);
    await this.database.withContext({ userId, workspaceId }, async (tx) => {
      const recipient = await tx.invitationRecipient.findFirst({
        where: { id: recipientId, workspaceId, revokedAt: null },
      });
      if (!recipient) notFound("Invitation recipient not found");
      const householdId =
        recipient.householdId ??
        (
          await tx.guest.findFirst({
            where: { id: recipient.guestId ?? "", workspaceId },
          })
        )?.householdId;
      if (!householdId) validation("Recipient has no household scope");
      await tx.guestAccessGrant.updateMany({
        where: { invitationRecipientId: recipient.id, revokedAt: null },
        data: { revokedAt: new Date(), version: { increment: 1 } },
      });
      await tx.guestAccessGrant.create({
        data: {
          workspaceId,
          invitationRecipientId: recipient.id,
          householdId,
          tokenHash: hashToken(token),
        },
      });
    });
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

  async audiencePreview(
    userId: string,
    workspaceId: string,
    campaignId: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, workspaceId },
      });
      if (!campaign) notFound("Campaign not found");
      const candidates = await tx.invitationRecipient.findMany({
        where: {
          workspaceId,
          revokedAt: null,
          ...(campaign.invitationVersionId
            ? { invitationVersionId: campaign.invitationVersionId }
            : {}),
          ...(campaign.purpose === "RSVP_REMINDER"
            ? {
                status: {
                  in: ["READY", "SENT", "OPENED", "PARTIALLY_RESPONDED"],
                },
              }
            : {}),
        },
      });
      const recipients = await this.filterAudience(tx, campaign, candidates);
      let valid = 0;
      const invalid: Array<{ recipientId: string; reason: string }> = [];
      for (const recipient of recipients) {
        const address = await this.recipientAddress(tx, recipient);
        if (address) valid += 1;
        else
          invalid.push({ recipientId: recipient.id, reason: "missing_email" });
      }
      return {
        total: recipients.length,
        valid,
        invalid: invalid.length,
        invalidRecipients: invalid,
      };
    });
  }

  async transition(
    userId: string,
    workspaceId: string,
    campaignId: string,
    expectedVersion: number,
    idempotencyKey: string,
    transition: string,
    scheduledAt: string | undefined,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const input = { campaignId, expectedVersion, transition, scheduledAt };
        const prior = await replay(
          tx,
          userId,
          "campaign.transition",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
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
          const preview = await this.snapshotAudience(tx, campaign);
          if (["FAILED", "PARTIAL"].includes(campaign.status)) {
            await tx.campaignRecipient.updateMany({
              where: { campaignId: campaign.id, status: "FAILED" },
              data: {
                status: "PENDING",
                failureCode: null,
                failedAt: null,
                version: { increment: 1 },
              },
            });
          }
          const queuedRecipients = await tx.campaignRecipient.count({
            where: { campaignId: campaign.id, status: "PENDING" },
          });
          if (!queuedRecipients)
            validation("Campaign has no valid e-mail recipients");
          const availableAt =
            transition === "SCHEDULE"
              ? new Date(scheduledAt ?? "")
              : new Date();
          if (
            transition === "SCHEDULE" &&
            (Number.isNaN(availableAt.getTime()) || availableAt <= new Date())
          )
            validation("A future schedule time is required");
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
            newRecipients: preview.created,
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
        if (transition === "CANCEL")
          await tx.campaignRecipient.updateMany({
            where: { campaignId, status: { in: ["PENDING", "QUEUED"] } },
            data: { status: "CANCELLED", version: { increment: 1 } },
          });
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
  ) {
    const candidates = await tx.invitationRecipient.findMany({
      where: {
        workspaceId: campaign.workspaceId,
        revokedAt: null,
        ...(campaign.invitationVersionId
          ? { invitationVersionId: campaign.invitationVersionId }
          : {}),
        ...(campaign.purpose === "RSVP_REMINDER"
          ? {
              status: {
                in: ["READY", "SENT", "OPENED", "PARTIALLY_RESPONDED"],
              },
            }
          : {}),
      },
    });
    const recipients = await this.filterAudience(tx, campaign, candidates);
    let created = 0;
    for (const recipient of recipients) {
      const address = await this.recipientAddress(tx, recipient);
      if (!address) continue;
      const result = await tx.campaignRecipient.createMany({
        data: [
          {
            workspaceId: campaign.workspaceId,
            campaignId: campaign.id,
            invitationRecipientId: recipient.id,
            guestId: recipient.guestId,
            householdId: recipient.householdId,
            address,
            personalizationSnapshot:
              recipient.personalizationSnapshot as Prisma.InputJsonValue,
            dedupeKey: `${campaign.id}:${recipient.id}:EMAIL`,
          },
        ],
        skipDuplicates: true,
      });
      created += result.count;
    }
    return { created, total: recipients.length };
  }

  private async filterAudience<
    T extends {
      id: string;
      workspaceId: string;
      guestId: string | null;
      householdId: string | null;
      status: string;
    },
  >(
    tx: Transaction,
    campaign: { workspaceId: string; audienceFilter: unknown },
    recipients: T[],
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
        isChild: true,
        isPlusOne: true,
      },
    });
    const guestIds = guests.map((guest) => guest.id);
    const [tagAssignments, responses] = await Promise.all([
      tx.guestTagAssignment.findMany({
        where: { workspaceId: campaign.workspaceId, guestId: { in: guestIds } },
        select: { guestId: true, tagId: true },
      }),
      tx.guestEventResponse.findMany({
        where: { workspaceId: campaign.workspaceId, guestId: { in: guestIds } },
        select: { guestId: true, attendance: true },
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
    const invitationStatuses = new Set(
      stringArray(filter.invitationStatuses).map((status) =>
        status.toUpperCase(),
      ),
    );
    const rsvpStatuses = new Set(stringArray(filter.rsvpStatuses));

    return recipients.filter((recipient) => {
      const members = guests.filter((guest) =>
        recipient.guestId
          ? guest.id === recipient.guestId
          : guest.householdId === recipient.householdId,
      );
      if (
        selectedGuestIds.size &&
        !members.some((guest) => selectedGuestIds.has(guest.id))
      )
        return false;
      if (
        selectedHouseholdIds.size &&
        (!recipient.householdId ||
          !selectedHouseholdIds.has(recipient.householdId))
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

  private async recipientAddress(
    tx: Transaction,
    recipient: { guestId: string | null; householdId: string | null },
  ) {
    if (recipient.guestId)
      return (
        (await tx.guest.findUnique({ where: { id: recipient.guestId } }))
          ?.emailNormalized ?? null
      );
    if (!recipient.householdId) return null;
    const household = await tx.household.findUnique({
      where: { id: recipient.householdId },
    });
    if (household?.primaryGuestId) {
      const primary = await tx.guest.findUnique({
        where: { id: household.primaryGuestId },
      });
      if (primary?.emailNormalized) return primary.emailNormalized;
    }
    return (
      (
        await tx.guest.findFirst({
          where: {
            householdId: recipient.householdId,
            status: "ACTIVE",
            emailNormalized: { not: null },
          },
          orderBy: [{ isChild: "asc" }, { createdAt: "asc" }],
        })
      )?.emailNormalized ?? null
    );
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

  private async event(
    tx: Transaction,
    input: {
      eventName: string;
      aggregateId: string;
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
      aggregateType: input.eventName.startsWith("campaign")
        ? "Campaign"
        : "InvitationSite",
      aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      deduplicationKey:
        input.deduplicationKey ??
        `${input.eventName}:${input.aggregateId}:v${input.aggregateVersion ?? 1}`,
      payload: {
        subject: { entityId: input.aggregateId },
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
): "PAUSED" | "QUEUED" | "CANCELLED" | "ARCHIVED" {
  const allowed: Record<
    string,
    Record<string, "PAUSED" | "QUEUED" | "CANCELLED" | "ARCHIVED">
  > = {
    SENDING: { PAUSE: "PAUSED", CANCEL: "CANCELLED" },
    QUEUED: { PAUSE: "PAUSED", CANCEL: "CANCELLED" },
    SCHEDULED: { PAUSE: "PAUSED", CANCEL: "CANCELLED" },
    PAUSED: { RESUME: "QUEUED", CANCEL: "CANCELLED" },
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

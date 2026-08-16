import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  CreateMenu,
  GuestInvitationOpen,
  GuestLinkAccess,
  GuestRsvpRequest,
  RsvpDashboardQuery,
  RsvpDashboardStatus,
} from "@weddingos/contracts";
import {
  guestAccommodationRecommendationSchema,
  rsvpFormConfigSchema,
} from "@weddingos/contracts";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";
import {
  decryptSensitive,
  encryptSensitive,
  hashToken,
  stableHash,
} from "./sensitive.crypto";
import { resolveInvitationVariant } from "./invitation-resolution";

type Transaction = Prisma.TransactionClient;
type GuestContext = {
  grantId: string;
  workspaceId: string;
  householdId: string;
  recipientId: string;
  tokenHash: string;
};

@Injectable()
export class RsvpMenuService {
  private readonly sensitiveKey: { keyId: string; secret: string };

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.sensitiveKey = {
      keyId: environment.OUTBOX_ENCRYPTION_KEY_ID,
      secret: environment.OUTBOX_ENCRYPTION_KEY,
    };
  }

  async form(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      return this.formInTransaction(tx, workspaceId);
    });
  }

  async dashboard(
    userId: string,
    workspaceId: string,
    query: RsvpDashboardQuery,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const definition = await tx.rsvpFormDefinition.findUnique({
        where: { workspaceId },
        select: { publishedVersionId: true },
      });
      const publishedVersion = definition?.publishedVersionId
        ? await tx.rsvpFormVersion.findFirst({
            where: {
              id: definition.publishedVersionId,
              workspaceId,
              immutable: true,
            },
          })
        : null;
      const config = publishedVersion
        ? rsvpFormConfigSchema.parse(publishedVersion.config)
        : null;
      const [events, households, guests] = await Promise.all([
        tx.weddingEvent.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            guestVisible: true,
            rsvpEnabled: true,
            status: { not: "CANCELLED" },
          },
          orderBy: [{ position: "asc" }, { startAt: "asc" }, { id: "asc" }],
          select: { id: true, title: true, startAt: true },
        }),
        tx.household.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, name: true },
        }),
        tx.guest.findMany({
          where: { workspaceId, status: "ACTIVE", deletedAt: null },
          orderBy: [
            { isChild: "asc" },
            { isPlusOne: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
          select: {
            id: true,
            householdId: true,
            firstName: true,
            lastName: true,
            displayName: true,
            isChild: true,
            isPlusOne: true,
            needsTransport: true,
            needsAccommodation: true,
          },
        }),
      ]);
      const guestIds = guests.map((guest) => guest.id);
      const submissions = publishedVersion
        ? await tx.rsvpSubmission.findMany({
            where: { workspaceId, formVersionId: publishedVersion.id },
            orderBy: [
              { lastModifiedAt: "desc" },
              { submittedAt: "desc" },
              { createdAt: "desc" },
              { id: "desc" },
            ],
          })
        : [];
      const submissionIds = submissions.map((submission) => submission.id);
      const [responses, selections] = await Promise.all([
        submissionIds.length
          ? tx.guestEventResponse.findMany({
              where: {
                workspaceId,
                submissionId: { in: submissionIds },
                guestId: { in: guestIds },
                weddingEventId: { in: events.map((event) => event.id) },
              },
            })
          : [],
        guestIds.length
          ? tx.guestMenuSelection.findMany({
              where: { workspaceId, guestId: { in: guestIds }, active: true },
              orderBy: [{ selectedAt: "desc" }, { id: "desc" }],
              select: { guestId: true, menuId: true },
            })
          : [],
      ]);
      const menuIds = [...new Set(selections.map((item) => item.menuId))];
      const menuNames = new Map(
        (
          await tx.menu.findMany({
            where: { workspaceId, id: { in: menuIds }, deletedAt: null },
            select: { id: true, name: true },
          })
        ).map((menu) => [menu.id, menu.name]),
      );
      const submissionByHousehold = new Map<
        string,
        (typeof submissions)[number]
      >();
      for (const submission of submissions)
        if (!submissionByHousehold.has(submission.householdId))
          submissionByHousehold.set(submission.householdId, submission);
      const selectionByGuest = new Map<string, (typeof selections)[number]>();
      for (const selection of selections)
        if (!selectionByGuest.has(selection.guestId))
          selectionByGuest.set(selection.guestId, selection);
      const responseByPair = new Map(
        responses.map((response) => [
          `${response.submissionId}:${response.guestId}:${response.weddingEventId}`,
          response,
        ]),
      );
      const guestsByHousehold = new Map<
        string,
        Array<(typeof guests)[number]>
      >();
      for (const guest of guests) {
        const householdGuests = guestsByHousehold.get(guest.householdId) ?? [];
        householdGuests.push(guest);
        guestsByHousehold.set(guest.householdId, householdGuests);
      }
      const rows = households.flatMap((household) => {
        const householdGuests = guestsByHousehold.get(household.id) ?? [];
        if (!householdGuests.length) return [];
        const submission = submissionByHousehold.get(household.id) ?? null;
        const members = householdGuests.map((guest) => {
          const memberResponses = events.map((event) => {
            const response = submission
              ? responseByPair.get(`${submission.id}:${guest.id}:${event.id}`)
              : undefined;
            return {
              eventId: event.id,
              attendance: response
                ? (response.attendance.toLowerCase() as
                    "confirmed" | "declined" | "unsure")
                : submission && guest.isPlusOne
                  ? ("confirmed" as const)
                  : null,
            };
          });
          const selection = selectionByGuest.get(guest.id);
          return {
            guestId: guest.id,
            name:
              guest.displayName?.trim() ||
              `${guest.firstName} ${guest.lastName}`.trim(),
            isChild: guest.isChild,
            isPlusOne: guest.isPlusOne,
            status: dashboardStatus(
              memberResponses.map((response) => response.attendance),
            ),
            responses: memberResponses,
            menuId: selection?.menuId ?? null,
            menuName: selection
              ? (menuNames.get(selection.menuId) ?? null)
              : null,
            needsTransport: guest.needsTransport,
            needsAccommodation: guest.needsAccommodation,
          };
        });
        return [
          {
            householdId: household.id,
            householdName: household.name,
            status: householdDashboardStatus(
              members.map((member) => member.status),
            ),
            members,
            submission: submission
              ? {
                  id: submission.id,
                  version: submission.version,
                  source:
                    submission.source === "ADMIN_OVERRIDE"
                      ? ("admin_override" as const)
                      : ("guest" as const),
                  message: submission.guestMessage,
                  submittedAt: submission.submittedAt?.toISOString() ?? null,
                  lastModifiedAt:
                    submission.lastModifiedAt?.toISOString() ?? null,
                }
              : null,
          },
        ];
      });
      const memberStatuses = rows.flatMap((row) =>
        row.members.map((member) => member.status),
      );
      const summary = {
        totalGuests: memberStatuses.length,
        totalHouseholds: rows.length,
        respondedHouseholds: rows.filter((row) => row.submission).length,
        confirmed: countStatus(memberStatuses, "confirmed"),
        declined: countStatus(memberStatuses, "declined"),
        unsure: countStatus(memberStatuses, "unsure"),
        mixed: countStatus(memberStatuses, "mixed"),
        incomplete: countStatus(memberStatuses, "incomplete"),
        noResponse: countStatus(memberStatuses, "no_response"),
        menuIncomplete:
          config?.menuSelection === false
            ? 0
            : rows
                .flatMap((row) => row.members)
                .filter(
                  (member) =>
                    member.responses.some(
                      (response) => response.attendance === "confirmed",
                    ) && !member.menuId,
                ).length,
        transportRequested: guests.filter((guest) => guest.needsTransport)
          .length,
        accommodationRequested: guests.filter(
          (guest) => guest.needsAccommodation,
        ).length,
      };
      const search = query.search?.toLocaleLowerCase("ro");
      const filtered = rows.filter(
        (row) =>
          (!query.status || row.status === query.status) &&
          (!search ||
            row.householdName.toLocaleLowerCase("ro").includes(search) ||
            row.members.some((member) =>
              member.name.toLocaleLowerCase("ro").includes(search),
            )),
      );
      const cursorIndex = query.cursor
        ? filtered.findIndex((row) => row.householdId === query.cursor)
        : -1;
      const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      const page = filtered.slice(start, start + query.limit);
      return {
        events: events.map((event) => ({
          id: event.id,
          title: event.title,
          startAt: event.startAt?.toISOString() ?? null,
        })),
        items: page,
        nextCursor:
          start + query.limit < filtered.length
            ? (page.at(-1)?.householdId ?? null)
            : null,
        matchedHouseholds: filtered.length,
        summary,
      };
    });
  }

  async saveForm(
    userId: string,
    workspaceId: string,
    expectedVersion: number | null,
    config: Record<string, unknown>,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        let definition = await tx.rsvpFormDefinition.findUnique({
          where: { workspaceId },
        });
        if (definition && expectedVersion === null)
          precondition("If-Match is required for an existing RSVP form");
        if (definition && definition.version !== expectedVersion)
          conflict(definition.version);
        const deadline = config.deadline
          ? new Date(String(config.deadline))
          : null;
        if (deadline) {
          const wedding = await tx.weddingProfile.findUnique({
            where: { workspaceId },
          });
          if (wedding?.weddingDate && deadline >= wedding.weddingDate)
            validation("RSVP deadline must be before the wedding date");
        }
        definition ??= await tx.rsvpFormDefinition.create({
          data: { workspaceId, createdById: userId },
        });
        const latest = await tx.rsvpFormVersion.findFirst({
          where: { formDefinitionId: definition.id },
          orderBy: { versionNumber: "desc" },
        });
        const draft = await tx.rsvpFormVersion.create({
          data: {
            workspaceId,
            formDefinitionId: definition.id,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            config: config as Prisma.InputJsonValue,
            contentHash: stableHash(config),
            createdById: userId,
          },
        });
        const updatedDefinition = await tx.rsvpFormDefinition.update({
          where: { id: definition.id },
          data: { currentDraftId: draft.id, version: { increment: 1 } },
        });
        if (definition.currentDraftId) {
          const previous = await tx.rsvpFormVersion.findUnique({
            where: { id: definition.currentDraftId },
          });
          const previousConfig = object(previous?.config);
          if (previousConfig.deadline !== config.deadline) {
            await this.event(tx, {
              eventName: "rsvp.deadline_changed.v1",
              aggregateId: definition.id,
              aggregateVersion: updatedDefinition.version,
              workspaceId,
              actorUserId: userId,
              correlationId,
              action: "rsvp_deadline_changed",
              summary: "Deadline-ul RSVP a fost actualizat.",
            });
          }
        }
        return this.formInTransaction(tx, workspaceId);
      },
    );
  }

  async publishForm(
    userId: string,
    workspaceId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const input = { workspaceId, expectedVersion };
        const prior = await replay(
          tx,
          userId,
          "rsvp.form.publish",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        const definition = await tx.rsvpFormDefinition.findUnique({
          where: { workspaceId },
        });
        if (!definition?.currentDraftId)
          validation("Save the RSVP form before publishing");
        if (definition.version !== expectedVersion)
          conflict(definition.version);
        const draft = await tx.rsvpFormVersion.findUniqueOrThrow({
          where: { id: definition.currentDraftId },
        });
        const config = object(draft.config);
        if (!Array.isArray(config.languages) || !config.languages.length)
          validation("At least one RSVP language is required");
        const now = new Date();
        await tx.rsvpFormVersion.update({
          where: { id: draft.id },
          data: { immutable: true, publishedAt: now },
        });
        const updated = await tx.rsvpFormDefinition.update({
          where: { id: definition.id },
          data: {
            publishedVersionId: draft.id,
            status: "PUBLISHED",
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          eventName: "rsvp.form_published.v1",
          aggregateId: definition.id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "rsvp_form_published",
          summary: "Formularul RSVP a fost publicat.",
        });
        const response = await this.formInTransaction(tx, workspaceId);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "rsvp.form.publish",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async bootstrap(token: string) {
    return this.withGuest(token, async (tx, context) => {
      const recipient = await tx.invitationRecipient.findFirst({
        where: { id: context.recipientId, workspaceId: context.workspaceId },
      });
      if (!recipient) invalidToken();
      const identityRecipients = await this.identityRecipients(tx, recipient);
      const identityRecipientIds = identityRecipients.map((row) => row.id);
      const canonicalRecipient = identityRecipients[0] ?? recipient;
      const site = await tx.invitationSite.findFirst({
        where: {
          id: recipient.invitationSiteId,
          workspaceId: context.workspaceId,
          status: "PUBLISHED",
        },
      });
      const version = site?.publishedVersionId
        ? await tx.invitationVersion.findUnique({
            where: { id: site.publishedVersionId },
          })
        : null;
      if (!version || !site) invalidToken();
      const variant = canonicalRecipient.invitationVariantId
        ? await tx.invitationVariant.findFirst({
            where: {
              id: canonicalRecipient.invitationVariantId,
              invitationSiteId: site.id,
              workspaceId: context.workspaceId,
              status: "ACTIVE",
            },
          })
        : null;
      const variantVersion = variant?.publishedVersionId
        ? await tx.invitationVariantVersion.findFirst({
            where: {
              id: variant.publishedVersionId,
              invitationVariantId: variant.id,
              baseInvitationVersionId: version.id,
              workspaceId: context.workspaceId,
              publishedAt: { not: null },
            },
          })
        : null;
      const resolvedInvitation = resolveInvitationVariant(
        version.document,
        version.settings,
        variantVersion?.overrides,
      );
      const household = await tx.household.findUnique({
        where: { id: context.householdId },
      });
      if (!household) invalidToken();
      const [members, events, form, menus, wedding] = await Promise.all([
        tx.guest.findMany({
          where: {
            householdId: context.householdId,
            status: "ACTIVE",
          },
          orderBy: [
            { isChild: "asc" },
            { isPlusOne: "asc" },
            { createdAt: "asc" },
          ],
        }),
        tx.weddingEvent.findMany({
          where: {
            workspaceId: context.workspaceId,
            guestVisible: true,
            deletedAt: null,
            status: { not: "CANCELLED" },
          },
          orderBy: [{ position: "asc" }, { startAt: "asc" }],
        }),
        tx.rsvpFormDefinition.findUnique({
          where: { workspaceId: context.workspaceId },
        }),
        tx.menu.findMany({
          where: {
            workspaceId: context.workspaceId,
            status: "ACTIVE",
            deletedAt: null,
          },
          orderBy: { position: "asc" },
        }),
        tx.weddingProfile.findUnique({
          where: { workspaceId: context.workspaceId },
        }),
      ]);
      const formVersion = form?.publishedVersionId
        ? await tx.rsvpFormVersion.findUnique({
            where: { id: form.publishedVersionId },
          })
        : null;
      const config = object(formVersion?.config);
      const rsvpConfig = {
        deadline: config.deadline ? String(config.deadline) : null,
        attendanceEnabled: config.attendanceEnabled !== false,
        perEventAttendance: config.perEventAttendance !== false,
        plusOneQuestion: config.plusOneQuestion !== false,
        childrenConfirmation: config.childrenConfirmation !== false,
        menuSelection: config.menuSelection !== false,
        allergyCollection: config.allergyCollection !== false,
        accessibilityCollection: config.accessibilityCollection !== false,
        transportQuestion: config.transportQuestion !== false,
        accommodationQuestion: config.accommodationQuestion !== false,
        guestMessage: config.guestMessage !== false,
        allowEdits: config.allowEdits !== false,
        closedMessage: String(config.closedMessage ?? "RSVP închis"),
        languages: Array.isArray(config.languages)
          ? config.languages.map(String)
          : ["ro"],
      };
      const submission = formVersion
        ? await tx.rsvpSubmission.findFirst({
            where: {
              invitationRecipientId: { in: identityRecipientIds },
              formVersionId: formVersion.id,
            },
            orderBy: { updatedAt: "desc" },
          })
        : null;
      const responses = submission
        ? await tx.guestEventResponse.findMany({
            where: { submissionId: submission.id },
          })
        : [];
      const [selections, allergyRows] = await Promise.all([
        tx.guestMenuSelection.findMany({
          where: {
            workspaceId: context.workspaceId,
            guestId: {
              in: rsvpConfig.menuSelection
                ? members.map((member) => member.id)
                : [],
            },
            active: true,
          },
        }),
        tx.guestAllergy.findMany({
          where: {
            workspaceId: context.workspaceId,
            guestId: {
              in: rsvpConfig.allergyCollection
                ? members.map((member) => member.id)
                : [],
            },
            active: true,
          },
          select: { guestId: true, label: true },
          orderBy: [{ guestId: "asc" }, { createdAt: "asc" }],
        }),
      ]);
      const allergiesByGuest = new Map<string, string[]>();
      for (const allergy of allergyRows)
        allergiesByGuest.set(allergy.guestId, [
          ...(allergiesByGuest.get(allergy.guestId) ?? []),
          allergy.label,
        ]);
      const operationsRows = await tx.$queryRaw<
        Array<{ data: Prisma.JsonValue }>
      >`SELECT public.weddingos_guest_operations_bootstrap() AS data`;
      const accommodationRecommendations =
        await tx.accommodationRecommendation.findMany({
          where: {
            workspaceId: context.workspaceId,
            weddingEventId: { in: events.map((event) => event.id) },
            status: "PUBLISHED",
            deletedAt: null,
          },
          orderBy: [
            { weddingEventId: "asc" },
            { position: "asc" },
            { createdAt: "asc" },
          ],
        });
      const deadline = config.deadline
        ? new Date(String(config.deadline))
        : null;
      const deadlineOpen = !deadline || deadline > new Date();
      const allowEdits =
        rsvpConfig.attendanceEnabled &&
        deadlineOpen &&
        (config.allowEdits !== false || !submission?.submittedAt);
      return {
        couple: {
          partnerOneName: wedding?.partnerOneName,
          partnerTwoName: wedding?.partnerTwoName,
          displayNames: [wedding?.partnerOneName, wedding?.partnerTwoName]
            .filter(Boolean)
            .join(" & "),
          weddingDate: wedding?.weddingDate?.toISOString().slice(0, 10) ?? null,
        },
        invitation: {
          siteId: site.id,
          document: resolvedInvitation.document,
          settings: resolvedInvitation.settings,
          language: version.language,
          baseVersionId: version.id,
          variant: variantVersion
            ? {
                id: variant!.id,
                name: variant!.name,
                code: variant!.code,
                versionId: variantVersion.id,
              }
            : null,
          experience: object(resolvedInvitation.settings).experience ?? null,
        },
        interaction: {
          invitationOpenedAt:
            canonicalRecipient.openedAt?.toISOString() ?? null,
          lastAccessedAt:
            canonicalRecipient.lastAccessedAt?.toISOString() ?? null,
          shouldPlayReveal: !canonicalRecipient.openedAt,
        },
        household: {
          id: household.id,
          name: household.name,
          members: members.map((member) => ({
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            displayName:
              member.displayName ??
              `${member.firstName} ${member.lastName}`.trim(),
            isChild: member.isChild,
            isPlusOne: member.isPlusOne,
            primaryGuestId: member.primaryGuestId,
            plusOneAllowed: member.plusOneAllowed,
            ...(rsvpConfig.transportQuestion
              ? { needsTransport: member.needsTransport }
              : {}),
            ...(rsvpConfig.accommodationQuestion
              ? { needsAccommodation: member.needsAccommodation }
              : {}),
            ...(rsvpConfig.allergyCollection
              ? { allergies: allergiesByGuest.get(member.id) ?? [] }
              : {}),
          })),
        },
        events: events.map(mapEvent),
        menus: rsvpConfig.menuSelection ? menus.map(mapMenuSummary) : [],
        operations: object(operationsRows[0]?.data),
        accommodationRecommendations: accommodationRecommendations.map(
          mapAccommodationRecommendation,
        ),
        rsvp: {
          submissionId: submission?.id ?? null,
          version: submission?.version ?? 1,
          status: submission?.status.toLowerCase() ?? "draft",
          message: rsvpConfig.guestMessage
            ? (submission?.guestMessage ?? null)
            : null,
          responses: responses.map((response) => ({
            guestId: response.guestId,
            eventId: response.weddingEventId,
            attendance: response.attendance.toLowerCase(),
          })),
          selections: rsvpConfig.menuSelection
            ? selections.map((selection) => ({
                guestId: selection.guestId,
                menuId: selection.menuId,
              }))
            : [],
        },
        rsvpConfig,
        deadline: deadline?.toISOString() ?? null,
        allowEdits,
        closedMessage: String(config.closedMessage ?? "RSVP închis"),
      };
    });
  }

  async recordLinkAccess(input: GuestLinkAccess) {
    return this.withGuest(input.token, async (tx, context) => {
      const recipient = await tx.invitationRecipient.findFirst({
        where: { id: context.recipientId, workspaceId: context.workspaceId },
      });
      if (!recipient) invalidToken();
      const identityRecipients = await this.identityRecipients(tx, recipient);
      const identityRecipientIds = identityRecipients.map((row) => row.id);
      const inserted = await tx.invitationRecipientInteraction.createMany({
        data: [
          {
            workspaceId: context.workspaceId,
            invitationRecipientId: recipient.id,
            guestAccessGrantId: context.grantId,
            type: "LINK_ACCESSED",
            source: input.source,
            idempotencyKey: input.idempotencyKey,
            metadata: {},
          },
        ],
        skipDuplicates: true,
      });
      const interaction =
        await tx.invitationRecipientInteraction.findUniqueOrThrow({
          where: {
            invitationRecipientId_type_idempotencyKey: {
              invitationRecipientId: recipient.id,
              type: "LINK_ACCESSED",
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
      await tx.invitationRecipient.updateMany({
        where: {
          id: { in: identityRecipientIds },
          OR: [
            { lastAccessedAt: null },
            { lastAccessedAt: { lt: interaction.occurredAt } },
          ],
        },
        data: {
          lastAccessedAt: interaction.occurredAt,
        },
      });
      await tx.guestAccessGrant.updateMany({
        where: {
          id: context.grantId,
          OR: [
            { lastUsedAt: null },
            { lastUsedAt: { lt: interaction.occurredAt } },
          ],
        },
        data: {
          lastUsedAt: interaction.occurredAt,
          version: { increment: 1 },
        },
      });
      return {
        recipientId: recipient.id,
        linkAccessedAt: interaction.occurredAt.toISOString(),
        duplicate: inserted.count === 0,
      };
    });
  }

  async recordInvitationOpen(input: GuestInvitationOpen) {
    return this.withGuest(input.token, async (tx, context) => {
      const recipient = await tx.invitationRecipient.findFirst({
        where: { id: context.recipientId, workspaceId: context.workspaceId },
      });
      if (!recipient) invalidToken();
      const identityRecipients = await this.identityRecipients(tx, recipient);
      const identityRecipientIds = identityRecipients.map((row) => row.id);
      const canonicalRecipient = identityRecipients[0] ?? recipient;
      const inserted = await tx.invitationRecipientInteraction.createMany({
        data: [
          {
            workspaceId: context.workspaceId,
            invitationRecipientId: recipient.id,
            guestAccessGrantId: context.grantId,
            type: "INVITATION_OPENED",
            source: input.source,
            idempotencyKey: input.idempotencyKey,
            metadata: {},
          },
        ],
        skipDuplicates: true,
      });
      const interaction =
        await tx.invitationRecipientInteraction.findUniqueOrThrow({
          where: {
            invitationRecipientId_type_idempotencyKey: {
              invitationRecipientId: recipient.id,
              type: "INVITATION_OPENED",
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
      const now = interaction.occurredAt;
      await tx.invitationRecipient.updateMany({
        where: {
          id: { in: identityRecipientIds },
          openedAt: null,
        },
        data: {
          openedAt: now,
        },
      });
      await tx.invitationRecipient.updateMany({
        where: {
          id: { in: identityRecipientIds },
          status: { in: ["READY", "QUEUED", "SENT"] },
        },
        data: {
          status: "OPENED",
        },
      });
      await tx.invitationRecipient.updateMany({
        where: {
          id: { in: identityRecipientIds },
          OR: [{ lastAccessedAt: null }, { lastAccessedAt: { lt: now } }],
        },
        data: { lastAccessedAt: now },
      });
      await tx.guestAccessGrant.updateMany({
        where: {
          id: context.grantId,
          OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: now } }],
        },
        data: { lastUsedAt: now, version: { increment: 1 } },
      });
      await this.asyncEvents.record(tx, {
        eventName: "invitation.opened.v1",
        aggregateType: "InvitationRecipient",
        aggregateId: recipient.id,
        workspaceId: context.workspaceId,
        deduplicationKey: `invitation-opened:${recipient.invitationSiteId}:${canonicalRecipient.householdId ?? canonicalRecipient.guestId}`,
        payload: {
          subject: { recipientId: recipient.id },
          invitationOpen: {
            recipientId: recipient.id,
            source: input.source,
          },
          activity: {
            category: "invitations",
            action: "invitation_opened",
            summary: "O familie a deschis invitația.",
            entityType: "InvitationRecipient",
            entityId: recipient.id,
          },
        },
      });
      const current = await tx.invitationRecipient.findUniqueOrThrow({
        where: { id: recipient.id },
      });
      return {
        recipientId: recipient.id,
        invitationOpenedAt: (current.openedAt ?? now).toISOString(),
        duplicate: inserted.count === 0,
      };
    });
  }

  async guestRsvp(token: string) {
    return this.bootstrap(token).then((data) => data.rsvp);
  }

  async submitGuestRsvp(input: GuestRsvpRequest, correlationId: string) {
    return this.withGuest(input.token, async (tx, context) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${`invitation-site-workspace:${context.workspaceId}`},
            0
          )
        )
      `;
      const recipient = await tx.invitationRecipient.findFirst({
        where: { id: context.recipientId, workspaceId: context.workspaceId },
      });
      const definition = await tx.rsvpFormDefinition.findUnique({
        where: { workspaceId: context.workspaceId },
      });
      if (!recipient || !definition?.publishedVersionId)
        validation("RSVP form is not available");
      const identityRecipients = await this.identityRecipients(tx, recipient);
      const identityRecipientIds = identityRecipients.map((row) => row.id);
      const canonicalRecipient = identityRecipients[0] ?? recipient;
      const formVersion = await tx.rsvpFormVersion.findUniqueOrThrow({
        where: { id: definition.publishedVersionId },
      });
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${`guest-rsvp:${context.workspaceId}:${context.householdId}:${formVersion.id}`},
            0
          )
        )
      `;
      const config = object(formVersion.config);
      if (config.attendanceEnabled === false)
        problem(
          "FEATURE_DISABLED",
          HttpStatus.LOCKED,
          "RSVP collection is disabled",
        );
      const deadline = config.deadline
        ? new Date(String(config.deadline))
        : null;
      if (deadline && deadline <= new Date())
        problem(
          "FEATURE_DISABLED",
          HttpStatus.LOCKED,
          "RSVP closed",
          String(config.closedMessage ?? "RSVP închis"),
        );
      let submission = await tx.rsvpSubmission.findFirst({
        where: {
          invitationRecipientId: { in: identityRecipientIds },
          formVersionId: formVersion.id,
        },
        orderBy: { updatedAt: "desc" },
      });
      if (submission?.idempotencyKey === input.idempotencyKey)
        return this.submissionResponse(tx, submission);
      if (config.allowEdits === false && submission?.submittedAt)
        problem(
          "FEATURE_DISABLED",
          HttpStatus.LOCKED,
          "RSVP edits are disabled",
        );
      const members = await tx.guest.findMany({
        where: { householdId: context.householdId, status: "ACTIVE" },
      });
      const requiredMembers = members.filter((member) => !member.isPlusOne);
      const memberIds = new Set(requiredMembers.map((member) => member.id));
      const requestedIds = new Set(
        input.members.map((member) => member.guestId),
      );
      if (
        input.members.length !== requiredMembers.length ||
        requestedIds.size !== requiredMembers.length ||
        [...requestedIds].some((id) => !memberIds.has(id))
      )
        validation("RSVP must include every active household member");
      const validEvents = await tx.weddingEvent.findMany({
        where: {
          workspaceId: context.workspaceId,
          guestVisible: true,
          rsvpEnabled: true,
          deletedAt: null,
          status: { not: "CANCELLED" },
        },
      });
      if (!validEvents.length) validation("RSVP has no active events");
      const validEventIds = new Set(validEvents.map((event) => event.id));
      for (const memberInput of input.members) {
        const submittedEventIds = new Set(
          memberInput.events.map((event) => event.eventId),
        );
        if (
          memberInput.events.length !== validEventIds.size ||
          submittedEventIds.size !== validEventIds.size ||
          [...submittedEventIds].some((id) => !validEventIds.has(id))
        )
          validation("RSVP must answer every active event for every member");
      }
      if (submission && submission.version !== input.version)
        conflict(submission.version);
      const wasSubmitted = Boolean(submission?.submittedAt);
      submission = submission
        ? await tx.rsvpSubmission.update({
            where: { id: submission.id },
            data: {
              status: "UPDATED",
              lastModifiedAt: new Date(),
              ...(config.guestMessage === false
                ? {}
                : { guestMessage: input.message }),
              idempotencyKey: input.idempotencyKey,
              version: { increment: 1 },
            },
          })
        : await tx.rsvpSubmission.create({
            data: {
              workspaceId: context.workspaceId,
              householdId: context.householdId,
              invitationRecipientId: canonicalRecipient.id,
              formVersionId: formVersion.id,
              status: "SUBMITTED",
              submittedAt: new Date(),
              lastModifiedAt: new Date(),
              ...(config.guestMessage === false
                ? {}
                : { guestMessage: input.message }),
              idempotencyKey: input.idempotencyKey,
              // Bootstrap exposes version 1 for the not-yet-created RSVP.
              // The first persisted submission advances that virtual version
              // so a second request based on the same empty state conflicts.
              version: 2,
            },
          });
      for (const memberInput of input.members) {
        const guest = members.find((item) => item.id === memberInput.guestId)!;
        await tx.guest.update({
          where: { id: guest.id },
          data: {
            ...(config.transportQuestion === false
              ? {}
              : {
                  needsTransport:
                    memberInput.needsTransport ?? guest.needsTransport,
                }),
            ...(config.accommodationQuestion === false
              ? {}
              : {
                  needsAccommodation:
                    memberInput.needsAccommodation ?? guest.needsAccommodation,
                }),
            ...(config.accessibilityCollection === false ||
            memberInput.accessibilityNotes === undefined
              ? {}
              : {
                  accessibilityNotesEncrypted: encryptSensitive(
                    memberInput.accessibilityNotes,
                    this.sensitiveKey,
                  ),
                }),
            version: { increment: 1 },
          },
        });
        for (const event of memberInput.events) {
          await tx.guestEventResponse.upsert({
            where: {
              submissionId_guestId_weddingEventId: {
                submissionId: submission.id,
                guestId: guest.id,
                weddingEventId: event.eventId,
              },
            },
            update: {
              attendance: event.attendance,
              respondedAt: new Date(),
              version: { increment: 1 },
            },
            create: {
              workspaceId: context.workspaceId,
              submissionId: submission.id,
              guestId: guest.id,
              weddingEventId: event.eventId,
              attendance: event.attendance,
            },
          });
        }
        const attends = memberInput.events.some(
          (event) => event.attendance === "CONFIRMED",
        );
        await tx.guestMenuSelection.updateMany({
          where: { guestId: guest.id, active: true },
          data: { active: false, version: { increment: 1 } },
        });
        if (config.menuSelection !== false && attends && memberInput.menuId) {
          await this.assertMenu(
            tx,
            context.workspaceId,
            memberInput.menuId,
            guest.isChild,
          );
          await tx.guestMenuSelection.create({
            data: {
              workspaceId: context.workspaceId,
              guestId: guest.id,
              menuId: memberInput.menuId,
              submissionId: submission.id,
            },
          });
        }
        if (config.allergyCollection === false) continue;
        const requestedAllergies = [
          ...new Set(
            (memberInput.allergies ?? [])
              .map((allergy) => allergy.trim())
              .filter(Boolean),
          ),
        ];
        const existingAllergies = await tx.guestAllergy.findMany({
          where: { workspaceId: context.workspaceId, guestId: guest.id },
          select: { id: true, label: true, active: true },
        });
        const requestedAllergySet = new Set(requestedAllergies);
        const removedAllergies = existingAllergies.filter(
          (allergy) =>
            allergy.active && !requestedAllergySet.has(allergy.label),
        );
        if (removedAllergies.length) {
          const removedAt = new Date();
          const removedIds = removedAllergies.map((allergy) => allergy.id);
          await tx.guestAllergy.updateMany({
            where: { id: { in: removedIds } },
            data: { active: false, deletedAt: removedAt },
          });
          await tx.allergyIssue.updateMany({
            where: { allergyId: { in: removedIds } },
            data: {
              status: "RESOLVED",
              resolvedAt: removedAt,
              version: { increment: 1 },
            },
          });
        }
        const existingAllergiesByLabel = new Map(
          existingAllergies.map((allergy) => [allergy.label, allergy]),
        );
        for (const allergy of requestedAllergies) {
          const reactivated =
            existingAllergiesByLabel.get(allergy)?.active === false;
          const allergyRow = await tx.guestAllergy.upsert({
            where: { guestId_label: { guestId: guest.id, label: allergy } },
            update: {
              active: true,
              deletedAt: null,
              detailsEncrypted: encryptSensitive(
                memberInput.allergyDetails,
                this.sensitiveKey,
              ),
              version: { increment: 1 },
            },
            create: {
              workspaceId: context.workspaceId,
              guestId: guest.id,
              label: allergy,
              detailsEncrypted: encryptSensitive(
                memberInput.allergyDetails,
                this.sensitiveKey,
              ),
            },
          });
          await tx.allergyIssue.upsert({
            where: { allergyId: allergyRow.id },
            update: reactivated
              ? {
                  status: "UNREVIEWED",
                  resolvedAt: null,
                  version: { increment: 1 },
                }
              : {},
            create: {
              workspaceId: context.workspaceId,
              guestId: guest.id,
              allergyId: allergyRow.id,
            },
          });
        }
      }
      if (config.plusOneQuestion !== false && input.plusOne) {
        const primary = members.find((member) => member.plusOneAllowed);
        if (!primary) validation("This household has no plus-one allowance");
        let plusOne = members.find(
          (member) => member.isPlusOne && member.primaryGuestId === primary.id,
        );
        if (input.plusOne.attending) {
          if (!input.plusOne.firstName)
            validation("Plus-one first name is required");
          plusOne = plusOne
            ? await tx.guest.update({
                where: { id: plusOne.id },
                data: {
                  firstName: input.plusOne.firstName,
                  lastName: input.plusOne.lastName ?? "",
                  status: "ACTIVE",
                  deletedAt: null,
                  version: { increment: 1 },
                },
              })
            : await tx.guest.create({
                data: {
                  workspaceId: context.workspaceId,
                  householdId: context.householdId,
                  firstName: input.plusOne.firstName,
                  lastName: input.plusOne.lastName ?? "",
                  isPlusOne: true,
                  primaryGuestId: primary.id,
                  preferredLanguage: primary.preferredLanguage,
                  side: primary.side,
                },
              });
          if (config.menuSelection !== false && input.plusOne.menuId) {
            await this.assertMenu(
              tx,
              context.workspaceId,
              input.plusOne.menuId,
              false,
            );
            await tx.guestMenuSelection.updateMany({
              where: { guestId: plusOne.id, active: true },
              data: { active: false, version: { increment: 1 } },
            });
            await tx.guestMenuSelection.create({
              data: {
                workspaceId: context.workspaceId,
                guestId: plusOne.id,
                menuId: input.plusOne.menuId,
                submissionId: submission.id,
              },
            });
          }
        } else if (plusOne) {
          await tx.guest.update({
            where: { id: plusOne.id },
            data: {
              status: "ARCHIVED",
              deletedAt: new Date(),
              version: { increment: 1 },
            },
          });
          await tx.invitationRecipient.updateMany({
            where: {
              workspaceId: context.workspaceId,
              guestId: plusOne.id,
              revokedAt: null,
            },
            data: { revokedAt: new Date(), version: { increment: 1 } },
          });
          await tx.guestMenuSelection.updateMany({
            where: { guestId: plusOne.id, active: true },
            data: { active: false, version: { increment: 1 } },
          });
        }
      }
      const allResponses = await tx.guestEventResponse.findMany({
        where: { submissionId: submission.id },
      });
      const responsePairs = new Set(
        allResponses
          .filter(
            (response) =>
              memberIds.has(response.guestId) &&
              validEventIds.has(response.weddingEventId),
          )
          .map((response) => `${response.guestId}:${response.weddingEventId}`),
      );
      const completed = requiredMembers.every((member) =>
        validEvents.every((event) =>
          responsePairs.has(`${member.id}:${event.id}`),
        ),
      );
      const completedAt = completed ? new Date() : null;
      await tx.invitationRecipient.updateMany({
        where: {
          id: { in: identityRecipientIds },
        },
        data: {
          status: completed ? "RESPONDED" : "PARTIALLY_RESPONDED",
          rsvpCompletedAt: completedAt,
        },
      });
      if (completed && completedAt)
        await tx.invitationRecipientInteraction.createMany({
          data: [
            {
              workspaceId: context.workspaceId,
              invitationRecipientId: recipient.id,
              guestAccessGrantId: context.grantId,
              type: "RSVP_COMPLETED",
              source: "rsvp_submit",
              idempotencyKey: input.idempotencyKey,
              metadata: { submissionId: submission.id },
              occurredAt: completedAt,
            },
          ],
          skipDuplicates: true,
        });
      const allDeclined = allResponses.every(
        (response) => response.attendance === "DECLINED",
      );
      const eventName = allDeclined
        ? "rsvp.declined.v1"
        : wasSubmitted
          ? "rsvp.updated.v1"
          : "rsvp.submitted.v1";
      await this.asyncEvents.record(tx, {
        eventName,
        aggregateType: "RsvpSubmission",
        aggregateId: submission.id,
        aggregateVersion: submission.version,
        workspaceId: context.workspaceId,
        correlationId,
        idempotencyKey: input.idempotencyKey,
        deduplicationKey: `${eventName}:${submission.id}:v${submission.version}`,
        payload: {
          subject: { submissionId: submission.id },
          rsvpProjection: { submissionId: submission.id },
          guestOperationsProjection: { submissionId: submission.id },
          activity: {
            category: "rsvp",
            action: allDeclined
              ? "rsvp_declined"
              : wasSubmitted
                ? "rsvp_updated"
                : "rsvp_submitted",
            summary: allDeclined
              ? "Un household a refuzat invitația."
              : wasSubmitted
                ? "Un răspuns RSVP a fost actualizat."
                : "A fost primit un răspuns RSVP nou.",
            entityType: "RsvpSubmission",
            entityId: submission.id,
          },
        },
      });
      return this.submissionResponse(tx, submission);
    });
  }

  async overrideSubmission(
    userId: string,
    workspaceId: string,
    submissionId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: {
      reason: string;
      members: GuestRsvpRequest["members"];
      message?: string;
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replayInput = { submissionId, expectedVersion, input };
        const prior = await replay(
          tx,
          userId,
          "rsvp.override",
          idempotencyKey,
          replayInput,
        );
        if (prior) return prior;
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`invitation-site-workspace:${workspaceId}`},
              0
            )
          )
        `;
        const submission = await tx.rsvpSubmission.findFirst({
          where: { id: submissionId, workspaceId },
        });
        if (!submission) notFound("RSVP submission not found");
        if (submission.version !== expectedVersion)
          conflict(submission.version);
        const definition = await tx.rsvpFormDefinition.findUnique({
          where: { workspaceId },
          select: { publishedVersionId: true },
        });
        if (definition?.publishedVersionId !== submission.formVersionId)
          validation(
            "Only responses to the currently published RSVP form can be corrected",
          );
        const members = await tx.guest.findMany({
          where: {
            workspaceId,
            householdId: submission.householdId,
            status: "ACTIVE",
            deletedAt: null,
          },
        });
        const events = await tx.weddingEvent.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            guestVisible: true,
            rsvpEnabled: true,
            status: { not: "CANCELLED" },
          },
          select: { id: true },
        });
        const memberIds = new Set(members.map((member) => member.id));
        const inputMemberIds = new Set(
          input.members.map((member) => member.guestId),
        );
        const eventIds = new Set(events.map((event) => event.id));
        if (
          inputMemberIds.size !== memberIds.size ||
          [...memberIds].some((memberId) => !inputMemberIds.has(memberId))
        )
          validation(
            "The correction must include every active household member",
          );
        for (const memberInput of input.members) {
          if (!memberIds.has(memberInput.guestId))
            validation("Guest does not belong to this RSVP household");
          const inputEventIds = new Set(
            memberInput.events.map((event) => event.eventId),
          );
          if (
            inputEventIds.size !== eventIds.size ||
            [...eventIds].some((eventId) => !inputEventIds.has(eventId))
          )
            validation(
              "The correction must answer every active RSVP event for every member",
            );
          for (const event of memberInput.events) {
            await tx.guestEventResponse.upsert({
              where: {
                submissionId_guestId_weddingEventId: {
                  submissionId,
                  guestId: memberInput.guestId,
                  weddingEventId: event.eventId,
                },
              },
              update: {
                attendance: event.attendance,
                respondedAt: new Date(),
                version: { increment: 1 },
              },
              create: {
                workspaceId,
                submissionId,
                guestId: memberInput.guestId,
                weddingEventId: event.eventId,
                attendance: event.attendance,
              },
            });
          }
        }
        const updated = await tx.rsvpSubmission.update({
          where: { id: submissionId },
          data: {
            status: "UPDATED",
            source: "ADMIN_OVERRIDE",
            adminOverrideReason: input.reason,
            guestMessage: input.message,
            lastModifiedAt: new Date(),
            version: { increment: 1 },
          },
        });
        const recipient = await tx.invitationRecipient.findFirst({
          where: {
            id: submission.invitationRecipientId,
            workspaceId,
            revokedAt: null,
          },
        });
        if (recipient) {
          const identityRecipients = await this.identityRecipients(
            tx,
            recipient,
          );
          await tx.invitationRecipient.updateMany({
            where: { id: { in: identityRecipients.map((item) => item.id) } },
            data: { status: "RESPONDED", rsvpCompletedAt: new Date() },
          });
        }
        const response = await this.submissionResponse(tx, updated);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "rsvp.override",
          idempotencyKey,
          replayInput,
          response,
        );
        return response;
      },
    );
  }

  async menus(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.menu.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      });
      return {
        items: await Promise.all(rows.map((row) => this.menuResource(tx, row))),
      };
    });
  }

  async createMenu(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateMenu,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const prior = await replay(
          tx,
          userId,
          "menu.create",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        const row = await tx.menu.create({
          data: {
            workspaceId,
            name: input.name,
            description: input.description,
            audience: input.audience,
            priceMinor: input.priceMinor,
            currency: input.currency,
            vendorNameSnapshot: input.vendorNameSnapshot,
            status: input.status,
            position: input.position,
          },
        });
        await this.replaceMenuChildren(
          tx,
          workspaceId,
          row.id,
          input.courses,
          input.dietaryTags,
        );
        await this.event(tx, {
          eventName: "menu.created.v1",
          aggregateId: row.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "menu_created",
          summary: `Meniul ${row.name} a fost creat.`,
        });
        const response = await this.menuResource(tx, row);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "menu.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async menu(userId: string, workspaceId: string, menuId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.menu.findFirst({
        where: { id: menuId, workspaceId, deletedAt: null },
      });
      if (!row) notFound("Menu not found");
      return this.menuResource(tx, row);
    });
  }

  async updateMenu(
    userId: string,
    workspaceId: string,
    menuId: string,
    expectedVersion: number,
    input: Partial<CreateMenu>,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const row = await tx.menu.findFirst({
          where: { id: menuId, workspaceId, deletedAt: null },
        });
        if (!row) notFound("Menu not found");
        if (row.version !== expectedVersion) conflict(row.version);
        const updated = await tx.menu.update({
          where: { id: menuId },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.description === undefined
              ? {}
              : { description: input.description }),
            ...(input.audience === undefined
              ? {}
              : { audience: input.audience }),
            ...(input.priceMinor === undefined
              ? {}
              : { priceMinor: input.priceMinor }),
            ...(input.currency === undefined
              ? {}
              : { currency: input.currency }),
            ...(input.vendorNameSnapshot === undefined
              ? {}
              : { vendorNameSnapshot: input.vendorNameSnapshot }),
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.position === undefined
              ? {}
              : { position: input.position }),
            version: { increment: 1 },
          },
        });
        if (input.courses || input.dietaryTags)
          await this.replaceMenuChildren(
            tx,
            workspaceId,
            menuId,
            input.courses ??
              (await tx.menuCourse.findMany({ where: { menuId } })).map(
                (item) => ({
                  courseType: item.courseType,
                  name: item.name,
                  description: item.description,
                  position: item.position,
                }),
              ),
            input.dietaryTags ??
              (await this.menuTags(tx, menuId)).map((tag) => tag.code),
          );
        await this.event(tx, {
          eventName: "menu.updated.v1",
          aggregateId: menuId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "menu_updated",
          summary: `Meniul ${updated.name} a fost actualizat.`,
        });
        return this.menuResource(tx, updated);
      },
    );
  }

  async deleteMenu(
    userId: string,
    workspaceId: string,
    menuId: string,
    expectedVersion: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.menu.findFirst({
        where: { id: menuId, workspaceId, deletedAt: null },
      });
      if (!row) notFound("Menu not found");
      if (row.version !== expectedVersion) conflict(row.version);
      const selections = await tx.guestMenuSelection.count({
        where: { menuId, active: true },
      });
      const updated = await tx.menu.update({
        where: { id: menuId },
        data: {
          status: "INACTIVE",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return {
        deleted: true,
        menuId,
        affectedSelections: selections,
        version: updated.version,
      };
    });
  }

  async selections(userId: string, workspaceId: string, cursor?: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.guestMenuSelection.findMany({
        where: { workspaceId, active: true },
        orderBy: [{ selectedAt: "desc" }, { id: "desc" }],
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const guests = new Map(
        (
          await tx.guest.findMany({
            where: { id: { in: rows.map((row) => row.guestId) } },
          })
        ).map((guest) => [guest.id, guest]),
      );
      const menus = new Map(
        (
          await tx.menu.findMany({
            where: { id: { in: rows.map((row) => row.menuId) } },
          })
        ).map((menu) => [menu.id, menu]),
      );
      return {
        items: rows.slice(0, 100).map((row) => ({
          id: row.id,
          guestId: row.guestId,
          guestName: guests.has(row.guestId)
            ? `${guests.get(row.guestId)!.firstName} ${guests.get(row.guestId)!.lastName}`.trim()
            : "Invitat",
          menuId: row.menuId,
          menuName: menus.get(row.menuId)?.name,
          selectedAt: row.selectedAt.toISOString(),
          source: row.source.toLowerCase(),
          version: row.version,
        })),
        nextCursor: rows.length > 100 ? rows[99]!.id : null,
      };
    });
  }

  async setOrganizerMenuSelection(
    userId: string,
    workspaceId: string,
    guestId: string,
    input: { menuId: string | null; selectionVersion?: number | null },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`guest-menu-selection:${workspaceId}:${guestId}`},
              0
            )
          )
        `;
        const guest = await tx.guest.findFirst({
          where: {
            id: guestId,
            workspaceId,
            status: "ACTIVE",
            deletedAt: null,
          },
        });
        if (!guest) notFound("Invitatul nu există.");
        const current = await tx.guestMenuSelection.findFirst({
          where: { workspaceId, guestId, active: true },
          orderBy: [{ selectedAt: "desc" }, { id: "desc" }],
        });
        const expectedVersion = input.selectionVersion ?? null;
        if (current && current.version !== expectedVersion)
          conflict(current.version);
        if (!current && expectedVersion !== null) conflict(0);
        if (current?.menuId === input.menuId) {
          const menu = await tx.menu.findFirst({
            where: { id: current.menuId, workspaceId },
          });
          return {
            id: current.id,
            guestId,
            menuId: current.menuId,
            menuName: menu?.name ?? null,
            selectedAt: current.selectedAt.toISOString(),
            source: current.source.toLowerCase(),
            version: current.version,
          };
        }
        if (input.menuId)
          await this.assertMenu(tx, workspaceId, input.menuId, guest.isChild);
        if (current)
          await tx.guestMenuSelection.updateMany({
            where: { workspaceId, guestId, active: true },
            data: { active: false, version: { increment: 1 } },
          });
        const selection = input.menuId
          ? await tx.guestMenuSelection.create({
              data: {
                workspaceId,
                guestId,
                menuId: input.menuId,
                source: "ORGANIZER",
              },
            })
          : null;
        const menu = selection
          ? await tx.menu.findFirst({
              where: { id: selection.menuId, workspaceId },
            })
          : null;
        return selection
          ? {
              id: selection.id,
              guestId,
              menuId: selection.menuId,
              menuName: menu?.name ?? null,
              selectedAt: selection.selectedAt.toISOString(),
              source: selection.source.toLowerCase(),
              version: selection.version,
            }
          : { guestId, menuId: null, menuName: null, version: null };
      },
    );
  }

  async allergyIssues(
    userId: string,
    workspaceId: string,
    includeDetails: boolean,
    cursor?: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.allergyIssue.findMany({
        where: { workspaceId },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const allergies = new Map(
        (
          await tx.guestAllergy.findMany({
            where: { id: { in: rows.map((row) => row.allergyId) } },
          })
        ).map((row) => [row.id, row]),
      );
      const guests = new Map(
        (
          await tx.guest.findMany({
            where: { id: { in: rows.map((row) => row.guestId) } },
          })
        ).map((row) => [row.id, row]),
      );
      return {
        items: rows.slice(0, 100).map((row) => {
          const allergy = allergies.get(row.allergyId);
          const guest = guests.get(row.guestId);
          return {
            id: row.id,
            guestId: row.guestId,
            guestName: guest
              ? `${guest.firstName} ${guest.lastName}`.trim()
              : "Invitat",
            allergy: allergy?.label ?? "Alergie raportată",
            severity: allergy?.severity.toLowerCase() ?? "unknown",
            details: includeDetails
              ? decryptSensitive(allergy?.detailsEncrypted, this.sensitiveKey)
              : null,
            status: row.status.toLowerCase(),
            assignedToMembershipId: row.assignedToMembershipId,
            resolvedAt: row.resolvedAt?.toISOString() ?? null,
            version: row.version,
          };
        }),
        nextCursor: rows.length > 100 ? rows[99]!.id : null,
      };
    });
  }

  async resolveAllergyIssue(
    userId: string,
    workspaceId: string,
    issueId: string,
    expectedVersion: number,
    input: {
      status:
        "UNREVIEWED" | "REVIEWING" | "CONFIRMED_WITH_CATERER" | "RESOLVED";
      assignedToMembershipId?: string | null;
      resolutionNote?: string | null;
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const row = await tx.allergyIssue.findFirst({
          where: { id: issueId, workspaceId },
        });
        if (!row) notFound("Allergy issue not found");
        if (row.version !== expectedVersion) conflict(row.version);
        if (input.assignedToMembershipId) {
          const member = await tx.workspaceMembership.findFirst({
            where: {
              id: input.assignedToMembershipId,
              workspaceId,
              status: "ACTIVE",
            },
          });
          if (!member) validation("Assignee is not an active workspace member");
        }
        const updated = await tx.allergyIssue.update({
          where: { id: issueId },
          data: {
            status: input.status,
            assignedToMembershipId: input.assignedToMembershipId,
            resolutionNoteEncrypted: encryptSensitive(
              input.resolutionNote,
              this.sensitiveKey,
            ),
            resolvedAt: input.status === "RESOLVED" ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (updated.status === "RESOLVED")
          await this.event(tx, {
            eventName: "allergy.issue_resolved.v1",
            aggregateId: issueId,
            aggregateVersion: updated.version,
            workspaceId,
            actorUserId: userId,
            correlationId,
            action: "allergy_issue_resolved",
            summary: "O situație de alergie a fost rezolvată.",
          });
        return {
          id: updated.id,
          status: updated.status.toLowerCase(),
          assignedToMembershipId: updated.assignedToMembershipId,
          resolvedAt: updated.resolvedAt?.toISOString() ?? null,
          version: updated.version,
        };
      },
    );
  }

  async cateringExport(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    includeAllergies: boolean,
    format: "csv" | "xlsx",
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const input = { includeAllergies, format };
        const prior = await replay(
          tx,
          userId,
          "menu.export",
          idempotencyKey,
          input,
        );
        if (prior) return prior;
        const aggregateId = randomUUID();
        const jobId = await this.asyncEvents.record(tx, {
          eventName: "menu.export_requested.v1",
          aggregateType: "CateringExport",
          aggregateId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `menu-export:${workspaceId}:${userId}:${idempotencyKey}`,
          userVisibleJob: true,
          payload: {
            subject: { exportId: aggregateId },
            menuExport: { requestedByUserId: userId, format, includeAllergies },
          },
        });
        if (!jobId) throw new Error("Catering export job missing");
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        const response = { job: mapJob(job) };
        await saveReplay(
          tx,
          userId,
          workspaceId,
          "menu.export",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  private async withGuest<T>(
    token: string,
    operation: (tx: Transaction, context: GuestContext) => Promise<T>,
  ): Promise<T> {
    const tokenHash = hashToken(token);
    return this.database.withContext(
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
          invalidToken();
        const context: GuestContext = {
          grantId: grant.id,
          workspaceId: grant.workspaceId,
          householdId: grant.householdId,
          recipientId: grant.invitationRecipientId,
          tokenHash,
        };
        await this.database.setTransactionContext(tx, {
          workspaceId: context.workspaceId,
          guestTokenHash: tokenHash,
          guestAccessGrantId: context.grantId,
        });
        const activeRecipient = await tx.invitationRecipient.findFirst({
          where: {
            id: context.recipientId,
            workspaceId: context.workspaceId,
            revokedAt: null,
          },
          select: { id: true },
        });
        if (!activeRecipient) invalidToken();
        return operation(tx, context);
      },
    );
  }

  private async identityRecipients(
    tx: Transaction,
    recipient: {
      id: string;
      workspaceId: string;
      invitationSiteId: string;
      invitationVariantId: string | null;
      householdId: string | null;
      guestId: string | null;
      openedAt: Date | null;
      lastAccessedAt: Date | null;
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
    if (!rows.length) return [recipient];
    if (!householdId) return rows;
    return rows.sort((left, right) => {
      const leftIsHousehold = left.householdId === householdId ? 0 : 1;
      const rightIsHousehold = right.householdId === householdId ? 0 : 1;
      return leftIsHousehold - rightIsHousehold;
    });
  }

  private async formInTransaction(tx: Transaction, workspaceId: string) {
    const definition = await tx.rsvpFormDefinition.findUnique({
      where: { workspaceId },
    });
    if (!definition) return null;
    const [draft, published] = await Promise.all([
      definition.currentDraftId
        ? tx.rsvpFormVersion.findUnique({
            where: { id: definition.currentDraftId },
          })
        : null,
      definition.publishedVersionId
        ? tx.rsvpFormVersion.findUnique({
            where: { id: definition.publishedVersionId },
          })
        : null,
    ]);
    return {
      id: definition.id,
      workspaceId,
      status: definition.status.toLowerCase(),
      draft: draft ? mapFormVersion(draft) : null,
      published: published ? mapFormVersion(published) : null,
      version: definition.version,
    };
  }

  private async submissionResponse(
    tx: Transaction,
    submission: {
      id: string;
      status: string;
      source: string;
      guestMessage: string | null;
      submittedAt: Date | null;
      lastModifiedAt: Date | null;
      version: number;
    },
  ) {
    const [responses, selections] = await Promise.all([
      tx.guestEventResponse.findMany({
        where: { submissionId: submission.id },
      }),
      tx.guestMenuSelection.findMany({
        where: { submissionId: submission.id, active: true },
      }),
    ]);
    return {
      id: submission.id,
      status: submission.status.toLowerCase(),
      source: submission.source.toLowerCase(),
      message: submission.guestMessage,
      submittedAt: submission.submittedAt?.toISOString() ?? null,
      lastModifiedAt: submission.lastModifiedAt?.toISOString() ?? null,
      responses: responses.map((response) => ({
        guestId: response.guestId,
        eventId: response.weddingEventId,
        attendance: response.attendance.toLowerCase(),
      })),
      selections: selections.map((selection) => ({
        guestId: selection.guestId,
        menuId: selection.menuId,
      })),
      version: submission.version,
    };
  }

  private async assertMenu(
    tx: Transaction,
    workspaceId: string,
    menuId: string,
    child: boolean,
  ) {
    const menu = await tx.menu.findFirst({
      where: { id: menuId, workspaceId, status: "ACTIVE", deletedAt: null },
    });
    if (
      !menu ||
      (child
        ? !["CHILD", "ALL"].includes(menu.audience)
        : !["ADULT", "ALL"].includes(menu.audience))
    )
      validation("Selected menu is not available for this guest");
  }
  private async replaceMenuChildren(
    tx: Transaction,
    workspaceId: string,
    menuId: string,
    courses: Array<{
      courseType: string;
      name: string;
      description?: string | null;
      position: number;
    }>,
    tagCodes: string[],
  ) {
    await tx.menuCourse.deleteMany({ where: { menuId } });
    if (courses.length)
      await tx.menuCourse.createMany({
        data: courses.map((course) => ({
          workspaceId,
          menuId,
          courseType: course.courseType,
          name: course.name,
          description: course.description,
          position: course.position,
        })),
      });
    await tx.menuDietaryTag.deleteMany({ where: { menuId } });
    for (const code of [
      ...new Set(tagCodes.map((item) => item.trim().toUpperCase())),
    ]) {
      const tag = await tx.dietaryTag.upsert({
        where: { workspaceId_code: { workspaceId, code } },
        update: {},
        create: { workspaceId, code, label: code.replaceAll("_", " ") },
      });
      await tx.menuDietaryTag.create({
        data: { workspaceId, menuId, dietaryTagId: tag.id },
      });
    }
  }
  private async menuTags(tx: Transaction, menuId: string) {
    const links = await tx.menuDietaryTag.findMany({ where: { menuId } });
    return tx.dietaryTag.findMany({
      where: { id: { in: links.map((link) => link.dietaryTagId) } },
    });
  }
  private async menuResource(
    tx: Transaction,
    row: {
      id: string;
      workspaceId: string;
      name: string;
      description: string | null;
      audience: string;
      priceMinor: number | null;
      currency: string | null;
      vendorNameSnapshot: string | null;
      status: string;
      position: number;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    },
  ) {
    const [courses, tags, selections] = await Promise.all([
      tx.menuCourse.findMany({
        where: { menuId: row.id },
        orderBy: { position: "asc" },
      }),
      this.menuTags(tx, row.id),
      tx.guestMenuSelection.count({ where: { menuId: row.id, active: true } }),
    ]);
    return {
      ...mapMenuSummary(row),
      courses: courses.map((course) => ({
        id: course.id,
        courseType: course.courseType,
        name: course.name,
        description: course.description,
        position: course.position,
      })),
      dietaryTags: tags.map((tag) => ({
        id: tag.id,
        code: tag.code,
        label: tag.label,
      })),
      selections,
      vendorNameSnapshot: row.vendorNameSnapshot,
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
      workspaceId: string;
      actorUserId: string;
      correlationId: string;
      action: string;
      summary: string;
    },
  ) {
    await this.asyncEvents.record(tx, {
      eventName: input.eventName,
      aggregateType: input.eventName.startsWith("menu")
        ? "Menu"
        : input.eventName.startsWith("allergy")
          ? "AllergyIssue"
          : "RsvpForm",
      aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      deduplicationKey: `${input.eventName}:${input.aggregateId}:v${input.aggregateVersion ?? 1}`,
      payload: {
        subject: { entityId: input.aggregateId },
        activity: {
          category:
            input.eventName.startsWith("menu") ||
            input.eventName.startsWith("allergy")
              ? "menus"
              : "rsvp",
          action: input.action,
          summary: input.summary,
          entityId: input.aggregateId,
        },
      },
    });
  }
}

function mapAccommodationRecommendation(row: {
  id: string;
  workspaceId: string;
  weddingEventId: string;
  source: string;
  externalId: string | null;
  sourceUrl: string | null;
  sourceUpdatedAt: Date | null;
  fetchedAt: Date;
  attribution: string | null;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  distanceKm: Prisma.Decimal | null;
  bookingUrl: string | null;
  contactUrl: string | null;
  contactPhone: string | null;
  facilities: Prisma.JsonValue;
  priceSnapshot: Prisma.JsonValue | null;
  organizerNote: string | null;
  groupCode: string | null;
  deadline: Date | null;
  status: string;
  position: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return guestAccommodationRecommendationSchema.parse({
    id: row.id,
    weddingEventId: row.weddingEventId,
    source: row.source.toLowerCase(),
    provenance: {
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
      fetchedAt: row.fetchedAt.toISOString(),
      attribution: row.attribution,
    },
    name: row.name,
    type: row.type.toLowerCase(),
    address: row.address,
    city: row.city,
    country: row.country,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    distanceKm: row.distanceKm == null ? null : Number(row.distanceKm),
    bookingUrl: row.bookingUrl,
    contactUrl: row.contactUrl,
    contactPhone: row.contactPhone,
    facilities: row.facilities,
    priceSnapshot: row.priceSnapshot,
    organizerNote: row.organizerNote,
    groupCode: row.groupCode,
    deadline: row.deadline?.toISOString() ?? null,
    position: row.position,
  });
}

function mapFormVersion(row: {
  id: string;
  versionNumber: number;
  config: unknown;
  contentHash: string;
  immutable: boolean;
  publishedAt: Date | null;
}) {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    config: rsvpFormConfigSchema.parse(row.config),
    contentHash: row.contentHash,
    immutable: row.immutable,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function dashboardStatus(
  responses: Array<"confirmed" | "declined" | "unsure" | null>,
): RsvpDashboardStatus {
  if (!responses.length || responses.every((response) => response === null))
    return "no_response";
  if (responses.some((response) => response === null)) return "incomplete";
  const distinct = new Set(responses);
  if (distinct.size > 1) return "mixed";
  return responses[0] ?? "no_response";
}

function householdDashboardStatus(
  statuses: RsvpDashboardStatus[],
): RsvpDashboardStatus {
  if (!statuses.length || statuses.every((status) => status === "no_response"))
    return "no_response";
  if (statuses.some((status) => ["no_response", "incomplete"].includes(status)))
    return "incomplete";
  const distinct = new Set(statuses);
  if (distinct.size > 1 || distinct.has("mixed")) return "mixed";
  return statuses[0] ?? "no_response";
}

function countStatus(
  statuses: RsvpDashboardStatus[],
  status: RsvpDashboardStatus,
) {
  return statuses.filter((item) => item === status).length;
}

function mapEvent(row: {
  id: string;
  type: string;
  title: string;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
  timezone: string;
  locationName: string | null;
  locationAddress: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  dressCode: string | null;
  rsvpEnabled: boolean;
}) {
  const query =
    row.latitude && row.longitude
      ? `${row.latitude.toString()},${row.longitude.toString()}`
      : (row.locationAddress ?? row.locationName);
  return {
    id: row.id,
    type: row.type.toLowerCase(),
    title: row.title,
    description: row.description,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    timezone: row.timezone,
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    dressCode: row.dressCode,
    rsvpEnabled: row.rsvpEnabled,
    directions: query
      ? {
          googleMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
          waze: `https://www.waze.com/ul?q=${encodeURIComponent(query)}`,
          appleMaps: `https://maps.apple.com/?q=${encodeURIComponent(query)}`,
        }
      : null,
  };
}
function mapMenuSummary(row: {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  audience: string;
  priceMinor: number | null;
  currency: string | null;
  status: string;
  position: number;
  version?: number;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    audience: row.audience.toLowerCase(),
    priceMinor: row.priceMinor,
    currency: row.currency,
    status: row.status.toLowerCase(),
    position: row.position,
    version: row.version,
  };
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
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function invalidToken(): never {
  problem(
    "TOKEN_INVALID",
    HttpStatus.UNAUTHORIZED,
    "Guest access token is invalid or expired",
  );
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

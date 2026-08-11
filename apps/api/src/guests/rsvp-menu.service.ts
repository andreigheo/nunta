import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { CreateMenu, GuestRsvpRequest } from "@weddingos/contracts";
import { guestAccommodationRecommendationSchema } from "@weddingos/contracts";
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
        where: { id: context.recipientId, householdId: context.householdId },
      });
      if (!recipient) invalidToken();
      const version = await tx.invitationVersion.findUnique({
        where: { id: recipient.invitationVersionId },
      });
      const site = await tx.invitationSite.findFirst({
        where: {
          workspaceId: context.workspaceId,
          publishedVersionId: recipient.invitationVersionId,
          status: "PUBLISHED",
        },
      });
      if (!version || !site) invalidToken();
      const household = await tx.household.findUnique({
        where: { id: context.householdId },
      });
      if (!household) invalidToken();
      const [members, events, form, menus, wedding, submission] =
        await Promise.all([
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
          tx.rsvpSubmission.findFirst({
            where: { invitationRecipientId: context.recipientId },
            orderBy: { updatedAt: "desc" },
          }),
        ]);
      const formVersion = form?.publishedVersionId
        ? await tx.rsvpFormVersion.findUnique({
            where: { id: form.publishedVersionId },
          })
        : null;
      const responses = submission
        ? await tx.guestEventResponse.findMany({
            where: { submissionId: submission.id },
          })
        : [];
      const selections = await tx.guestMenuSelection.findMany({
        where: {
          workspaceId: context.workspaceId,
          guestId: { in: members.map((member) => member.id) },
          active: true,
        },
      });
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
      await tx.guestAccessGrant.update({
        where: { id: context.grantId },
        data: { lastUsedAt: new Date(), version: { increment: 1 } },
      });
      if (!recipient.openedAt) {
        await tx.invitationRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "OPENED",
            openedAt: new Date(),
            lastAccessedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "invitation.opened.v1",
          aggregateType: "InvitationRecipient",
          aggregateId: recipient.id,
          workspaceId: context.workspaceId,
          deduplicationKey: `invitation-opened:${recipient.id}`,
          payload: {
            subject: { recipientId: recipient.id },
            invitationOpen: { recipientId: recipient.id },
            activity: {
              category: "invitations",
              action: "invitation_opened",
              summary: "O familie a deschis invitația.",
              entityType: "InvitationRecipient",
              entityId: recipient.id,
            },
          },
        });
      } else {
        await tx.invitationRecipient.update({
          where: { id: recipient.id },
          data: {
            lastAccessedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      const config = object(formVersion?.config);
      const deadline = config.deadline
        ? new Date(String(config.deadline))
        : null;
      const allowEdits =
        Boolean(config.allowEdits ?? true) &&
        (!deadline || deadline > new Date());
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
          document: version.document,
          settings: version.settings,
          language: version.language,
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
          })),
        },
        events: events.map(mapEvent),
        menus: menus.map(mapMenuSummary),
        operations: object(operationsRows[0]?.data),
        accommodationRecommendations: accommodationRecommendations.map(
          mapAccommodationRecommendation,
        ),
        rsvp: {
          submissionId: submission?.id ?? null,
          version: submission?.version ?? 1,
          status: submission?.status.toLowerCase() ?? "draft",
          message: submission?.guestMessage ?? null,
          responses: responses.map((response) => ({
            guestId: response.guestId,
            eventId: response.weddingEventId,
            attendance: response.attendance.toLowerCase(),
          })),
          selections: selections.map((selection) => ({
            guestId: selection.guestId,
            menuId: selection.menuId,
          })),
        },
        deadline: deadline?.toISOString() ?? null,
        allowEdits,
        closedMessage: String(config.closedMessage ?? "RSVP închis"),
      };
    });
  }

  async guestRsvp(token: string) {
    return this.bootstrap(token).then((data) => data.rsvp);
  }

  async submitGuestRsvp(input: GuestRsvpRequest, correlationId: string) {
    return this.withGuest(input.token, async (tx, context) => {
      const recipient = await tx.invitationRecipient.findFirst({
        where: { id: context.recipientId, householdId: context.householdId },
      });
      const definition = await tx.rsvpFormDefinition.findUnique({
        where: { workspaceId: context.workspaceId },
      });
      if (!recipient || !definition?.publishedVersionId)
        validation("RSVP form is not available");
      const formVersion = await tx.rsvpFormVersion.findUniqueOrThrow({
        where: { id: definition.publishedVersionId },
      });
      const config = object(formVersion.config);
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
      if (config.allowEdits === false) {
        const existing = await tx.rsvpSubmission.findFirst({
          where: { invitationRecipientId: recipient.id },
        });
        if (existing?.submittedAt)
          problem(
            "FEATURE_DISABLED",
            HttpStatus.LOCKED,
            "RSVP edits are disabled",
          );
      }
      const members = await tx.guest.findMany({
        where: { householdId: context.householdId, status: "ACTIVE" },
      });
      const memberIds = new Set(members.map((member) => member.id));
      const requestedIds = new Set(
        input.members.map((member) => member.guestId),
      );
      if ([...requestedIds].some((id) => !memberIds.has(id))) invalidToken();
      const eventIds = [
        ...new Set(
          input.members.flatMap((member) =>
            member.events.map((event) => event.eventId),
          ),
        ),
      ];
      const validEvents = await tx.weddingEvent.findMany({
        where: {
          id: { in: eventIds },
          workspaceId: context.workspaceId,
          guestVisible: true,
          rsvpEnabled: true,
          deletedAt: null,
          status: { not: "CANCELLED" },
        },
      });
      if (validEvents.length !== eventIds.length)
        validation("One or more RSVP events are invalid");
      let submission = await tx.rsvpSubmission.findFirst({
        where: {
          invitationRecipientId: recipient.id,
          formVersionId: formVersion.id,
        },
      });
      if (submission?.idempotencyKey === input.idempotencyKey)
        return this.submissionResponse(tx, submission);
      if (submission && submission.version !== input.version)
        conflict(submission.version);
      const wasSubmitted = Boolean(submission?.submittedAt);
      submission = submission
        ? await tx.rsvpSubmission.update({
            where: { id: submission.id },
            data: {
              status: "UPDATED",
              lastModifiedAt: new Date(),
              guestMessage: input.message,
              idempotencyKey: input.idempotencyKey,
              version: { increment: 1 },
            },
          })
        : await tx.rsvpSubmission.create({
            data: {
              workspaceId: context.workspaceId,
              householdId: context.householdId,
              invitationRecipientId: recipient.id,
              formVersionId: formVersion.id,
              status: "SUBMITTED",
              submittedAt: new Date(),
              lastModifiedAt: new Date(),
              guestMessage: input.message,
              idempotencyKey: input.idempotencyKey,
            },
          });
      for (const memberInput of input.members) {
        const guest = members.find((item) => item.id === memberInput.guestId)!;
        await tx.guest.update({
          where: { id: guest.id },
          data: {
            needsTransport: memberInput.needsTransport ?? guest.needsTransport,
            needsAccommodation:
              memberInput.needsAccommodation ?? guest.needsAccommodation,
            ...(memberInput.accessibilityNotes === undefined
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
        if (attends && memberInput.menuId) {
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
        for (const allergy of memberInput.allergies ?? []) {
          const allergyRow = await tx.guestAllergy.upsert({
            where: { guestId_label: { guestId: guest.id, label: allergy } },
            update: {
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
            update: {},
            create: {
              workspaceId: context.workspaceId,
              guestId: guest.id,
              allergyId: allergyRow.id,
            },
          });
        }
      }
      if (input.plusOne) {
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
          if (input.plusOne.menuId) {
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
          await tx.guestMenuSelection.updateMany({
            where: { guestId: plusOne.id, active: true },
            data: { active: false, version: { increment: 1 } },
          });
        }
      }
      const allResponses = await tx.guestEventResponse.findMany({
        where: { submissionId: submission.id },
      });
      const visibleMemberCount = members.filter(
        (member) => !member.isPlusOne,
      ).length;
      const completed =
        allResponses.length >= visibleMemberCount * validEvents.length;
      await tx.invitationRecipient.update({
        where: { id: recipient.id },
        data: {
          status: completed ? "RESPONDED" : "PARTIALLY_RESPONDED",
          rsvpCompletedAt: completed ? new Date() : null,
          version: { increment: 1 },
        },
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
        const submission = await tx.rsvpSubmission.findFirst({
          where: { id: submissionId, workspaceId },
        });
        if (!submission) notFound("RSVP submission not found");
        if (submission.version !== expectedVersion)
          conflict(submission.version);
        const members = await tx.guest.findMany({
          where: { householdId: submission.householdId },
        });
        for (const memberInput of input.members) {
          if (!members.some((member) => member.id === memberInput.guestId))
            validation("Guest does not belong to this RSVP household");
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
        return operation(tx, context);
      },
    );
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
    config: row.config,
    contentHash: row.contentHash,
    immutable: row.immutable,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
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

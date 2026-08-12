import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  CreateGuest,
  CreateGuestTag,
  CreateHousehold,
  UpdateGuest,
  UpdateGuestTag,
  UpdateHousehold,
} from "@weddingos/contracts";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import ExcelJS from "exceljs";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";
import { WorkspaceEntitlementService } from "../workspace-billing/workspace-entitlement.service";
import { encryptSensitive, stableHash } from "./sensitive.crypto";

type Transaction = Prisma.TransactionClient;
type Capabilities = readonly string[];

@Injectable()
export class GuestCrmService {
  private readonly sensitiveKey: { keyId: string; secret: string };
  private readonly importRoot: string;
  private readonly importMaxRows: number;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(WorkspaceEntitlementService)
    private readonly entitlements: WorkspaceEntitlementService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.sensitiveKey = {
      keyId: environment.OUTBOX_ENCRYPTION_KEY_ID,
      secret: environment.OUTBOX_ENCRYPTION_KEY,
    };
    this.importRoot = resolve(
      environment.ARTIFACT_ROOT,
      "..",
      "..",
      "imports",
      "guest-imports",
    );
    this.importMaxRows = environment.ARTIFACT_MAX_ROWS;
  }

  async households(
    userId: string,
    workspaceId: string,
    query: Record<string, string | undefined>,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const take = 50;
      const rows = await tx.household.findMany({
        where: {
          workspaceId,
          ...(query.archived === "true" ? {} : { deletedAt: null }),
          ...(query.search
            ? { name: { contains: query.search, mode: "insensitive" } }
            : {}),
          ...(query.side ? { side: side(query.side) } : {}),
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const items = await Promise.all(
        rows.slice(0, take).map(async (row) => ({
          ...mapHousehold(row),
          invitationStatus: await this.householdInvitationStatus(tx, row.id),
          guestsCount: await tx.guest.count({
            where: { householdId: row.id, status: "ACTIVE" },
          }),
        })),
      );
      return {
        items,
        nextCursor: rows.length > take ? rows[take - 1]!.id : null,
        summary: await this.summary(tx, workspaceId),
      };
    });
  }

  async createHousehold(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateHousehold,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "guest.household.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        const row = await tx.household.create({
          data: {
            workspaceId,
            name: input.name,
            preferredLanguage: input.preferredLanguage,
            city: input.city,
            country: input.country,
            address: input.address,
            category: input.category,
            side: input.side,
            notesPrivateEncrypted: encryptSensitive(
              input.notesPrivate,
              this.sensitiveKey,
            ),
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "guest.household_created.v1",
          aggregateType: "Household",
          aggregateId: row.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `household-created:${row.id}`,
          payload: {
            subject: { householdId: row.id },
            activity: {
              category: "guests",
              action: "household_created",
              summary: `A fost creat grupul ${row.name}.`,
              entityType: "Household",
              entityId: row.id,
            },
          },
        });
        const response = {
          ...mapHousehold(row),
          invitationStatus: "NOT_PREPARED" as const,
          guestsCount: 0,
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "guest.household.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async household(userId: string, workspaceId: string, householdId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.household.findFirst({
        where: { id: householdId, workspaceId },
      });
      if (!row) notFound("Household not found");
      const guests = await tx.guest.findMany({
        where: { workspaceId, householdId, status: { not: "REMOVED" } },
        orderBy: [
          { isChild: "asc" },
          { lastName: "asc" },
          { firstName: "asc" },
        ],
      });
      return {
        ...mapHousehold(row),
        invitationStatus: await this.householdInvitationStatus(tx, row.id),
        guestsCount: guests.filter((guest) => guest.status === "ACTIVE").length,
        guests: guests.map((guest) => mapGuest(guest, row.name, true)),
      };
    });
  }

  async updateHousehold(
    userId: string,
    workspaceId: string,
    householdId: string,
    version: number,
    input: UpdateHousehold,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await tx.household.findFirst({
          where: { id: householdId, workspaceId },
        });
        if (!current) notFound("Household not found");
        assertVersion(current.version, version);
        if (input.primaryGuestId) {
          const primary = await tx.guest.findFirst({
            where: { id: input.primaryGuestId, workspaceId, householdId },
          });
          if (!primary)
            validation("Primary guest must belong to this household");
        }
        const row = await tx.household.update({
          where: { id: householdId },
          data: {
            ...defined(input, [
              "name",
              "primaryGuestId",
              "preferredLanguage",
              "city",
              "country",
              "address",
              "category",
              "side",
            ]),
            ...(input.notesPrivate === undefined
              ? {}
              : {
                  notesPrivateEncrypted: encryptSensitive(
                    input.notesPrivate,
                    this.sensitiveKey,
                  ),
                }),
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          eventName: "guest.household_updated.v1",
          aggregateType: "Household",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "household_updated",
          summary: `Grupul ${row.name} a fost actualizat.`,
        });
        return {
          ...mapHousehold(row),
          invitationStatus: await this.householdInvitationStatus(tx, row.id),
          guestsCount: await tx.guest.count({
            where: { householdId: row.id, status: "ACTIVE" },
          }),
        };
      },
    );
  }

  async archiveHousehold(
    userId: string,
    workspaceId: string,
    householdId: string,
    version: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const row = await tx.household.findFirst({
          where: { id: householdId, workspaceId },
        });
        if (!row) notFound("Household not found");
        assertVersion(row.version, version);
        const householdGuests = await tx.guest.findMany({
          where: { householdId },
          select: { id: true, status: true },
        });
        await tx.guest.updateMany({
          where: { householdId, status: "ACTIVE" },
          data: {
            status: "ARCHIVED",
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await tx.invitationRecipient.updateMany({
          where: {
            workspaceId,
            revokedAt: null,
            OR: [
              { householdId },
              { guestId: { in: householdGuests.map((guest) => guest.id) } },
            ],
          },
          data: { revokedAt: new Date(), version: { increment: 1 } },
        });
        const updated = await tx.household.update({
          where: { id: householdId },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        return {
          archived: true,
          householdId,
          affectedGuests: householdGuests.filter(
            (guest) => guest.status === "ACTIVE",
          ).length,
          version: updated.version,
        };
      },
    );
  }

  async guests(
    userId: string,
    workspaceId: string,
    query: Record<string, string | undefined>,
    capabilities: Capabilities,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const take = Math.min(100, Math.max(1, Number(query.limit) || 50));
      const canReadPii = capabilities.includes("guest.read_pii");
      const derivedFilters: Prisma.GuestWhereInput[] = [];
      const tagIds = csv(query.tagIds ?? query.tag);
      if (tagIds.length) {
        const tagged = await tx.guestTagAssignment.findMany({
          where: { workspaceId, tagId: { in: tagIds } },
          select: { guestId: true },
        });
        derivedFilters.push({ id: { in: tagged.map((row) => row.guestId) } });
      }
      if (query.invitationStatus) {
        const requestedStatus = query.invitationStatus.toUpperCase();
        const recipients = await tx.invitationRecipient.findMany({
          where: {
            workspaceId,
            revokedAt: null,
            ...(requestedStatus === "NOT_PREPARED"
              ? {}
              : { status: invitationStatus(requestedStatus) }),
          },
          select: { guestId: true, householdId: true },
        });
        const guestIds = recipients.flatMap((row) => row.guestId ?? []);
        const householdIds = recipients.flatMap((row) => row.householdId ?? []);
        derivedFilters.push(
          requestedStatus === "NOT_PREPARED"
            ? {
                NOT: [
                  { id: { in: guestIds } },
                  { householdId: { in: householdIds } },
                ],
              }
            : {
                OR: [
                  { id: { in: guestIds } },
                  { householdId: { in: householdIds } },
                ],
              },
        );
      }
      if (query.rsvpStatus) {
        const requestedStatus = query.rsvpStatus
          .replaceAll("-", "_")
          .toUpperCase();
        const responses = await tx.guestEventResponse.findMany({
          where: {
            workspaceId,
            ...(requestedStatus === "NO_RESPONSE"
              ? {}
              : { attendance: attendance(requestedStatus) }),
          },
          select: { guestId: true },
        });
        const responseGuestIds = [
          ...new Set(responses.map((row) => row.guestId)),
        ];
        derivedFilters.push(
          requestedStatus === "NO_RESPONSE"
            ? { id: { notIn: responseGuestIds } }
            : { id: { in: responseGuestIds } },
        );
      }
      if (query.menuStatus) {
        const selections = await tx.guestMenuSelection.findMany({
          where: { workspaceId, active: true },
          select: { guestId: true },
        });
        const selectedGuestIds = [
          ...new Set(selections.map((row) => row.guestId)),
        ];
        derivedFilters.push(
          query.menuStatus.toLowerCase() === "complete"
            ? { id: { in: selectedGuestIds } }
            : { id: { notIn: selectedGuestIds } },
        );
      }
      if (query.allergyStatus) {
        const requestedStatus = query.allergyStatus.toUpperCase();
        const issues = await tx.allergyIssue.findMany({
          where: {
            workspaceId,
            ...(requestedStatus === "ANY"
              ? {}
              : { status: allergyStatus(requestedStatus) }),
          },
          select: { guestId: true },
        });
        derivedFilters.push({
          id: { in: [...new Set(issues.map((row) => row.guestId))] },
        });
      }
      const rows = await tx.guest.findMany({
        where: {
          workspaceId,
          ...(derivedFilters.length ? { AND: derivedFilters } : {}),
          ...(query.archived === "true"
            ? { status: { in: ["ACTIVE", "ARCHIVED"] } }
            : { status: "ACTIVE" }),
          ...(query.household ? { householdId: query.household } : {}),
          ...(query.side ? { side: side(query.side) } : {}),
          ...(query.category ? { category: query.category } : {}),
          ...(query.child === undefined
            ? {}
            : { isChild: query.child === "true" }),
          ...(query.plusOne === undefined
            ? {}
            : { isPlusOne: query.plusOne === "true" }),
          ...(query.transportRequired === "true"
            ? { needsTransport: true }
            : {}),
          ...(query.accommodationRequired === "true"
            ? { needsAccommodation: true }
            : {}),
          ...(query.search
            ? {
                OR: [
                  {
                    firstName: { contains: query.search, mode: "insensitive" },
                  },
                  { lastName: { contains: query.search, mode: "insensitive" } },
                  ...(canReadPii
                    ? [
                        {
                          emailNormalized: {
                            contains: query.search,
                            mode: "insensitive" as const,
                          },
                        },
                        { phoneE164: { contains: query.search } },
                      ]
                    : []),
                ],
              }
            : {}),
        },
        orderBy: guestOrder(query.sort),
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const households = new Map(
        (
          await tx.household.findMany({
            where: { id: { in: rows.map((row) => row.householdId) } },
          })
        ).map((row) => [row.id, row.name]),
      );
      const assignments = await tx.guestTagAssignment.findMany({
        where: { guestId: { in: rows.map((row) => row.id) } },
      });
      const tags = new Map(
        (
          await tx.guestTag.findMany({
            where: { id: { in: assignments.map((row) => row.tagId) } },
          })
        ).map((row) => [row.id, row]),
      );
      const guestIds = rows.map((row) => row.id);
      const [responses, selections, recipients] = await Promise.all([
        tx.guestEventResponse.findMany({
          where: { workspaceId, guestId: { in: guestIds } },
          orderBy: { respondedAt: "desc" },
        }),
        tx.guestMenuSelection.findMany({
          where: { workspaceId, guestId: { in: guestIds }, active: true },
          orderBy: { selectedAt: "desc" },
        }),
        tx.invitationRecipient.findMany({
          where: {
            workspaceId,
            revokedAt: null,
            OR: [
              { guestId: { in: guestIds } },
              { householdId: { in: rows.map((row) => row.householdId) } },
            ],
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      const menuIds = [
        ...new Set(selections.map((selection) => selection.menuId)),
      ];
      const menuNames = new Map(
        (await tx.menu.findMany({ where: { id: { in: menuIds } } })).map(
          (menu) => [menu.id, menu.name],
        ),
      );
      return {
        items: rows.slice(0, take).map((row) => ({
          ...mapGuest(row, households.get(row.householdId), canReadPii),
          invitationStatus:
            recipients.find(
              (recipient) =>
                recipient.guestId === row.id ||
                recipient.householdId === row.householdId,
            )?.status ?? "NOT_PREPARED",
          rsvpStatus:
            responses
              .find((response) => response.guestId === row.id)
              ?.attendance.toLowerCase()
              .replace("_", "-") ?? "no-response",
          menuName: (() => {
            const selection = selections.find(
              (item) => item.guestId === row.id,
            );
            return selection ? (menuNames.get(selection.menuId) ?? null) : null;
          })(),
          tags: assignments
            .filter((item) => item.guestId === row.id)
            .map((item) => tags.get(item.tagId))
            .filter(Boolean)
            .map((tag) => ({
              id: tag!.id,
              name: tag!.name,
              color: tag!.color,
            })),
        })),
        nextCursor: rows.length > take ? rows[take - 1]!.id : null,
        summary: await this.summary(tx, workspaceId),
      };
    });
  }

  async tags(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.guestTag.findMany({
        where: { workspaceId },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      const counts = await tx.guestTagAssignment.groupBy({
        by: ["tagId"],
        where: { workspaceId },
        _count: true,
      });
      const byTag = new Map(counts.map((row) => [row.tagId, row._count]));
      return {
        items: rows.map((row) => mapTag(row, byTag.get(row.id) ?? 0)),
      };
    });
  }

  async createTag(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateGuestTag,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const prior = await this.replay(
        tx,
        userId,
        workspaceId,
        "guest.tag.create",
        idempotencyKey,
        input,
      );
      if (prior) return prior;
      const row = await tx.guestTag.create({
        data: { workspaceId, name: input.name, color: input.color },
      });
      const response = mapTag(row, 0);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "guest.tag.create",
        idempotencyKey,
        input,
        response,
      );
      return response;
    });
  }

  async updateTag(
    userId: string,
    workspaceId: string,
    tagId: string,
    version: number,
    input: UpdateGuestTag,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.guestTag.findFirst({
        where: { id: tagId, workspaceId },
      });
      if (!current) notFound("Guest tag not found");
      assertVersion(current.version, version);
      const row = await tx.guestTag.update({
        where: { id: tagId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.color === undefined ? {} : { color: input.color }),
          version: { increment: 1 },
        },
      });
      const assignedGuests = await tx.guestTagAssignment.count({
        where: { tagId },
      });
      return mapTag(row, assignedGuests);
    });
  }

  async deleteTag(
    userId: string,
    workspaceId: string,
    tagId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.guestTag.findFirst({
        where: { id: tagId, workspaceId },
      });
      if (!current) notFound("Guest tag not found");
      assertVersion(current.version, version);
      const assignedGuests = await tx.guestTagAssignment.count({
        where: { tagId },
      });
      await tx.guestTag.delete({ where: { id: tagId } });
      return { deleted: true, tagId, affectedGuests: assignedGuests };
    });
  }

  async createGuest(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateGuest,
    correlationId: string,
    capabilities: Capabilities,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "guest.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        await this.entitlements.assertCapacity(
          tx,
          workspaceId,
          "MAX_GUESTS",
          await tx.guest.count({
            where: { workspaceId, status: "ACTIVE" },
          }),
        );
        const household = await tx.household.findFirst({
          where: { id: input.householdId, workspaceId, deletedAt: null },
        });
        if (!household) notFound("Household not found");
        if (input.isPlusOne) {
          if (!input.primaryGuestId)
            validation("A plus-one requires a primary guest");
          const primary = await tx.guest.findFirst({
            where: {
              id: input.primaryGuestId,
              workspaceId,
              householdId: input.householdId,
              status: "ACTIVE",
            },
          });
          if (!primary?.plusOneAllowed)
            validation("This guest is not allowed a plus-one");
          const existing = await tx.guest.findFirst({
            where: {
              workspaceId,
              primaryGuestId: primary.id,
              isPlusOne: true,
              status: "ACTIVE",
            },
          });
          if (existing)
            validation("The plus-one limit has already been reached");
        }
        const row = await tx.guest.create({
          data: guestCreateData(workspaceId, input, this.sensitiveKey),
        });
        if (input.tagIds?.length) {
          const count = await tx.guestTag.count({
            where: { workspaceId, id: { in: input.tagIds } },
          });
          if (count !== input.tagIds.length)
            validation("One or more tags are invalid");
          await tx.guestTagAssignment.createMany({
            data: input.tagIds.map((tagId) => ({
              workspaceId,
              guestId: row.id,
              tagId,
            })),
          });
        }
        await this.event(tx, {
          eventName: "guest.created.v1",
          aggregateType: "Guest",
          aggregateId: row.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "guest_created",
          summary: `A fost adăugat invitatul ${row.firstName} ${row.lastName}.`,
        });
        const response = mapGuest(
          row,
          household.name,
          capabilities.includes("guest.read_pii"),
        );
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "guest.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async guest(
    userId: string,
    workspaceId: string,
    guestId: string,
    capabilities: Capabilities,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.guest.findFirst({
        where: { id: guestId, workspaceId },
      });
      if (!row) notFound("Guest not found");
      const household = await tx.household.findUnique({
        where: { id: row.householdId },
      });
      const contacts = await tx.guestContactLog.findMany({
        where: { guestId },
        orderBy: { occurredAt: "desc" },
        take: 50,
      });
      return {
        ...mapGuest(
          row,
          household?.name,
          capabilities.includes("guest.read_pii"),
        ),
        communication: contacts.map((item) => ({
          id: item.id,
          channel: item.channel.toLowerCase(),
          direction: item.direction.toLowerCase(),
          summary: item.summaryRedacted,
          occurredAt: item.occurredAt.toISOString(),
        })),
      };
    });
  }

  async updateGuest(
    userId: string,
    workspaceId: string,
    guestId: string,
    version: number,
    input: UpdateGuest,
    correlationId: string,
    capabilities: Capabilities,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await tx.guest.findFirst({
          where: { id: guestId, workspaceId },
        });
        if (!current) notFound("Guest not found");
        assertVersion(current.version, version);
        const householdId = input.householdId ?? current.householdId;
        const household = await tx.household.findFirst({
          where: { id: householdId, workspaceId, deletedAt: null },
        });
        if (!household) notFound("Household not found");
        const movingHousehold = householdId !== current.householdId;
        const directRecipientIds = movingHousehold
          ? (
              await tx.invitationRecipient.findMany({
                where: {
                  workspaceId,
                  guestId: current.id,
                  revokedAt: null,
                },
                select: { id: true },
              })
            ).map((recipient) => recipient.id)
          : [];
        const row = await tx.guest.update({
          where: { id: guestId },
          data: {
            ...defined(input, [
              "householdId",
              "firstName",
              "lastName",
              "displayName",
              "preferredLanguage",
              "relationship",
              "side",
              "category",
              "isChild",
              "primaryGuestId",
              "plusOneAllowed",
              "needsTransport",
              "needsAccommodation",
              "status",
            ]),
            ...(input.email === undefined
              ? {}
              : { emailNormalized: normalizeEmail(input.email) }),
            ...(input.phone === undefined
              ? {}
              : { phoneE164: normalizePhone(input.phone) }),
            ...(input.dateOfBirth === undefined
              ? {}
              : {
                  dateOfBirth: input.dateOfBirth
                    ? new Date(input.dateOfBirth)
                    : null,
                }),
            ...(input.accessibilityNotes === undefined
              ? {}
              : {
                  accessibilityNotesEncrypted: encryptSensitive(
                    input.accessibilityNotes,
                    this.sensitiveKey,
                  ),
                }),
            ...(input.notesPrivate === undefined
              ? {}
              : {
                  notesPrivateEncrypted: encryptSensitive(
                    input.notesPrivate,
                    this.sensitiveKey,
                  ),
                }),
            version: { increment: 1 },
          },
        });
        if (row.status === "ARCHIVED")
          await tx.invitationRecipient.updateMany({
            where: {
              workspaceId,
              revokedAt: null,
              guestId: row.id,
            },
            data: { revokedAt: new Date(), version: { increment: 1 } },
          });
        else if (directRecipientIds.length)
          await tx.guestAccessGrant.updateMany({
            where: {
              workspaceId,
              invitationRecipientId: { in: directRecipientIds },
              revokedAt: null,
            },
            data: { householdId, version: { increment: 1 } },
          });
        if (input.tagIds) {
          await tx.guestTagAssignment.deleteMany({ where: { guestId } });
          if (input.tagIds.length)
            await tx.guestTagAssignment.createMany({
              data: input.tagIds.map((tagId) => ({
                workspaceId,
                guestId,
                tagId,
              })),
            });
        }
        await this.event(tx, {
          eventName:
            row.status === "ARCHIVED"
              ? "guest.archived.v1"
              : "guest.updated.v1",
          aggregateType: "Guest",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action:
            row.status === "ARCHIVED" ? "guest_archived" : "guest_updated",
          summary:
            row.status === "ARCHIVED"
              ? "Un invitat a fost arhivat."
              : `Invitatul ${row.firstName} ${row.lastName} a fost actualizat.`,
        });
        return mapGuest(
          row,
          household.name,
          capabilities.includes("guest.read_pii"),
        );
      },
    );
  }

  async archiveGuest(
    userId: string,
    workspaceId: string,
    guestId: string,
    version: number,
    correlationId: string,
  ) {
    return this.updateGuest(
      userId,
      workspaceId,
      guestId,
      version,
      { status: "ARCHIVED" },
      correlationId,
      ["guest.read_pii"],
    );
  }

  async bulk(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    command: Record<string, unknown> & { command: string; guestIds: string[] },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const prior = await this.replay(
          tx,
          userId,
          workspaceId,
          "guest.bulk",
          idempotencyKey,
          command,
        );
        if (prior) return prior;
        const count = await tx.guest.count({
          where: { workspaceId, id: { in: command.guestIds } },
        });
        if (count !== command.guestIds.length)
          validation("One or more guests are unavailable");
        switch (command.command) {
          case "ADD_TAG": {
            const tag = await tx.guestTag.findFirst({
              where: { id: String(command.tagId), workspaceId },
            });
            if (!tag) notFound("Guest tag not found");
            await tx.guestTagAssignment.createMany({
              data: command.guestIds.map((guestId) => ({
                workspaceId,
                guestId,
                tagId: String(command.tagId),
              })),
              skipDuplicates: true,
            });
            break;
          }
          case "REMOVE_TAG": {
            const tag = await tx.guestTag.findFirst({
              where: { id: String(command.tagId), workspaceId },
            });
            if (!tag) notFound("Guest tag not found");
            await tx.guestTagAssignment.deleteMany({
              where: {
                guestId: { in: command.guestIds },
                tagId: String(command.tagId),
              },
            });
            break;
          }
          case "ARCHIVE":
            await tx.guest.updateMany({
              where: { id: { in: command.guestIds } },
              data: {
                status: "ARCHIVED",
                deletedAt: new Date(),
                version: { increment: 1 },
              },
            });
            await tx.invitationRecipient.updateMany({
              where: {
                workspaceId,
                revokedAt: null,
                guestId: { in: command.guestIds },
              },
              data: { revokedAt: new Date(), version: { increment: 1 } },
            });
            break;
          case "MOVE_TO_HOUSEHOLD": {
            const household = await tx.household.findFirst({
              where: {
                id: String(command.householdId),
                workspaceId,
                deletedAt: null,
              },
            });
            if (!household) notFound("Target household not found");
            const directRecipientIds = (
              await tx.invitationRecipient.findMany({
                where: {
                  workspaceId,
                  guestId: { in: command.guestIds },
                  revokedAt: null,
                },
                select: { id: true },
              })
            ).map((recipient) => recipient.id);
            await tx.guest.updateMany({
              where: { id: { in: command.guestIds } },
              data: { householdId: household.id, version: { increment: 1 } },
            });
            if (directRecipientIds.length)
              await tx.guestAccessGrant.updateMany({
                where: {
                  workspaceId,
                  invitationRecipientId: { in: directRecipientIds },
                  revokedAt: null,
                },
                data: {
                  householdId: household.id,
                  version: { increment: 1 },
                },
              });
            break;
          }
          default:
            validation(
              "This bulk command is handled by its invitation or campaign workflow",
            );
        }
        const response = {
          command: command.command,
          affected: command.guestIds.length,
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "guest.bulk",
          idempotencyKey,
          command,
          response,
        );
        return response;
      },
    );
  }

  async createImport(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    correlationId: string,
  ) {
    if (!file || file.size <= 0) validation("Import file is required");
    if (file.size > 5_242_880) validation("Import file exceeds 5 MiB");
    const extension = extname(file.originalname).toLowerCase();
    if (![".csv", ".xlsx"].includes(extension) || extension === ".xlsm")
      validation("Only CSV and XLSX files are accepted");
    const allowedTypes = [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ];
    if (!allowedTypes.includes(file.mimetype))
      validation("Import content type is invalid");
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const replayInput = { checksum, fileName: file.originalname };
    const prior = await this.database.withContext(
      { userId, workspaceId, correlationId },
      (tx) =>
        this.replay(
          tx,
          userId,
          workspaceId,
          "guest.import.create",
          idempotencyKey,
          replayInput,
        ),
    );
    if (prior) return prior;
    const storageKey = `${randomUUID()}${extension}`;
    const fullPath = resolve(this.importRoot, storageKey);
    if (!fullPath.startsWith(`${this.importRoot}/`))
      validation("Invalid storage key");
    await mkdir(this.importRoot, { recursive: true, mode: 0o700 });
    await writeFile(fullPath, file.buffer, { mode: 0o600, flag: "wx" });
    await chmod(fullPath, 0o600);
    try {
      return await this.database.withContext(
        { userId, workspaceId, correlationId },
        async (tx) => {
          const importId = randomUUID();
          const jobId = await this.asyncEvents.record(tx, {
            eventName: "guest.import_requested.v1",
            aggregateType: "GuestImport",
            aggregateId: importId,
            workspaceId,
            actorUserId: userId,
            correlationId,
            idempotencyKey,
            deduplicationKey: `guest-import:${workspaceId}:${checksum}`,
            userVisibleJob: true,
            payload: {
              subject: { importId },
              guestImport: { importId },
              activity: {
                category: "guests",
                action: "guest_import_requested",
                summary: "A fost solicitat importul listei de invitați.",
                entityType: "GuestImport",
                entityId: importId,
              },
            },
          });
          if (!jobId) throw new Error("Guest import job missing");
          const row = await tx.guestImport.create({
            data: {
              id: importId,
              workspaceId,
              createdById: userId,
              backgroundJobId: jobId,
              sourceFileName: basename(file.originalname).slice(0, 255),
              storageKey,
              checksum,
              mediaType: file.mimetype,
              sizeBytes: BigInt(file.size),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
          const job = await tx.backgroundJob.findUniqueOrThrow({
            where: { id: jobId },
          });
          const response = { import: mapImport(row), job: mapJob(job) };
          await this.saveReplay(
            tx,
            userId,
            workspaceId,
            "guest.import.create",
            idempotencyKey,
            replayInput,
            response,
          );
          return response;
        },
      );
    } catch (error) {
      await unlink(fullPath).catch(() => undefined);
      throw error;
    }
  }

  async importStatus(userId: string, workspaceId: string, importId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.guestImport.findFirst({
        where: { id: importId, workspaceId },
      });
      if (!row) notFound("Guest import not found");
      return mapImport(row);
    });
  }

  async importRows(
    userId: string,
    workspaceId: string,
    importId: string,
    cursor?: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.guestImportRow.findMany({
        where: { importId, workspaceId },
        orderBy: { rowNumber: "asc" },
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      return {
        items: rows.slice(0, 100).map(mapImportRow),
        nextCursor: rows.length > 100 ? rows[99]!.id : null,
      };
    });
  }

  async updateImportMapping(
    userId: string,
    workspaceId: string,
    importId: string,
    version: number,
    mapping: Record<string, string>,
  ) {
    const allowedFields = new Set([
      "firstName",
      "lastName",
      "email",
      "phone",
      "household",
    ]);
    if (Object.keys(mapping).some((field) => !allowedFields.has(field)))
      validation("Import mapping contains an unsupported field");
    if (!mapping.firstName && !mapping.lastName)
      validation("Import mapping requires a first-name or last-name column");
    const source = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        const row = await tx.guestImport.findFirst({
          where: { id: importId, workspaceId },
        });
        if (!row) notFound("Guest import not found");
        assertVersion(row.version, version);
        return { storageKey: row.storageKey };
      },
    );
    if (
      basename(source.storageKey) !== source.storageKey ||
      !/^[0-9a-f-]{36}\.(csv|xlsx)$/i.test(source.storageKey)
    )
      validation("Import source reference is invalid");
    const fullPath = resolve(this.importRoot, source.storageKey);
    if (!fullPath.startsWith(`${this.importRoot}/`))
      validation("Import source reference is invalid");
    let buffer: Buffer;
    try {
      buffer = await readFile(fullPath);
    } catch {
      validation("Import source file is no longer available");
    }
    const rawRows = source.storageKey.toLowerCase().endsWith(".csv")
      ? readCsvRows(buffer, this.importMaxRows)
      : await readXlsxRows(buffer, this.importMaxRows);
    if (rawRows.length > this.importMaxRows)
      validation(`Guest import exceeds ${this.importMaxRows} rows`);
    const headers = new Set(Object.keys(rawRows[0] ?? {}));
    if (Object.values(mapping).some((header) => !headers.has(header)))
      validation("Import mapping references a column that does not exist");

    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.guestImport.findFirst({
        where: { id: importId, workspaceId },
      });
      if (!row) notFound("Guest import not found");
      assertVersion(row.version, version);
      const existingGuests = await tx.guest.findMany({
        where: { workspaceId, status: { not: "REMOVED" } },
        select: {
          id: true,
          householdId: true,
          emailNormalized: true,
          phoneE164: true,
        },
      });
      const byEmail = new Map(
        existingGuests
          .filter((guest) => guest.emailNormalized)
          .map((guest) => [guest.emailNormalized!, guest]),
      );
      const byPhone = new Map(
        existingGuests
          .filter((guest) => guest.phoneE164)
          .map((guest) => [guest.phoneE164!, guest]),
      );
      const parsed = rawRows.map((raw, index) => {
        const normalized = normalizeImportRow(raw, mapping);
        const errors: string[] = [];
        if (!normalized.firstName && !normalized.lastName)
          errors.push("NAME_REQUIRED");
        if (
          normalized.email &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)
        )
          errors.push("EMAIL_INVALID");
        const duplicate =
          (normalized.email ? byEmail.get(normalized.email) : undefined) ??
          (normalized.phone ? byPhone.get(normalized.phone) : undefined);
        return {
          workspaceId,
          importId,
          rowNumber: index + 2,
          rawDataRedacted: redactImportRow(raw) as Prisma.InputJsonValue,
          normalizedData: normalized as Prisma.InputJsonValue,
          validationErrors: errors as Prisma.InputJsonValue,
          duplicateGuestId: duplicate?.id ?? null,
          duplicateHouseholdId: duplicate?.householdId ?? null,
          decision: (errors.length
            ? "SKIP"
            : duplicate
              ? "MERGE_WITH_EXISTING"
              : "CREATE_NEW") as "SKIP" | "MERGE_WITH_EXISTING" | "CREATE_NEW",
        };
      });
      await tx.guestImportRow.deleteMany({ where: { importId } });
      if (parsed.length) await tx.guestImportRow.createMany({ data: parsed });
      const validRows = parsed.filter(
        (item) => (item.validationErrors as unknown[]).length === 0,
      ).length;
      const duplicateRows = parsed.filter(
        (item) => item.duplicateGuestId,
      ).length;
      const updated = await tx.guestImport.update({
        where: { id: importId },
        data: {
          mapping,
          status: "READY_FOR_REVIEW",
          totalRows: parsed.length,
          validRows,
          invalidRows: parsed.length - validRows,
          duplicateRows,
          version: { increment: 1 },
        },
      });
      return mapImport(updated);
    });
  }

  async decideImportRow(
    userId: string,
    workspaceId: string,
    importId: string,
    rowId: string,
    version: number,
    decision: "CREATE_NEW" | "MERGE_WITH_EXISTING" | "SKIP",
    mergeGuestId?: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.guestImportRow.findFirst({
        where: { id: rowId, importId, workspaceId },
      });
      if (!row) notFound("Guest import row not found");
      assertVersion(row.version, version);
      if (
        decision === "MERGE_WITH_EXISTING" &&
        !mergeGuestId &&
        !row.duplicateGuestId
      )
        validation("Merge requires an existing guest");
      const updated = await tx.guestImportRow.update({
        where: { id: rowId },
        data: {
          decision,
          duplicateGuestId: mergeGuestId ?? row.duplicateGuestId,
          version: { increment: 1 },
        },
      });
      return mapImportRow(updated);
    });
  }

  async commitImport(
    userId: string,
    workspaceId: string,
    importId: string,
    version: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "guest.import.commit",
          idempotencyKey,
          { importId, version },
        );
        if (replay) return replay;
        const guestImport = await tx.guestImport.findFirst({
          where: { id: importId, workspaceId },
        });
        if (!guestImport) notFound("Guest import not found");
        assertVersion(guestImport.version, version);
        if (!["READY_FOR_REVIEW", "COMPLETED"].includes(guestImport.status))
          validation("Import is not ready to commit");
        const rows = await tx.guestImportRow.findMany({
          where: { importId, resultGuestId: null },
        });
        const rowsToCreate = rows.filter(
          (row) =>
            row.decision !== "SKIP" &&
            row.decision !== "MERGE_WITH_EXISTING" &&
            (row.validationErrors as unknown[]).length === 0,
        ).length;
        await this.entitlements.assertCapacity(
          tx,
          workspaceId,
          "MAX_GUESTS",
          await tx.guest.count({
            where: { workspaceId, status: "ACTIVE" },
          }),
          rowsToCreate,
        );
        let committed = guestImport.committedRows;
        for (const row of rows) {
          if (
            row.decision === "SKIP" ||
            (row.validationErrors as unknown[]).length
          )
            continue;
          const data = object(row.normalizedData);
          if (row.decision === "MERGE_WITH_EXISTING") {
            if (!row.duplicateGuestId)
              validation(`Row ${row.rowNumber} requires a merge target`);
            await tx.guestImportRow.update({
              where: { id: row.id },
              data: { resultGuestId: row.duplicateGuestId },
            });
            committed += 1;
            continue;
          }
          const householdName =
            text(data.household) || `${text(data.lastName) || "Invitat"}`;
          let household = await tx.household.findFirst({
            where: {
              workspaceId,
              name: { equals: householdName, mode: "insensitive" },
              deletedAt: null,
            },
          });
          household ??= await tx.household.create({
            data: {
              workspaceId,
              name: householdName,
              preferredLanguage: "ro",
              side: "COMMON",
            },
          });
          const guest = await tx.guest.create({
            data: {
              workspaceId,
              householdId: household.id,
              firstName: text(data.firstName) || "Invitat",
              lastName: text(data.lastName) || "",
              emailNormalized: normalizeEmail(text(data.email)),
              phoneE164: normalizePhone(text(data.phone)),
              side: "COMMON",
              preferredLanguage: "ro",
            },
          });
          await tx.guestImportRow.update({
            where: { id: row.id },
            data: { resultGuestId: guest.id },
          });
          committed += 1;
        }
        const updated = await tx.guestImport.update({
          where: { id: importId },
          data: {
            status: "COMPLETED",
            committedRows: committed,
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          eventName: "guest.import_completed.v1",
          aggregateType: "GuestImport",
          aggregateId: importId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          action: "guest_import_completed",
          summary: `Importul invitaților s-a încheiat: ${committed} rânduri aplicate.`,
        });
        const response = {
          import: mapImport(updated),
          committedRows: committed,
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "guest.import.commit",
          idempotencyKey,
          { importId, version },
          response,
        );
        return response;
      },
    );
  }

  async exportGuests(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: Record<string, unknown>,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "guest.export",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        const jobId = await this.asyncEvents.record(tx, {
          eventName: "guest.export_requested.v1",
          aggregateType: "GuestExport",
          aggregateId: randomUUID(),
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `guest-export:${workspaceId}:${userId}:${idempotencyKey}`,
          userVisibleJob: true,
          payload: {
            subject: { requestedByUserId: userId },
            guestExport: {
              requestedByUserId: userId,
              format: input.format === "xlsx" ? "xlsx" : "csv",
              options: input,
            },
          },
        });
        if (!jobId) throw new Error("Guest export job missing");
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        const response = { job: mapJob(job) };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "guest.export",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  private async summary(tx: Transaction, workspaceId: string) {
    const guests = await tx.guest.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: {
        id: true,
        isChild: true,
        isPlusOne: true,
        needsTransport: true,
        needsAccommodation: true,
      },
    });
    const households = await tx.household.count({
      where: { workspaceId, deletedAt: null },
    });
    const recipients = await tx.invitationRecipient.findMany({
      where: { workspaceId, revokedAt: null },
      select: { status: true },
    });
    const responses = await tx.guestEventResponse.findMany({
      where: { workspaceId },
      select: { guestId: true, attendance: true },
    });
    const respondedGuests = new Set(
      responses
        .filter((item) => item.attendance !== "NO_RESPONSE")
        .map((item) => item.guestId),
    );
    const confirmed = new Set(
      responses
        .filter((item) => item.attendance === "CONFIRMED")
        .map((item) => item.guestId),
    ).size;
    const declined = new Set(
      responses
        .filter((item) => item.attendance === "DECLINED")
        .map((item) => item.guestId),
    ).size;
    const unsure = new Set(
      responses
        .filter((item) => item.attendance === "UNSURE")
        .map((item) => item.guestId),
    ).size;
    const selections = await tx.guestMenuSelection.count({
      where: { workspaceId, active: true },
    });
    const allergyIssues = await tx.allergyIssue.count({
      where: { workspaceId, status: { not: "RESOLVED" } },
    });
    const invitationCount = (status: string) =>
      recipients.filter((item) => item.status === status).length;
    return {
      totalGuests: guests.length,
      totalHouseholds: households,
      invitation: {
        notPrepared: Math.max(0, households - recipients.length),
        ready: invitationCount("READY"),
        queued: invitationCount("QUEUED"),
        sent: invitationCount("SENT"),
        opened: recipients.filter((item) =>
          ["OPENED", "PARTIALLY_RESPONDED", "RESPONDED"].includes(item.status),
        ).length,
      },
      rsvp: {
        confirmed,
        declined,
        unsure,
        noResponse: Math.max(0, guests.length - respondedGuests.size),
        partialHouseholds: await tx.invitationRecipient.count({
          where: { workspaceId, status: "PARTIALLY_RESPONDED" },
        }),
      },
      people: {
        adults: guests.filter((item) => !item.isChild).length,
        children: guests.filter((item) => item.isChild).length,
        plusOnes: guests.filter((item) => item.isPlusOne).length,
      },
      menu: {
        complete: selections,
        incomplete: Math.max(0, confirmed - selections),
        allergyIssues,
      },
      logistics: {
        transportRequested: guests.filter((item) => item.needsTransport).length,
        accommodationRequested: guests.filter((item) => item.needsAccommodation)
          .length,
      },
    };
  }

  private async householdInvitationStatus(
    tx: Transaction,
    householdId: string,
  ) {
    const recipient = await tx.invitationRecipient.findFirst({
      where: { householdId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return recipient?.status ?? "NOT_PREPARED";
  }

  private async event(
    tx: Transaction,
    input: {
      eventName: string;
      aggregateType: string;
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
      ...input,
      deduplicationKey: `${input.eventName}:${input.aggregateId}:v${input.aggregateVersion ?? 1}`,
      payload: {
        subject: { entityId: input.aggregateId },
        activity: {
          category: "guests",
          action: input.action,
          summary: input.summary,
          entityType: input.aggregateType,
          entityId: input.aggregateId,
        },
      },
    });
  }

  private async replay(
    tx: Transaction,
    userId: string,
    workspaceId: string,
    operation: string,
    key: string,
    input: unknown,
  ) {
    const record = await tx.idempotencyRecord.findUnique({
      where: {
        actorUserId_operation_key: { actorUserId: userId, operation, key },
      },
    });
    if (!record) return null;
    if (record.requestHash !== stableHash(input))
      problem(
        "IDEMPOTENCY_CONFLICT",
        HttpStatus.CONFLICT,
        "Idempotency key reused with different input",
      );
    return record.responseBody;
  }

  private async saveReplay(
    tx: Transaction,
    userId: string,
    workspaceId: string,
    operation: string,
    key: string,
    input: unknown,
    response: unknown,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        workspaceId,
        actorUserId: userId,
        operation,
        key,
        requestHash: stableHash(input),
        responseStatus: 200,
        responseBody: response as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }
}

function mapHousehold(row: {
  id: string;
  workspaceId: string;
  name: string;
  primaryGuestId: string | null;
  preferredLanguage: string;
  city: string | null;
  country: string | null;
  address: string | null;
  category: string | null;
  side: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    primaryGuestId: row.primaryGuestId,
    preferredLanguage: row.preferredLanguage,
    city: row.city,
    country: row.country,
    address: row.address,
    category: row.category,
    side: row.side.toLowerCase(),
    deletedAt: iso(row.deletedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function mapGuest(
  row: {
    id: string;
    workspaceId: string;
    householdId: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    emailNormalized: string | null;
    phoneE164: string | null;
    preferredLanguage: string;
    relationship: string | null;
    side: string;
    category: string | null;
    isChild: boolean;
    isPlusOne: boolean;
    primaryGuestId: string | null;
    plusOneAllowed: boolean;
    needsTransport: boolean;
    needsAccommodation: boolean;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  },
  householdName?: string,
  canReadPii = false,
) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    householdId: row.householdId,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    email: canReadPii ? row.emailNormalized : null,
    phone: canReadPii ? row.phoneE164 : null,
    preferredLanguage: row.preferredLanguage,
    relationship: row.relationship,
    side: row.side.toLowerCase(),
    category: row.category,
    isChild: row.isChild,
    isPlusOne: row.isPlusOne,
    primaryGuestId: row.primaryGuestId,
    plusOneAllowed: row.plusOneAllowed,
    needsTransport: row.needsTransport,
    needsAccommodation: row.needsAccommodation,
    status: row.status.toLowerCase(),
    householdName,
    tags: [],
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTag(
  row: {
    id: string;
    workspaceId: string;
    name: string;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  },
  assignedGuests: number,
) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    color: row.color,
    assignedGuests,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapImport(row: {
  id: string;
  workspaceId: string;
  sourceFileName: string;
  status: string;
  mapping: unknown;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  committedRows: number;
  expiresAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sourceFileName: row.sourceFileName,
    status: row.status.toLowerCase(),
    mapping: row.mapping,
    totalRows: row.totalRows,
    validRows: row.validRows,
    invalidRows: row.invalidRows,
    duplicateRows: row.duplicateRows,
    committedRows: row.committedRows,
    expiresAt: row.expiresAt.toISOString(),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapImportRow(row: {
  id: string;
  rowNumber: number;
  rawDataRedacted: unknown;
  normalizedData: unknown;
  validationErrors: unknown;
  duplicateGuestId: string | null;
  duplicateHouseholdId: string | null;
  decision: string | null;
  resultGuestId: string | null;
  version: number;
}) {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    rawDataRedacted: row.rawDataRedacted,
    normalizedData: row.normalizedData,
    validationErrors: row.validationErrors,
    duplicateGuestId: row.duplicateGuestId,
    duplicateHouseholdId: row.duplicateHouseholdId,
    decision: row.decision?.toLowerCase() ?? null,
    resultGuestId: row.resultGuestId,
    version: row.version,
  };
}

function guestCreateData(
  workspaceId: string,
  input: CreateGuest,
  sensitiveKey: { keyId: string; secret: string },
) {
  return {
    workspaceId,
    householdId: input.householdId,
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: input.displayName,
    emailNormalized: normalizeEmail(input.email),
    phoneE164: normalizePhone(input.phone),
    preferredLanguage: input.preferredLanguage,
    relationship: input.relationship,
    side: input.side,
    category: input.category,
    isChild: input.isChild,
    dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    isPlusOne: input.isPlusOne,
    primaryGuestId: input.primaryGuestId,
    plusOneAllowed: input.plusOneAllowed,
    accessibilityNotesEncrypted: encryptSensitive(
      input.accessibilityNotes,
      sensitiveKey,
    ),
    needsTransport: input.needsTransport,
    needsAccommodation: input.needsAccommodation,
    notesPrivateEncrypted: encryptSensitive(input.notesPrivate, sensitiveKey),
  };
}

export function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function normalizeImportRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
) {
  const value = (field: string) => {
    const header = mapping[field];
    return header ? String(raw[header] ?? "").trim() : "";
  };
  return {
    firstName: value("firstName"),
    lastName: value("lastName"),
    email: value("email").toLowerCase(),
    phone: normalizePhone(value("phone")) ?? "",
    household: value("household"),
  };
}

function redactImportRow(raw: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => {
      const header = normalizeImportHeader(key);
      const rowValue = String(value ?? "");
      if (header.includes("email") || header === "mail") {
        const [local, domain] = rowValue.split("@");
        return [
          key,
          domain ? `${local?.slice(0, 1) ?? "*"}***@${domain}` : "[redacted]",
        ];
      }
      if (
        header.includes("phone") ||
        header.includes("telefon") ||
        header.includes("mobil")
      )
        return [
          key,
          rowValue ? `***${rowValue.replace(/\D/g, "").slice(-3)}` : "",
        ];
      return [key, rowValue ? "[available]" : ""];
    }),
  );
}

function normalizeImportHeader(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function normalizePhone(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/[^\d+]/g, "");
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}
function side(
  value: string,
): "PARTNER_ONE" | "PARTNER_TWO" | "COMMON" | "VENDOR" | "OTHER" {
  const normalized = value.toUpperCase();
  if (
    ["PARTNER_ONE", "PARTNER_TWO", "COMMON", "VENDOR", "OTHER"].includes(
      normalized,
    )
  )
    return normalized as ReturnType<typeof side>;
  validation("Invalid guest side");
}
function invitationStatus(
  value: string,
):
  | "READY"
  | "QUEUED"
  | "SENT"
  | "OPENED"
  | "PARTIALLY_RESPONDED"
  | "RESPONDED"
  | "REVOKED" {
  if (
    [
      "READY",
      "QUEUED",
      "SENT",
      "OPENED",
      "PARTIALLY_RESPONDED",
      "RESPONDED",
      "REVOKED",
    ].includes(value)
  )
    return value as ReturnType<typeof invitationStatus>;
  validation("Invalid invitation status");
}
function attendance(
  value: string,
): "CONFIRMED" | "DECLINED" | "UNSURE" | "NO_RESPONSE" {
  if (["CONFIRMED", "DECLINED", "UNSURE", "NO_RESPONSE"].includes(value))
    return value as ReturnType<typeof attendance>;
  validation("Invalid RSVP status");
}
function allergyStatus(
  value: string,
): "UNREVIEWED" | "REVIEWING" | "CONFIRMED_WITH_CATERER" | "RESOLVED" {
  if (
    ["UNREVIEWED", "REVIEWING", "CONFIRMED_WITH_CATERER", "RESOLVED"].includes(
      value,
    )
  )
    return value as ReturnType<typeof allergyStatus>;
  validation("Invalid allergy status");
}
function csv(value: string | undefined) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}
function guestOrder(sort?: string): Prisma.GuestOrderByWithRelationInput[] {
  switch (sort) {
    case "first_name":
      return [{ firstName: "asc" }, { id: "asc" }];
    case "created_at":
      return [{ createdAt: "desc" }, { id: "desc" }];
    default:
      return [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }];
  }
}
function defined(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}
function assertVersion(latest: number, expected: number) {
  if (latest !== expected)
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Version conflict",
      "Resursa a fost modificată. Reîncarcă datele curente.",
      undefined,
      { latestVersion: latest },
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

async function readXlsxRows(
  buffer: Buffer,
  maxRows: number,
): Promise<Array<Record<string, unknown>>> {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    return readCsvRows(buffer, maxRows);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.worksheets[0];
  if (!sheet) validation("Import workbook has no sheets");
  const headers = Array.from({ length: sheet.columnCount }, (_, index) =>
    sheet
      .getRow(1)
      .getCell(index + 1)
      .text.trim(),
  );
  const rows: Array<Record<string, unknown>> = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length > maxRows) return;
    const value: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) value[header] = row.getCell(index + 1).text;
    });
    rows.push(value);
  });
  return rows;
}

function readCsvRows(
  buffer: Buffer,
  maxRows: number,
): Array<Record<string, unknown>> {
  const records = parseCsvRecords(
    buffer.toString("utf8").replace(/^\uFEFF/, ""),
  );
  const headers = (records.shift() ?? []).map((header) => header.trim());
  return records
    .slice(0, maxRows + 1)
    .map((record) =>
      Object.fromEntries(
        headers
          .map((header, index) => [header, record[index] ?? ""] as const)
          .filter(([header]) => header.length > 0),
      ),
    );
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else field += character;
  }
  if (field.length || record.length) {
    record.push(field.replace(/\r$/, ""));
    if (record.some((value) => value.length > 0)) records.push(record);
  }
  if (quoted) validation("CSV contains an unclosed quote");
  return records;
}

import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import {
  contradictorySeatingConstraints,
  SEATING_RULES_VERSION,
  validateAccommodationCapacity,
  validateTransportCapacity,
} from "@weddingos/jobs";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";
import { encryptSensitive, stableHash } from "../guests/sensitive.crypto";

type Transaction = Prisma.TransactionClient;
type Input = Record<string, unknown>;

@Injectable()
export class OperationsService {
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

  async venueSpaces(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.venueSpace.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: [{ status: "asc" }, { name: "asc" }],
        })
      ).map(resource),
    }));
  }

  async venueSpace(userId: string, workspaceId: string, id: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) =>
      resource(await this.requireVenue(tx, workspaceId, id)),
    );
  }

  async createVenueSpace(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "seating.venue.create",
        key,
        input,
      );
      if (replay) return replay;
      await this.requireEvent(tx, workspaceId, string(input.weddingEventId));
      const row = await tx.venueSpace.create({
        data: {
          workspaceId,
          weddingEventId: string(input.weddingEventId),
          name: string(input.name),
          description: nullableString(input.description),
          locationName: nullableString(input.locationName),
          widthUnits: number(input.widthUnits),
          heightUnits: number(input.heightUnits),
          unit: dbEnum(input.unit, "ARBITRARY_GRID") as
            "METERS" | "CENTIMETERS" | "ARBITRARY_GRID",
          capacity: nullableNumber(input.capacity),
          backgroundImageUrl: nullableString(input.backgroundImageUrl),
        },
      });
      const response = resource(row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "seating.venue.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateVenueSpace(
    userId: string,
    workspaceId: string,
    id: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await this.requireVenue(tx, workspaceId, id);
      assertVersion(current.version, version);
      if (input.weddingEventId)
        await this.requireEvent(tx, workspaceId, string(input.weddingEventId));
      const row = await tx.venueSpace.update({
        where: { id },
        data: {
          ...(input.weddingEventId
            ? { weddingEventId: string(input.weddingEventId) }
            : {}),
          ...(input.name ? { name: string(input.name) } : {}),
          ...(input.description !== undefined
            ? { description: nullableString(input.description) }
            : {}),
          ...(input.locationName !== undefined
            ? { locationName: nullableString(input.locationName) }
            : {}),
          ...(input.widthUnits !== undefined
            ? { widthUnits: number(input.widthUnits) }
            : {}),
          ...(input.heightUnits !== undefined
            ? { heightUnits: number(input.heightUnits) }
            : {}),
          ...(input.unit
            ? {
                unit: dbEnum(input.unit) as
                  "METERS" | "CENTIMETERS" | "ARBITRARY_GRID",
              }
            : {}),
          ...(input.capacity !== undefined
            ? { capacity: nullableNumber(input.capacity) }
            : {}),
          ...(input.backgroundImageUrl !== undefined
            ? { backgroundImageUrl: nullableString(input.backgroundImageUrl) }
            : {}),
          ...(input.status
            ? {
                status: dbEnum(input.status) as "DRAFT" | "ACTIVE" | "ARCHIVED",
              }
            : {}),
          version: { increment: 1 },
        },
      });
      return resource(row);
    });
  }

  async deleteVenueSpace(
    userId: string,
    workspaceId: string,
    id: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await this.requireVenue(tx, workspaceId, id);
      assertVersion(current.version, version);
      const used = await tx.seatingPlan.count({
        where: { workspaceId, venueSpaceId: id, deletedAt: null },
      });
      if (used) conflict("Spațiul este utilizat de un plan de mese.");
      await tx.venueSpace.update({
        where: { id },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { deleted: true, id };
    });
  }

  async seatingPlans(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.seatingPlan.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
      });
      return {
        items: await Promise.all(
          rows.map(async (plan) => ({
            ...resource(plan),
            tableCount: await tx.seatingTable.count({
              where: { seatingPlanId: plan.id, deletedAt: null },
            }),
            assignmentCount: await tx.guestSeatingAssignment.count({
              where: {
                seatingPlanId: plan.id,
                status: { in: ["ACTIVE", "CONFLICT"] },
              },
            }),
            openIssueCount: await tx.seatingIssue.count({
              where: {
                seatingPlanId: plan.id,
                status: { in: ["OPEN", "ACKNOWLEDGED"] },
              },
            }),
          })),
        ),
      };
    });
  }

  async seatingPlan(
    userId: string,
    workspaceId: string,
    planId: string,
    includeSensitive = false,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.recomputeSeatingIssues(tx, workspaceId, planId);
      return this.seatingPlanResource(
        tx,
        workspaceId,
        planId,
        includeSensitive,
      );
    });
  }

  async createSeatingPlan(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "seating.plan.create",
          key,
          input,
        );
        if (replay) return replay;
        const event = await this.requireEvent(
          tx,
          workspaceId,
          string(input.weddingEventId),
        );
        if (event.status === "CANCELLED")
          validation("Evenimentul este anulat.");
        const space = await this.requireVenue(
          tx,
          workspaceId,
          string(input.venueSpaceId),
        );
        if (space.weddingEventId !== event.id)
          validation(
            "Spațiul și planul trebuie să aparțină aceluiași eveniment.",
          );
        const plan = await tx.seatingPlan.create({
          data: {
            workspaceId,
            weddingEventId: event.id,
            venueSpaceId: space.id,
            name: string(input.name),
            createdById: userId,
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "seating.plan_created.v1",
          aggregateType: "SeatingPlan",
          aggregateId: plan.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `seating-plan-created:${plan.id}`,
          payload: {
            subject: { planId: plan.id, weddingEventId: event.id },
            activity: {
              category: "seating",
              action: "plan_created",
              summary: `Planul de mese ${plan.name} a fost creat.`,
              entityType: "SeatingPlan",
              entityId: plan.id,
            },
          },
        });
        const response = resource(plan);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "seating.plan.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateSeatingPlan(
    userId: string,
    workspaceId: string,
    planId: string,
    version: number,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await this.requireSeatingPlan(tx, workspaceId, planId);
        assertVersion(current.version, version);
        if (input.venueSpaceId) {
          const space = await this.requireVenue(
            tx,
            workspaceId,
            string(input.venueSpaceId),
          );
          if (space.weddingEventId !== current.weddingEventId)
            validation("Spațiul aparține altui eveniment.");
        }
        const plan = await tx.seatingPlan.update({
          where: { id: planId },
          data: {
            ...(input.name ? { name: string(input.name) } : {}),
            ...(input.venueSpaceId
              ? { venueSpaceId: string(input.venueSpaceId) }
              : {}),
            ...(input.status
              ? {
                  status: dbEnum(input.status) as
                    "DRAFT" | "READY" | "ARCHIVED",
                }
              : {}),
            activeSnapshotId: null,
            version: { increment: 1 },
          },
        });
        await this.recordSimple(tx, {
          eventName: "seating.plan_updated.v1",
          aggregateType: "SeatingPlan",
          aggregateId: plan.id,
          aggregateVersion: plan.version,
          workspaceId,
          userId,
          correlationId,
          summary: `Planul de mese ${plan.name} a fost actualizat.`,
          category: "seating",
          action: "plan_updated",
        });
        return resource(plan);
      },
    );
  }

  async deleteSeatingPlan(
    userId: string,
    workspaceId: string,
    planId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
      assertVersion(plan.version, version);
      if (plan.status === "PUBLISHED")
        conflict("Planul publicat trebuie retras înainte de arhivare.");
      await tx.seatingPlan.update({
        where: { id: planId },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { deleted: true, id: planId };
    });
  }

  async createTable(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `seating.table.create:${planId}`,
          key,
          input,
        );
        if (replay) return replay;
        const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
        const capacity = number(input.capacity);
        const minimumCapacity = nullableNumber(input.minimumCapacity);
        if (minimumCapacity !== null && minimumCapacity > capacity)
          validation(
            "Capacitatea minimă recomandată nu poate depăși capacitatea mesei.",
          );
        const table = await tx.seatingTable.create({
          data: {
            workspaceId,
            seatingPlanId: planId,
            name: string(input.name),
            label: string(input.label),
            shape: dbEnum(input.shape) as
              "ROUND" | "RECTANGLE" | "OVAL" | "SQUARE" | "CUSTOM",
            capacity,
            minimumCapacity,
            x: number(input.x),
            y: number(input.y),
            width: number(input.width),
            height: number(input.height),
            rotation: number(input.rotation ?? 0),
            position: number(input.position ?? 0),
            zone: nullableString(input.zone),
            notesPrivate: nullableString(input.notesPrivate),
            locked: boolean(input.locked),
          },
        });
        const seats = array(input.seats);
        if (seats.length > table.capacity)
          validation("Numărul locurilor depășește capacitatea mesei.");
        if (seats.length)
          await tx.seatingSeat.createMany({
            data: seats.map((seatValue, index) => {
              const seat = record(seatValue);
              return {
                workspaceId,
                tableId: table.id,
                label: string(seat.label),
                position: number(seat.position ?? index),
                x: nullableNumber(seat.x),
                y: nullableNumber(seat.y),
                rotation: nullableNumber(seat.rotation),
                accessible: boolean(seat.accessible),
                status: dbEnum(seat.status ?? "available") as
                  "AVAILABLE" | "BLOCKED" | "RESERVED",
              };
            }),
          });
        const updatedPlan = await tx.seatingPlan.update({
          where: { id: plan.id },
          data: { activeSnapshotId: null, version: { increment: 1 } },
        });
        await this.recordSimple(tx, {
          eventName: "seating.plan_updated.v1",
          aggregateType: "SeatingTable",
          aggregateId: table.id,
          aggregateVersion: table.version,
          workspaceId,
          userId,
          correlationId,
          summary: `Masa ${table.label} a fost adăugată.`,
          category: "seating",
          action: "table_created",
          subject: { planId, planVersion: updatedPlan.version },
        });
        const response = resource(table);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `seating.table.create:${planId}`,
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateTable(
    userId: string,
    workspaceId: string,
    planId: string,
    tableId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requireSeatingPlan(tx, workspaceId, planId);
      const current = await tx.seatingTable.findFirst({
        where: {
          id: tableId,
          workspaceId,
          seatingPlanId: planId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Masa nu există.");
      assertVersion(current.version, version);
      const capacity =
        input.capacity === undefined
          ? current.capacity
          : number(input.capacity);
      const minimumCapacity =
        input.minimumCapacity === undefined
          ? current.minimumCapacity
          : nullableNumber(input.minimumCapacity);
      if (minimumCapacity !== null && minimumCapacity > capacity)
        validation(
          "Capacitatea minimă recomandată nu poate depăși capacitatea mesei.",
        );
      const assigned = await tx.guestSeatingAssignment.count({
        where: {
          seatingTableId: tableId,
          status: { in: ["ACTIVE", "CONFLICT"] },
        },
      });
      if (capacity < assigned)
        validation(
          "Capacitatea nu poate fi mai mică decât numărul invitaților alocați.",
        );
      const table = await tx.seatingTable.update({
        where: { id: tableId },
        data: {
          ...(input.name ? { name: string(input.name) } : {}),
          ...(input.label ? { label: string(input.label) } : {}),
          ...(input.shape
            ? {
                shape: dbEnum(input.shape) as
                  "ROUND" | "RECTANGLE" | "OVAL" | "SQUARE" | "CUSTOM",
              }
            : {}),
          ...(input.capacity !== undefined ? { capacity } : {}),
          ...(input.minimumCapacity !== undefined ? { minimumCapacity } : {}),
          ...(input.x !== undefined ? { x: number(input.x) } : {}),
          ...(input.y !== undefined ? { y: number(input.y) } : {}),
          ...(input.width !== undefined ? { width: number(input.width) } : {}),
          ...(input.height !== undefined
            ? { height: number(input.height) }
            : {}),
          ...(input.rotation !== undefined
            ? { rotation: number(input.rotation) }
            : {}),
          ...(input.position !== undefined
            ? { position: number(input.position) }
            : {}),
          ...(input.zone !== undefined
            ? { zone: nullableString(input.zone) }
            : {}),
          ...(input.notesPrivate !== undefined
            ? { notesPrivate: nullableString(input.notesPrivate) }
            : {}),
          ...(input.locked !== undefined
            ? { locked: boolean(input.locked) }
            : {}),
          version: { increment: 1 },
        },
      });
      if (input.capacity !== undefined) {
        const seats = await tx.seatingSeat.findMany({
          where: { workspaceId, tableId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        });
        if (capacity > seats.length) {
          const usedLabels = new Set(seats.map((seat) => seat.label));
          const nextSeats: Array<{
            workspaceId: string;
            tableId: string;
            label: string;
            position: number;
          }> = [];
          let nextLabel = 1;
          let nextPosition =
            seats.reduce(
              (maximum, seat) => Math.max(maximum, seat.position),
              -1,
            ) + 1;
          while (nextSeats.length < capacity - seats.length) {
            const label = String(nextLabel);
            nextLabel += 1;
            if (usedLabels.has(label)) continue;
            usedLabels.add(label);
            nextSeats.push({
              workspaceId,
              tableId,
              label,
              position: nextPosition,
            });
            nextPosition += 1;
          }
          await tx.seatingSeat.createMany({ data: nextSeats });
        } else if (capacity < seats.length) {
          const assignedSeatIds = new Set(
            (
              await tx.guestSeatingAssignment.findMany({
                where: {
                  workspaceId,
                  seatingTableId: tableId,
                  seatingSeatId: { not: null },
                  status: { in: ["ACTIVE", "CONFLICT"] },
                },
                select: { seatingSeatId: true },
              })
            )
              .map((assignment) => assignment.seatingSeatId)
              .filter((id): id is string => Boolean(id)),
          );
          const removable = [...seats]
            .reverse()
            .filter((seat) => !assignedSeatIds.has(seat.id))
            .slice(0, seats.length - capacity);
          if (removable.length < seats.length - capacity)
            validation(
              "Eliberează locurile exacte ocupate înainte de a micșora capacitatea mesei.",
            );
          await tx.seatingSeat.deleteMany({
            where: { id: { in: removable.map((seat) => seat.id) } },
          });
        }
      }
      await tx.seatingPlan.update({
        where: { id: planId },
        data: { activeSnapshotId: null, version: { increment: 1 } },
      });
      return resource(table);
    });
  }

  async deleteTable(
    userId: string,
    workspaceId: string,
    planId: string,
    tableId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const table = await tx.seatingTable.findFirst({
        where: {
          id: tableId,
          workspaceId,
          seatingPlanId: planId,
          deletedAt: null,
        },
      });
      if (!table) notFound("Masa nu există.");
      assertVersion(table.version, version);
      const assignments = await tx.guestSeatingAssignment.count({
        where: {
          seatingTableId: tableId,
          status: { in: ["ACTIVE", "CONFLICT"] },
        },
      });
      if (assignments)
        conflict("Elimină mai întâi invitații alocați acestei mese.");
      await tx.seatingTable.update({
        where: { id: tableId },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await tx.seatingPlan.update({
        where: { id: planId },
        data: { activeSnapshotId: null, version: { increment: 1 } },
      });
      return { deleted: true, id: tableId };
    });
  }

  async updateSeat(
    userId: string,
    workspaceId: string,
    planId: string,
    tableId: string,
    seatId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requireSeatingPlan(tx, workspaceId, planId);
      const current = await tx.seatingSeat.findFirst({
        where: { id: seatId, workspaceId, tableId },
      });
      if (!current) notFound("Locul nu există.");
      assertVersion(current.version, version);
      if (dbEnum(input.status ?? current.status) !== "AVAILABLE") {
        const assigned = await tx.guestSeatingAssignment.count({
          where: {
            seatingSeatId: seatId,
            status: { in: ["ACTIVE", "CONFLICT"] },
          },
        });
        if (assigned) conflict("Un loc ocupat nu poate fi blocat.");
      }
      const seat = await tx.seatingSeat.update({
        where: { id: seatId },
        data: {
          ...(input.label ? { label: string(input.label) } : {}),
          ...(input.position !== undefined
            ? { position: number(input.position) }
            : {}),
          ...(input.x !== undefined ? { x: nullableNumber(input.x) } : {}),
          ...(input.y !== undefined ? { y: nullableNumber(input.y) } : {}),
          ...(input.rotation !== undefined
            ? { rotation: nullableNumber(input.rotation) }
            : {}),
          ...(input.accessible !== undefined
            ? { accessible: boolean(input.accessible) }
            : {}),
          ...(input.status
            ? {
                status: dbEnum(input.status) as
                  "AVAILABLE" | "BLOCKED" | "RESERVED",
              }
            : {}),
          version: { increment: 1 },
        },
      });
      await tx.seatingPlan.update({
        where: { id: planId },
        data: { activeSnapshotId: null, version: { increment: 1 } },
      });
      return resource(seat);
    });
  }

  async replaceSeatingAssignments(
    userId: string,
    workspaceId: string,
    planId: string,
    planVersion: number,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `seating.assign:${planId}`,
          key,
          { planVersion, ...input },
        );
        if (replay) return replay;
        const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
        assertVersion(plan.version, planVersion);
        const result = await this.applySeatingBatch(
          tx,
          workspaceId,
          plan,
          userId,
          input,
        );
        const updated = await tx.seatingPlan.update({
          where: { id: planId },
          data: { activeSnapshotId: null, version: { increment: 1 } },
        });
        await this.recomputeSeatingIssues(tx, workspaceId, planId);
        await this.asyncEvents.record(tx, {
          eventName: "seating.assignment_changed.v1",
          aggregateType: "SeatingPlan",
          aggregateId: planId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `seating-assign:${planId}:v${updated.version}`,
          payload: {
            subject: { planId, changed: result.changed },
            seatingIssueProjection: { planId },
            activity: {
              category: "seating",
              action: "assignments_changed",
              summary: `${result.changed} alocări la mese au fost actualizate.`,
              entityType: "SeatingPlan",
              entityId: planId,
            },
          },
        });
        const response = { ...result, version: updated.version };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `seating.assign:${planId}`,
          key,
          { planVersion, ...input },
          response,
        );
        return response;
      },
    );
  }

  async removeSeatingAssignment(
    userId: string,
    workspaceId: string,
    planId: string,
    assignmentId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const assignment = await tx.guestSeatingAssignment.findFirst({
        where: {
          id: assignmentId,
          workspaceId,
          seatingPlanId: planId,
          status: { in: ["ACTIVE", "CONFLICT"] },
        },
      });
      if (!assignment) notFound("Alocarea nu există.");
      assertVersion(assignment.version, version);
      await tx.guestSeatingAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "REMOVED",
          removedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const plan = await tx.seatingPlan.update({
        where: { id: planId },
        data: { activeSnapshotId: null, version: { increment: 1 } },
      });
      await this.recomputeSeatingIssues(tx, workspaceId, planId);
      return { removed: true, version: plan.version };
    });
  }

  async seatingConstraints(
    userId: string,
    workspaceId: string,
    planId: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.seatingConstraint.findMany({
          where: { workspaceId, seatingPlanId: planId, deletedAt: null },
          orderBy: { createdAt: "asc" },
        })
      ).map(resource),
    }));
  }

  async createConstraint(
    userId: string,
    workspaceId: string,
    planId: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requireSeatingPlan(tx, workspaceId, planId);
      await this.validateConstraintReferences(tx, workspaceId, planId, input);
      const candidate = constraintInput(input);
      const existing = await tx.seatingConstraint.findMany({
        where: { workspaceId, seatingPlanId: planId, deletedAt: null },
      });
      const conflicts = contradictorySeatingConstraints([
        ...existing.map(ruleConstraint),
        ruleConstraint(candidate),
      ]);
      if (conflicts.length)
        validation("Constrângerea contrazice o regulă existentă.");
      const row = await tx.seatingConstraint.create({
        data: {
          workspaceId,
          seatingPlanId: planId,
          createdById: userId,
          ...candidate,
        },
      });
      await tx.seatingPlan.update({
        where: { id: planId },
        data: { activeSnapshotId: null, version: { increment: 1 } },
      });
      return resource(row);
    });
  }

  async updateConstraint(
    userId: string,
    workspaceId: string,
    planId: string,
    constraintId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.seatingConstraint.findFirst({
        where: {
          id: constraintId,
          workspaceId,
          seatingPlanId: planId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Constrângerea nu există.");
      assertVersion(current.version, version);
      const merged = constraintInput({ ...resource(current), ...input });
      await this.validateConstraintReferences(tx, workspaceId, planId, merged);
      const others = await tx.seatingConstraint.findMany({
        where: {
          workspaceId,
          seatingPlanId: planId,
          deletedAt: null,
          id: { not: constraintId },
        },
      });
      if (
        contradictorySeatingConstraints([
          ...others.map(ruleConstraint),
          ruleConstraint(merged),
        ]).length
      )
        validation("Constrângerea contrazice o regulă existentă.");
      const row = await tx.seatingConstraint.update({
        where: { id: constraintId },
        data: { ...merged, version: { increment: 1 } },
      });
      await tx.seatingPlan.update({
        where: { id: planId },
        data: { activeSnapshotId: null, version: { increment: 1 } },
      });
      return resource(row);
    });
  }

  async deleteConstraint(
    userId: string,
    workspaceId: string,
    planId: string,
    constraintId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.seatingConstraint.findFirst({
        where: {
          id: constraintId,
          workspaceId,
          seatingPlanId: planId,
          deletedAt: null,
        },
      });
      if (!row) notFound("Constrângerea nu există.");
      assertVersion(row.version, version);
      await tx.seatingConstraint.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await tx.seatingPlan.update({
        where: { id: planId },
        data: { activeSnapshotId: null, version: { increment: 1 } },
      });
      return { deleted: true, id: constraintId };
    });
  }

  async seatingIssues(userId: string, workspaceId: string, planId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.recomputeSeatingIssues(tx, workspaceId, planId);
      return {
        items: (
          await tx.seatingIssue.findMany({
            where: { workspaceId, seatingPlanId: planId },
            orderBy: [
              { status: "asc" },
              { severity: "desc" },
              { createdAt: "asc" },
            ],
          })
        ).map(resource),
      };
    });
  }

  async resolveSeatingIssue(
    userId: string,
    workspaceId: string,
    planId: string,
    issueId: string,
    version: number,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const issue = await tx.seatingIssue.findFirst({
          where: { id: issueId, workspaceId, seatingPlanId: planId },
        });
        if (!issue) notFound("Conflictul nu există.");
        assertVersion(issue.version, version);
        const row = await tx.seatingIssue.update({
          where: { id: issue.id },
          data: {
            status: dbEnum(input.status) as
              "ACKNOWLEDGED" | "RESOLVED" | "IGNORED_WITH_REASON",
            resolutionNote: string(input.reason),
            resolvedById: userId,
            resolvedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.recordSimple(tx, {
          eventName: "seating.issue_resolved.v1",
          aggregateType: "SeatingIssue",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          userId,
          correlationId,
          summary: "Un conflict de seating a fost revizuit.",
          category: "seating",
          action: "issue_resolved",
        });
        return resource(row);
      },
    );
  }

  async requestSeatingSuggestion(
    userId: string,
    workspaceId: string,
    planId: string,
    planVersion: number,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const request = { planVersion, ...input };
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `seating.suggest:${planId}`,
          key,
          request,
        );
        if (replay) return replay;
        const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
        assertVersion(plan.version, planVersion);
        const runId = randomUUID();
        const inputHash = await this.seatingInputHash(tx, workspaceId, planId);
        const jobId = await this.asyncEvents.record(tx, {
          eventName: "seating.suggestion_requested.v1",
          aggregateType: "SeatingSuggestionRun",
          aggregateId: runId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `seating-suggestion:${planId}:${inputHash}`,
          userVisibleJob: true,
          payload: {
            subject: { planId, runId, inputHash },
            seatingSuggestion: { runId },
            activity: {
              category: "seating",
              action: "suggestion_requested",
              summary: "A fost solicitată o propunere deterministă de seating.",
              entityType: "SeatingPlan",
              entityId: planId,
            },
          },
        });
        if (!jobId) throw new Error("Seating suggestion job missing");
        const run = await tx.seatingSuggestionRun.create({
          data: {
            id: runId,
            workspaceId,
            seatingPlanId: planId,
            backgroundJobId: jobId,
            rulesVersion: SEATING_RULES_VERSION,
            inputHash,
            createdById: userId,
          },
        });
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        const response = { runId: run.id, job: mapJob(job) };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `seating.suggest:${planId}`,
          key,
          request,
          response,
        );
        return response;
      },
    );
  }

  async seatingSuggestion(
    userId: string,
    workspaceId: string,
    planId: string,
    suggestionId: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const suggestion = await tx.seatingSuggestion.findFirst({
        where: { id: suggestionId, workspaceId, seatingPlanId: planId },
      });
      if (!suggestion) notFound("Propunerea nu există.");
      const assignments = await tx.seatingSuggestionAssignment.findMany({
        where: { workspaceId, suggestionId },
        orderBy: { position: "asc" },
      });
      return {
        ...resource(suggestion),
        assignments: assignments.map(resource),
      };
    });
  }

  async applySeatingSuggestion(
    userId: string,
    workspaceId: string,
    planId: string,
    suggestionId: string,
    version: number,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const request = { suggestionId, version, ...input };
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `seating.suggestion.apply:${suggestionId}`,
          key,
          request,
        );
        if (replay) return replay;
        const suggestion = await tx.seatingSuggestion.findFirst({
          where: { id: suggestionId, workspaceId, seatingPlanId: planId },
        });
        if (!suggestion) notFound("Propunerea nu există.");
        assertVersion(suggestion.version, version);
        if (suggestion.status === "APPLIED")
          conflict("Propunerea a fost deja aplicată.");
        if (suggestion.status !== "READY_FOR_REVIEW")
          conflict("Propunerea nu este pregătită pentru aplicare.");
        const conflicts = array(suggestion.hardConflicts);
        if (conflicts.length && !boolean(input.confirmConflicts))
          validation("Propunerea are conflicte care necesită confirmare.");
        const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
        const proposed = await tx.seatingSuggestionAssignment.findMany({
          where: { workspaceId, suggestionId },
          orderBy: { position: "asc" },
        });
        const batch: Input = {
          assignments: proposed.map((assignment) => ({
            guestId: assignment.guestId,
            tableId: assignment.tableId,
            seatId: assignment.seatId,
            source: "suggestion",
          })),
          removeAssignmentIds: [],
        };
        if (boolean(input.replaceUnlockedAssignments)) {
          const existing = await tx.guestSeatingAssignment.findMany({
            where: {
              workspaceId,
              seatingPlanId: planId,
              status: { in: ["ACTIVE", "CONFLICT"] },
              locked: false,
            },
          });
          batch.removeAssignmentIds = existing.map(
            (assignment) => assignment.id,
          );
        }
        const applied = await this.applySeatingBatch(
          tx,
          workspaceId,
          plan,
          userId,
          batch,
        );
        const updatedSuggestion = await tx.seatingSuggestion.update({
          where: { id: suggestion.id },
          data: {
            status: "APPLIED",
            appliedAt: new Date(),
            version: { increment: 1 },
          },
        });
        const updatedPlan = await tx.seatingPlan.update({
          where: { id: planId },
          data: { activeSnapshotId: null, version: { increment: 1 } },
        });
        await this.recomputeSeatingIssues(tx, workspaceId, planId);
        await this.recordSimple(tx, {
          eventName: "seating.suggestion_applied.v1",
          aggregateType: "SeatingSuggestion",
          aggregateId: suggestion.id,
          aggregateVersion: updatedSuggestion.version,
          workspaceId,
          userId,
          correlationId,
          summary: `${applied.changed} invitați au fost alocați prin propunerea deterministă.`,
          category: "seating",
          action: "suggestion_applied",
          subject: { planId, planVersion: updatedPlan.version },
        });
        const response = {
          applied: applied.changed,
          planVersion: updatedPlan.version,
          suggestionVersion: updatedSuggestion.version,
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `seating.suggestion.apply:${suggestionId}`,
          key,
          request,
          response,
        );
        return response;
      },
    );
  }

  async publishSeating(
    userId: string,
    workspaceId: string,
    planId: string,
    version: number,
    key: string,
    reason: string | null,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const request = { planId, version, reason };
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `seating.publish:${planId}`,
          key,
          request,
        );
        if (replay) return replay;
        const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
        assertVersion(plan.version, version);
        await this.recomputeSeatingIssues(tx, workspaceId, planId);
        const critical = await tx.seatingIssue.findMany({
          where: {
            workspaceId,
            seatingPlanId: planId,
            severity: "CRITICAL",
            status: { in: ["OPEN", "ACKNOWLEDGED"] },
          },
        });
        if (critical.length && !reason)
          validation(
            "Conflictele critice trebuie rezolvate sau publicarea trebuie justificată.",
          );
        const tables = await tx.seatingTable.findMany({
          where: { workspaceId, seatingPlanId: planId, deletedAt: null },
          orderBy: { position: "asc" },
        });
        if (!tables.length) validation("Planul nu conține mese.");
        const seats = await tx.seatingSeat.findMany({
          where: {
            workspaceId,
            tableId: { in: tables.map((table) => table.id) },
          },
          orderBy: { position: "asc" },
        });
        const assignments = await tx.guestSeatingAssignment.findMany({
          where: {
            workspaceId,
            seatingPlanId: planId,
            status: { in: ["ACTIVE", "CONFLICT"] },
          },
          orderBy: { guestId: "asc" },
        });
        const versionNumber =
          (
            await tx.seatingPlanSnapshot.aggregate({
              where: { seatingPlanId: planId },
              _max: { versionNumber: true },
            })
          )._max.versionNumber ?? 0;
        const layout = {
          tables: tables.map(resource),
          seats: seats.map(resource),
          assignments: assignments.map(resource),
          overrideReason: reason,
        };
        const snapshot = await tx.seatingPlanSnapshot.create({
          data: {
            workspaceId,
            seatingPlanId: planId,
            versionNumber: versionNumber + 1,
            layoutDocument: layout as Prisma.InputJsonValue,
            assignmentHash: stableHash(
              assignments.map((assignment) => [
                assignment.guestId,
                assignment.seatingTableId,
                assignment.seatingSeatId,
              ]),
            ),
            guestCount: assignments.length,
            tableCount: tables.length,
            seatCount: seats.length,
            createdById: userId,
            publishedAt: new Date(),
          },
        });
        const updated = await tx.seatingPlan.update({
          where: { id: planId },
          data: {
            status: "PUBLISHED",
            activeSnapshotId: snapshot.id,
            publishedSnapshotId: snapshot.id,
            version: { increment: 1 },
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "seating.plan_published.v1",
          aggregateType: "SeatingPlan",
          aggregateId: planId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `seating-published:${planId}:snapshot:${snapshot.id}`,
          payload: {
            subject: {
              planId,
              snapshotId: snapshot.id,
              guestCount: snapshot.guestCount,
            },
            notification: {
              recipientUserId: userId,
              module: "seating",
              kind: "plan_published",
              priority: "normal",
              title: "Planul de mese a fost publicat",
              body: `${snapshot.guestCount} invitați pot vedea acum masa alocată.`,
              actionUrl: `/seating?plan=${planId}`,
            },
            activity: {
              category: "seating",
              action: "plan_published",
              summary: `Planul de mese a fost publicat pentru ${snapshot.guestCount} invitați.`,
              entityType: "SeatingPlan",
              entityId: planId,
            },
          },
        });
        const response = {
          plan: resource(updated),
          snapshot: resource(snapshot),
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `seating.publish:${planId}`,
          key,
          request,
          response,
        );
        return response;
      },
    );
  }

  async unpublishSeating(
    userId: string,
    workspaceId: string,
    planId: string,
    version: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
        assertVersion(plan.version, version);
        const row = await tx.seatingPlan.update({
          where: { id: planId },
          data: {
            status: "READY",
            publishedSnapshotId: null,
            version: { increment: 1 },
          },
        });
        await this.recordSimple(tx, {
          eventName: "seating.plan_updated.v1",
          aggregateType: "SeatingPlan",
          aggregateId: planId,
          aggregateVersion: row.version,
          workspaceId,
          userId,
          correlationId,
          summary: "Planul de mese a fost retras din Guest Companion.",
          category: "seating",
          action: "plan_unpublished",
        });
        return resource(row);
      },
    );
  }

  async exportSeating(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
    correlationId: string,
    canReadSensitive: boolean,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `seating.export:${planId}`,
          key,
          input,
        );
        if (replay) return replay;
        await this.requireSeatingPlan(tx, workspaceId, planId);
        const includeSensitive = boolean(input.includeSensitive);
        if (includeSensitive && !canReadSensitive)
          forbidden("Nu ai acces la sumarul alimentar protejat.");
        if (string(input.kind) === "catering_summary" && !canReadSensitive)
          forbidden("Exportul catering necesită acces sensibil.");
        const artifactId = randomUUID();
        const jobId = await this.asyncEvents.record(tx, {
          eventName: "seating.export_requested.v1",
          aggregateType: "SeatingPlan",
          aggregateId: planId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `seating-export:${planId}:${key}`,
          userVisibleJob: true,
          payload: {
            subject: { planId, artifactId },
            seatingExport: {
              artifactId,
              planId,
              requestedByUserId: userId,
              format: string(input.format),
              kind: string(input.kind),
              includeSensitive,
            },
          },
        });
        if (!jobId) throw new Error("Seating export job missing");
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        const response = { artifactId, job: mapJob(job) };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `seating.export:${planId}`,
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  // Transport and accommodation methods follow the same aggregate boundaries.
  async transportRequests(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.refreshOperationalRequests(tx, workspaceId);
      const rows = await tx.transportRequest.findMany({
        where: { workspaceId },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      });
      const [guests, households, events] = await Promise.all([
        tx.guest.findMany({
          where: { workspaceId, id: { in: rows.map((row) => row.guestId) } },
          select: { id: true, firstName: true, lastName: true },
        }),
        tx.household.findMany({
          where: {
            workspaceId,
            id: {
              in: rows
                .map((row) => row.householdId)
                .filter((id): id is string => Boolean(id)),
            },
          },
          select: { id: true, name: true },
        }),
        tx.weddingEvent.findMany({
          where: {
            workspaceId,
            id: { in: rows.map((row) => row.weddingEventId) },
          },
          select: { id: true, title: true },
        }),
      ]);
      const guestNames = new Map(
        guests.map((guest) => [
          guest.id,
          [guest.firstName, guest.lastName].filter(Boolean).join(" "),
        ]),
      );
      const householdNames = new Map(
        households.map((household) => [household.id, household.name]),
      );
      const eventTitles = new Map(
        events.map((event) => [event.id, event.title]),
      );
      return {
        items: rows.map((row) => ({
          ...resource(row),
          guestName: guestNames.get(row.guestId) ?? "Invitat fără nume",
          householdName: row.householdId
            ? (householdNames.get(row.householdId) ?? null)
            : null,
          eventTitle:
            eventTitles.get(row.weddingEventId) ?? "Eveniment fără titlu",
        })),
      };
    });
  }

  async updateTransportRequest(
    userId: string,
    workspaceId: string,
    requestId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.transportRequest.findFirst({
        where: { id: requestId, workspaceId },
      });
      if (!current) notFound("Cererea de transport nu există.");
      assertVersion(current.version, version);
      const row = await tx.transportRequest.update({
        where: { id: requestId },
        data: {
          ...(input.requested !== undefined
            ? { requested: boolean(input.requested) }
            : {}),
          ...(input.pickupArea !== undefined
            ? { pickupArea: nullableString(input.pickupArea) }
            : {}),
          ...(input.pickupAddress !== undefined
            ? {
                pickupAddressEncrypted: encryptSensitive(
                  nullableString(input.pickupAddress),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.specialRequirements !== undefined
            ? {
                specialRequirementsEncrypted: encryptSensitive(
                  nullableString(input.specialRequirements),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.status
            ? {
                status: dbEnum(input.status) as
                  "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED",
              }
            : {}),
          organizerOverride: true,
          organizerOverrideReason: string(input.overrideReason),
          version: { increment: 1 },
        },
      });
      return resource(row);
    });
  }

  async transportPlans(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.transportPlan.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: { updatedAt: "desc" },
        })
      ).map(resource),
    }));
  }

  async transportPlan(userId: string, workspaceId: string, planId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) =>
      this.transportPlanResource(tx, workspaceId, planId),
    );
  }

  async createTransportPlan(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "transport.plan.create",
          key,
          input,
        );
        if (replay) return replay;
        await this.requireEvent(tx, workspaceId, string(input.weddingEventId));
        const row = await tx.transportPlan.create({
          data: {
            workspaceId,
            weddingEventId: string(input.weddingEventId),
            name: string(input.name),
            createdById: userId,
          },
        });
        await this.recordSimple(tx, {
          eventName: "transport.plan_created.v1",
          aggregateType: "TransportPlan",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          userId,
          correlationId,
          summary: `Planul de transport ${row.name} a fost creat.`,
          category: "transport",
          action: "plan_created",
        });
        const response = resource(row);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "transport.plan.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateTransportPlan(
    userId: string,
    workspaceId: string,
    planId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await this.requireTransportPlan(tx, workspaceId, planId);
      assertVersion(current.version, version);
      const row = await tx.transportPlan.update({
        where: { id: planId },
        data: {
          ...(input.name ? { name: string(input.name) } : {}),
          ...(input.status
            ? {
                status: dbEnum(input.status) as
                  "DRAFT" | "READY" | "COMPLETED" | "ARCHIVED",
              }
            : {}),
          version: { increment: 1 },
        },
      });
      return resource(row);
    });
  }

  async deleteTransportPlan(
    userId: string,
    workspaceId: string,
    planId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await this.requireTransportPlan(tx, workspaceId, planId);
      assertVersion(current.version, version);
      if (current.status === "PUBLISHED")
        conflict("Planul publicat nu poate fi arhivat.");
      await tx.transportPlan.update({
        where: { id: planId },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { deleted: true, id: planId };
    });
  }

  async createVehicle(
    userId: string,
    workspaceId: string,
    planId: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requireTransportPlan(tx, workspaceId, planId);
      const capacity = number(input.capacity);
      const accessibleCapacity = number(input.accessibleCapacity ?? 0);
      if (accessibleCapacity > capacity)
        validation("Capacitatea accesibilă depășește capacitatea vehiculului.");
      return resource(
        await tx.transportVehicle.create({
          data: {
            workspaceId,
            transportPlanId: planId,
            name: string(input.name),
            vehicleType: dbEnum(input.vehicleType) as
              "BUS" | "MINIBUS" | "VAN" | "CAR" | "SHUTTLE" | "OTHER",
            capacity,
            accessibleCapacity,
            registrationLabel: nullableString(input.registrationLabel),
            driverName: nullableString(input.driverName),
            driverPhoneEncrypted: encryptSensitive(
              nullableString(input.driverPhone),
              this.sensitiveKey,
            ),
            notesPrivate: nullableString(input.notesPrivate),
          },
        }),
      );
    });
  }

  async updateVehicle(
    userId: string,
    workspaceId: string,
    planId: string,
    vehicleId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.transportVehicle.findFirst({
        where: {
          id: vehicleId,
          workspaceId,
          transportPlanId: planId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Vehiculul nu există.");
      assertVersion(current.version, version);
      const capacity =
        input.capacity === undefined
          ? current.capacity
          : number(input.capacity);
      const accessibleCapacity =
        input.accessibleCapacity === undefined
          ? current.accessibleCapacity
          : number(input.accessibleCapacity);
      if (accessibleCapacity > capacity)
        validation("Capacitatea accesibilă depășește capacitatea vehiculului.");
      const row = await tx.transportVehicle.update({
        where: { id: vehicleId },
        data: {
          ...(input.name ? { name: string(input.name) } : {}),
          ...(input.vehicleType
            ? {
                vehicleType: dbEnum(input.vehicleType) as
                  "BUS" | "MINIBUS" | "VAN" | "CAR" | "SHUTTLE" | "OTHER",
              }
            : {}),
          capacity,
          accessibleCapacity,
          ...(input.registrationLabel !== undefined
            ? { registrationLabel: nullableString(input.registrationLabel) }
            : {}),
          ...(input.driverName !== undefined
            ? { driverName: nullableString(input.driverName) }
            : {}),
          ...(input.driverPhone !== undefined
            ? {
                driverPhoneEncrypted: encryptSensitive(
                  nullableString(input.driverPhone),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.notesPrivate !== undefined
            ? { notesPrivate: nullableString(input.notesPrivate) }
            : {}),
          ...(input.status
            ? {
                status: dbEnum(input.status) as
                  "ACTIVE" | "INACTIVE" | "ARCHIVED",
              }
            : {}),
          version: { increment: 1 },
        },
      });
      return resource(row);
    });
  }

  async deleteVehicle(
    userId: string,
    workspaceId: string,
    planId: string,
    vehicleId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.transportVehicle.findFirst({
        where: {
          id: vehicleId,
          workspaceId,
          transportPlanId: planId,
          deletedAt: null,
        },
      });
      if (!row) notFound("Vehiculul nu există.");
      assertVersion(row.version, version);
      if (
        await tx.transportRoute.count({ where: { vehicleId, deletedAt: null } })
      )
        conflict("Vehiculul este folosit de o rută.");
      await tx.transportVehicle.update({
        where: { id: vehicleId },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { deleted: true, id: vehicleId };
    });
  }

  async transportStops(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.transportStop.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: { name: "asc" },
        })
      ).map(resource),
    }));
  }

  async createTransportStop(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "transport.stop.create",
        key,
        input,
      );
      if (replay) return replay;
      const row = await tx.transportStop.create({
        data: {
          workspaceId,
          name: string(input.name),
          address: string(input.address),
          latitude: nullableNumber(input.latitude),
          longitude: nullableNumber(input.longitude),
          instructions: nullableString(input.instructions),
          accessible: boolean(input.accessible),
        },
      });
      const response = resource(row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "transport.stop.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateTransportStop(
    userId: string,
    workspaceId: string,
    stopId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.transportStop.findFirst({
        where: { id: stopId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Oprirea nu există.");
      assertVersion(current.version, version);
      return resource(
        await tx.transportStop.update({
          where: { id: stopId },
          data: {
            ...(input.name ? { name: string(input.name) } : {}),
            ...(input.address ? { address: string(input.address) } : {}),
            ...(input.latitude !== undefined
              ? { latitude: nullableNumber(input.latitude) }
              : {}),
            ...(input.longitude !== undefined
              ? { longitude: nullableNumber(input.longitude) }
              : {}),
            ...(input.instructions !== undefined
              ? { instructions: nullableString(input.instructions) }
              : {}),
            ...(input.accessible !== undefined
              ? { accessible: boolean(input.accessible) }
              : {}),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async deleteTransportStop(
    userId: string,
    workspaceId: string,
    stopId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.transportStop.findFirst({
        where: { id: stopId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Oprirea nu există.");
      assertVersion(current.version, version);
      if (await tx.transportRouteStop.count({ where: { stopId } }))
        conflict("Oprirea este folosită de o rută.");
      await tx.transportStop.update({
        where: { id: stopId },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      return { deleted: true, id: stopId };
    });
  }

  async createRoute(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `transport.route.create:${planId}`,
          key,
          input,
        );
        if (replay) return replay;
        await this.requireTransportPlan(tx, workspaceId, planId);
        if (input.vehicleId)
          await this.requireVehicle(
            tx,
            workspaceId,
            planId,
            string(input.vehicleId),
          );
        const route = await tx.transportRoute.create({
          data: {
            workspaceId,
            transportPlanId: planId,
            vehicleId: nullableString(input.vehicleId),
            name: string(input.name),
            direction: dbEnum(input.direction) as
              "TO_EVENT" | "FROM_EVENT" | "ROUND_TRIP" | "CUSTOM",
            departureAt: date(input.departureAt),
            arrivalAt: nullableDate(input.arrivalAt),
            originName: string(input.originName),
            destinationName: string(input.destinationName),
            capacityOverride: nullableNumber(input.capacityOverride),
          },
        });
        await this.replaceRouteStops(
          tx,
          workspaceId,
          route.id,
          array(input.stops),
        );
        await this.recordSimple(tx, {
          eventName: "transport.route_created.v1",
          aggregateType: "TransportRoute",
          aggregateId: route.id,
          aggregateVersion: route.version,
          workspaceId,
          userId,
          correlationId,
          summary: `Ruta ${route.name} a fost creată.`,
          category: "transport",
          action: "route_created",
        });
        const response = resource(route);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `transport.route.create:${planId}`,
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateRoute(
    userId: string,
    workspaceId: string,
    planId: string,
    routeId: string,
    version: number,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await this.requireRoute(
          tx,
          workspaceId,
          planId,
          routeId,
        );
        assertVersion(current.version, version);
        if (input.vehicleId)
          await this.requireVehicle(
            tx,
            workspaceId,
            planId,
            string(input.vehicleId),
          );
        const row = await tx.transportRoute.update({
          where: { id: routeId },
          data: {
            ...(input.vehicleId !== undefined
              ? { vehicleId: nullableString(input.vehicleId) }
              : {}),
            ...(input.name ? { name: string(input.name) } : {}),
            ...(input.direction
              ? {
                  direction: dbEnum(input.direction) as
                    "TO_EVENT" | "FROM_EVENT" | "ROUND_TRIP" | "CUSTOM",
                }
              : {}),
            ...(input.departureAt
              ? { departureAt: date(input.departureAt) }
              : {}),
            ...(input.arrivalAt !== undefined
              ? { arrivalAt: nullableDate(input.arrivalAt) }
              : {}),
            ...(input.originName
              ? { originName: string(input.originName) }
              : {}),
            ...(input.destinationName
              ? { destinationName: string(input.destinationName) }
              : {}),
            ...(input.capacityOverride !== undefined
              ? { capacityOverride: nullableNumber(input.capacityOverride) }
              : {}),
            ...(input.status
              ? {
                  status: dbEnum(input.status) as
                    | "DRAFT"
                    | "CONFIRMED"
                    | "PUBLISHED"
                    | "COMPLETED"
                    | "CANCELLED",
                }
              : {}),
            version: { increment: 1 },
          },
        });
        if (input.stops)
          await this.replaceRouteStops(
            tx,
            workspaceId,
            routeId,
            array(input.stops),
          );
        await this.recordSimple(tx, {
          eventName: "transport.route_updated.v1",
          aggregateType: "TransportRoute",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          userId,
          correlationId,
          summary: `Ruta ${row.name} a fost actualizată.`,
          category: "transport",
          action: "route_updated",
        });
        return resource(row);
      },
    );
  }

  async deleteRoute(
    userId: string,
    workspaceId: string,
    planId: string,
    routeId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await this.requireRoute(tx, workspaceId, planId, routeId);
      assertVersion(row.version, version);
      if (
        await tx.guestTransportAssignment.count({
          where: { routeId, status: { in: ["ASSIGNED", "CONFIRMED"] } },
        })
      )
        conflict("Ruta are invitați alocați.");
      await tx.transportRoute.update({
        where: { id: routeId },
        data: {
          status: "CANCELLED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { deleted: true, id: routeId };
    });
  }

  async replaceTransportAssignments(
    userId: string,
    workspaceId: string,
    planId: string,
    version: number,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const request = { version, ...input };
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `transport.assign:${planId}`,
          key,
          request,
        );
        if (replay) return replay;
        const plan = await this.requireTransportPlan(tx, workspaceId, planId);
        assertVersion(plan.version, version);
        const planRouteIds = (
          await tx.transportRoute.findMany({
            where: { workspaceId, transportPlanId: planId },
            select: { id: true },
          })
        ).map((route) => route.id);
        for (const assignmentId of array(input.removeAssignmentIds).map(
          string,
        )) {
          await tx.guestTransportAssignment.updateMany({
            where: {
              id: assignmentId,
              workspaceId,
              routeId: { in: planRouteIds },
            },
            data: { status: "CANCELLED", version: { increment: 1 } },
          });
        }
        let changed = 0;
        for (const value of array(input.assignments)) {
          const assignment = record(value);
          const route = await this.requireRoute(
            tx,
            workspaceId,
            planId,
            string(assignment.routeId),
          );
          const guest = await this.requireGuest(
            tx,
            workspaceId,
            string(assignment.guestId),
          );
          const requestRow = assignment.requestId
            ? await tx.transportRequest.findFirst({
                where: {
                  id: string(assignment.requestId),
                  workspaceId,
                  guestId: guest.id,
                },
              })
            : null;
          if (!requestRow && !assignment.overrideReason)
            validation(
              "Invitatul nu are o cerere de transport; override-ul necesită motiv.",
            );
          if (requestRow && requestRow.weddingEventId !== plan.weddingEventId)
            validation(
              "Cererea de transport aparține altui eveniment decât planul selectat.",
            );
          const sameDirectionRouteIds = (
            await tx.transportRoute.findMany({
              where: {
                workspaceId,
                transportPlanId: planId,
                direction: route.direction,
                id: { not: route.id },
                deletedAt: null,
              },
              select: { id: true },
            })
          ).map((item) => item.id);
          if (
            sameDirectionRouteIds.length &&
            (await tx.guestTransportAssignment.count({
              where: {
                workspaceId,
                guestId: guest.id,
                routeId: { in: sameDirectionRouteIds },
                status: { in: ["ASSIGNED", "CONFIRMED"] },
              },
            }))
          )
            validation(
              "Invitatul este deja alocat pe o altă rută în aceeași direcție.",
            );
          await this.validateRouteCapacity(
            tx,
            workspaceId,
            route,
            guest,
            number(assignment.seatCount ?? 1),
          );
          const existing = await tx.guestTransportAssignment.findUnique({
            where: {
              routeId_guestId: { routeId: route.id, guestId: guest.id },
            },
          });
          if (existing)
            await tx.guestTransportAssignment.update({
              where: { id: existing.id },
              data: {
                transportRequestId: requestRow?.id,
                pickupStopId: nullableString(assignment.pickupStopId),
                dropoffStopId: nullableString(assignment.dropoffStopId),
                seatCount: number(assignment.seatCount ?? 1),
                status: "ASSIGNED",
                overrideReason: nullableString(assignment.overrideReason),
                version: { increment: 1 },
              },
            });
          else
            await tx.guestTransportAssignment.create({
              data: {
                workspaceId,
                routeId: route.id,
                guestId: guest.id,
                transportRequestId: requestRow?.id,
                pickupStopId: nullableString(assignment.pickupStopId),
                dropoffStopId: nullableString(assignment.dropoffStopId),
                seatCount: number(assignment.seatCount ?? 1),
                overrideReason: nullableString(assignment.overrideReason),
              },
            });
          if (requestRow)
            await tx.transportRequest.update({
              where: { id: requestRow.id },
              data: { status: "ASSIGNED", version: { increment: 1 } },
            });
          changed += 1;
        }
        const updated = await tx.transportPlan.update({
          where: { id: plan.id },
          data: { version: { increment: 1 } },
        });
        await this.recomputeTransportIssues(tx, workspaceId, plan.id);
        await this.asyncEvents.record(tx, {
          eventName: "transport.assignment_changed.v1",
          aggregateType: "TransportPlan",
          aggregateId: plan.id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `transport-assign:${plan.id}:v${updated.version}`,
          payload: {
            subject: { planId: plan.id, changed },
            transportIssueProjection: { planId: plan.id },
            activity: {
              category: "transport",
              action: "assignments_changed",
              summary: `${changed} alocări de transport au fost actualizate.`,
              entityType: "TransportPlan",
              entityId: plan.id,
            },
          },
        });
        const response = { changed, version: updated.version };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `transport.assign:${planId}`,
          key,
          request,
          response,
        );
        return response;
      },
    );
  }

  async publishTransport(
    userId: string,
    workspaceId: string,
    planId: string,
    version: number,
    key: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const request = { planId, version };
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `transport.publish:${planId}`,
          key,
          request,
        );
        if (replay) return replay;
        const plan = await this.requireTransportPlan(tx, workspaceId, planId);
        assertVersion(plan.version, version);
        await this.recomputeTransportIssues(tx, workspaceId, planId);
        if (
          await tx.transportIssue.count({
            where: {
              transportPlanId: planId,
              severity: "CRITICAL",
              status: { in: ["OPEN", "ACKNOWLEDGED"] },
            },
          })
        )
          validation("Planul are conflicte critice de capacitate.");
        const row = await tx.transportPlan.update({
          where: { id: planId },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.recordSimple(tx, {
          eventName: "transport.plan_published.v1",
          aggregateType: "TransportPlan",
          aggregateId: planId,
          aggregateVersion: row.version,
          workspaceId,
          userId,
          correlationId,
          summary: "Planul de transport a fost publicat pentru invitați.",
          category: "transport",
          action: "plan_published",
          notification: {
            title: "Planul de transport a fost publicat",
            body: "Invitații alocați pot vedea acum instrucțiunile de transport.",
            actionUrl: `/transport?plan=${planId}`,
          },
        });
        const response = resource(row);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `transport.publish:${planId}`,
          key,
          request,
          response,
        );
        return response;
      },
    );
  }

  async transportManifest(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
    correlationId: string,
    canReadSensitive: boolean,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `transport.manifest:${planId}`,
          key,
          input,
        );
        if (replay) return replay;
        await this.requireTransportPlan(tx, workspaceId, planId);
        const includeSensitive = boolean(input.includeSensitive);
        if (includeSensitive && !canReadSensitive)
          forbidden("Nu ai acces la datele sensibile din manifest.");
        const artifactId = randomUUID();
        const jobId = await this.asyncEvents.record(tx, {
          eventName: "transport.manifest_requested.v1",
          aggregateType: "TransportPlan",
          aggregateId: planId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `transport-manifest:${planId}:${key}`,
          userVisibleJob: true,
          payload: {
            subject: { planId, artifactId },
            transportManifest: {
              artifactId,
              planId,
              requestedByUserId: userId,
              format: string(input.format),
              includeSensitive,
            },
          },
        });
        if (!jobId) throw new Error("Transport manifest job missing");
        const response = {
          artifactId,
          job: mapJob(
            await tx.backgroundJob.findUniqueOrThrow({ where: { id: jobId } }),
          ),
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `transport.manifest:${planId}`,
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async accommodationRequests(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.refreshOperationalRequests(tx, workspaceId);
      const rows = await tx.accommodationRequest.findMany({
        where: { workspaceId },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      });
      const [guests, households] = await Promise.all([
        tx.guest.findMany({
          where: { workspaceId, id: { in: rows.map((row) => row.guestId) } },
          select: { id: true, firstName: true, lastName: true },
        }),
        tx.household.findMany({
          where: {
            workspaceId,
            id: { in: rows.map((row) => row.householdId) },
          },
          select: { id: true, name: true },
        }),
      ]);
      const guestNames = new Map(
        guests.map((guest) => [
          guest.id,
          [guest.firstName, guest.lastName].filter(Boolean).join(" "),
        ]),
      );
      const householdNames = new Map(
        households.map((household) => [household.id, household.name]),
      );
      return {
        items: rows.map((row) => ({
          ...resource(row),
          guestName: guestNames.get(row.guestId) ?? "Invitat fără nume",
          householdName: householdNames.get(row.householdId) ?? null,
        })),
      };
    });
  }

  async updateAccommodationRequest(
    userId: string,
    workspaceId: string,
    requestId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.accommodationRequest.findFirst({
        where: { id: requestId, workspaceId },
      });
      if (!current) notFound("Cererea de cazare nu există.");
      assertVersion(current.version, version);
      const row = await tx.accommodationRequest.update({
        where: { id: requestId },
        data: {
          ...(input.requested !== undefined
            ? { requested: boolean(input.requested) }
            : {}),
          ...(input.arrivalDate !== undefined
            ? { arrivalDate: nullableDate(input.arrivalDate) }
            : {}),
          ...(input.departureDate !== undefined
            ? { departureDate: nullableDate(input.departureDate) }
            : {}),
          ...(input.roomPreference !== undefined
            ? { roomPreference: nullableString(input.roomPreference) }
            : {}),
          ...(input.accessibilityRequirements !== undefined
            ? {
                accessibilityRequirementsEncrypted: encryptSensitive(
                  nullableString(input.accessibilityRequirements),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.status
            ? {
                status: dbEnum(input.status) as
                  "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED",
              }
            : {}),
          organizerOverride: true,
          organizerOverrideReason: string(input.overrideReason),
          version: { increment: 1 },
        },
      });
      return resource(row);
    });
  }

  async accommodationProperties(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.accommodationProperty.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: { name: "asc" },
        })
      ).map(resource),
    }));
  }

  async accommodationProperty(
    userId: string,
    workspaceId: string,
    propertyId: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const property = await this.requireProperty(tx, workspaceId, propertyId);
      const rooms = await tx.accommodationRoom.findMany({
        where: { workspaceId, propertyId, deletedAt: null },
        orderBy: { name: "asc" },
      });
      const roomTypes = await tx.accommodationRoomType.findMany({
        where: { workspaceId, propertyId },
        orderBy: { name: "asc" },
      });
      return {
        ...resource(property),
        rooms: rooms.map(resource),
        roomTypes: roomTypes.map(resource),
      };
    });
  }

  async createAccommodationProperty(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "accommodation.property.create",
          key,
          input,
        );
        if (replay) return replay;
        const row = await tx.accommodationProperty.create({
          data: {
            workspaceId,
            name: string(input.name),
            type: dbEnum(input.type) as
              "HOTEL" | "PENSION" | "APARTMENT" | "HOUSE" | "HOSTEL" | "OTHER",
            address: string(input.address),
            city: string(input.city),
            country: string(input.country),
            latitude: nullableNumber(input.latitude),
            longitude: nullableNumber(input.longitude),
            contactName: nullableString(input.contactName),
            contactPhoneEncrypted: encryptSensitive(
              nullableString(input.contactPhone),
              this.sensitiveKey,
            ),
            checkInTime: nullableString(input.checkInTime),
            checkOutTime: nullableString(input.checkOutTime),
            instructions: nullableString(input.instructions),
          },
        });
        await this.recordSimple(tx, {
          eventName: "accommodation.property_created.v1",
          aggregateType: "AccommodationProperty",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          userId,
          correlationId,
          summary: `Proprietatea ${row.name} a fost adăugată.`,
          category: "accommodation",
          action: "property_created",
        });
        const response = resource(row);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "accommodation.property.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateAccommodationProperty(
    userId: string,
    workspaceId: string,
    propertyId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await this.requireProperty(tx, workspaceId, propertyId);
      assertVersion(current.version, version);
      const row = await tx.accommodationProperty.update({
        where: { id: propertyId },
        data: {
          ...(input.name ? { name: string(input.name) } : {}),
          ...(input.type
            ? {
                type: dbEnum(input.type) as
                  | "HOTEL"
                  | "PENSION"
                  | "APARTMENT"
                  | "HOUSE"
                  | "HOSTEL"
                  | "OTHER",
              }
            : {}),
          ...(input.address ? { address: string(input.address) } : {}),
          ...(input.city ? { city: string(input.city) } : {}),
          ...(input.country ? { country: string(input.country) } : {}),
          ...(input.latitude !== undefined
            ? { latitude: nullableNumber(input.latitude) }
            : {}),
          ...(input.longitude !== undefined
            ? { longitude: nullableNumber(input.longitude) }
            : {}),
          ...(input.contactName !== undefined
            ? { contactName: nullableString(input.contactName) }
            : {}),
          ...(input.contactPhone !== undefined
            ? {
                contactPhoneEncrypted: encryptSensitive(
                  nullableString(input.contactPhone),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.checkInTime !== undefined
            ? { checkInTime: nullableString(input.checkInTime) }
            : {}),
          ...(input.checkOutTime !== undefined
            ? { checkOutTime: nullableString(input.checkOutTime) }
            : {}),
          ...(input.instructions !== undefined
            ? { instructions: nullableString(input.instructions) }
            : {}),
          ...(input.status
            ? {
                status: dbEnum(input.status) as
                  "DRAFT" | "ACTIVE" | "FULL" | "ARCHIVED",
              }
            : {}),
          version: { increment: 1 },
        },
      });
      return resource(row);
    });
  }

  async deleteAccommodationProperty(
    userId: string,
    workspaceId: string,
    propertyId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await this.requireProperty(tx, workspaceId, propertyId);
      assertVersion(row.version, version);
      if (
        await tx.accommodationStay.count({
          where: { propertyId, deletedAt: null },
        })
      )
        conflict("Proprietatea are sejururi active.");
      await tx.accommodationProperty.update({
        where: { id: propertyId },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { deleted: true, id: propertyId };
    });
  }

  async createRoom(
    userId: string,
    workspaceId: string,
    propertyId: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requireProperty(tx, workspaceId, propertyId);
      const adults = number(input.capacityAdults);
      const children = number(input.capacityChildren);
      if (adults + children < 1)
        validation("Camera trebuie să aibă cel puțin un loc.");
      return resource(
        await tx.accommodationRoom.create({
          data: {
            workspaceId,
            propertyId,
            roomTypeId: nullableString(input.roomTypeId),
            name: string(input.name),
            floor: nullableString(input.floor),
            capacityAdults: adults,
            capacityChildren: children,
            accessible: boolean(input.accessible),
            status: dbEnum(input.status ?? "available") as
              "AVAILABLE" | "HELD" | "OCCUPIED" | "UNAVAILABLE",
            notesPrivate: nullableString(input.notesPrivate),
          },
        }),
      );
    });
  }

  async updateRoom(
    userId: string,
    workspaceId: string,
    propertyId: string,
    roomId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.accommodationRoom.findFirst({
        where: { id: roomId, workspaceId, propertyId, deletedAt: null },
      });
      if (!current) notFound("Camera nu există.");
      assertVersion(current.version, version);
      return resource(
        await tx.accommodationRoom.update({
          where: { id: roomId },
          data: {
            ...(input.roomTypeId !== undefined
              ? { roomTypeId: nullableString(input.roomTypeId) }
              : {}),
            ...(input.name ? { name: string(input.name) } : {}),
            ...(input.floor !== undefined
              ? { floor: nullableString(input.floor) }
              : {}),
            ...(input.capacityAdults !== undefined
              ? { capacityAdults: number(input.capacityAdults) }
              : {}),
            ...(input.capacityChildren !== undefined
              ? { capacityChildren: number(input.capacityChildren) }
              : {}),
            ...(input.accessible !== undefined
              ? { accessible: boolean(input.accessible) }
              : {}),
            ...(input.status
              ? {
                  status: dbEnum(input.status) as
                    "AVAILABLE" | "HELD" | "OCCUPIED" | "UNAVAILABLE",
                }
              : {}),
            ...(input.notesPrivate !== undefined
              ? { notesPrivate: nullableString(input.notesPrivate) }
              : {}),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async deleteRoom(
    userId: string,
    workspaceId: string,
    propertyId: string,
    roomId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const room = await tx.accommodationRoom.findFirst({
        where: { id: roomId, workspaceId, propertyId, deletedAt: null },
      });
      if (!room) notFound("Camera nu există.");
      assertVersion(room.version, version);
      if (
        await tx.accommodationAllocation.count({
          where: {
            roomId,
            status: { in: ["ASSIGNED", "CONFIRMED", "CHECKED_IN"] },
          },
        })
      )
        conflict("Camera are invitați alocați.");
      await tx.accommodationRoom.update({
        where: { id: roomId },
        data: {
          status: "UNAVAILABLE",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { deleted: true, id: roomId };
    });
  }

  async accommodationStays(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.accommodationStay.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: { checkInDate: "asc" },
        })
      ).map(resource),
    }));
  }

  async accommodationStay(userId: string, workspaceId: string, stayId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) =>
      this.accommodationStayResource(tx, workspaceId, stayId),
    );
  }

  async createAccommodationStay(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "accommodation.stay.create",
          key,
          input,
        );
        if (replay) return replay;
        await this.requireProperty(tx, workspaceId, string(input.propertyId));
        const checkInDate = date(input.checkInDate);
        const checkOutDate = date(input.checkOutDate);
        if (checkOutDate <= checkInDate)
          validation("Data de check-out trebuie să fie după check-in.");
        const row = await tx.accommodationStay.create({
          data: {
            workspaceId,
            propertyId: string(input.propertyId),
            name: string(input.name),
            checkInDate,
            checkOutDate,
            createdById: userId,
          },
        });
        await this.recordSimple(tx, {
          eventName: "accommodation.stay_created.v1",
          aggregateType: "AccommodationStay",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          userId,
          correlationId,
          summary: `Sejurul ${row.name} a fost creat.`,
          category: "accommodation",
          action: "stay_created",
        });
        const response = resource(row);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "accommodation.stay.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateAccommodationStay(
    userId: string,
    workspaceId: string,
    stayId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await this.requireStay(tx, workspaceId, stayId);
      assertVersion(current.version, version);
      if (input.propertyId)
        await this.requireProperty(tx, workspaceId, string(input.propertyId));
      const row = await tx.accommodationStay.update({
        where: { id: stayId },
        data: {
          ...(input.propertyId ? { propertyId: string(input.propertyId) } : {}),
          ...(input.name ? { name: string(input.name) } : {}),
          ...(input.checkInDate
            ? { checkInDate: date(input.checkInDate) }
            : {}),
          ...(input.checkOutDate
            ? { checkOutDate: date(input.checkOutDate) }
            : {}),
          ...(input.status
            ? {
                status: dbEnum(input.status) as
                  "DRAFT" | "READY" | "COMPLETED" | "ARCHIVED",
              }
            : {}),
          version: { increment: 1 },
        },
      });
      return resource(row);
    });
  }

  async deleteAccommodationStay(
    userId: string,
    workspaceId: string,
    stayId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const stay = await this.requireStay(tx, workspaceId, stayId);
      assertVersion(stay.version, version);
      if (stay.status === "PUBLISHED")
        conflict("Sejurul publicat nu poate fi arhivat.");
      await tx.accommodationStay.update({
        where: { id: stayId },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { deleted: true, id: stayId };
    });
  }

  async replaceAccommodationAllocations(
    userId: string,
    workspaceId: string,
    stayId: string,
    version: number,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const request = { version, ...input };
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `accommodation.assign:${stayId}`,
          key,
          request,
        );
        if (replay) return replay;
        const stay = await this.requireStay(tx, workspaceId, stayId);
        assertVersion(stay.version, version);
        for (const id of array(input.removeAllocationIds).map(string))
          await tx.accommodationAllocation.updateMany({
            where: { id, workspaceId, stayId },
            data: { status: "CANCELLED", version: { increment: 1 } },
          });
        const values = array(input.allocations).map(record);
        const households = new Map<string, Set<string>>();
        for (const value of values) {
          const set =
            households.get(string(value.householdId)) ?? new Set<string>();
          set.add(string(value.roomId));
          households.set(string(value.householdId), set);
        }
        if (
          [...households.values()].some((rooms) => rooms.size > 1) &&
          (!boolean(input.confirmHouseholdSplit) || !input.reason)
        )
          validation("Separarea household-ului necesită confirmare și motiv.");
        let changed = 0;
        for (const value of values) {
          const room = await tx.accommodationRoom.findFirst({
            where: {
              id: string(value.roomId),
              workspaceId,
              propertyId: stay.propertyId,
              deletedAt: null,
            },
          });
          if (!room || room.status === "UNAVAILABLE")
            validation("Camera nu este disponibilă.");
          const guest = await this.requireGuest(
            tx,
            workspaceId,
            string(value.guestId),
          );
          if (guest.householdId !== string(value.householdId))
            validation("Guest și household nu corespund.");
          const checkInDate = date(value.checkInDate);
          const checkOutDate = date(value.checkOutDate);
          if (
            checkInDate < stay.checkInDate ||
            checkOutDate > stay.checkOutDate ||
            checkOutDate <= checkInDate
          )
            validation(
              "Datele alocării trebuie să fie în intervalul sejurului.",
            );
          const overlapping = await tx.accommodationAllocation.count({
            where: {
              workspaceId,
              guestId: guest.id,
              status: { in: ["ASSIGNED", "CONFIRMED", "CHECKED_IN"] },
              NOT: { stayId },
              checkInDate: { lt: checkOutDate },
              checkOutDate: { gt: checkInDate },
            },
          });
          if (overlapping)
            validation("Invitatul are o alocare de cazare suprapusă.");
          await this.validateRoomCapacity(
            tx,
            workspaceId,
            stayId,
            room.id,
            guest.id,
          );
          const requestRow = value.requestId
            ? await tx.accommodationRequest.findFirst({
                where: {
                  id: string(value.requestId),
                  workspaceId,
                  guestId: guest.id,
                },
              })
            : null;
          if (!requestRow && !value.overrideReason)
            validation(
              "Invitatul nu are cerere de cazare; override-ul necesită motiv.",
            );
          const existing = await tx.accommodationAllocation.findUnique({
            where: { stayId_guestId: { stayId, guestId: guest.id } },
          });
          if (existing)
            await tx.accommodationAllocation.update({
              where: { id: existing.id },
              data: {
                roomId: room.id,
                householdId: guest.householdId,
                accommodationRequestId: requestRow?.id,
                checkInDate,
                checkOutDate,
                status: "ASSIGNED",
                overrideReason: nullableString(
                  value.overrideReason ?? input.reason,
                ),
                version: { increment: 1 },
              },
            });
          else
            await tx.accommodationAllocation.create({
              data: {
                workspaceId,
                stayId,
                roomId: room.id,
                guestId: guest.id,
                householdId: guest.householdId,
                accommodationRequestId: requestRow?.id,
                checkInDate,
                checkOutDate,
                overrideReason: nullableString(
                  value.overrideReason ?? input.reason,
                ),
              },
            });
          if (requestRow)
            await tx.accommodationRequest.update({
              where: { id: requestRow.id },
              data: { status: "ASSIGNED", version: { increment: 1 } },
            });
          changed += 1;
        }
        const updated = await tx.accommodationStay.update({
          where: { id: stayId },
          data: { version: { increment: 1 } },
        });
        await this.recomputeAccommodationIssues(tx, workspaceId, stayId);
        await this.asyncEvents.record(tx, {
          eventName: "accommodation.allocation_changed.v1",
          aggregateType: "AccommodationStay",
          aggregateId: stayId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `accommodation-assign:${stayId}:v${updated.version}`,
          payload: {
            subject: { stayId, changed },
            accommodationIssueProjection: { stayId },
            activity: {
              category: "accommodation",
              action: "allocations_changed",
              summary: `${changed} alocări de cazare au fost actualizate.`,
              entityType: "AccommodationStay",
              entityId: stayId,
            },
          },
        });
        const response = { changed, version: updated.version };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `accommodation.assign:${stayId}`,
          key,
          request,
          response,
        );
        return response;
      },
    );
  }

  async publishAccommodation(
    userId: string,
    workspaceId: string,
    stayId: string,
    version: number,
    key: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const request = { stayId, version };
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `accommodation.publish:${stayId}`,
          key,
          request,
        );
        if (replay) return replay;
        const stay = await this.requireStay(tx, workspaceId, stayId);
        assertVersion(stay.version, version);
        await this.recomputeAccommodationIssues(tx, workspaceId, stayId);
        if (
          await tx.accommodationIssue.count({
            where: {
              stayId,
              severity: "CRITICAL",
              status: { in: ["OPEN", "ACKNOWLEDGED"] },
            },
          })
        )
          validation("Sejurul are conflicte critice de capacitate.");
        const row = await tx.accommodationStay.update({
          where: { id: stayId },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.recordSimple(tx, {
          eventName: "accommodation.stay_published.v1",
          aggregateType: "AccommodationStay",
          aggregateId: stayId,
          aggregateVersion: row.version,
          workspaceId,
          userId,
          correlationId,
          summary:
            "Detaliile de cazare au fost publicate pentru invitații alocați.",
          category: "accommodation",
          action: "stay_published",
          notification: {
            title: "Detaliile de cazare au fost publicate",
            body: "Invitații alocați pot vedea acum proprietatea, camera și intervalul.",
            actionUrl: `/accommodation?stay=${stayId}`,
          },
        });
        const response = resource(row);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `accommodation.publish:${stayId}`,
          key,
          request,
          response,
        );
        return response;
      },
    );
  }

  async roomingList(
    userId: string,
    workspaceId: string,
    stayId: string,
    key: string,
    input: Input,
    correlationId: string,
    canReadSensitive: boolean,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `accommodation.rooming:${stayId}`,
          key,
          input,
        );
        if (replay) return replay;
        await this.requireStay(tx, workspaceId, stayId);
        const includeSensitive = boolean(input.includeSensitive);
        if (includeSensitive && !canReadSensitive)
          forbidden("Nu ai acces la notele protejate din rooming list.");
        const artifactId = randomUUID();
        const jobId = await this.asyncEvents.record(tx, {
          eventName: "accommodation.rooming_list_requested.v1",
          aggregateType: "AccommodationStay",
          aggregateId: stayId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `accommodation-rooming:${stayId}:${key}`,
          userVisibleJob: true,
          payload: {
            subject: { stayId, artifactId },
            accommodationRoomingList: {
              artifactId,
              stayId,
              requestedByUserId: userId,
              format: string(input.format),
              includeSensitive,
            },
          },
        });
        if (!jobId) throw new Error("Accommodation rooming-list job missing");
        const response = {
          artifactId,
          job: mapJob(
            await tx.backgroundJob.findUniqueOrThrow({ where: { id: jobId } }),
          ),
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `accommodation.rooming:${stayId}`,
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async syncGuestOperations(workspaceId: string, submissionId: string) {
    return this.database.withContext({ workspaceId }, async (tx) => {
      const submission = await tx.rsvpSubmission.findFirst({
        where: { id: submissionId, workspaceId },
      });
      if (!submission) notFound("RSVP submission not found.");
      await this.refreshOperationalRequests(tx, workspaceId, submissionId);
      const plans = await tx.seatingPlan.findMany({
        where: { workspaceId, status: "PUBLISHED", deletedAt: null },
      });
      for (const plan of plans)
        await this.recomputeSeatingIssues(tx, workspaceId, plan.id, true);
      return { synchronized: true, seatingPlansChecked: plans.length };
    });
  }

  private async seatingPlanResource(
    tx: Transaction,
    workspaceId: string,
    planId: string,
    includeSensitive = false,
  ) {
    const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
    const tables = await tx.seatingTable.findMany({
      where: { workspaceId, seatingPlanId: planId, deletedAt: null },
      orderBy: { position: "asc" },
    });
    const seats = await tx.seatingSeat.findMany({
      where: { workspaceId, tableId: { in: tables.map((table) => table.id) } },
      orderBy: { position: "asc" },
    });
    const assignments = await tx.guestSeatingAssignment.findMany({
      where: {
        workspaceId,
        seatingPlanId: planId,
        status: { in: ["ACTIVE", "CONFLICT"] },
      },
      orderBy: { createdAt: "asc" },
    });
    const eligible = await this.eligibleGuests(
      tx,
      workspaceId,
      plan.weddingEventId,
    );
    const guestIds = [
      ...new Set([
        ...eligible.map((guest) => guest.id),
        ...assignments.map((assignment) => assignment.guestId),
      ]),
    ];
    const guests = await tx.guest.findMany({
      where: { workspaceId, id: { in: guestIds } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const households = await tx.household.findMany({
      where: {
        workspaceId,
        id: { in: [...new Set(guests.map((guest) => guest.householdId))] },
      },
    });
    const menuSelections = await tx.guestMenuSelection.findMany({
      where: { workspaceId, guestId: { in: guestIds }, active: true },
      orderBy: [{ selectedAt: "desc" }, { id: "desc" }],
    });
    const menus = await tx.menu.findMany({
      where: {
        workspaceId,
        id: {
          in: [...new Set(menuSelections.map((selection) => selection.menuId))],
        },
      },
    });
    const allergies = includeSensitive
      ? await tx.guestAllergy.findMany({
          where: {
            workspaceId,
            guestId: { in: guestIds },
            active: true,
            deletedAt: null,
          },
          orderBy: [{ severity: "desc" }, { label: "asc" }],
        })
      : [];
    const constraints = await tx.seatingConstraint.findMany({
      where: { workspaceId, seatingPlanId: planId, deletedAt: null },
    });
    const issues = await tx.seatingIssue.findMany({
      where: { workspaceId, seatingPlanId: planId },
      orderBy: [{ status: "asc" }, { severity: "desc" }],
    });
    return {
      ...resource(plan),
      hasUnpublishedChanges:
        plan.status === "PUBLISHED" &&
        plan.activeSnapshotId !== plan.publishedSnapshotId,
      tables: tables.map((table) => ({
        ...resource(table),
        seats: seats.filter((seat) => seat.tableId === table.id).map(resource),
        assigned: assignments.filter(
          (assignment) => assignment.seatingTableId === table.id,
        ).length,
      })),
      assignments: assignments.map(resource),
      guests: guests.map((guest) => ({
        ...resource(guest),
        householdName:
          households.find((household) => household.id === guest.householdId)
            ?.name ?? null,
        menu: (() => {
          const selection = menuSelections.find(
            (item) => item.guestId === guest.id,
          );
          if (!selection) return null;
          const menu = menus.find((item) => item.id === selection.menuId);
          return {
            id: selection.menuId,
            name: menu?.name ?? "Meniu indisponibil",
            selectionId: selection.id,
            selectionVersion: selection.version,
          };
        })(),
        ...(includeSensitive
          ? {
              allergies: allergies
                .filter((allergy) => allergy.guestId === guest.id)
                .map((allergy) => ({
                  id: allergy.id,
                  label: allergy.label,
                  severity: allergy.severity.toLowerCase(),
                })),
            }
          : {}),
        eligible: eligible.some((item) => item.id === guest.id),
        assigned: assignments.some((item) => item.guestId === guest.id),
      })),
      constraints: constraints.map(resource),
      issues: issues.map(resource),
    };
  }

  private async transportPlanResource(
    tx: Transaction,
    workspaceId: string,
    planId: string,
  ) {
    const plan = await this.requireTransportPlan(tx, workspaceId, planId);
    await this.recomputeTransportIssues(tx, workspaceId, planId);
    const vehicles = await tx.transportVehicle.findMany({
      where: { workspaceId, transportPlanId: planId, deletedAt: null },
      orderBy: { name: "asc" },
    });
    const routes = await tx.transportRoute.findMany({
      where: { workspaceId, transportPlanId: planId, deletedAt: null },
      orderBy: { departureAt: "asc" },
    });
    const assignments = await tx.guestTransportAssignment.findMany({
      where: {
        workspaceId,
        routeId: { in: routes.map((route) => route.id) },
        status: { in: ["ASSIGNED", "CONFIRMED"] },
      },
    });
    const routeStops = await tx.transportRouteStop.findMany({
      where: { workspaceId, routeId: { in: routes.map((route) => route.id) } },
      orderBy: { position: "asc" },
    });
    const stops = await tx.transportStop.findMany({
      where: { workspaceId, id: { in: routeStops.map((item) => item.stopId) } },
    });
    const issues = await tx.transportIssue.findMany({
      where: { workspaceId, transportPlanId: planId },
      orderBy: [{ status: "asc" }, { severity: "desc" }],
    });
    return {
      ...resource(plan),
      vehicles: vehicles.map(resource),
      routes: routes.map((route) => ({
        ...resource(route),
        assignments: assignments
          .filter((item) => item.routeId === route.id)
          .map(resource),
        stops: routeStops
          .filter((item) => item.routeId === route.id)
          .map((item) => ({
            ...resource(item),
            stop: resource(stops.find((stop) => stop.id === item.stopId) ?? {}),
          })),
      })),
      issues: issues.map(resource),
    };
  }

  private async accommodationStayResource(
    tx: Transaction,
    workspaceId: string,
    stayId: string,
  ) {
    const stay = await this.requireStay(tx, workspaceId, stayId);
    await this.recomputeAccommodationIssues(tx, workspaceId, stayId);
    const property = await this.requireProperty(
      tx,
      workspaceId,
      stay.propertyId,
    );
    const rooms = await tx.accommodationRoom.findMany({
      where: { workspaceId, propertyId: stay.propertyId, deletedAt: null },
      orderBy: { name: "asc" },
    });
    const allocations = await tx.accommodationAllocation.findMany({
      where: {
        workspaceId,
        stayId,
        status: { in: ["ASSIGNED", "CONFIRMED", "CHECKED_IN"] },
      },
    });
    const issues = await tx.accommodationIssue.findMany({
      where: { workspaceId, stayId },
      orderBy: [{ status: "asc" }, { severity: "desc" }],
    });
    return {
      ...resource(stay),
      property: resource(property),
      rooms: rooms.map((room) => ({
        ...resource(room),
        allocations: allocations
          .filter((item) => item.roomId === room.id)
          .map(resource),
      })),
      issues: issues.map(resource),
    };
  }

  private async applySeatingBatch(
    tx: Transaction,
    workspaceId: string,
    plan: { id: string; weddingEventId: string },
    userId: string,
    input: Input,
  ) {
    const removeIds = new Set(array(input.removeAssignmentIds).map(string));
    if (removeIds.size)
      await tx.guestSeatingAssignment.updateMany({
        where: {
          id: { in: [...removeIds] },
          workspaceId,
          seatingPlanId: plan.id,
          locked: false,
        },
        data: {
          status: "REMOVED",
          removedAt: new Date(),
          version: { increment: 1 },
        },
      });
    const values = array(input.assignments).map(record);
    const guestIds = values.map((item) => string(item.guestId));
    if (new Set(guestIds).size !== guestIds.length)
      validation("Același invitat apare de două ori în batch.");
    const eligibleIds = new Set(
      (await this.eligibleGuests(tx, workspaceId, plan.weddingEventId)).map(
        (guest) => guest.id,
      ),
    );
    for (const value of values) {
      const guest = await this.requireGuest(
        tx,
        workspaceId,
        string(value.guestId),
      );
      const table = await tx.seatingTable.findFirst({
        where: {
          id: string(value.tableId),
          workspaceId,
          seatingPlanId: plan.id,
          deletedAt: null,
        },
      });
      if (!table) validation("Masa nu aparține planului.");
      if (table.locked) {
        const existing = await tx.guestSeatingAssignment.findFirst({
          where: {
            workspaceId,
            seatingPlanId: plan.id,
            guestId: guest.id,
            seatingTableId: table.id,
            locked: true,
            status: { in: ["ACTIVE", "CONFLICT"] },
          },
        });
        if (!existing) conflict("Masa este blocată.");
      }
      if (!eligibleIds.has(guest.id) && !value.overrideReason)
        validation("Invitatul nu este eligibil; override-ul necesită motiv.");
      if (value.seatId) {
        const seat = await tx.seatingSeat.findFirst({
          where: { id: string(value.seatId), workspaceId, tableId: table.id },
        });
        if (!seat || seat.status !== "AVAILABLE")
          validation("Locul este indisponibil.");
      }
    }
    const current = await tx.guestSeatingAssignment.findMany({
      where: {
        workspaceId,
        seatingPlanId: plan.id,
        status: { in: ["ACTIVE", "CONFLICT"] },
      },
    });
    const prospective = new Map(
      current
        .filter((item) => !removeIds.has(item.id))
        .map((item) => [
          item.guestId,
          { tableId: item.seatingTableId, seatId: item.seatingSeatId },
        ]),
    );
    for (const value of values)
      prospective.set(string(value.guestId), {
        tableId: string(value.tableId),
        seatId: nullableString(value.seatId),
      });
    const tables = await tx.seatingTable.findMany({
      where: { workspaceId, seatingPlanId: plan.id, deletedAt: null },
    });
    for (const table of tables)
      if (
        [...prospective.values()].filter((item) => item.tableId === table.id)
          .length > table.capacity
      )
        validation(`Masa ${table.label} depășește capacitatea.`);
    const seatIds = [...prospective.values()]
      .map((item) => item.seatId)
      .filter((value): value is string => Boolean(value));
    if (new Set(seatIds).size !== seatIds.length)
      validation("Același loc este alocat de două ori.");
    for (const value of values) {
      const guestId = string(value.guestId);
      const existing = await tx.guestSeatingAssignment.findFirst({
        where: {
          workspaceId,
          seatingPlanId: plan.id,
          guestId,
          status: { in: ["ACTIVE", "CONFLICT"] },
        },
      });
      const data = {
        seatingTableId: string(value.tableId),
        seatingSeatId: nullableString(value.seatId),
        source: dbEnum(value.source ?? "manual") as
          "MANUAL" | "SUGGESTION" | "IMPORT",
        status: eligibleIds.has(guestId)
          ? ("ACTIVE" as const)
          : ("CONFLICT" as const),
        assignedById: userId,
        assignmentGroupKey: null,
        overrideReason: nullableString(value.overrideReason),
        locked: boolean(value.locked),
        removedAt: null,
      };
      if (existing)
        await tx.guestSeatingAssignment.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        });
      else
        await tx.guestSeatingAssignment.create({
          data: {
            workspaceId,
            seatingPlanId: plan.id,
            weddingEventId: plan.weddingEventId,
            guestId,
            ...data,
          },
        });
    }
    return { changed: values.length + removeIds.size };
  }

  private async recomputeSeatingIssues(
    tx: Transaction,
    workspaceId: string,
    planId: string,
    stale = false,
  ) {
    const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
    const eligible = await this.eligibleGuests(
      tx,
      workspaceId,
      plan.weddingEventId,
    );
    const assignments = await tx.guestSeatingAssignment.findMany({
      where: {
        workspaceId,
        seatingPlanId: planId,
        status: { in: ["ACTIVE", "CONFLICT"] },
      },
    });
    const tables = await tx.seatingTable.findMany({
      where: { workspaceId, seatingPlanId: planId, deletedAt: null },
    });
    const [seats, constraints, menuSelections, activeMenuCount, allergyIssues] =
      await Promise.all([
        tx.seatingSeat.findMany({
          where: {
            workspaceId,
            tableId: { in: tables.map((table) => table.id) },
          },
        }),
        tx.seatingConstraint.findMany({
          where: { workspaceId, seatingPlanId: planId, deletedAt: null },
        }),
        tx.guestMenuSelection.findMany({
          where: {
            workspaceId,
            guestId: { in: eligible.map((guest) => guest.id) },
            active: true,
          },
          select: { guestId: true },
        }),
        tx.menu.count({
          where: { workspaceId, status: "ACTIVE", deletedAt: null },
        }),
        tx.allergyIssue.findMany({
          where: {
            workspaceId,
            guestId: { in: eligible.map((guest) => guest.id) },
            status: { in: ["UNREVIEWED", "REVIEWING"] },
          },
          select: { guestId: true },
        }),
      ]);
    const guests = await tx.guest.findMany({
      where: {
        workspaceId,
        id: { in: assignments.map((item) => item.guestId) },
      },
    });
    const desired: Array<{
      type:
        | "UNASSIGNED_GUEST"
        | "OVER_CAPACITY"
        | "UNDER_CAPACITY"
        | "DUPLICATE_ASSIGNMENT"
        | "INELIGIBLE_GUEST"
        | "HOUSEHOLD_SPLIT"
        | "PLUS_ONE_SEPARATED"
        | "CHILD_SEPARATED"
        | "CONSTRAINT_VIOLATION"
        | "ACCESSIBILITY_MISMATCH"
        | "MENU_INCOMPLETE"
        | "ALLERGY_REVIEW_REQUIRED"
        | "PUBLISHED_PLAN_STALE";
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      guestId?: string;
      householdId?: string;
      tableId?: string;
      key: string;
      details: string;
    }> = [];
    const assignedIds = new Set(assignments.map((item) => item.guestId));
    for (const guest of eligible)
      if (!assignedIds.has(guest.id))
        desired.push({
          type: "UNASSIGNED_GUEST",
          severity: "HIGH",
          guestId: guest.id,
          householdId: guest.householdId,
          key: `unassigned:${guest.id}`,
          details: "Un invitat confirmat nu este alocat la masă.",
        });
    for (const table of tables) {
      const count = assignments.filter(
        (item) => item.seatingTableId === table.id,
      ).length;
      if (count > table.capacity)
        desired.push({
          type: "OVER_CAPACITY",
          severity: "CRITICAL",
          tableId: table.id,
          key: `capacity:${table.id}`,
          details: `Masa depășește capacitatea cu ${count - table.capacity} locuri.`,
        });
      if (table.minimumCapacity !== null && count < table.minimumCapacity)
        desired.push({
          type: "UNDER_CAPACITY",
          severity: "MEDIUM",
          tableId: table.id,
          key: `minimum-capacity:${table.id}`,
          details: `Masa are ${count} invitați, sub minimul recomandat de ${table.minimumCapacity}.`,
        });
    }
    const assignmentsByGuest = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const rows = assignmentsByGuest.get(assignment.guestId) ?? [];
      rows.push(assignment);
      assignmentsByGuest.set(assignment.guestId, rows);
    }
    for (const [guestId, rows] of assignmentsByGuest)
      if (rows.length > 1)
        desired.push({
          type: "DUPLICATE_ASSIGNMENT",
          severity: "CRITICAL",
          guestId,
          key: `duplicate:${guestId}`,
          details: "Același invitat are mai multe alocări active.",
        });
    const eligibleIds = new Set(eligible.map((guest) => guest.id));
    for (const assignment of assignments)
      if (!eligibleIds.has(assignment.guestId))
        desired.push({
          type: "INELIGIBLE_GUEST",
          severity: "CRITICAL",
          guestId: assignment.guestId,
          key: `ineligible:${assignment.guestId}`,
          details: "Alocarea aparține unui invitat care nu mai este confirmat.",
        });
    const byHousehold = new Map<string, Set<string>>();
    for (const guest of guests) {
      const assignment = assignments.find((item) => item.guestId === guest.id);
      if (!assignment) continue;
      const set = byHousehold.get(guest.householdId) ?? new Set<string>();
      set.add(assignment.seatingTableId);
      byHousehold.set(guest.householdId, set);
    }
    for (const [householdId, tableIds] of byHousehold)
      if (tableIds.size > 1)
        desired.push({
          type: "HOUSEHOLD_SPLIT",
          severity: "HIGH",
          householdId,
          key: `household:${householdId}`,
          details: "Membrii household-ului sunt împărțiți la mese diferite.",
        });
    for (const guest of guests.filter(
      (item) => item.isPlusOne && item.primaryGuestId,
    )) {
      const own = assignments.find((item) => item.guestId === guest.id);
      const primary = assignments.find(
        (item) => item.guestId === guest.primaryGuestId,
      );
      if (own && primary && own.seatingTableId !== primary.seatingTableId)
        desired.push({
          type: "PLUS_ONE_SEPARATED",
          severity: "HIGH",
          guestId: guest.id,
          householdId: guest.householdId,
          key: `plus-one:${guest.id}`,
          details: "Plus-one este separat de invitatul principal.",
        });
    }
    for (const guest of guests.filter((item) => item.isChild)) {
      const own = assignments.find((item) => item.guestId === guest.id);
      const adultTables = guests
        .filter(
          (item) => item.householdId === guest.householdId && !item.isChild,
        )
        .map(
          (item) =>
            assignments.find((assignment) => assignment.guestId === item.id)
              ?.seatingTableId,
        )
        .filter(Boolean);
      if (
        own &&
        adultTables.length &&
        !adultTables.includes(own.seatingTableId)
      )
        desired.push({
          type: "CHILD_SEPARATED",
          severity: "CRITICAL",
          guestId: guest.id,
          householdId: guest.householdId,
          key: `child:${guest.id}`,
          details: "Copilul este separat de adulții household-ului.",
        });
    }
    const assignmentByGuest = new Map(
      assignments.map((assignment) => [assignment.guestId, assignment]),
    );
    const seatById = new Map(seats.map((seat) => [seat.id, seat]));
    for (const constraint of constraints) {
      if (!constraint.guestId) continue;
      const own = assignmentByGuest.get(constraint.guestId);
      const related = constraint.relatedGuestId
        ? assignmentByGuest.get(constraint.relatedGuestId)
        : undefined;
      let violated = false;
      if (
        ["KEEP_TOGETHER", "PREFER_TOGETHER"].includes(constraint.type) &&
        own &&
        related
      )
        violated = own.seatingTableId !== related.seatingTableId;
      if (
        ["KEEP_APART", "PREFER_APART"].includes(constraint.type) &&
        own &&
        related
      )
        violated = own.seatingTableId === related.seatingTableId;
      if (constraint.type === "MUST_BE_AT_TABLE" && own)
        violated = own.seatingTableId !== constraint.tableId;
      if (constraint.type === "MUST_NOT_BE_AT_TABLE" && own)
        violated = own.seatingTableId === constraint.tableId;
      if (constraint.type === "ACCESSIBLE_SEAT_REQUIRED" && own) {
        const seat = own.seatingSeatId
          ? seatById.get(own.seatingSeatId)
          : undefined;
        if (!seat?.accessible)
          desired.push({
            type: "ACCESSIBILITY_MISMATCH",
            severity: "CRITICAL",
            guestId: constraint.guestId,
            tableId: own.seatingTableId,
            key: `accessibility:${constraint.id}`,
            details:
              "Invitatul are nevoie de un loc exact marcat ca accesibil.",
          });
        continue;
      }
      if (violated)
        desired.push({
          type: "CONSTRAINT_VIOLATION",
          severity: constraint.required ? "CRITICAL" : "MEDIUM",
          guestId: constraint.guestId,
          tableId: own?.seatingTableId,
          key: `constraint:${constraint.id}`,
          details: constraint.required
            ? "O regulă obligatorie de așezare nu este respectată."
            : "O preferință de așezare nu este respectată.",
        });
    }
    if (activeMenuCount > 0) {
      const selectedGuestIds = new Set(
        menuSelections.map((selection) => selection.guestId),
      );
      for (const guest of eligible)
        if (!selectedGuestIds.has(guest.id))
          desired.push({
            type: "MENU_INCOMPLETE",
            severity: "MEDIUM",
            guestId: guest.id,
            key: `menu:${guest.id}`,
            details: "Invitatul confirmat nu are încă un meniu selectat.",
          });
    }
    for (const guestId of new Set(allergyIssues.map((issue) => issue.guestId)))
      desired.push({
        type: "ALLERGY_REVIEW_REQUIRED",
        severity: "HIGH",
        guestId,
        key: `allergy:${guestId}`,
        details:
          "Există o informație alimentară care trebuie confirmată cu furnizorul de catering.",
      });
    if (stale && plan.status === "PUBLISHED")
      desired.push({
        type: "PUBLISHED_PLAN_STALE",
        severity: "CRITICAL",
        key: `stale:${plan.version}`,
        details: "Planul publicat trebuie revizuit după schimbarea RSVP.",
      });
    await this.replaceSeatingIssues(tx, workspaceId, planId, desired);
  }

  private async replaceSeatingIssues(
    tx: Transaction,
    workspaceId: string,
    planId: string,
    desired: Array<{
      type: string;
      severity: string;
      guestId?: string;
      householdId?: string;
      tableId?: string;
      key: string;
      details: string;
    }>,
  ) {
    const keys = desired.map((item) => item.key);
    await tx.seatingIssue.updateMany({
      where: {
        workspaceId,
        seatingPlanId: planId,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        dedupeKey: { notIn: keys },
      },
      data: {
        status: "RESOLVED",
        resolutionNote: "Conflictul nu mai este prezent.",
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    const existing = await tx.seatingIssue.findMany({
      where: { workspaceId, seatingPlanId: planId, dedupeKey: { in: keys } },
    });
    const existingByKey = new Map(
      existing.map((issue) => [issue.dedupeKey, issue]),
    );
    for (const item of desired) {
      const current = existingByKey.get(item.key);
      if (!current) {
        await tx.seatingIssue.create({
          data: {
            workspaceId,
            seatingPlanId: planId,
            type: item.type as never,
            severity: item.severity as never,
            guestId: item.guestId,
            householdId: item.householdId,
            tableId: item.tableId,
            detailsRedacted: item.details,
            dedupeKey: item.key,
          },
        });
        continue;
      }
      const nextStatus =
        current.status === "RESOLVED" ? "OPEN" : current.status;
      const changed =
        current.type !== item.type ||
        current.severity !== item.severity ||
        current.guestId !== (item.guestId ?? null) ||
        current.householdId !== (item.householdId ?? null) ||
        current.tableId !== (item.tableId ?? null) ||
        current.detailsRedacted !== item.details ||
        current.status !== nextStatus;
      if (!changed) continue;
      await tx.seatingIssue.update({
        where: { id: current.id },
        data: {
          type: item.type as never,
          severity: item.severity as never,
          guestId: item.guestId,
          householdId: item.householdId,
          tableId: item.tableId,
          detailsRedacted: item.details,
          status: nextStatus,
          ...(nextStatus === "OPEN"
            ? { resolutionNote: null, resolvedAt: null }
            : {}),
          version: { increment: 1 },
        },
      });
    }
  }

  private async recomputeTransportIssues(
    tx: Transaction,
    workspaceId: string,
    planId: string,
  ) {
    const plan = await this.requireTransportPlan(tx, workspaceId, planId);
    const routes = await tx.transportRoute.findMany({
      where: { workspaceId, transportPlanId: planId, deletedAt: null },
    });
    const requests = await tx.transportRequest.findMany({
      where: {
        workspaceId,
        weddingEventId: plan.weddingEventId,
        status: { in: ["REQUESTED", "CONFIRMED"] },
      },
    });
    const assignments = await tx.guestTransportAssignment.findMany({
      where: {
        workspaceId,
        routeId: { in: routes.map((route) => route.id) },
        status: { in: ["ASSIGNED", "CONFIRMED"] },
      },
    });
    const desired: Array<{
      type: "UNASSIGNED_REQUEST" | "OVER_CAPACITY" | "MISSING_VEHICLE";
      severity: "HIGH" | "CRITICAL";
      guestId?: string;
      routeId?: string;
      key: string;
      details: string;
    }> = [];
    for (const request of requests)
      if (!assignments.some((item) => item.guestId === request.guestId))
        desired.push({
          type: "UNASSIGNED_REQUEST",
          severity: "HIGH",
          guestId: request.guestId,
          key: `unassigned:${request.id}`,
          details: "O cerere de transport nu este alocată.",
        });
    for (const route of routes) {
      if (!route.vehicleId)
        desired.push({
          type: "MISSING_VEHICLE",
          severity: "CRITICAL",
          routeId: route.id,
          key: `vehicle:${route.id}`,
          details: "Ruta nu are vehicul.",
        });
      const vehicle = route.vehicleId
        ? await tx.transportVehicle.findFirst({
            where: { id: route.vehicleId, workspaceId },
          })
        : null;
      const capacity = route.capacityOverride ?? vehicle?.capacity ?? 0;
      const assigned = assignments
        .filter((item) => item.routeId === route.id)
        .reduce((sum, item) => sum + item.seatCount, 0);
      if (assigned > capacity)
        desired.push({
          type: "OVER_CAPACITY",
          severity: "CRITICAL",
          routeId: route.id,
          key: `capacity:${route.id}`,
          details: `Ruta depășește capacitatea cu ${assigned - capacity} locuri.`,
        });
    }
    const keys = desired.map((item) => item.key);
    await tx.transportIssue.updateMany({
      where: {
        workspaceId,
        transportPlanId: planId,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        dedupeKey: { notIn: keys },
      },
      data: {
        status: "RESOLVED",
        resolutionNote: "Conflictul nu mai este prezent.",
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    for (const item of desired)
      await tx.transportIssue.upsert({
        where: {
          workspaceId_transportPlanId_dedupeKey: {
            workspaceId,
            transportPlanId: planId,
            dedupeKey: item.key,
          },
        },
        create: {
          workspaceId,
          transportPlanId: planId,
          type: item.type,
          severity: item.severity,
          guestId: item.guestId,
          routeId: item.routeId,
          detailsRedacted: item.details,
          dedupeKey: item.key,
        },
        update: {
          type: item.type,
          severity: item.severity,
          detailsRedacted: item.details,
          status: "OPEN",
          resolutionNote: null,
          resolvedAt: null,
          version: { increment: 1 },
        },
      });
  }

  private async recomputeAccommodationIssues(
    tx: Transaction,
    workspaceId: string,
    stayId: string,
  ) {
    const stay = await this.requireStay(tx, workspaceId, stayId);
    const requests = await tx.accommodationRequest.findMany({
      where: { workspaceId, status: { in: ["REQUESTED", "CONFIRMED"] } },
    });
    const allocations = await tx.accommodationAllocation.findMany({
      where: {
        workspaceId,
        stayId,
        status: { in: ["ASSIGNED", "CONFIRMED", "CHECKED_IN"] },
      },
    });
    const rooms = await tx.accommodationRoom.findMany({
      where: { workspaceId, propertyId: stay.propertyId, deletedAt: null },
    });
    const guests = await tx.guest.findMany({
      where: {
        workspaceId,
        id: { in: allocations.map((item) => item.guestId) },
      },
    });
    const desired: Array<{
      type:
        | "UNASSIGNED_REQUEST"
        | "ADULT_CAPACITY_EXCEEDED"
        | "CHILD_CAPACITY_EXCEEDED"
        | "CHILD_WITHOUT_ADULT";
      severity: "HIGH" | "CRITICAL";
      guestId?: string;
      householdId?: string;
      roomId?: string;
      key: string;
      details: string;
    }> = [];
    for (const request of requests)
      if (!allocations.some((item) => item.guestId === request.guestId))
        desired.push({
          type: "UNASSIGNED_REQUEST",
          severity: "HIGH",
          guestId: request.guestId,
          householdId: request.householdId,
          key: `unassigned:${request.id}`,
          details: "O cerere de cazare nu este alocată.",
        });
    for (const room of rooms) {
      const roomGuestIds = allocations
        .filter((item) => item.roomId === room.id)
        .map((item) => item.guestId);
      const result = validateAccommodationCapacity({
        adultCapacity: room.capacityAdults,
        childCapacity: room.capacityChildren,
        guests: guests
          .filter((guest) => roomGuestIds.includes(guest.id))
          .map((guest) => ({ isChild: guest.isChild })),
      });
      if (result.adultOverCapacity)
        desired.push({
          type: "ADULT_CAPACITY_EXCEEDED",
          severity: "CRITICAL",
          roomId: room.id,
          key: `adult-capacity:${room.id}`,
          details: "Capacitatea pentru adulți este depășită.",
        });
      if (result.childOverCapacity)
        desired.push({
          type: "CHILD_CAPACITY_EXCEEDED",
          severity: "CRITICAL",
          roomId: room.id,
          key: `child-capacity:${room.id}`,
          details: "Capacitatea pentru copii este depășită.",
        });
      if (result.childWithoutAdult)
        desired.push({
          type: "CHILD_WITHOUT_ADULT",
          severity: "CRITICAL",
          roomId: room.id,
          key: `child-alone:${room.id}`,
          details: "O cameră are copii fără adult alocat.",
        });
    }
    const keys = desired.map((item) => item.key);
    await tx.accommodationIssue.updateMany({
      where: {
        workspaceId,
        stayId,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        dedupeKey: { notIn: keys },
      },
      data: {
        status: "RESOLVED",
        resolutionNote: "Conflictul nu mai este prezent.",
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    for (const item of desired)
      await tx.accommodationIssue.upsert({
        where: {
          workspaceId_stayId_dedupeKey: {
            workspaceId,
            stayId,
            dedupeKey: item.key,
          },
        },
        create: {
          workspaceId,
          stayId,
          type: item.type,
          severity: item.severity,
          guestId: item.guestId,
          householdId: item.householdId,
          roomId: item.roomId,
          detailsRedacted: item.details,
          dedupeKey: item.key,
        },
        update: {
          type: item.type,
          severity: item.severity,
          detailsRedacted: item.details,
          status: "OPEN",
          resolutionNote: null,
          resolvedAt: null,
          version: { increment: 1 },
        },
      });
  }

  private async refreshOperationalRequests(
    tx: Transaction,
    workspaceId: string,
    submissionId?: string,
  ) {
    const responses = await tx.guestEventResponse.findMany({
      where: { workspaceId, ...(submissionId ? { submissionId } : {}) },
    });
    const guests = await tx.guest.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
        id: { in: responses.map((response) => response.guestId) },
      },
    });
    for (const response of responses) {
      const guest = guests.find(
        (candidate) => candidate.id === response.guestId,
      );
      if (!guest) continue;
      if (guest.needsTransport && response.attendance === "CONFIRMED")
        await tx.transportRequest.upsert({
          where: {
            guestId_weddingEventId: {
              guestId: guest.id,
              weddingEventId: response.weddingEventId,
            },
          },
          create: {
            workspaceId,
            guestId: guest.id,
            householdId: guest.householdId,
            weddingEventId: response.weddingEventId,
            sourceSubmissionId: response.submissionId,
          },
          update: {
            requested: true,
            status: "REQUESTED",
            sourceSubmissionId: response.submissionId,
            version: { increment: 1 },
          },
        });
      else
        await tx.transportRequest.updateMany({
          where: {
            workspaceId,
            guestId: guest.id,
            weddingEventId: response.weddingEventId,
            organizerOverride: false,
          },
          data: {
            requested: false,
            status: "CANCELLED",
            version: { increment: 1 },
          },
        });
      if (guest.needsAccommodation && response.attendance === "CONFIRMED")
        await tx.accommodationRequest.upsert({
          where: { guestId: guest.id },
          create: {
            workspaceId,
            guestId: guest.id,
            householdId: guest.householdId,
            sourceSubmissionId: response.submissionId,
          },
          update: {
            requested: true,
            status: "REQUESTED",
            sourceSubmissionId: response.submissionId,
            version: { increment: 1 },
          },
        });
      else
        await tx.accommodationRequest.updateMany({
          where: { workspaceId, guestId: guest.id, organizerOverride: false },
          data: {
            requested: false,
            status: "CANCELLED",
            version: { increment: 1 },
          },
        });
    }
  }

  private async validateRouteCapacity(
    tx: Transaction,
    workspaceId: string,
    route: {
      id: string;
      vehicleId: string | null;
      capacityOverride: number | null;
    },
    guest: { id: string; accessibilityNotesEncrypted: string | null },
    seatCount: number,
  ) {
    const vehicle = route.vehicleId
      ? await tx.transportVehicle.findFirst({
          where: { id: route.vehicleId, workspaceId },
        })
      : null;
    if (!vehicle) validation("Ruta trebuie să aibă un vehicul.");
    const assignments = await tx.guestTransportAssignment.findMany({
      where: {
        workspaceId,
        routeId: route.id,
        guestId: { not: guest.id },
        status: { in: ["ASSIGNED", "CONFIRMED"] },
      },
    });
    const assignedGuestIds = assignments.map(
      (assignment) => assignment.guestId,
    );
    const accessibleGuestIds = assignedGuestIds.length
      ? new Set(
          (
            await tx.guest.findMany({
              where: {
                workspaceId,
                id: { in: assignedGuestIds },
                accessibilityNotesEncrypted: { not: null },
              },
              select: { id: true },
            })
          ).map((item) => item.id),
        )
      : new Set<string>();
    const capacity = route.capacityOverride ?? vehicle.capacity;
    const result = validateTransportCapacity({
      capacity,
      accessibleCapacity: vehicle.accessibleCapacity,
      assignments: [
        ...assignments.map((item) => ({
          seatCount: item.seatCount,
          accessible: accessibleGuestIds.has(item.guestId),
        })),
        { seatCount, accessible: Boolean(guest.accessibilityNotesEncrypted) },
      ],
    });
    if (result.overCapacity)
      validation("Ruta depășește capacitatea disponibilă.");
    if (result.accessibleOverCapacity)
      validation("Ruta nu are suficiente locuri accesibile.");
  }

  private async validateRoomCapacity(
    tx: Transaction,
    workspaceId: string,
    stayId: string,
    roomId: string,
    replacingGuestId: string,
  ) {
    const room = await tx.accommodationRoom.findFirst({
      where: { id: roomId, workspaceId },
    });
    if (!room) validation("Camera nu există.");
    const allocations = await tx.accommodationAllocation.findMany({
      where: {
        workspaceId,
        stayId,
        roomId,
        guestId: { not: replacingGuestId },
        status: { in: ["ASSIGNED", "CONFIRMED", "CHECKED_IN"] },
      },
    });
    const guests = await tx.guest.findMany({
      where: {
        workspaceId,
        id: {
          in: [...allocations.map((item) => item.guestId), replacingGuestId],
        },
      },
    });
    const result = validateAccommodationCapacity({
      adultCapacity: room.capacityAdults,
      childCapacity: room.capacityChildren,
      guests: guests.map((guest) => ({ isChild: guest.isChild })),
    });
    if (result.adultOverCapacity || result.childOverCapacity)
      validation("Camera depășește capacitatea pentru adulți sau copii.");
  }

  private async eligibleGuests(
    tx: Transaction,
    workspaceId: string,
    weddingEventId: string,
  ) {
    const responses = await tx.guestEventResponse.findMany({
      where: { workspaceId, weddingEventId, attendance: "CONFIRMED" },
      select: { guestId: true },
    });
    return tx.guest.findMany({
      where: {
        workspaceId,
        id: { in: [...new Set(responses.map((response) => response.guestId))] },
        status: "ACTIVE",
        deletedAt: null,
      },
    });
  }

  private async seatingInputHash(
    tx: Transaction,
    workspaceId: string,
    planId: string,
  ) {
    const plan = await this.requireSeatingPlan(tx, workspaceId, planId);
    const [guests, tables, assignments, constraints] = await Promise.all([
      this.eligibleGuests(tx, workspaceId, plan.weddingEventId),
      tx.seatingTable.findMany({
        where: { workspaceId, seatingPlanId: planId, deletedAt: null },
      }),
      tx.guestSeatingAssignment.findMany({
        where: {
          workspaceId,
          seatingPlanId: planId,
          status: { in: ["ACTIVE", "CONFLICT"] },
        },
      }),
      tx.seatingConstraint.findMany({
        where: { workspaceId, seatingPlanId: planId, deletedAt: null },
      }),
    ]);
    return stableHash({
      planVersion: plan.version,
      guests,
      tables,
      assignments,
      constraints,
    });
  }

  private async validateConstraintReferences(
    tx: Transaction,
    workspaceId: string,
    planId: string,
    input: Input,
  ) {
    if (input.guestId)
      await this.requireGuest(tx, workspaceId, string(input.guestId));
    if (input.relatedGuestId)
      await this.requireGuest(tx, workspaceId, string(input.relatedGuestId));
    if (
      input.householdId &&
      !(await tx.household.findFirst({
        where: { id: string(input.householdId), workspaceId, deletedAt: null },
      }))
    )
      validation("Household-ul nu există.");
    if (
      input.tableId &&
      !(await tx.seatingTable.findFirst({
        where: {
          id: string(input.tableId),
          workspaceId,
          seatingPlanId: planId,
          deletedAt: null,
        },
      }))
    )
      validation("Masa nu aparține planului.");
    if (
      input.guestId &&
      input.relatedGuestId &&
      input.guestId === input.relatedGuestId
    )
      validation("Constrângerea nu poate referi același invitat.");
  }

  private async replaceRouteStops(
    tx: Transaction,
    workspaceId: string,
    routeId: string,
    values: unknown[],
  ) {
    const rows = values.map(record);
    const stopIds = rows.map((item) => string(item.stopId));
    if (new Set(stopIds).size !== stopIds.length)
      validation("O oprire apare de două ori pe rută.");
    if (
      rows.length &&
      (await tx.transportStop.count({
        where: { workspaceId, id: { in: stopIds }, deletedAt: null },
      })) !== rows.length
    )
      validation("Una dintre opriri nu există.");
    await tx.transportRouteStop.deleteMany({ where: { workspaceId, routeId } });
    if (rows.length)
      await tx.transportRouteStop.createMany({
        data: rows.map((item, index) => ({
          workspaceId,
          routeId,
          stopId: string(item.stopId),
          position: number(item.position ?? index),
          plannedAt: nullableDate(item.plannedAt),
          pickupWindowStart: nullableDate(item.pickupWindowStart),
          pickupWindowEnd: nullableDate(item.pickupWindowEnd),
        })),
      });
  }

  private async recordSimple(
    tx: Transaction,
    input: {
      eventName: Parameters<AsyncService["record"]>[1]["eventName"];
      aggregateType: string;
      aggregateId: string;
      aggregateVersion: number;
      workspaceId: string;
      userId: string;
      correlationId: string;
      summary: string;
      category: string;
      action: string;
      subject?: Input;
      notification?: { title: string; body: string; actionUrl: string };
    },
  ) {
    await this.asyncEvents.record(tx, {
      eventName: input.eventName,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion,
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      correlationId: input.correlationId,
      deduplicationKey: `${input.eventName}:${input.aggregateId}:v${input.aggregateVersion}`,
      payload: {
        subject: input.subject ?? {},
        activity: {
          category: input.category,
          action: input.action,
          summary: input.summary,
          entityType: input.aggregateType,
          entityId: input.aggregateId,
        },
        ...(input.notification
          ? {
              notification: {
                recipientUserId: input.userId,
                module: input.category,
                kind: input.action,
                priority: "normal",
                ...input.notification,
              },
            }
          : {}),
      },
    });
  }

  private async replay(
    tx: Transaction,
    userId: string,
    workspaceId: string,
    operation: string,
    key: string,
    request: unknown,
  ) {
    const row = await tx.idempotencyRecord.findUnique({
      where: {
        actorUserId_operation_key: { actorUserId: userId, operation, key },
      },
    });
    if (!row) return null;
    if (row.workspaceId !== workspaceId || row.requestHash !== hash(request))
      conflict("Idempotency-Key a fost folosit cu altă cerere.");
    return row.responseBody as Prisma.JsonObject;
  }

  private async saveReplay(
    tx: Transaction,
    userId: string,
    workspaceId: string,
    operation: string,
    key: string,
    request: unknown,
    response: unknown,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        workspaceId,
        actorUserId: userId,
        operation,
        key,
        requestHash: hash(request),
        responseStatus: 200,
        responseBody: response as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  private async requireEvent(tx: Transaction, workspaceId: string, id: string) {
    const row = await tx.weddingEvent.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!row) notFound("Evenimentul nu există.");
    return row;
  }
  private async requireVenue(tx: Transaction, workspaceId: string, id: string) {
    const row = await tx.venueSpace.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!row) notFound("Spațiul nu există.");
    return row;
  }
  private async requireSeatingPlan(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ) {
    const row = await tx.seatingPlan.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!row) notFound("Planul de mese nu există.");
    return row;
  }
  private async requireTransportPlan(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ) {
    const row = await tx.transportPlan.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!row) notFound("Planul de transport nu există.");
    return row;
  }
  private async requireVehicle(
    tx: Transaction,
    workspaceId: string,
    planId: string,
    id: string,
  ) {
    const row = await tx.transportVehicle.findFirst({
      where: { id, workspaceId, transportPlanId: planId, deletedAt: null },
    });
    if (!row) notFound("Vehiculul nu există.");
    return row;
  }
  private async requireRoute(
    tx: Transaction,
    workspaceId: string,
    planId: string,
    id: string,
  ) {
    const row = await tx.transportRoute.findFirst({
      where: { id, workspaceId, transportPlanId: planId, deletedAt: null },
    });
    if (!row) notFound("Ruta nu există.");
    return row;
  }
  private async requireProperty(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ) {
    const row = await tx.accommodationProperty.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!row) notFound("Proprietatea nu există.");
    return row;
  }
  private async requireStay(tx: Transaction, workspaceId: string, id: string) {
    const row = await tx.accommodationStay.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!row) notFound("Sejurul nu există.");
    return row;
  }
  private async requireGuest(tx: Transaction, workspaceId: string, id: string) {
    const row = await tx.guest.findFirst({
      where: { id, workspaceId, status: "ACTIVE", deletedAt: null },
    });
    if (!row) notFound("Invitatul nu există.");
    return row;
  }
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function string(value: unknown) {
  if (typeof value !== "string") validation("Valoare text invalidă.");
  return value;
}
function nullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return string(value);
}
function number(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value))
    validation("Valoare numerică invalidă.");
  return value;
}
function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return number(value);
}
function boolean(value: unknown) {
  return value === true;
}
function date(value: unknown) {
  const parsed = new Date(string(value));
  if (Number.isNaN(parsed.valueOf())) validation("Dată invalidă.");
  return parsed;
}
function nullableDate(value: unknown): Date | null {
  return value === null || value === undefined || value === ""
    ? null
    : date(value);
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function record(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value))
    validation("Obiect invalid.");
  return value as Input;
}
function dbEnum(value: unknown, fallback = "") {
  return string(value ?? fallback).toUpperCase();
}
function assertVersion(actual: number, expected: number) {
  if (actual !== expected)
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Versiunea s-a schimbat.",
      "Reîncarcă datele și încearcă din nou.",
      undefined,
      { latestVersion: actual },
    );
}
function validation(message: string): never {
  problem(
    "VALIDATION_FAILED",
    HttpStatus.UNPROCESSABLE_ENTITY,
    "Cererea nu poate fi aplicată.",
    message,
  );
}
function conflict(message: string): never {
  problem(
    "VERSION_CONFLICT",
    HttpStatus.CONFLICT,
    "Conflict operațional",
    message,
  );
}
function forbidden(message: string): never {
  problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Acces interzis", message);
}
function notFound(message: string): never {
  problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Resursa nu există", message);
}

const enumKeys = new Set([
  "status",
  "type",
  "shape",
  "unit",
  "source",
  "severity",
  "priority",
  "vehicleType",
  "direction",
]);
function resource(value: unknown): Input {
  if (!value || typeof value !== "object") return {};
  const output: Input = {};
  for (const [key, item] of Object.entries(value)) {
    if (item instanceof Date) output[key] = item.toISOString();
    else if (
      typeof item === "object" &&
      item &&
      "toNumber" in item &&
      typeof (item as { toNumber?: unknown }).toNumber === "function"
    )
      output[key] = (item as { toNumber(): number }).toNumber();
    else if (enumKeys.has(key) && typeof item === "string")
      output[key] = item.toLowerCase();
    else output[key] = item;
  }
  return output;
}

function constraintInput(input: Input) {
  return {
    type: dbEnum(input.type) as never,
    guestId: nullableString(input.guestId),
    householdId: nullableString(input.householdId),
    relatedGuestId: nullableString(input.relatedGuestId),
    tableId: nullableString(input.tableId),
    priority: dbEnum(input.priority ?? "medium") as never,
    required: boolean(input.required),
    reason: nullableString(input.reason),
  };
}
function ruleConstraint(value: Input | ReturnType<typeof constraintInput>) {
  return {
    type: dbEnum(value.type) as
      | "KEEP_TOGETHER"
      | "KEEP_APART"
      | "PREFER_TOGETHER"
      | "PREFER_APART"
      | "MUST_BE_AT_TABLE"
      | "MUST_NOT_BE_AT_TABLE"
      | "ACCESSIBLE_SEAT_REQUIRED",
    guestId: nullableString(value.guestId),
    householdId: nullableString(value.householdId),
    relatedGuestId: nullableString(value.relatedGuestId),
    tableId: nullableString(value.tableId),
    required: boolean(value.required),
  };
}

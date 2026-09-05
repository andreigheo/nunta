import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@weddingos/database";
import {
  isOnboardingComplete,
  type UpdateOnboardingDraft,
} from "@weddingos/contracts";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
  ) {}

  async get(userId: string, workspaceId: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const draft = await transaction.onboardingDraft.upsert({
          where: { workspaceId },
          create: { workspaceId, userId },
          update: {},
        });
        return mapDraft(draft);
      },
    );
  }

  async update(
    userId: string,
    workspaceId: string,
    input: UpdateOnboardingDraft,
    version: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const data: Prisma.OnboardingDraftUpdateManyMutationInput = {
          ...(input.currentStep === undefined
            ? {}
            : { currentStep: input.currentStep }),
          ...(input.couple === undefined
            ? {}
            : { couple: input.couple as Prisma.InputJsonValue }),
          ...(input.dateEvents === undefined
            ? {}
            : { dateEvents: input.dateEvents as Prisma.InputJsonValue }),
          ...(input.location === undefined
            ? {}
            : { location: input.location as Prisma.InputJsonValue }),
          ...(input.guests === undefined
            ? {}
            : { guests: input.guests as Prisma.InputJsonValue }),
          ...(input.budget === undefined
            ? {}
            : { budget: input.budget as Prisma.InputJsonValue }),
          ...(input.style === undefined
            ? {}
            : { style: input.style as Prisma.InputJsonValue }),
          ...(input.existingProgress === undefined
            ? {}
            : {
                existingProgress:
                  input.existingProgress as Prisma.InputJsonValue,
              }),
          ...(input.planningPreferences === undefined
            ? {}
            : {
                planningPreferences:
                  input.planningPreferences as Prisma.InputJsonValue,
              }),
          version: { increment: 1 },
        };
        const updated = await transaction.onboardingDraft.updateMany({
          where: { workspaceId, userId, version, status: "DRAFT" },
          data,
        });
        if (updated.count === 0) {
          const current = await transaction.onboardingDraft.findUnique({
            where: { workspaceId },
            select: { version: true },
          });
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Onboarding version conflict",
            "Datele au fost modificate. Reîncarcă și aplică manual schimbările.",
            undefined,
            current ? { latestVersion: current.version } : undefined,
          );
        }
        const draft = await transaction.onboardingDraft.findUniqueOrThrow({
          where: { workspaceId },
        });
        await this.asyncEvents.record(transaction, {
          eventName: "onboarding.draft_updated.v1",
          aggregateType: "OnboardingDraft",
          aggregateId: draft.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `onboarding-save:${draft.id}:v${draft.version}`,
          payload: {
            subject: {
              draftId: draft.id,
              version: draft.version,
              currentStep: draft.currentStep,
            },
            activity: {
              category: "onboarding",
              action: "draft_updated",
              summary: `Onboarding salvat la pasul ${draft.currentStep}.`,
              entityType: "OnboardingDraft",
              entityId: draft.id,
            },
          },
        });
        return mapDraft(draft);
      },
    );
  }

  async complete(
    userId: string,
    workspaceId: string,
    version: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const draft = await transaction.onboardingDraft.findUnique({
          where: { workspaceId },
        });
        if (!draft)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Onboarding draft not found",
          );
        const completedEvent = await transaction.outboxMessage.findFirst({
          where: {
            eventName: "onboarding.ready_for_plan_generation.v1",
            aggregateType: "OnboardingDraft",
            aggregateId: draft.id,
            backgroundJobId: { not: null },
          },
          select: { backgroundJobId: true },
        });
        if (completedEvent?.backgroundJobId) {
          // Completion is also the repair boundary for workspaces created by
          // older releases. The outbox event proves the plan-generation side
          // effect already happened, but derived profile/event rows may still
          // be missing. Both materializers are idempotent upserts, so reconcile
          // them before returning the original job.
          await materializeEventProfile(
            transaction,
            userId,
            workspaceId,
            draft.couple,
            draft.dateEvents,
            draft.location,
            draft.budget,
          );
          await materializeOnboardingEvents(
            transaction,
            workspaceId,
            draft.couple,
            draft.dateEvents,
            draft.location,
          );
          return completion(completedEvent.backgroundJobId);
        }
        if (draft.version !== version)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Onboarding version conflict",
          );
        const normalized = mapDraft(draft);
        if (!isOnboardingComplete(normalized)) {
          problem(
            "ONBOARDING_INCOMPLETE",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Onboarding incomplete",
            "Completează și salvează toate cele opt etape.",
          );
        }
        await transaction.onboardingDraft.update({
          where: { id: draft.id },
          data: {
            status: "READY",
            completedAt: new Date(),
            currentStep: 8,
            version: { increment: 1 },
          },
        });
        await materializeEventProfile(
          transaction,
          userId,
          workspaceId,
          draft.couple,
          draft.dateEvents,
          draft.location,
          draft.budget,
        );
        await materializeOnboardingEvents(
          transaction,
          workspaceId,
          draft.couple,
          draft.dateEvents,
          draft.location,
        );
        const eventType = onboardingEventType(
          asRecord(draft.couple).eventType ??
            asRecord(draft.dateEvents).eventType,
        );
        const wedding = eventType === "wedding";
        const eventId = randomUUID();
        const jobId = await this.asyncEvents.record(transaction, {
          eventName: "onboarding.ready_for_plan_generation.v1",
          aggregateType: "OnboardingDraft",
          aggregateId: draft.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `onboarding-complete:${draft.id}`,
          userVisibleJob: true,
          payload: {
            subject: { eventId, draftId: draft.id },
            notification: {
              recipientUserId: userId,
              kind: "onboarding",
              title: wedding
                ? "Configurarea nunții este gata"
                : "Configurarea evenimentului este gata",
              body: wedding
                ? "Datele au fost salvate. Următorul pas este propunerea planului nunții."
                : "Datele au fost salvate. Următorul pas este propunerea planului evenimentului.",
              actionUrl: "/plan?generate=1",
            },
            activity: {
              category: "onboarding",
              action: "ready_for_plan_generation",
              summary: wedding
                ? "Onboardingul nunții este pregătit pentru generarea planului."
                : "Onboardingul evenimentului este pregătit pentru generarea planului.",
              entityType: "OnboardingDraft",
              entityId: draft.id,
            },
          },
        });
        if (!jobId)
          throw new Error("Onboarding completion job was not created");
        return completion(jobId);
      },
    );
  }
}

function completion(jobId: string) {
  return {
    completed: true as const,
    planGeneration: "not_started" as const,
    message: "Date salvate. Pregătim propunerea planului tău." as const,
    jobId,
  };
}

function mapDraft(draft: {
  id: string;
  workspaceId: string;
  currentStep: number;
  status: string;
  couple: Prisma.JsonValue;
  dateEvents: Prisma.JsonValue;
  location: Prisma.JsonValue;
  guests: Prisma.JsonValue;
  budget: Prisma.JsonValue;
  style: Prisma.JsonValue;
  existingProgress: Prisma.JsonValue;
  planningPreferences: Prisma.JsonValue;
  completedAt: Date | null;
  updatedAt: Date;
  version: number;
}) {
  return {
    id: draft.id,
    workspaceId: draft.workspaceId,
    currentStep: draft.currentStep,
    status: draft.status.toLowerCase(),
    couple: asRecord(draft.couple),
    dateEvents: asRecord(draft.dateEvents),
    location: asRecord(draft.location),
    guests: asRecord(draft.guests),
    budget: asRecord(draft.budget),
    style: asRecord(draft.style),
    existingProgress: asRecord(draft.existingProgress),
    planningPreferences: asRecord(draft.planningPreferences),
    completedAt: draft.completedAt?.toISOString() ?? null,
    updatedAt: draft.updatedAt.toISOString(),
    version: draft.version,
  };
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function materializeEventProfile(
  transaction: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
  coupleValue: Prisma.JsonValue,
  dateEventsValue: Prisma.JsonValue,
  locationValue: Prisma.JsonValue,
  budgetValue: Prisma.JsonValue,
) {
  const couple = asRecord(coupleValue);
  const dateEvents = asRecord(dateEventsValue);
  const location = asRecord(locationValue);
  const budget = asRecord(budgetValue);
  const title = onboardingText(couple.title, 160);
  const eventType = onboardingEventType(
    couple.eventType ?? dateEvents.eventType,
  );
  const organizerName = onboardingText(
    couple.organizerName ?? couple.organizer,
    160,
  );
  const partnerOneName = onboardingText(couple.partnerOne, 100);
  const partnerTwoName = onboardingText(couple.partnerTwo, 100);
  const eventDate = onboardingDate(dateEvents.date ?? dateEvents.exactDate);
  const profileLocation = onboardingText(
    location.venueAddress ?? location.venue ?? location.city ?? location.region,
    160,
  );
  const currency =
    typeof budget.currency === "string" && /^[A-Z]{3}$/.test(budget.currency)
      ? budget.currency
      : null;

  if (title || currency) {
    await transaction.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(title ? { title } : {}),
        ...(currency ? { currency } : {}),
        updatedById: userId,
        version: { increment: 1 },
      },
    });
  }
  await transaction.eventProfile.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      eventType,
      organizerName,
      partnerOneName,
      partnerTwoName,
      eventDate,
      location: profileLocation,
      createdById: userId,
      updatedById: userId,
    },
    update: {
      eventType,
      organizerName,
      partnerOneName,
      partnerTwoName,
      eventDate,
      location: profileLocation,
      updatedById: userId,
      version: { increment: 1 },
    },
  });
}

function onboardingText(value: unknown, maximumLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : null;
}

function onboardingDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function onboardingEventType(value: unknown) {
  const allowed = new Set([
    "wedding",
    "baptism",
    "birthday",
    "corporate",
    "conference",
    "anniversary",
    "private_party",
    "festival",
    "fundraiser",
    "other",
  ]);
  return typeof value === "string" && allowed.has(value) ? value : "wedding";
}

async function materializeOnboardingEvents(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  coupleValue: Prisma.JsonValue,
  dateEventsValue: Prisma.JsonValue,
  locationValue: Prisma.JsonValue,
) {
  const couple = asRecord(coupleValue);
  const dateEvents = asRecord(dateEventsValue);
  const location = asRecord(locationValue);
  const eventType = onboardingEventType(
    couple.eventType ?? dateEvents.eventType,
  );
  const workspace = await transaction.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const dateCandidate =
    typeof dateEvents.date === "string"
      ? dateEvents.date
      : typeof dateEvents.exactDate === "string"
        ? dateEvents.exactDate
        : null;
  const date =
    dateCandidate && /^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)
      ? dateCandidate
      : null;
  const at = (dayOffset: number, time: string) =>
    date
      ? new Date(
          new Date(`${date}T${time}:00.000Z`).getTime() +
            dayOffset * 86_400_000,
        )
      : null;
  const locationName =
    typeof location.venue === "string" && location.venue.trim()
      ? location.venue.trim()
      : null;
  const locationAddress =
    typeof location.venueAddress === "string" && location.venueAddress.trim()
      ? location.venueAddress.trim()
      : null;
  const weddingDefinitions: Array<{
    key: string;
    enabled: boolean;
    type:
      | "CIVIL_CEREMONY"
      | "RELIGIOUS_CEREMONY"
      | "RECEPTION"
      | "WELCOME_DINNER"
      | "BRUNCH"
      | "CUSTOM";
    title: string;
    start: Date | null;
  }> = [
    {
      key: "civil",
      enabled: dateEvents.civil !== false,
      type: "CIVIL_CEREMONY",
      title: "Cununia civilă",
      start: at(-1, "12:00"),
    },
    {
      key: "religious",
      enabled: dateEvents.religious !== false,
      type: "RELIGIOUS_CEREMONY",
      title: "Cununia religioasă",
      start: at(0, "14:30"),
    },
    {
      key: "reception",
      enabled: dateEvents.reception !== false,
      type: "RECEPTION",
      title: "Recepția",
      start: at(0, "17:00"),
    },
    {
      key: "welcome-dinner",
      enabled: dateEvents.welcomeDinner === true,
      type: "WELCOME_DINNER",
      title: "Welcome dinner",
      start: at(-1, "19:00"),
    },
    {
      key: "brunch",
      enabled: dateEvents.brunch === true,
      type: "BRUNCH",
      title: "Brunch",
      start: at(1, "11:00"),
    },
  ];
  const genericDefinitions: typeof weddingDefinitions = [
    {
      key: "main",
      enabled: true,
      type: "CUSTOM",
      title:
        onboardingText(dateEvents.primaryTitle, 200) ??
        onboardingEventTypeLabel(eventType),
      start: at(0, "12:00"),
    },
  ];
  const custom = Array.isArray(dateEvents.extraEvents)
    ? dateEvents.extraEvents
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
        .slice(0, 20)
        .map((title, index) => ({
          key: `custom-${index}-${createStableKey(title)}`,
          enabled: true,
          type: "CUSTOM" as const,
          title: title.trim(),
          start: at(0, "12:00"),
        }))
    : [];
  const definitions =
    eventType === "wedding" ? weddingDefinitions : genericDefinitions;
  for (const [position, event] of [...definitions, ...custom].entries()) {
    if (!event.enabled) continue;
    await transaction.weddingEvent.upsert({
      where: {
        workspaceId_sourceKey: {
          workspaceId,
          sourceKey: `onboarding:${event.key}`,
        },
      },
      create: {
        workspaceId,
        type: event.type,
        title: event.title,
        startAt: event.start,
        timezone: workspace.timezone,
        locationName,
        locationAddress,
        position,
        status: date ? "CONFIRMED" : "DRAFT",
        source: "onboarding",
        sourceKey: `onboarding:${event.key}`,
      },
      update: {
        type: event.type,
        title: event.title,
        startAt: event.start,
        timezone: workspace.timezone,
        locationName,
        locationAddress,
        position,
        status: date ? "CONFIRMED" : "DRAFT",
        deletedAt: null,
      },
    });
  }
}

function onboardingEventTypeLabel(eventType: string) {
  const labels: Record<string, string> = {
    baptism: "Botez",
    birthday: "Aniversare",
    corporate: "Eveniment corporate",
    conference: "Conferință",
    anniversary: "Jubileu",
    private_party: "Petrecere privată",
    festival: "Festival",
    fundraiser: "Eveniment caritabil",
    other: "Eveniment",
  };
  return labels[eventType] ?? "Eveniment";
}

function createStableKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

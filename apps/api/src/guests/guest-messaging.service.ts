import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type {
  GuestMessageConsent,
  GuestMessageInput,
  GuestMessagingOverview,
} from "@weddingos/contracts";
import {
  messageTemplates,
  normalizedPhone,
  phoneHash,
  phoneChannelReady,
  sealPhoneMessage,
  testRecipientAllowed,
} from "@weddingos/jobs";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { stableHash } from "./sensitive.crypto";

@Injectable()
export class GuestMessagingService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AsyncService) private readonly events: AsyncService,
    @Inject(API_ENVIRONMENT) private readonly env: ApiEnvironment,
  ) {}

  async overview(
    userId: string,
    workspaceId: string,
  ): Promise<GuestMessagingOverview> {
    return this.db.withContext({ userId, workspaceId }, async (tx) => {
      const guests = await tx.guest.findMany({
        where: { workspaceId, deletedAt: null, status: "ACTIVE" },
        orderBy: [{ lastName: "asc" }, { id: "asc" }],
      });
      const guestIds = guests.map((guest) => guest.id);
      const householdIds = [
        ...new Set(guests.map((guest) => guest.householdId)),
      ];
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const [consents, messages, usedToday, households, assignments] =
        await Promise.all([
          tx.guestMessageConsent.findMany({ where: { workspaceId } }),
          tx.guestMessage.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
          tx.guestMessage.count({
            where: { workspaceId, createdAt: { gte: day } },
          }),
          tx.household.findMany({
            where: { workspaceId, id: { in: householdIds }, deletedAt: null },
            select: { id: true, name: true },
            orderBy: [{ name: "asc" }, { id: "asc" }],
          }),
          tx.guestTagAssignment.findMany({
            where: { workspaceId, guestId: { in: guestIds } },
            select: { guestId: true, tagId: true },
          }),
        ]);
      const tags = await tx.guestTag.findMany({
        where: {
          workspaceId,
          id: { in: [...new Set(assignments.map((item) => item.tagId))] },
        },
        select: { id: true, name: true, color: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      const names = new Map(
        guests.map((g) => [g.id, `${g.firstName} ${g.lastName}`.trim()]),
      );
      const householdNames = new Map(
        households.map((household) => [household.id, household.name]),
      );
      const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
      const guestGroups = new Map<string, typeof tags>();
      for (const assignment of assignments) {
        const tag = tagsById.get(assignment.tagId);
        if (!tag) continue;
        const current = guestGroups.get(assignment.guestId) ?? [];
        current.push(tag);
        guestGroups.set(assignment.guestId, current);
      }
      return {
        channels: {
          SMS: phoneChannelReady(this.env, "SMS"),
          WHATSAPP: phoneChannelReady(this.env, "WHATSAPP"),
        },
        templates: Object.keys(
          messageTemplates(this.env),
        ) as GuestMessageInput["template"][],
        dailyLimit: this.env.TWILIO_WORKSPACE_DAILY_LIMIT,
        usedToday,
        remainingToday: Math.max(
          0,
          this.env.TWILIO_WORKSPACE_DAILY_LIMIT - usedToday,
        ),
        groups: tags.map((tag) => ({
          ...tag,
          guestIds: assignments
            .filter((item) => item.tagId === tag.id)
            .map((item) => item.guestId),
        })),
        households: households.map((household) => ({
          ...household,
          guestIds: guests
            .filter((guest) => guest.householdId === household.id)
            .map((guest) => guest.id),
        })),
        guests: guests.map((g) => {
          const phone = normalizedPhone(g.phoneE164 ?? "");
          const allowed = (channel: string) =>
            consents.some(
              (c) =>
                c.guestId === g.id &&
                c.channel === channel &&
                c.allowed &&
                phone &&
                c.destinationHash === phoneHash(phone),
            );
          return {
            id: g.id,
            name: names.get(g.id)!,
            email: g.emailNormalized,
            phone,
            householdId: g.householdId,
            householdName:
              householdNames.get(g.householdId) ?? "Fără gospodărie",
            groups: guestGroups.get(g.id) ?? [],
            sms: allowed("SMS"),
            whatsapp: allowed("WHATSAPP"),
          };
        }),
        messages: messages.map((m) => ({
          id: m.id,
          guestId: m.guestId,
          guestName: names.get(m.guestId) ?? "Invitat",
          channel: m.channel as "SMS" | "WHATSAPP",
          status: m.status,
          errorCode: m.errorCode,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    });
  }

  async consent(
    userId: string,
    workspaceId: string,
    guestId: string,
    input: GuestMessageConsent,
  ) {
    return this.db.withContext({ userId, workspaceId }, async (tx) => {
      const guest = await tx.guest.findFirst({
        where: { id: guestId, workspaceId, deletedAt: null, status: "ACTIVE" },
      });
      if (!guest)
        problem(
          "NOT_FOUND",
          HttpStatus.NOT_FOUND,
          "Invitatul nu există în acest eveniment.",
        );
      const phone = normalizedPhone(guest.phoneE164 ?? "");
      if (!phone)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Completează telefonul invitatului cu prefix internațional.",
        );
      const data = {
        allowed: input.allowed,
        evidence: input.evidence,
        destinationHash: phoneHash(phone),
        recordedById: userId,
      };
      await tx.guestMessageConsent.upsert({
        where: {
          workspaceId_guestId_channel: {
            workspaceId,
            guestId,
            channel: input.channel,
          },
        },
        create: { workspaceId, guestId, channel: input.channel, ...data },
        update: data,
      });
      return { saved: true };
    });
  }

  async send(
    userId: string,
    workspaceId: string,
    key: string,
    input: GuestMessageInput,
    correlationId: string,
  ) {
    const guestIds = [...new Set(input.guestIds)].sort();
    const requestHash = stableHash({ ...input, guestIds });
    return this.db.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        // Serializes quota reservations and requests across API instances.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('sarbato-phone-messaging',0))`;
        const prior = await tx.guestMessage.findMany({
          where: { workspaceId, requestKey: key },
        });
        if (prior.length) {
          if (prior.some((p) => p.requestHash !== requestHash))
            problem(
              "IDEMPOTENCY_CONFLICT",
              HttpStatus.CONFLICT,
              "Cheia a fost folosită pentru alt mesaj.",
            );
          return { ids: prior.map((p) => p.id), replayed: true };
        }
        if (!phoneChannelReady(this.env, input.channel))
          problem(
            "FEATURE_DISABLED",
            HttpStatus.SERVICE_UNAVAILABLE,
            "Canalul nu este încă activat.",
          );
        if (
          input.channel === "WHATSAPP" &&
          !messageTemplates(this.env)[input.template]
        )
          problem(
            "VALIDATION_FAILED",
            HttpStatus.BAD_REQUEST,
            "Șablonul WhatsApp nu este configurat.",
          );
        const day = new Date();
        day.setUTCHours(0, 0, 0, 0);
        const used = await tx.guestMessage.count({
          where: { workspaceId, createdAt: { gte: day } },
        });
        const global = await tx.$queryRaw<
          { count: bigint }[]
        >`SELECT public.sarbato_message_daily_count() AS count`;
        if (
          used + guestIds.length > this.env.TWILIO_WORKSPACE_DAILY_LIMIT ||
          Number(global[0]?.count ?? 0) + guestIds.length >
            this.env.TWILIO_GLOBAL_DAILY_LIMIT
        )
          problem(
            "RATE_LIMITED",
            HttpStatus.TOO_MANY_REQUESTS,
            "Limita zilnică de mesaje a fost atinsă.",
          );
        const guests = await tx.guest.findMany({
          where: {
            id: { in: guestIds },
            workspaceId,
            status: "ACTIVE",
            deletedAt: null,
          },
        });
        if (guests.length !== guestIds.length)
          problem(
            "NOT_FOUND",
            HttpStatus.NOT_FOUND,
            "Un destinatar nu aparține acestui eveniment sau nu mai este activ.",
          );
        const ids: string[] = [];
        for (const guest of guests) {
          const phone = normalizedPhone(guest.phoneE164 ?? "");
          if (!phone)
            problem(
              "VALIDATION_FAILED",
              HttpStatus.BAD_REQUEST,
              "Un invitat nu are telefon valid cu prefix internațional.",
            );
          if (!testRecipientAllowed(this.env, phone))
            problem(
              "FEATURE_DISABLED",
              HttpStatus.CONFLICT,
              "Canalul este momentan disponibil doar pentru destinatarii de test.",
            );
          const destinationHash = phoneHash(phone);
          const consent = await tx.guestMessageConsent.findUnique({
            where: {
              workspaceId_guestId_channel: {
                workspaceId,
                guestId: guest.id,
                channel: input.channel,
              },
            },
          });
          await tx.$executeRaw`SELECT set_config('app.message_destination_hash',${destinationHash},true)`;
          const suppression = await tx.guestMessageSuppression.findUnique({
            where: {
              destinationHash_channel: {
                destinationHash,
                channel: input.channel,
              },
            },
          });
          if (
            !consent?.allowed ||
            consent.destinationHash !== destinationHash ||
            suppression?.blocked
          )
            problem(
              "VALIDATION_FAILED",
              HttpStatus.CONFLICT,
              "Un destinatar nu are acord activ pentru acest canal sau s-a dezabonat.",
            );
          const id = randomUUID();
          await tx.guestMessage.create({
            data: {
              id,
              workspaceId,
              guestId: guest.id,
              createdById: userId,
              channel: input.channel,
              destinationHash,
              encryptedPayload: sealPhoneMessage(
                { to: phone, body: input.body, template: input.template },
                this.env.OUTBOX_ENCRYPTION_KEY,
                `${workspaceId}:${id}`,
              ),
              requestKey: key,
              requestHash,
            },
          });
          await this.events.record(tx, {
            eventName: "guest.message_requested.v1",
            aggregateType: "guest_message",
            aggregateId: id,
            workspaceId,
            actorUserId: userId,
            correlationId,
            deduplicationKey: `guest-message:${id}`,
            maxAttempts: 3,
            payload: {
              guestMessage: { messageId: id },
              subject: { guestId: guest.id, channel: input.channel },
            },
          });
          ids.push(id);
        }
        return { ids, replayed: false };
      },
    );
  }
}

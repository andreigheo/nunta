import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import {
  normalizedPhone,
  openPhoneMessage,
  phoneChannelReady,
  phoneHash,
  sendTwilioMessage,
  testRecipientAllowed,
  type PhoneChannel,
} from "@weddingos/jobs";

type RunTransaction = <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>;

export async function deliverGuestMessage(
  run: RunTransaction,
  env: ApiEnvironment,
  workspaceId: string,
  messageId: string,
  send: typeof sendTwilioMessage = sendTwilioMessage,
) {
  const prepared = await run(async (tx) => {
    const row = await tx.guestMessage.findFirst({
      where: { id: messageId, workspaceId },
    });
    if (!row) throw new Error("GUEST_MESSAGE_NOT_FOUND");
    if (row.status !== "QUEUED") {
      // A crash after submission is ambiguous. Never automatically submit it again.
      if (row.status === "SENDING")
        await tx.guestMessage.updateMany({
          where: { id: row.id, status: "SENDING" },
          data: { status: "UNKNOWN", errorCode: "SUBMISSION_UNCONFIRMED" },
        });
      return null;
    }
    const channel = row.channel as PhoneChannel;
    const payload = openPhoneMessage(
      row.encryptedPayload,
      env.OUTBOX_ENCRYPTION_KEY,
      `${workspaceId}:${row.id}`,
    );
    const guest = await tx.guest.findFirst({
      where: {
        id: row.guestId,
        workspaceId,
        deletedAt: null,
        status: "ACTIVE",
      },
    });
    const member = await tx.workspaceMembership.findFirst({
      where: { workspaceId, userId: row.createdById, status: "ACTIVE" },
      include: { roleTemplate: true, overrides: true },
    });
    const user = await tx.user.findUnique({
      where: { id: row.createdById },
      select: { status: true },
    });
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });
    const grants = member?.roleTemplate.capabilities;
    const override = member?.overrides.find(
      (o) => o.capability === "campaign.send",
    );
    const canSend = override
      ? override.effect === "ALLOW"
      : Array.isArray(grants) && grants.includes("campaign.send");
    const consent = await tx.guestMessageConsent.findUnique({
      where: {
        workspaceId_guestId_channel: {
          workspaceId,
          guestId: row.guestId,
          channel,
        },
      },
    });
    await tx.$executeRaw`SELECT set_config('app.message_destination_hash',${row.destinationHash},true)`;
    const suppression = await tx.guestMessageSuppression.findUnique({
      where: {
        destinationHash_channel: {
          destinationHash: row.destinationHash,
          channel,
        },
      },
    });
    const valid =
      guest &&
      normalizedPhone(guest.phoneE164 ?? "") === payload.to &&
      phoneHash(payload.to) === row.destinationHash &&
      member &&
      canSend &&
      user?.status === "ACTIVE" &&
      workspace?.status !== "ARCHIVED" &&
      consent?.allowed &&
      consent.destinationHash === row.destinationHash &&
      !suppression?.blocked &&
      phoneChannelReady(env, channel) &&
      testRecipientAllowed(env, payload.to) &&
      Date.now() - row.createdAt.getTime() < 24 * 60 * 60 * 1000;
    if (!valid) {
      await tx.guestMessage.updateMany({
        where: { id: row.id, status: "QUEUED" },
        data: {
          status: "CANCELLED",
          errorCode: "RECIPIENT_OR_CHANNEL_UNAVAILABLE",
        },
      });
      return null;
    }
    const claimed = await tx.guestMessage.updateMany({
      where: { id: row.id, status: "QUEUED" },
      data: { status: "SENDING", attemptedAt: new Date() },
    });
    return claimed.count ? { row, payload, channel } : null;
  });
  if (!prepared) return;
  try {
    const response = await send(
      env,
      messageId,
      prepared.channel,
      prepared.payload,
    );
    await run((tx) =>
      tx.guestMessage.updateMany({
        where: {
          id: messageId,
          workspaceId,
          status: { in: ["SENDING", "UNKNOWN"] },
        },
        data: {
          providerSid: response.sid,
          status: "ACCEPTED",
          errorCode: null,
        },
      }),
    );
  } catch (error) {
    const failure = error as { status?: number; code?: number };
    const rejected =
      typeof failure.status === "number" &&
      failure.status >= 400 &&
      failure.status < 500;
    await run((tx) =>
      tx.guestMessage.updateMany({
        where: { id: messageId, workspaceId, status: "SENDING" },
        data: {
          status: rejected ? "FAILED" : "UNKNOWN",
          errorCode: rejected
            ? `TWILIO_${failure.code ?? failure.status}`
            : "SUBMISSION_UNCONFIRMED",
        },
      }),
    );
  }
}

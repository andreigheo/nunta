import { createHmac } from "node:crypto";

export function campaignGuestAccessToken(
  secret: string,
  campaignRecipientId: string,
) {
  return createHmac("sha256", secret)
    .update("guest-access:v3\0")
    .update(campaignRecipientId)
    .digest("base64url");
}

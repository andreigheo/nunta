import { z } from "zod";

export const phoneChannelSchema = z.enum(["SMS", "WHATSAPP"]);
export const guestMessageInputSchema = z
  .object({
    guestIds: z.array(z.string().uuid()).min(1).max(500),
    channel: phoneChannelSchema,
    body: z.string().trim().min(1).max(1000),
    template: z
      .enum(["event_update", "invitation", "reminder"])
      .default("event_update"),
  })
  .strict();
export const guestMessageConsentSchema = z
  .object({
    channel: phoneChannelSchema,
    allowed: z.boolean(),
    evidence: z.string().trim().min(10).max(300),
  })
  .strict();
export type GuestMessageInput = z.infer<typeof guestMessageInputSchema>;
export type GuestMessageConsent = z.infer<typeof guestMessageConsentSchema>;
export type GuestMessageResource = {
  id: string;
  guestId: string;
  guestName: string;
  channel: "SMS" | "WHATSAPP";
  status: string;
  errorCode: string | null;
  createdAt: string;
};
export type GuestMessagingOverview = {
  channels: { SMS: boolean; WHATSAPP: boolean };
  templates: Array<GuestMessageInput["template"]>;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  groups: Array<{
    id: string;
    name: string;
    color: string | null;
    guestIds: string[];
  }>;
  households: Array<{
    id: string;
    name: string;
    guestIds: string[];
  }>;
  guests: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    householdId: string;
    householdName: string;
    groups: Array<{ id: string; name: string; color: string | null }>;
    sms: boolean;
    whatsapp: boolean;
  }>;
  messages: GuestMessageResource[];
};

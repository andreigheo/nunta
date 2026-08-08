import { describe, expect, it } from "vitest";
import {
  campaignTransitionSchema,
  campaignAudienceFilterSchema,
  capabilityKeys,
  createGuestSchema,
  createGuestTagSchema,
  createInvitationRecipientsSchema,
  defaultRoleTemplates,
  guestBulkCommandSchema,
  guestRsvpRequestSchema,
  invitationDocumentSchema,
  saveInvitationDraftSchema,
} from "@weddingos/contracts";
import {
  createOpaqueToken,
  decryptSensitive,
  encryptSensitive,
  hashToken,
  stableHash,
} from "../src/guests/sensitive.crypto";
import {
  normalizeEmail,
  normalizePhone,
} from "../src/guests/guest-crm.service";
import { campaignTransition } from "../src/guests/invitation-campaign.service";
import { nextGuestAction } from "../src/planning/planning.service";

const uuid = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";

describe("Slice 3 guest, invitation, RSVP and menu rules", () => {
  it("normalizes contacts and rejects malformed phone values", () => {
    expect(normalizeEmail(" ANA@Example.Test ")).toBe("ana@example.test");
    expect(normalizePhone("(373) 60 123-456")).toBe("+37360123456");
    expect(() =>
      createGuestSchema.parse(guest({ phone: "call-me-now" })),
    ).toThrow();
  });

  it("enforces a plus-one primary guest contract", () => {
    expect(
      createGuestSchema.parse(guest({ isPlusOne: true, primaryGuestId: uuid }))
        .isPlusOne,
    ).toBe(true);
    expect(createGuestSchema.parse(guest()).isPlusOne).toBe(false);
  });

  it("keeps child and logistics flags explicit", () => {
    const child = createGuestSchema.parse(
      guest({ isChild: true, dateOfBirth: "2017-03-04", needsTransport: true }),
    );
    expect(child).toMatchObject({
      isChild: true,
      dateOfBirth: "2017-03-04",
      needsTransport: true,
    });
  });

  it("requires at least one invitation recipient and dedupes input shape", () => {
    expect(() =>
      createInvitationRecipientsSchema.parse({
        householdIds: [],
        guestIds: [],
      }),
    ).toThrow();
    expect(
      createInvitationRecipientsSchema.parse({
        householdIds: [uuid],
        guestIds: [],
      }).householdIds,
    ).toEqual([uuid]);
  });

  it("validates immutable invitation document structure and slugs", () => {
    const valid = invitationDocumentSchema.parse({
      sections: [
        {
          id: "hero",
          type: "hero",
          visible: true,
          content: { actionUrl: "https://example.test/rsvp" },
        },
      ],
    });
    expect(valid.sections).toHaveLength(1);
    expect(() =>
      saveInvitationDraftSchema.parse({
        slug: "Invalid Slug",
        defaultLanguage: "ro",
        availableLanguages: ["ro"],
        accessPolicy: "TOKEN_ONLY",
        document: valid,
        settings: {},
      }),
    ).toThrow();
  });

  it("rejects script and protocol-relative URLs in invitation content", () => {
    expect(() =>
      invitationDocumentSchema.parse({
        sections: [
          {
            id: "hero",
            type: "hero",
            visible: true,
            content: { actionUrl: "javascript:alert(1)" },
          },
        ],
      }),
    ).toThrow(/Unsafe invitation URL/);
    expect(() =>
      invitationDocumentSchema.parse({
        sections: [
          {
            id: "hero",
            type: "hero",
            visible: true,
            content: { mapLink: "//evil.test/x" },
          },
        ],
      }),
    ).toThrow(/Unsafe invitation URL/);
  });

  it("encrypts sensitive notes with authenticated ciphertext", () => {
    const config = {
      keyId: "unit-v1",
      secret: "sensitive-test-secret-at-least-32-characters",
    };
    const encrypted = encryptSensitive("alergie severă", config)!;
    expect(encrypted).not.toContain("alergie severă");
    expect(decryptSensitive(encrypted, config)).toBe("alergie severă");
    expect(() =>
      decryptSensitive(encrypted.replace(/.$/, "x"), config),
    ).toThrow();
  });

  it("creates opaque tokens, hashes them one-way and hashes stable JSON deterministically", () => {
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThan(40);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).not.toBe(token);
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
  });

  it("accepts only declared campaign transitions", () => {
    expect(campaignTransition("QUEUED", "PAUSE")).toBe("PAUSED");
    expect(campaignTransition("PAUSED", "RESUME")).toBe("QUEUED");
    expect(() => campaignTransition("COMPLETED", "SEND_NOW")).toThrow();
    expect(() =>
      campaignTransitionSchema.parse({ transition: "SEND_SMS" }),
    ).toThrow();
  });

  it("validates household-scoped RSVP answers and versioning", () => {
    const parsed = guestRsvpRequestSchema.parse({
      token: "a".repeat(40),
      version: 2,
      idempotencyKey: "rsvp-unit-key",
      members: [
        {
          guestId: uuid,
          events: [{ eventId, attendance: "CONFIRMED" }],
          allergies: [],
          needsTransport: false,
          needsAccommodation: false,
        },
      ],
      message: "Ne vedem acolo",
    });
    expect(parsed.members[0]?.events[0]?.attendance).toBe("CONFIRMED");
    expect(() =>
      guestRsvpRequestSchema.parse({
        token: "a".repeat(40),
        idempotencyKey: "rsvp-unit-key",
        version: 0,
        members: [],
      }),
    ).toThrow();
  });

  it("keeps bulk commands closed to declared operations", () => {
    expect(
      guestBulkCommandSchema.parse({ command: "ARCHIVE", guestIds: [uuid] })
        .command,
    ).toBe("ARCHIVE");
    expect(() =>
      guestBulkCommandSchema.parse({ command: "DELETE_ALL", guestIds: [uuid] }),
    ).toThrow();
  });

  it("validates guest tags and typed campaign audience filters", () => {
    expect(
      createGuestTagSchema.parse({ name: "Familie", color: "#6d5dfc" }).name,
    ).toBe("Familie");
    expect(() =>
      createGuestTagSchema.parse({ name: "Familie", color: "purple" }),
    ).toThrow();
    expect(
      campaignAudienceFilterSchema.parse({
        guestIds: [uuid],
        rsvpStatuses: ["NO_RESPONSE"],
        includeChildren: false,
      }),
    ).toMatchObject({ includeChildren: false });
    expect(() =>
      campaignAudienceFilterSchema.parse({ unsupportedFilter: true }),
    ).toThrow();
  });

  it("prioritizes publishing, missing contacts, reminders and allergies deterministically", () => {
    expect(
      nextGuestAction(actionInput({ invitationPublished: false }))?.type,
    ).toBe("invitation.publish");
    expect(nextGuestAction(actionInput({ missingContacts: 2 }))?.type).toBe(
      "guest.contacts",
    );
    expect(nextGuestAction(actionInput({ noResponse: 4 }))?.type).toBe(
      "rsvp.reminder",
    );
    expect(nextGuestAction(actionInput({ allergyIssues: 1 }))?.priority).toBe(
      "urgent",
    );
  });

  it("grants sensitive capabilities only to intended default roles", () => {
    const owner = defaultRoleTemplates.find(
      (role) => role.key === "couple_owner",
    )!;
    const family = defaultRoleTemplates.find(
      (role) => role.key === "family_collaborator",
    )!;
    expect(owner.capabilities).toContain("guest.read_sensitive");
    expect(owner.capabilities).toContain("menu.read_allergies");
    expect(family.capabilities).not.toContain("guest.read_pii");
    expect(family.capabilities).not.toContain("menu.read_allergies");
    expect(capabilityKeys).toContain("campaign.send");
  });
});

function guest(overrides: Record<string, unknown> = {}) {
  return {
    householdId: uuid,
    firstName: "Ana",
    lastName: "Pop",
    preferredLanguage: "ro",
    side: "COMMON",
    isChild: false,
    isPlusOne: false,
    plusOneAllowed: false,
    needsTransport: false,
    needsAccommodation: false,
    ...overrides,
  };
}

function actionInput(
  overrides: Partial<Parameters<typeof nextGuestAction>[0]> = {},
): Parameters<typeof nextGuestAction>[0] {
  return {
    invitationPublished: true,
    missingContacts: 0,
    hasCampaign: true,
    hasDeadline: true,
    noResponse: 0,
    menuIncomplete: 0,
    allergyIssues: 0,
    ...overrides,
  };
}

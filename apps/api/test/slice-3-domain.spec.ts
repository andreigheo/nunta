import { describe, expect, it } from "vitest";
import {
  applyInvitationSyncSchema,
  campaignTransitionSchema,
  campaignAudienceFilterSchema,
  capabilityKeys,
  createGuestSchema,
  createGuestTagSchema,
  createInvitationRecipientsSchema,
  defaultRoleTemplates,
  guestBulkCommandSchema,
  guestCompanionBootstrapSchema,
  guestRsvpRequestSchema,
  invitationDocumentSchema,
  invitationRecipientSchema,
  invitationSettingsSchema,
  invitationVariantOverridesSchema,
  organizerMenuSelectionResourceSchema,
  organizerMenuSelectionSchema,
  guestInvitationOpenSchema,
  guestLinkAccessSchema,
  invitationContainsStarterContent,
  saveInvitationDraftSchema,
} from "@weddingos/contracts";
import {
  createOpaqueToken,
  decryptSensitive,
  encryptSensitive,
  hashToken,
  stableHash,
} from "../src/guests/sensitive.crypto";
import { asyncEventNameSchema } from "@weddingos/jobs";
import {
  normalizeEmail,
  normalizePhone,
} from "../src/guests/guest-crm.service";
import { campaignTransition } from "../src/guests/invitation-campaign.service";
import { nextGuestAction } from "../src/planning/planning.service";
import {
  invitationMediaReferences,
  resolvedInvitationContainsMedia,
  resolveInvitationVariant,
  visibleInvitationDocument,
} from "../src/guests/invitation-resolution";

const uuid = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";

describe("Slice 3 guest, invitation, RSVP and menu rules", () => {
  it("contracts organizer menu selection updates and nullable removal", () => {
    expect(
      organizerMenuSelectionSchema.parse({
        menuId: uuid,
        selectionVersion: 2,
      }),
    ).toEqual({ menuId: uuid, selectionVersion: 2 });
    expect(
      organizerMenuSelectionSchema.parse({
        menuId: null,
        selectionVersion: null,
      }),
    ).toEqual({ menuId: null, selectionVersion: null });
    expect(
      organizerMenuSelectionResourceSchema.parse({
        guestId: uuid,
        menuId: null,
        menuName: null,
        version: null,
      }),
    ).toMatchObject({ guestId: uuid, menuId: null, version: null });
  });

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

  it("validates cinematic cover media and bounded motion settings", () => {
    const settings = invitationSettingsSchema.parse({
      experience: {
        enabled: true,
        style: "split_panels",
        replay: "first_visit",
        panelColor: "#3b183f",
        backgroundColor: "#f7f7f3",
        accentColor: "#f06449",
        texture: "paper",
        monogram: "A & M",
        frontMessage: "Pentru familia Pop",
        coverImageUrl: null,
        coverMediaId: uuid,
        durationMs: 1400,
      },
    });
    expect(settings.experience?.coverMediaId).toBe(uuid);
    expect(() =>
      invitationSettingsSchema.parse({
        experience: { coverMediaId: "not-a-media-id" },
      }),
    ).toThrow();
    expect(() =>
      invitationSettingsSchema.parse({
        experience: { durationMs: 5000 },
      }),
    ).toThrow();
  });

  it("distinguishes starter examples from reviewed invitation content", () => {
    expect(
      invitationContainsStarterContent({
        sections: [
          {
            content: {
              names: "Ana & Mihai",
              date: "12 septembrie 2027",
            },
          },
        ],
      }),
    ).toBe(true);
    expect(
      invitationContainsStarterContent({
        sections: [{ content: { names: "Andrei & Andreea" } }],
      }),
    ).toBe(false);
    expect(
      invitationContainsStarterContent(
        visibleInvitationDocument({
          sections: [
            {
              id: "hero",
              visible: false,
              content: {
                names: "Ana & Mihai",
                date: "12 septembrie 2027",
              },
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      invitationContainsStarterContent(
        resolveInvitationVariant(
          {
            sections: [
              {
                id: "hero",
                type: "hero",
                visible: true,
                content: { names: "Ana & Mihai" },
              },
            ],
          },
          {},
          {
            document: {
              sections: [
                {
                  id: "hero",
                  content: { venue: "Conacul Ambient · Cristian" },
                },
              ],
            },
          },
        ),
      ),
    ).toBe(true);
  });

  it("authorizes every explicit invitation media reference used by V2", () => {
    const baseDocument = {
      sections: [
        {
          id: "hero",
          type: "hero",
          visible: true,
          content: {
            mediaId: "artwork",
            backgroundMediaId: "background",
            sectionStyle: { backgroundMode: "image" },
            unrelatedMediaId: "must-not-be-authorized",
            decorations: [
              { kind: "image", mediaId: "decoration" },
              { kind: "shape", mediaId: "must-not-be-authorized" },
            ],
          },
        },
        {
          id: "video",
          type: "custom",
          visible: true,
          content: {
            blockKind: "video",
            url: "https://cdn.example.test/invitation.mp4",
            posterMediaId: "poster",
          },
        },
      ],
    };
    const references = invitationMediaReferences(baseDocument, {
      experience: { enabled: true, coverMediaId: "cover" },
    });

    expect([...references].sort()).toEqual(
      ["artwork", "background", "cover", "decoration", "poster"].sort(),
    );
    expect(references.has("must-not-be-authorized")).toBe(false);
  });

  it("authorizes only media in the effective visible invitation variant", () => {
    const baseDocument = {
      sections: [
        {
          id: "hero",
          type: "hero",
          visible: true,
          content: {
            backgroundMediaId: "base-hero",
            sectionStyle: { backgroundMode: "image" },
          },
        },
        {
          id: "story",
          type: "story",
          visible: true,
          content: { mediaId: "base-story" },
        },
      ],
    };
    const overrides = {
      document: {
        sections: [
          {
            id: "hero",
            content: { backgroundMediaId: "variant-hero" },
          },
          { id: "story", visible: false },
        ],
      },
    };

    expect(
      resolvedInvitationContainsMedia(
        baseDocument,
        {},
        overrides,
        "variant-hero",
      ),
    ).toBe(true);
    expect(
      resolvedInvitationContainsMedia(baseDocument, {}, overrides, "base-hero"),
    ).toBe(false);
    expect(
      resolvedInvitationContainsMedia(
        baseDocument,
        {},
        overrides,
        "base-story",
      ),
    ).toBe(false);
  });

  it("does not authorize retained media that the renderer does not display", () => {
    const references = invitationMediaReferences(
      {
        sections: [
          {
            id: "story",
            type: "story",
            visible: true,
            content: {
              backgroundMediaId: "solid-background",
              sectionStyle: { backgroundMode: "solid" },
            },
          },
        ],
      },
      {
        experience: { enabled: false, coverMediaId: "disabled-cover" },
      },
    );

    expect(references.has("solid-background")).toBe(false);
    expect(references.has("disabled-cover")).toBe(false);
  });

  it("keeps variant overrides and connected sync paths closed and typed", () => {
    expect(
      invitationVariantOverridesSchema.parse({
        document: {
          sections: [{ id: "hero", content: { names: "Ana & Mihai" } }],
        },
        settings: { colors: { accent: "#f06449" } },
      }),
    ).toBeTruthy();
    expect(
      applyInvitationSyncSchema.parse({
        sourceRevision: "a".repeat(64),
        paths: ["hero.names", "schedule.items"],
      }).paths,
    ).toEqual(["hero.names", "schedule.items"]);
    expect(() =>
      applyInvitationSyncSchema.parse({
        sourceRevision: "a".repeat(64),
        paths: ["custom.body"],
      }),
    ).toThrow();
  });

  it("separates link access from explicit invitation opening", () => {
    expect(
      guestLinkAccessSchema.parse({
        token: "a".repeat(40),
        idempotencyKey: "link-access-1",
      }).source,
    ).toBe("guest_page");
    expect(
      guestInvitationOpenSchema.parse({
        token: "a".repeat(40),
        idempotencyKey: "open-cover-1",
        source: "cover",
      }).source,
    ).toBe("cover");
  });

  it("registers every Invitation Studio workflow event in the outbox contract", () => {
    for (const eventName of [
      "invitation.version_restored.v1",
      "invitation.variant_created.v1",
      "invitation.variant_draft_updated.v1",
      "invitation.variant_archived.v1",
      "invitation.connected_data_applied.v1",
      "invitation.recipient_variant_assigned.v1",
    ])
      expect(asyncEventNameSchema.safeParse(eventName).success).toBe(true);
  });

  it("keeps recipient labels and language in the distribution contract", () => {
    expect(
      invitationRecipientSchema.parse({
        id: uuid,
        invitationSiteId: "00000000-0000-4000-8000-000000000003",
        householdId: "00000000-0000-4000-8000-000000000004",
        householdName: "Familia Pop",
        guestId: null,
        guestName: null,
        invitationVersionId: "00000000-0000-4000-8000-000000000005",
        invitationVariantId: null,
        preferredLanguage: "ro",
        status: "ready",
        openedAt: null,
        lastAccessedAt: null,
        rsvpCompletedAt: null,
        version: 1,
      }),
    ).toMatchObject({
      householdName: "Familia Pop",
      guestName: null,
      preferredLanguage: "ro",
    });
  });

  it("contracts invitation experience and interaction state in guest bootstrap", () => {
    const bootstrap = guestCompanionBootstrapSchema.parse({
      couple: {},
      invitation: {
        siteId: "00000000-0000-4000-8000-000000000003",
        document: {
          sections: [{ id: "hero", type: "hero", visible: true, content: {} }],
        },
        settings: { experience: { coverMediaId: uuid } },
        language: "ro",
        baseVersionId: "00000000-0000-4000-8000-000000000005",
        variant: null,
        experience: { coverMediaId: uuid },
      },
      interaction: {
        invitationOpenedAt: null,
        lastAccessedAt: null,
        shouldPlayReveal: true,
      },
      events: [],
      household: { id: uuid, name: "Familia Pop", members: [] },
      rsvp: {},
      rsvpConfig: {
        deadline: null,
        attendanceEnabled: true,
        perEventAttendance: true,
        plusOneQuestion: true,
        childrenConfirmation: true,
        menuSelection: true,
        allergyCollection: true,
        accessibilityCollection: true,
        transportQuestion: true,
        accommodationQuestion: true,
        guestMessage: true,
        allowEdits: true,
        closedMessage: "RSVP închis",
        languages: ["ro"],
      },
      menus: [],
      accommodationRecommendations: [],
      deadline: null,
      allowEdits: true,
      closedMessage: "RSVP închis",
    });
    expect(bootstrap.invitation.experience?.coverMediaId).toBe(uuid);
    expect(bootstrap.interaction.shouldPlayReveal).toBe(true);
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
    expect(() => campaignTransition("QUEUED", "PAUSE")).toThrow();
    expect(() => campaignTransition("PAUSED", "RESUME")).toThrow();
    expect(() => campaignTransition("COMPLETED", "SEND_NOW")).toThrow();
    expect(() =>
      campaignTransitionSchema.parse({ transition: "SEND_NOW" }),
    ).toThrow(/current campaign audience/i);
    expect(
      campaignTransitionSchema.parse({ transition: "RETRY_FAILED" }),
    ).toEqual({ transition: "RETRY_FAILED" });
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

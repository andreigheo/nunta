import { describe, expect, it } from "vitest";
import {
  capabilityKeySchema,
  checkInOfflineSyncSchema,
  createCheckInCredentialSchema,
  createGuestMomentSchema,
  createRunOfShowItemSchema,
  createWeddingDayAnnouncementSchema,
  createWeddingDayContactSchema,
  createWeddingDayIncidentSchema,
  createWeddingDayPlanSchema,
  detectMediaType,
  guestCheckInCommandSchema,
  guestMomentTransitionSchema,
  runOfShowDependenciesSchema,
  runOfShowTransitionSchema,
  weddingDayExportSchema,
} from "@weddingos/contracts";
import { consumerJobId, selectOutboxConsumers } from "@weddingos/jobs";

const id = "00000000-0000-4000-8000-000000000001";
const id2 = "00000000-0000-4000-8000-000000000002";
const occurredAt = "2027-07-20T10:00:00.000Z";

describe("Slice 8 operational contracts", () => {
  it("validates an exact-date Wedding Day plan", () => {
    expect(
      createWeddingDayPlanSchema.safeParse({
        weddingEventId: id,
        name: "Ziua nunții",
        timezone: "Europe/Bucharest",
        operationalDate: "2027-08-21",
      }).success,
    ).toBe(true);
    expect(
      createWeddingDayPlanSchema.safeParse({
        weddingEventId: id,
        name: "X",
        timezone: "UTC",
        operationalDate: "21.08.2027",
      }).success,
    ).toBe(false);
  });

  it("requires an ordered, bounded run-of-show interval", () => {
    expect(
      createRunOfShowItemSchema.safeParse({
        title: "Primirea invitaților",
        plannedStartAt: occurredAt,
        plannedEndAt: "2027-07-20T11:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      createRunOfShowItemSchema.safeParse({
        title: "A",
        plannedStartAt: "invalid",
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported run-of-show transitions", () => {
    expect(
      runOfShowTransitionSchema.safeParse({
        transition: "MARK_DELAYED",
        delayEstimateMinutes: 20,
      }).success,
    ).toBe(true);
    expect(
      runOfShowTransitionSchema.safeParse({ transition: "FORCE_COMPLETE" })
        .success,
    ).toBe(false);
  });

  it("limits dependency type and volume", () => {
    expect(
      runOfShowDependenciesSchema.safeParse({
        dependencies: [{ itemId: id, dependencyType: "FINISH_TO_START" }],
      }).success,
    ).toBe(true);
    expect(
      runOfShowDependenciesSchema.safeParse({
        dependencies: [{ itemId: id, dependencyType: "UNKNOWN" }],
      }).success,
    ).toBe(false);
  });

  it("keeps sensitive incidents on a closed type set", () => {
    expect(
      createWeddingDayIncidentSchema.safeParse({
        type: "MEDICAL",
        severity: "CRITICAL",
        title: "Asistență necesară",
        descriptionPrivate: "Echipa medicală a fost anunțată.",
      }).success,
    ).toBe(true);
    expect(
      createWeddingDayIncidentSchema.safeParse({
        type: "GOSSIP",
        severity: "CRITICAL",
        title: "X",
        descriptionPrivate: "Y",
      }).success,
    ).toBe(false);
  });

  it("requires at least one announcement audience and channel", () => {
    expect(
      createWeddingDayAnnouncementSchema.safeParse({
        title: "Schimbare acces",
        body: "Folosiți intrarea de nord.",
        channels: ["GUEST_COMPANION"],
        audiences: [{ type: "ALL_CONFIRMED_GUESTS", selector: {} }],
      }).success,
    ).toBe(true);
    expect(
      createWeddingDayAnnouncementSchema.safeParse({
        title: "Mesaj",
        body: "Text",
        channels: [],
        audiences: [],
      }).success,
    ).toBe(false);
  });

  it("validates encrypted contact input without accepting arbitrary fields", () => {
    expect(
      createWeddingDayContactSchema.safeParse({
        type: "EMERGENCY",
        name: "Coordonator medical",
        role: "Prim ajutor",
        phone: "+40 700 000 000",
      }).success,
    ).toBe(true);
    expect(
      createWeddingDayContactSchema.safeParse({
        type: "UNKNOWN",
        name: "X",
        role: "Y",
      }).success,
    ).toBe(false);
  });

  it("requires credential ownership and expiry", () => {
    expect(
      createCheckInCredentialSchema.safeParse({
        householdId: id,
        credentialType: "HOUSEHOLD",
        expiresAt: occurredAt,
      }).success,
    ).toBe(true);
    expect(
      createCheckInCredentialSchema.safeParse({
        credentialType: "QR_FOREVER",
        expiresAt: "never",
      }).success,
    ).toBe(false);
  });

  it("requires a reason for manual check-in override at domain boundary", () => {
    expect(
      guestCheckInCommandSchema.safeParse({
        commandId: id,
        guestIds: [id2],
        override: true,
        overrideReason: "Confirmat de organizator",
      }).success,
    ).toBe(true);
    expect(
      guestCheckInCommandSchema.safeParse({ commandId: id, guestIds: [] })
        .success,
    ).toBe(false);
  });

  it("bounds offline sync commands and requires snapshot identity", () => {
    expect(
      checkInOfflineSyncSchema.safeParse({
        devicePublicId: "station-device-01",
        deviceSecret: "x".repeat(32),
        snapshotId: id,
        snapshotVersion: 1,
        commands: [
          {
            commandId: id2,
            guestId: id,
            credentialProof: "a".repeat(64),
            action: "CHECK_IN",
            occurredAtDevice: occurredAt,
            localSequence: 1,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      checkInOfflineSyncSchema.safeParse({
        devicePublicId: "short",
        commands: [],
      }).success,
    ).toBe(false);
  });

  it("enforces media type, size and checksum intent", () => {
    expect(
      createGuestMomentSchema.safeParse({
        weddingEventId: id,
        mediaType: "VIDEO",
        originalFileName: "dans.mp4",
        contentType: "video/mp4",
        sizeBytes: 1024,
        checksumSha256: "a".repeat(64),
      }).success,
    ).toBe(true);
    expect(
      createGuestMomentSchema.safeParse({
        weddingEventId: id,
        mediaType: "IMAGE",
        originalFileName: "virus.exe",
        contentType: "application/octet-stream",
        sizeBytes: 1,
        checksumSha256: "x",
      }).success,
    ).toBe(false);
  });

  it("detects supported image and video signatures", () => {
    expect(detectMediaType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
    expect(
      detectMediaType(
        Buffer.from([
          0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
        ]),
      ),
    ).toBe("video/mp4");
    expect(detectMediaType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]))).toBe(
      "video/webm",
    );
    expect(
      detectMediaType(
        Buffer.from([
          0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20,
        ]),
      ),
    ).toBe("video/quicktime");
  });

  it("keeps moderation transitions explicit", () => {
    expect(
      guestMomentTransitionSchema.safeParse({ transition: "APPROVE" }).success,
    ).toBe(true);
    expect(
      guestMomentTransitionSchema.safeParse({
        transition: "PUBLISH_WITHOUT_REVIEW",
      }).success,
    ).toBe(false);
  });

  it("registers every Slice 8 atomic capability", () => {
    for (const capability of [
      "wedding_day.go_live",
      "incident.read_sensitive",
      "announcement.publish",
      "check_in.override",
      "check_in.offline_sync",
      "guest_moment.moderate",
      "gallery.publish",
    ]) {
      expect(capabilityKeySchema.safeParse(capability).success).toBe(true);
    }
  });

  it("requires the canonical plan or session scope for each export", () => {
    expect(
      weddingDayExportSchema.safeParse({
        type: "RUN_SHEET",
        format: "xlsx",
        planId: id,
      }).success,
    ).toBe(true);
    expect(
      weddingDayExportSchema.safeParse({
        type: "ATTENDANCE",
        format: "csv",
        planId: id,
      }).success,
    ).toBe(false);
  });
});

describe("Slice 8 outbox fan-out", () => {
  it("selects live, notification and activity consumers independently", () => {
    const consumers = selectOutboxConsumers({
      eventName: "wedding_day.incident_created.v1",
      hasEmail: false,
      payload: {
        occurredAt,
        subject: { incidentId: id },
        weddingDayLive: { liveEventId: id },
        incidentEscalation: { incidentId: id },
        activity: {
          category: "wedding_day",
          action: "incident_created",
          summary: "Incident creat",
          entityType: "WeddingDayIncident",
          entityId: id,
        },
      },
    });
    expect(consumers).toEqual(
      expect.arrayContaining([
        "wedding_day_live_projection",
        "incident_escalation",
        "activity_projection",
      ]),
    );
    expect(new Set(consumers).size).toBe(consumers.length);
  });

  it("selects one durable media scan and deterministic consumer job IDs", () => {
    const consumers = selectOutboxConsumers({
      eventName: "guest_moment.uploaded.v1",
      hasEmail: false,
      payload: {
        occurredAt,
        subject: { momentId: id },
        guestMomentScan: {
          momentId: id,
          mediaId: id2,
          storedObjectId: "00000000-0000-4000-8000-000000000003",
        },
      },
    });
    expect(consumers).toContain("guest_moment_scan");
    expect(consumerJobId(id, "guest_moment_scan")).toBe(
      `${id}--guest_moment_scan`,
    );
  });

  it("selects one durable Wedding Day export consumer", () => {
    const consumers = selectOutboxConsumers({
      eventName: "wedding_day.export_requested.v1",
      hasEmail: false,
      payload: {
        occurredAt,
        subject: { artifactId: id },
        weddingDayExport: {
          artifactId: id,
          requestedByUserId: id2,
          type: "RUN_SHEET",
          format: "csv",
          planId: id,
        },
      },
    });
    expect(
      consumers.filter((consumer) => consumer === "wedding_day_export"),
    ).toHaveLength(1);
  });
});

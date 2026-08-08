import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import { PrismaClient } from "@weddingos/database";
import { assertDestructiveDatabasePurpose } from "./database-identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ProblemFilter } from "../src/common/problem.filter";
import { hashToken } from "../src/guests/sensitive.crypto";

const origin = process.env.WEB_URL!;
const database = new PrismaClient({
  datasourceUrl: process.env.DATABASE_OWNER_URL!,
});
const webhookSecret = "weddingos-local-outbox-encryption-key-change-production";

type Account = {
  email: string;
  userId: string;
  agent: ReturnType<typeof request.agent>;
};

describe.sequential("Slice 3 guest journey integration", () => {
  let application!: INestApplication;
  let owner!: Account;
  let outsider!: Account;
  let workspaceId = "";
  let householdId = "";
  let primaryGuestId = "";
  let childGuestId = "";
  let recipientId = "";
  let guestToken = "";
  let eventIds: string[] = [];
  let menuId = "";
  let submissionId = "";
  let submissionVersion = 1;

  beforeAll(async () => {
    await cleanDatabase();
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    application = testingModule.createNestApplication();
    application.use(cookieParser());
    application.useGlobalFilters(new ProblemFilter());
    await application.init();
    owner = await createAccount("slice3-owner");
    outsider = await createAccount("slice3-outsider");
    workspaceId = await readyWorkspace(owner, "Guest journey");
  }, 180_000);

  afterAll(async () => {
    await application?.close();
    await database.$disconnect();
  });

  it("covers household and guest CRUD, child and plus-one rules, concurrency and tenant isolation", async () => {
    const householdKey = `household-${randomUUID()}`;
    const household = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/households`)
      .set("Origin", origin)
      .set("Idempotency-Key", householdKey)
      .send({
        name: "Familia Pop",
        preferredLanguage: "ro",
        side: "PARTNER_ONE",
        city: "Chișinău",
      })
      .expect(201);
    const replay = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/households`)
      .set("Origin", origin)
      .set("Idempotency-Key", householdKey)
      .send({
        name: "Familia Pop",
        preferredLanguage: "ro",
        side: "PARTNER_ONE",
        city: "Chișinău",
      })
      .expect(201);
    expect(replay.body.data.id).toBe(household.body.data.id);
    householdId = household.body.data.id;

    const updated = await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/households/${householdId}`)
      .set("Origin", origin)
      .set("If-Match", `"${household.body.data.version}"`)
      .send({ city: "Orhei" })
      .expect(200);
    await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/households/${householdId}`)
      .set("Origin", origin)
      .set("If-Match", `"${household.body.data.version}"`)
      .send({ city: "Cahul" })
      .expect(412);
    expect(updated.body.data.city).toBe("Orhei");

    const primary = await createGuest({
      firstName: "Ana",
      lastName: "Pop",
      email: owner.email,
      plusOneAllowed: true,
    });
    primaryGuestId = primary.id;
    const child = await createGuest({
      firstName: "Mara",
      lastName: "Pop",
      isChild: true,
      dateOfBirth: "2017-03-04",
    });
    childGuestId = child.id;
    const plusOne = await createGuest({
      firstName: "Alex",
      lastName: "Invitat",
      isPlusOne: true,
      primaryGuestId,
    });
    expect(plusOne.isPlusOne).toBe(true);
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guests`)
      .set("Origin", origin)
      .set("Idempotency-Key", `duplicate-plus-${randomUUID()}`)
      .send(
        guestPayload({
          firstName: "Alt",
          lastName: "Plus",
          isPlusOne: true,
          primaryGuestId,
        }),
      )
      .expect(422);
    const listed = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/guests`)
      .expect(200);
    expect(listed.body.data.summary.people).toMatchObject({
      children: 1,
      plusOnes: 1,
    });
    const tag = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guest-tags`)
      .set("Origin", origin)
      .set("Idempotency-Key", `tag-${randomUUID()}`)
      .send({ name: "Familie apropiată", color: "#6d5dfc" })
      .expect(201);
    const bulkKey = `bulk-tag-${randomUUID()}`;
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guest-bulk-commands`)
      .set("Origin", origin)
      .set("Idempotency-Key", bulkKey)
      .send({
        command: "ADD_TAG",
        guestIds: [primaryGuestId, childGuestId],
        tagId: tag.body.data.id,
      })
      .expect(201);
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guest-bulk-commands`)
      .set("Origin", origin)
      .set("Idempotency-Key", bulkKey)
      .send({
        command: "ADD_TAG",
        guestIds: [primaryGuestId, childGuestId],
        tagId: tag.body.data.id,
      })
      .expect(201);
    const tagged = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/guests?tag=${tag.body.data.id}&sort=first_name&limit=1`,
      )
      .expect(200);
    expect(tagged.body.data.items).toHaveLength(1);
    expect(tagged.body.data.nextCursor).toBeTruthy();
    expect(tagged.body.data.items[0].tags[0].name).toBe("Familie apropiată");
    await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/guest-tags/${tag.body.data.id}`)
      .set("Origin", origin)
      .set("If-Match", `"${tag.body.data.version}"`)
      .send({ name: "Familie VIP" })
      .expect(200);
    await outsider.agent
      .get(`/api/v1/workspaces/${workspaceId}/guests`)
      .expect(403);
    await outsider.agent
      .get(`/api/v1/workspaces/${workspaceId}/households/${householdId}`)
      .expect(403);
  });

  it("parses CSV and XLSX imports, previews duplicates and commits idempotently", async () => {
    const csv =
      "firstName,lastName,email,household\nIon,Pop,ion@example.test,Familia Ion\nAna,Pop," +
      owner.email +
      ",Familia Pop\n";
    const first = await uploadImport(
      "guest-list.csv",
      "text/csv",
      csv,
      `import-csv-${randomUUID()}`,
    );
    await expect
      .poll(
        async () =>
          (
            await database.guestImport.findUniqueOrThrow({
              where: { id: first.import.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("READY_FOR_REVIEW");
    const rows = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/guest-imports/${first.import.id}/rows`,
      )
      .expect(200);
    expect(rows.body.data.items).toHaveLength(2);
    expect(
      rows.body.data.items.some(
        (row: { duplicateGuestId: string | null }) =>
          row.duplicateGuestId === primaryGuestId,
      ),
    ).toBe(true);
    const importRow = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/guest-imports/${first.import.id}`)
      .expect(200);
    const mapped = await owner.agent
      .patch(
        `/api/v1/workspaces/${workspaceId}/guest-imports/${first.import.id}/mapping`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${importRow.body.data.version}"`)
      .send({
        mapping: {
          firstName: "firstName",
          lastName: "lastName",
          email: "email",
          household: "household",
        },
      })
      .expect(200);
    const commitKey = `commit-${randomUUID()}`;
    const committed = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/guest-imports/${first.import.id}/commit`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${mapped.body.data.version}"`)
      .set("Idempotency-Key", commitKey)
      .expect(201);
    const replay = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/guest-imports/${first.import.id}/commit`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${mapped.body.data.version}"`)
      .set("Idempotency-Key", commitKey)
      .expect(201);
    expect(replay.body.data.committedRows).toBe(
      committed.body.data.committedRows,
    );

    const xlsx = await uploadImport(
      "guest-list.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Prenume custom,Nume custom,Contact personal,Familie custom\nElena,Rusu,elena@example.test,Familia Rusu\n",
      `import-xlsx-${randomUUID()}`,
    );
    await expect
      .poll(
        async () =>
          (
            await database.guestImport.findUniqueOrThrow({
              where: { id: xlsx.import.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("READY_FOR_MAPPING");
    const xlsxStatus = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/guest-imports/${xlsx.import.id}`)
      .expect(200);
    await owner.agent
      .patch(
        `/api/v1/workspaces/${workspaceId}/guest-imports/${xlsx.import.id}/mapping`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${xlsxStatus.body.data.version}"`)
      .send({
        mapping: {
          firstName: "Prenume custom",
          lastName: "Nume custom",
          email: "Contact personal",
          household: "Familie custom",
        },
      })
      .expect(200);
    const mappedRows = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/guest-imports/${xlsx.import.id}/rows`,
      )
      .expect(200);
    expect(mappedRows.body.data.items).toHaveLength(1);
    expect(mappedRows.body.data.items[0].normalizedData).toMatchObject({
      firstName: "Elena",
      lastName: "Rusu",
      email: "elena@example.test",
      household: "Familia Rusu",
    });
    expect(mappedRows.body.data.items[0].validationErrors).toEqual([]);
  }, 120_000);

  it("versions and publishes the invitation, dedupes recipients, opens only the token household and rejects revoked tokens", async () => {
    let form = await owner.agent
      .put(`/api/v1/workspaces/${workspaceId}/rsvp-form`)
      .set("Origin", origin)
      .send({
        config: {
          deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
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
      })
      .expect(200);
    for (const days of [25, 20]) {
      form = await owner.agent
        .put(`/api/v1/workspaces/${workspaceId}/rsvp-form`)
        .set("Origin", origin)
        .set("If-Match", `"${form.body.data.version}"`)
        .send({
          config: {
            ...form.body.data.draft.config,
            deadline: new Date(Date.now() + days * 86_400_000).toISOString(),
          },
        })
        .expect(200);
    }
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/rsvp-form/publish`)
      .set("Origin", origin)
      .set("If-Match", `"${form.body.data.version}"`)
      .set("Idempotency-Key", `rsvp-publish-${randomUUID()}`)
      .expect(201);
    const draft = await owner.agent
      .put(`/api/v1/workspaces/${workspaceId}/invitation-site/draft`)
      .set("Origin", origin)
      .send({
        slug: `ana-mihai-${Date.now()}`,
        defaultLanguage: "ro",
        availableLanguages: ["ro", "en"],
        accessPolicy: "TOKEN_ONLY",
        document: {
          sections: [
            {
              id: "hero",
              type: "hero",
              title: "Ana & Mihai",
              visible: true,
              content: { actionUrl: "https://weddingos.local/rsvp" },
            },
          ],
        },
        settings: {
          colors: { primary: "#816b55" },
          typography: {},
          spacing: "comfortable",
          template: "classic",
        },
      })
      .expect(200);
    const published = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/invitation-site/publish`)
      .set("Origin", origin)
      .set("If-Match", `"${draft.body.data.version}"`)
      .set("Idempotency-Key", `publish-${randomUUID()}`)
      .expect(201);
    const recipientKey = `recipients-${randomUUID()}`;
    const recipients = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/invitation-recipients`)
      .set("Origin", origin)
      .set("Idempotency-Key", recipientKey)
      .send({
        householdIds: [householdId],
        guestIds: [],
        invitationVersionId: published.body.data.published.id,
      })
      .expect(201);
    const replay = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/invitation-recipients`)
      .set("Origin", origin)
      .set("Idempotency-Key", recipientKey)
      .send({
        householdIds: [householdId],
        guestIds: [],
        invitationVersionId: published.body.data.published.id,
      })
      .expect(201);
    expect(replay.body.data.recipientIds).toEqual(
      recipients.body.data.recipientIds,
    );
    const secondBatchKey = `recipients-second-${randomUUID()}`;
    const secondBatch = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/invitation-recipients`)
      .set("Origin", origin)
      .set("Idempotency-Key", secondBatchKey)
      .send({
        householdIds: [],
        guestIds: [childGuestId],
        invitationVersionId: published.body.data.published.id,
      })
      .expect(201);
    const secondReplay = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/invitation-recipients`)
      .set("Origin", origin)
      .set("Idempotency-Key", secondBatchKey)
      .send({
        householdIds: [],
        guestIds: [childGuestId],
        invitationVersionId: published.body.data.published.id,
      })
      .expect(201);
    expect(secondReplay.body.data.recipientIds).toEqual(
      secondBatch.body.data.recipientIds,
    );
    expect(
      await database.invitationRecipient.count({ where: { workspaceId } }),
    ).toBe(2);
    recipientId = recipients.body.data.recipientIds[0];
    guestToken = `slice3-${randomUUID()}-${randomUUID()}`;
    await database.guestAccessGrant.updateMany({
      where: { invitationRecipientId: recipientId },
      data: { revokedAt: new Date() },
    });
    const grant = await database.guestAccessGrant.create({
      data: {
        workspaceId,
        invitationRecipientId: recipientId,
        householdId,
        tokenHash: hashToken(guestToken),
      },
    });
    const bootstrap = await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(guestToken)}`)
      .expect(200);
    expect(bootstrap.body.household.id).toBe(householdId);
    expect(
      bootstrap.body.household.members.every(
        (member: { id: string }) =>
          [primaryGuestId, childGuestId].includes(member.id) || member.id,
      ),
    ).toBe(true);
    expect(
      await database.invitationRecipient
        .findUniqueOrThrow({ where: { id: recipientId } })
        .then((row) => row.status),
    ).toBe("OPENED");
    await database.guestAccessGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
    await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(guestToken)}`)
      .expect(401);
    guestToken = `slice3-${randomUUID()}-${randomUUID()}`;
    await database.guestAccessGrant.create({
      data: {
        workspaceId,
        invitationRecipientId: recipientId,
        householdId,
        tokenHash: hashToken(guestToken),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  });

  it("submits and updates household RSVP with menus, plus-one, allergy workflow, decline cleanup and conflict protection", async () => {
    const menu = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/menus`)
      .set("Origin", origin)
      .set("Idempotency-Key", `menu-${randomUUID()}`)
      .send({
        name: "Meniu clasic",
        description: "Meniu pentru adulți și copii",
        audience: "ALL",
        status: "ACTIVE",
        position: 0,
        courses: [{ courseType: "main", name: "Fel principal", position: 0 }],
        dietaryTags: ["vegetarian"],
      })
      .expect(201);
    menuId = menu.body.data.id;
    const bootstrap = await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(guestToken)}`)
      .expect(200);
    eventIds = bootstrap.body.events.map((event: { id: string }) => event.id);
    expect(eventIds.length).toBeGreaterThanOrEqual(3);
    const members = bootstrap.body.household.members as Array<{
      id: string;
      plusOneAllowed: boolean;
    }>;
    const firstPayload = rsvpPayload(
      members,
      "CONFIRMED",
      1,
      `rsvp-${randomUUID()}`,
    );
    firstPayload.members[0]!.allergies = ["arahide"];
    firstPayload.members[0]!.allergyDetails = "Reacție severă";
    firstPayload.members[0]!.needsTransport = true;
    const submitted = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(firstPayload)
      .expect(200);
    submissionId = submitted.body.id;
    submissionVersion = submitted.body.version;
    expect(
      await database.guestMenuSelection.count({
        where: { workspaceId, active: true },
      }),
    ).toBeGreaterThan(0);
    expect(await database.allergyIssue.count({ where: { workspaceId } })).toBe(
      1,
    );

    const confirmedUpdate = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(
        rsvpPayload(
          members,
          "CONFIRMED",
          submissionVersion,
          `update-confirmed-${randomUUID()}`,
        ),
      )
      .expect(200);
    const staleVersion = submissionVersion;
    submissionVersion = confirmedUpdate.body.version;
    await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(
        rsvpPayload(members, "DECLINED", staleVersion, `stale-${randomUUID()}`),
      )
      .expect(412);
    const declined = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(
        rsvpPayload(
          members,
          "DECLINED",
          submissionVersion,
          `update-${randomUUID()}`,
        ),
      )
      .expect(200);
    submissionVersion = declined.body.version;
    expect(
      await database.guestMenuSelection.count({
        where: {
          workspaceId,
          active: true,
          guestId: { in: members.map((member) => member.id) },
        },
      }),
    ).toBe(0);

    const overridden = await owner.agent
      .patch(
        `/api/v1/workspaces/${workspaceId}/rsvp-submissions/${submissionId}`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${submissionVersion}"`)
      .set("Idempotency-Key", `override-${randomUUID()}`)
      .send({
        reason: "Confirmare telefonică",
        members: members.map((member) => ({
          guestId: member.id,
          events: eventIds.map((eventId) => ({
            eventId,
            attendance: "CONFIRMED",
          })),
          menuId,
          allergies: [],
        })),
        message: "Actualizat de organizator",
      })
      .expect(200);
    submissionVersion = overridden.body.data.version;
    const issue = await database.allergyIssue.findFirstOrThrow({
      where: { workspaceId },
    });
    await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/allergy-issues/${issue.id}`)
      .set("Origin", origin)
      .set("If-Match", `"${issue.version}"`)
      .send({ status: "RESOLVED", resolutionNote: "Confirmat cu locația" })
      .expect(200);
  }, 120_000);

  it("snapshots, fans out and delivers a campaign, dedupes signed webhooks, retries only failure, exports artifacts and projects activity", async () => {
    const site = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/invitation-site`)
      .expect(200);
    const campaign = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/campaigns`)
      .set("Origin", origin)
      .set("Idempotency-Key", `campaign-${randomUUID()}`)
      .send({
        name: "Invitația principală",
        purpose: "INVITATION",
        channel: "EMAIL",
        invitationVersionId: site.body.data.published.id,
        template: {
          subject: "Invitație Sarbato",
          body: "Te așteptăm alături de noi.",
        },
        audienceFilter: {},
      })
      .expect(201);
    const audienceKey = `campaign-audience-${randomUUID()}`;
    const audience = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guest-bulk-commands`)
      .set("Origin", origin)
      .set("Idempotency-Key", audienceKey)
      .send({
        command: "ADD_TO_CAMPAIGN",
        guestIds: [primaryGuestId],
        campaignId: campaign.body.data.id,
      })
      .expect(201);
    const audienceReplay = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guest-bulk-commands`)
      .set("Origin", origin)
      .set("Idempotency-Key", audienceKey)
      .send({
        command: "ADD_TO_CAMPAIGN",
        guestIds: [primaryGuestId],
        campaignId: campaign.body.data.id,
      })
      .expect(201);
    expect(audienceReplay.body.data.campaign.version).toBe(
      audience.body.data.campaign.version,
    );
    const preview = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaign.body.data.id}/audience-preview`,
      )
      .expect(200);
    expect(preview.body.data.total).toBe(1);
    const queued = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaign.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${audience.body.data.campaign.version}"`)
      .set("Idempotency-Key", `send-${randomUUID()}`)
      .send({ transition: "SEND_NOW" })
      .expect(201);
    expect(queued.body.data.queuedRecipients).toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          (
            await database.campaign.findUniqueOrThrow({
              where: { id: campaign.body.data.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("COMPLETED");
    const delivery = await database.campaignRecipient.findFirstOrThrow({
      where: { campaignId: campaign.body.data.id },
    });
    expect(delivery.personalizationSnapshot).toBeTruthy();
    expect(delivery.providerMessageId).toBeTruthy();
    expect(
      await database.deliveryAttempt.count({
        where: { sourceId: delivery.id },
      }),
    ).toBe(1);

    const webhook = {
      eventId: `provider-${randomUUID()}`,
      messageId: delivery.providerMessageId,
      type: "opened",
      occurredAt: new Date().toISOString(),
    };
    const signature = createHmac("sha256", webhookSecret)
      .update(JSON.stringify(webhook))
      .digest("hex");
    const first = await request(application.getHttpServer())
      .post("/api/v1/webhooks/email/smtp")
      .set("x-weddingos-signature", signature)
      .send(webhook)
      .expect(201);
    const replay = await request(application.getHttpServer())
      .post("/api/v1/webhooks/email/smtp")
      .set("x-weddingos-signature", signature)
      .send(webhook)
      .expect(201);
    expect(first.body.accepted).toBe(true);
    expect(replay.body.duplicate).toBe(true);
    await request(application.getHttpServer())
      .post("/api/v1/webhooks/email/smtp")
      .set("x-weddingos-signature", "invalid")
      .send(webhook)
      .expect(403);

    const failedEvent = {
      eventId: `provider-${randomUUID()}`,
      messageId: delivery.providerMessageId,
      type: "failed",
      occurredAt: new Date().toISOString(),
    };
    const failedSignature = createHmac("sha256", webhookSecret)
      .update(JSON.stringify(failedEvent))
      .digest("hex");
    await request(application.getHttpServer())
      .post("/api/v1/webhooks/email/smtp")
      .set("x-weddingos-signature", failedSignature)
      .send(failedEvent)
      .expect(201);
    // OPENED is terminal and cannot be downgraded by a later provider failure.
    expect(
      (
        await database.campaignRecipient.findUniqueOrThrow({
          where: { id: delivery.id },
        })
      ).status,
    ).toBe("OPENED");

    const retryCampaign = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/campaigns`)
      .set("Origin", origin)
      .set("Idempotency-Key", `campaign-retry-${randomUUID()}`)
      .send({
        name: "Campanie cu retry",
        purpose: "INVITATION",
        channel: "EMAIL",
        invitationVersionId: site.body.data.published.id,
        template: { subject: "Retry Sarbato", body: "Mesaj cu recuperare." },
        audienceFilter: {},
      })
      .expect(201);
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/campaigns/${retryCampaign.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${retryCampaign.body.data.version}"`)
      .set("Idempotency-Key", `send-retry-${randomUUID()}`)
      .send({ transition: "SEND_NOW" })
      .expect(201);
    await expect
      .poll(
        async () =>
          (
            await database.campaign.findUniqueOrThrow({
              where: { id: retryCampaign.body.data.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("COMPLETED");
    const failedDelivery = await database.campaignRecipient.findFirstOrThrow({
      where: { campaignId: retryCampaign.body.data.id },
    });
    const providerFailure = {
      eventId: `provider-${randomUUID()}`,
      messageId: failedDelivery.providerMessageId,
      type: "failed",
      occurredAt: new Date().toISOString(),
    };
    await request(application.getHttpServer())
      .post("/api/v1/webhooks/email/smtp")
      .set(
        "x-weddingos-signature",
        createHmac("sha256", webhookSecret)
          .update(JSON.stringify(providerFailure))
          .digest("hex"),
      )
      .send(providerFailure)
      .expect(201);
    const partial = await database.campaign.findUniqueOrThrow({
      where: { id: retryCampaign.body.data.id },
    });
    expect(partial.status).toBe("PARTIAL");
    expect(
      (
        await database.campaignRecipient.findUniqueOrThrow({
          where: { id: failedDelivery.id },
        })
      ).status,
    ).toBe("FAILED");
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/campaigns/${partial.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${partial.version}"`)
      .set("Idempotency-Key", `retry-failed-${randomUUID()}`)
      .send({ transition: "RETRY_FAILED" })
      .expect(201);
    await expect
      .poll(
        async () =>
          (
            await database.campaign.findUniqueOrThrow({
              where: { id: partial.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("COMPLETED");
    expect(
      await database.deliveryAttempt.count({
        where: { sourceId: failedDelivery.id },
      }),
    ).toBe(2);

    const guestExport = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guest-exports`)
      .set("Origin", origin)
      .set("Idempotency-Key", `guest-export-${randomUUID()}`)
      .send({
        format: "xlsx",
        includeContactData: false,
        includeRsvp: true,
        includeMenu: true,
        includeAllergies: false,
        includeLogistics: true,
      })
      .expect(201);
    const cateringExport = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/catering-exports`)
      .set("Origin", origin)
      .set("Idempotency-Key", `catering-export-${randomUUID()}`)
      .send({ format: "csv", includeAllergies: true })
      .expect(201);
    await expect
      .poll(
        async () =>
          (
            await database.backgroundJob.findUniqueOrThrow({
              where: { id: guestExport.body.data.job.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("COMPLETED");
    await expect
      .poll(
        async () =>
          (
            await database.backgroundJob.findUniqueOrThrow({
              where: { id: cateringExport.body.data.job.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("COMPLETED");
    expect(
      await database.generatedArtifact.count({ where: { workspaceId } }),
    ).toBeGreaterThanOrEqual(2);
    await expect
      .poll(
        async () =>
          database.activityItem.count({
            where: {
              workspaceId,
              category: {
                in: ["guests", "invitations", "campaigns", "rsvp", "menus"],
              },
            },
          }),
        { timeout: 60_000 },
      )
      .toBeGreaterThan(5);
    expect(
      await database.notification.count({ where: { workspaceId } }),
    ).toBeGreaterThanOrEqual(0);

    const dashboard = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/dashboard`)
      .expect(200);
    expect(dashboard.body.data.guestCrm.activeGuests).toBeGreaterThan(0);
    expect(dashboard.body.data.unavailableModules).not.toHaveProperty("guests");
    const search = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/search?q=Ana`)
      .expect(200);
    expect(
      search.body.data.items.some(
        (item: { type: string }) => item.type === "guest",
      ),
    ).toBe(true);
  }, 180_000);

  it("covers Slice 4 seating, transport, accommodation and tenant isolation", async () => {
    const eventId = eventIds[0]!;
    const venue = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/venue-spaces`)
      .set("Origin", origin)
      .set("Idempotency-Key", `venue-${randomUUID()}`)
      .send({
        weddingEventId: eventId,
        name: "Sala Slice 4",
        widthUnits: 100,
        heightUnits: 70,
        unit: "arbitrary_grid",
      })
      .expect(201);
    const seating = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/seating-plans`)
      .set("Origin", origin)
      .set("Idempotency-Key", `seating-${randomUUID()}`)
      .send({
        weddingEventId: eventId,
        venueSpaceId: venue.body.data.id,
        name: "Plan Slice 4",
      })
      .expect(201);
    const seatingId = seating.body.data.id as string;
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}/tables`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `table-${randomUUID()}`)
      .send({
        name: "Masa familiei",
        label: "M1",
        shape: "round",
        capacity: 12,
        x: 100,
        y: 100,
        width: 120,
        height: 90,
        rotation: 0,
        position: 0,
        locked: false,
      })
      .expect(201);
    let seatingDetail = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}`)
      .expect(200);
    const eligible = (
      seatingDetail.body.data.guests as Array<{ id: string; eligible: boolean }>
    ).filter((guest) => guest.eligible);
    const tableId = seatingDetail.body.data.tables[0].id as string;
    seatingDetail = await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}/assignments`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${seatingDetail.body.data.version}"`)
      .set("Idempotency-Key", `seat-${randomUUID()}`)
      .send({
        assignments: eligible.map((guest) => ({
          guestId: guest.id,
          tableId,
          source: "manual",
          locked: false,
        })),
        removeAssignmentIds: [],
        confirmWarnings: true,
      })
      .expect(200);
    expect(seatingDetail.body.data.changed).toBe(eligible.length);
    seatingDetail = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}`)
      .expect(200);
    expect(seatingDetail.body.data.assignments).toHaveLength(eligible.length);
    const suggestion = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}/suggestions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${seatingDetail.body.data.version}"`)
      .set("Idempotency-Key", `suggest-${randomUUID()}`)
      .send({ preserveManualAssignments: true })
      .expect(201);
    expect(suggestion.body.data.job.status).toBe("queued");
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}/exports`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `seat-export-${randomUUID()}`)
      .send({ format: "svg", kind: "visual_plan", includeSensitive: false })
      .expect(201);

    const primary = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/guests/${primaryGuestId}`)
      .expect(200);
    await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/guests/${primaryGuestId}`)
      .set("Origin", origin)
      .set("If-Match", `"${primary.body.data.version}"`)
      .send({ needsTransport: true, needsAccommodation: true })
      .expect(200);
    const transportRequests = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/transport-requests`)
      .expect(200);
    const transportRequest = transportRequests.body.data.items.find(
      (item: { guestId: string }) => item.guestId === primaryGuestId,
    );
    expect(transportRequest).toBeTruthy();
    const transportPlan = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/transport-plans`)
      .set("Origin", origin)
      .set("Idempotency-Key", `transport-${randomUUID()}`)
      .send({ weddingEventId: eventId, name: "Transport Slice 4" })
      .expect(201);
    const transportId = transportPlan.body.data.id as string;
    const vehicle = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/transport-plans/${transportId}/vehicles`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `vehicle-${randomUUID()}`)
      .send({
        name: "Microbuz test",
        vehicleType: "minibus",
        capacity: 8,
        accessibleCapacity: 1,
      })
      .expect(201);
    const route = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/transport-plans/${transportId}/routes`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `route-${randomUUID()}`)
      .send({
        name: "Centru spre eveniment",
        vehicleId: vehicle.body.data.id,
        direction: "to_event",
        departureAt: "2027-09-12T14:00:00.000Z",
        originName: "Centru",
        destinationName: "Sala Slice 4",
        stops: [],
      })
      .expect(201);
    const transportDetail = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/transport-plans/${transportId}`)
      .expect(200);
    const transportAssignment = await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/transport-plans/${transportId}/assignments`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${transportDetail.body.data.version}"`)
      .set("Idempotency-Key", `transport-assign-${randomUUID()}`)
      .send({
        assignments: [
          {
            routeId: route.body.data.id,
            guestId: primaryGuestId,
            requestId: transportRequest.id,
            seatCount: 1,
          },
        ],
        removeAssignmentIds: [],
      })
      .expect(200);
    expect(transportAssignment.body.data.changed).toBe(1);
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/transport-plans/${transportId}/manifests`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `manifest-${randomUUID()}`)
      .send({ format: "xlsx", includeSensitive: false })
      .expect(201);

    const accommodationRequests = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/accommodation-requests`)
      .expect(200);
    const accommodationRequest = accommodationRequests.body.data.items.find(
      (item: { guestId: string }) => item.guestId === primaryGuestId,
    );
    expect(accommodationRequest).toBeTruthy();
    const property = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/accommodation-properties`)
      .set("Origin", origin)
      .set("Idempotency-Key", `property-${randomUUID()}`)
      .send({
        name: "Hotel Slice 4",
        type: "hotel",
        address: "Strada Test 1",
        city: "Chișinău",
        country: "Moldova",
      })
      .expect(201);
    const room = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/accommodation-properties/${property.body.data.id}/rooms`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `room-${randomUUID()}`)
      .send({
        name: "Camera 101",
        capacityAdults: 2,
        capacityChildren: 1,
        accessible: false,
        status: "available",
      })
      .expect(201);
    const stay = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/accommodation-stays`)
      .set("Origin", origin)
      .set("Idempotency-Key", `stay-${randomUUID()}`)
      .send({
        propertyId: property.body.data.id,
        name: "Sejur Slice 4",
        checkInDate: "2027-09-11",
        checkOutDate: "2027-09-13",
      })
      .expect(201);
    const allocation = await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/accommodation-stays/${stay.body.data.id}/allocations`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${stay.body.data.version}"`)
      .set("Idempotency-Key", `allocation-${randomUUID()}`)
      .send({
        allocations: [
          {
            roomId: room.body.data.id,
            guestId: primaryGuestId,
            householdId,
            requestId: accommodationRequest.id,
            checkInDate: "2027-09-11",
            checkOutDate: "2027-09-13",
          },
        ],
        removeAllocationIds: [],
        confirmHouseholdSplit: true,
        reason: "Alocare test integrare",
      })
      .expect(200);
    expect(allocation.body.data.changed).toBe(1);
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/accommodation-stays/${stay.body.data.id}/rooming-lists`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `rooming-${randomUUID()}`)
      .send({ format: "xlsx", includeSensitive: false })
      .expect(201);

    const dashboard = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/dashboard`)
      .expect(200);
    expect(dashboard.body.data.operations.transport.assignedGuests).toBe(1);
    expect(dashboard.body.data.operations.accommodation.assignedGuests).toBe(1);
    const search = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/search?q=Slice`)
      .expect(200);
    expect(
      search.body.data.items.some((item: { type: string }) =>
        ["seating_plan", "accommodation_property"].includes(item.type),
      ),
    ).toBe(true);
    await outsider.agent
      .get(`/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}`)
      .expect(403);
  }, 180_000);

  async function createGuest(overrides: Record<string, unknown>) {
    const response = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guests`)
      .set("Origin", origin)
      .set("Idempotency-Key", `guest-${randomUUID()}`)
      .send(guestPayload(overrides))
      .expect(201);
    return response.body.data as {
      id: string;
      isPlusOne: boolean;
      version: number;
    };
  }

  function guestPayload(overrides: Record<string, unknown>) {
    return {
      householdId,
      firstName: "Invitat",
      lastName: "Test",
      email: null,
      phone: null,
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

  async function uploadImport(
    name: string,
    mime: string,
    content: string,
    key: string,
  ) {
    const response = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/guest-imports`)
      .set("Origin", origin)
      .set("Idempotency-Key", key)
      .attach("file", Buffer.from(content), {
        filename: name,
        contentType: mime,
      })
      .expect(201);
    return response.body.data as {
      import: { id: string };
      job: { id: string };
    };
  }

  function rsvpPayload(
    members: Array<{ id: string }>,
    attendance: "CONFIRMED" | "DECLINED",
    version: number,
    idempotencyKey: string,
  ) {
    return {
      token: guestToken,
      version,
      idempotencyKey,
      members: members.map((member) => ({
        guestId: member.id,
        events: eventIds.map((eventId) => ({ eventId, attendance })),
        ...(attendance === "CONFIRMED" ? { menuId } : {}),
        allergies: [] as string[],
        allergyDetails: undefined as string | undefined,
        needsTransport: false,
        needsAccommodation: false,
      })),
      message: "Răspuns integrare",
    };
  }

  async function createAccount(label: string): Promise<Account> {
    const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const registration = await request(application.getHttpServer())
      .post("/api/v1/auth/registrations")
      .set("Origin", origin)
      .send({
        firstName: "Test",
        lastName: label,
        email,
        password: "WeddingOS2026!",
        acceptedTermsVersion: "2026-07-18",
        marketingConsent: false,
      })
      .expect(201);
    const token = await waitForVerificationToken(email);
    await request(application.getHttpServer())
      .post("/api/v1/auth/email-verifications")
      .set("Origin", origin)
      .send({ token })
      .expect(200);
    const agent = request.agent(application.getHttpServer());
    await agent
      .post("/api/v1/auth/sessions")
      .set("Origin", origin)
      .send({ email, password: "WeddingOS2026!", remember: true })
      .expect(200);
    return { email, userId: registration.body.data.userId, agent };
  }

  async function readyWorkspace(account: Account, title: string) {
    const workspace = await account.agent
      .post("/api/v1/workspaces")
      .set("Origin", origin)
      .set("Idempotency-Key", `workspace-${randomUUID()}`)
      .send({
        title,
        partnerOneName: "Ana",
        partnerTwoName: "Mihai",
        weddingDate: "2027-09-12",
        location: "Chișinău",
        timezone: "Europe/Chisinau",
      })
      .expect(201);
    const id = workspace.body.data.id as string;
    const draft = await account.agent
      .get(`/api/v1/workspaces/${id}/onboarding`)
      .expect(200);
    const saved = await account.agent
      .patch(`/api/v1/workspaces/${id}/onboarding`)
      .set("Origin", origin)
      .set("If-Match", `"${draft.body.data.version}"`)
      .send({
        currentStep: 8,
        couple: { confirmed: true, partnerOne: "Ana", partnerTwo: "Mihai" },
        dateEvents: {
          confirmed: true,
          exactDate: "2027-09-12",
          civil: true,
          religious: true,
          reception: true,
        },
        location: {
          confirmed: true,
          city: "Chișinău",
          venue: "Sala de evenimente",
        },
        guests: {
          confirmed: true,
          guestCount: 100,
          transport: true,
          accommodation: true,
        },
        budget: { confirmed: true, amount: 150000 },
        style: { confirmed: true, priorities: ["familie"] },
        existingProgress: { confirmed: true },
        planningPreferences: { confirmed: true, assistanceLevel: "guided" },
      })
      .expect(200);
    await account.agent
      .post(`/api/v1/workspaces/${id}/onboarding/complete`)
      .set("Origin", origin)
      .set("If-Match", `"${saved.body.data.version}"`)
      .set("Idempotency-Key", `complete-${randomUUID()}`)
      .expect(201);
    expect(
      await database.weddingEvent.count({ where: { workspaceId: id } }),
    ).toBeGreaterThanOrEqual(3);
    return id;
  }
});

async function waitForVerificationToken(email: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    for (const summary of list.messages.filter(
      (message) =>
        message.Subject === "Confirmă adresa de email Sarbato" &&
        message.To.some((recipient) => recipient.Address === email),
    )) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Verification email not delivered to ${email}`);
}

async function cleanDatabase() {
  await assertDestructiveDatabasePurpose(database, "integration");
  const tables = await database.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'database_identities', 'role_templates', 'vendor_role_templates', 'subscription_products', 'subscription_plans', 'subscription_prices', 'subscription_plan_entitlements', 'platform_fee_policies', 'platform_roles', 'legal_documents', 'legal_document_versions', 'consent_purposes', 'data_retention_policies', 'data_retention_rules')
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await database.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}

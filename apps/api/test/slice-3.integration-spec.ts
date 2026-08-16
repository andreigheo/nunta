import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { createHash, createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import type { Prisma } from "@weddingos/database";
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
const appDatabase = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL!,
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
  let legacyGuestToken = "";
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
    await appDatabase.$disconnect();
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
    const secondBatchKey = `recipients-second-${randomUUID()}`;
    const [recipients, secondBatch] = await Promise.all([
      owner.agent
        .post(`/api/v1/workspaces/${workspaceId}/invitation-recipients`)
        .set("Origin", origin)
        .set("Idempotency-Key", recipientKey)
        .send({
          householdIds: [householdId],
          guestIds: [],
          invitationVersionId: published.body.data.published.id,
        })
        .expect(201),
      owner.agent
        .post(`/api/v1/workspaces/${workspaceId}/invitation-recipients`)
        .set("Origin", origin)
        .set("Idempotency-Key", secondBatchKey)
        .send({
          householdIds: [],
          guestIds: [childGuestId],
          invitationVersionId: published.body.data.published.id,
        })
        .expect(201),
    ]);
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
    expect(recipients.body.data.created + secondBatch.body.data.created).toBe(
      1,
    );
    expect(secondBatch.body.data.recipientIds).toEqual(
      recipients.body.data.recipientIds,
    );
    expect(
      await database.invitationRecipient.count({ where: { workspaceId } }),
    ).toBe(1);
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
    ).toBe("READY");
    const linkKey = `link-${randomUUID()}`;
    const linkAccess = await request(application.getHttpServer())
      .post("/api/v1/guest/link-access")
      .send({ token: guestToken, idempotencyKey: linkKey })
      .expect(201);
    expect(linkAccess.body.duplicate).toBe(false);
    expect(
      await database.invitationRecipient
        .findUniqueOrThrow({ where: { id: recipientId } })
        .then((row) => row.status),
    ).toBe("READY");
    const openKey = `open-${randomUUID()}`;
    const opened = await request(application.getHttpServer())
      .post("/api/v1/guest/invitation-open")
      .send({ token: guestToken, idempotencyKey: openKey, source: "cover" })
      .expect(201);
    const openedReplay = await request(application.getHttpServer())
      .post("/api/v1/guest/invitation-open")
      .send({ token: guestToken, idempotencyKey: openKey, source: "cover" })
      .expect(201);
    expect(opened.body.duplicate).toBe(false);
    expect(openedReplay.body.duplicate).toBe(true);
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

  it("keeps legacy recipient links valid across republish and isolates deterministic access channels", async () => {
    const site = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/invitation-site`)
      .expect(200);
    const invitationMedia = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const invitationMediaChecksum = createHash("sha256")
      .update(invitationMedia)
      .digest("hex");
    const upload = await owner.agent
      .post("/api/v1/uploads")
      .set("Origin", origin)
      .set("Idempotency-Key", `invitation-media-${randomUUID()}`)
      .send({
        workspaceId,
        purpose: "INVITATION_MEDIA",
        originalFileName: "invitation-pixel.png",
        contentType: "image/png",
        sizeBytes: invitationMedia.length,
        checksumSha256: invitationMediaChecksum,
      })
      .expect(201);
    const uploadResponse = await fetch(upload.body.data.upload.url, {
      method: "PUT",
      headers: upload.body.data.upload.headers,
      body: invitationMedia,
    });
    expect(uploadResponse.ok).toBe(true);
    const completedUpload = await owner.agent
      .post(`/api/v1/uploads/${upload.body.data.id}/complete`)
      .set("Origin", origin)
      .send({ checksumSha256: invitationMediaChecksum })
      .expect(201);
    const invitationMediaId = completedUpload.body.data.storageObjectId;
    await expect
      .poll(
        async () =>
          (
            await database.storedObject.findUniqueOrThrow({
              where: { id: invitationMediaId },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("AVAILABLE");
    const rollbackCompatibleRecipientId = randomUUID();
    const explicitSiteRecipientId = randomUUID();
    const publishedVersion = await database.invitationVersion.findUniqueOrThrow(
      {
        where: { id: site.body.data.published.id },
      },
    );
    const alternateVersion = await database.invitationVersion.create({
      data: {
        workspaceId,
        invitationSiteId: site.body.data.id,
        versionNumber:
          (
            await database.invitationVersion.aggregate({
              where: { invitationSiteId: site.body.data.id },
              _max: { versionNumber: true },
            })
          )._max.versionNumber! + 1,
        document: publishedVersion.document as Prisma.InputJsonValue,
        settings: publishedVersion.settings as Prisma.InputJsonValue,
        language: publishedVersion.language,
        createdById: owner.userId,
        contentHash: "0".repeat(64),
      },
    });
    try {
      // Exercise the compatibility trigger through the restricted application
      // role with forced RLS, not only through the migration-owner connection.
      await appDatabase.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT
            set_config('app.current_user_id', ${owner.userId}, true),
            set_config('app.current_workspace_id', ${workspaceId}, true)
        `;
        await transaction.$executeRaw`
          INSERT INTO "invitation_recipients" (
            "id", "workspace_id", "guest_id", "invitation_version_id", "updated_at"
          ) VALUES (
            ${rollbackCompatibleRecipientId}::uuid,
            ${workspaceId}::uuid,
            ${childGuestId}::uuid,
            ${site.body.data.published.id}::uuid,
            CURRENT_TIMESTAMP
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO "invitation_recipients" (
            "id", "workspace_id", "guest_id", "invitation_site_id",
            "invitation_version_id", "updated_at"
          ) VALUES (
            ${explicitSiteRecipientId}::uuid,
            ${workspaceId}::uuid,
            ${primaryGuestId}::uuid,
            ${site.body.data.id}::uuid,
            ${site.body.data.published.id}::uuid,
            CURRENT_TIMESTAMP
          )
        `;
        await transaction.$executeRaw`
          UPDATE "invitation_recipients"
          SET "invitation_version_id" = ${alternateVersion.id}::uuid,
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${rollbackCompatibleRecipientId}::uuid
        `;
      });
      expect(
        await database.invitationRecipient
          .findUniqueOrThrow({ where: { id: rollbackCompatibleRecipientId } })
          .then((row) => ({
            siteId: row.invitationSiteId,
            versionId: row.invitationVersionId,
          })),
      ).toEqual({
        siteId: site.body.data.id,
        versionId: alternateVersion.id,
      });
      expect(
        await database.invitationRecipient
          .findUniqueOrThrow({ where: { id: explicitSiteRecipientId } })
          .then((row) => row.invitationSiteId),
      ).toBe(site.body.data.id);

      await expect(
        database.$executeRaw`
          INSERT INTO "invitation_recipients" (
            "id", "workspace_id", "guest_id", "invitation_site_id",
            "invitation_version_id", "updated_at"
          ) VALUES (
            ${randomUUID()}::uuid,
            ${randomUUID()}::uuid,
            ${childGuestId}::uuid,
            ${site.body.data.id}::uuid,
            ${site.body.data.published.id}::uuid,
            CURRENT_TIMESTAMP
          )
        `,
      ).rejects.toThrow(/workspace does not match invitation version/i);
    } finally {
      await database.invitationRecipient.deleteMany({
        where: {
          id: { in: [rollbackCompatibleRecipientId, explicitSiteRecipientId] },
        },
      });
      await database.invitationVersion.delete({
        where: { id: alternateVersion.id },
      });
    }
    const legacyRecipient = await database.invitationRecipient.create({
      data: {
        workspaceId,
        invitationSiteId: site.body.data.id,
        invitationVersionId: site.body.data.published.id,
        guestId: childGuestId,
        preferredLanguage: "ro",
        personalizationSnapshot: { guestName: "Mara Pop" },
      },
    });
    legacyGuestToken = `legacy-${randomUUID()}-${randomUUID()}`;
    await database.guestAccessGrant.create({
      data: {
        workspaceId,
        invitationRecipientId: legacyRecipient.id,
        householdId,
        channel: "LEGACY",
        tokenHash: hashToken(legacyGuestToken),
      },
    });

    const concurrentHousehold = await database.household.create({
      data: {
        workspaceId,
        name: "Familia cursă revocare",
        preferredLanguage: "ro",
      },
    });
    const concurrentRecipient = await database.invitationRecipient.create({
      data: {
        workspaceId,
        householdId: concurrentHousehold.id,
        invitationSiteId: site.body.data.id,
        invitationVersionId: site.body.data.published.id,
        preferredLanguage: "ro",
      },
    });
    const concurrentGrantId = randomUUID();
    let markGrantInserted!: () => void;
    const grantInserted = new Promise<void>((resolve) => {
      markGrantInserted = resolve;
    });
    let releaseGrantTransaction!: () => void;
    const grantTransactionReleased = new Promise<void>((resolve) => {
      releaseGrantTransaction = resolve;
    });
    const grantTransaction = database.$transaction(async (transaction) => {
      await transaction.guestAccessGrant.create({
        data: {
          id: concurrentGrantId,
          workspaceId,
          invitationRecipientId: concurrentRecipient.id,
          householdId: concurrentHousehold.id,
          tokenHash: hashToken(`concurrent-${randomUUID()}-${randomUUID()}`),
        },
      });
      markGrantInserted();
      await grantTransactionReleased;
    });
    await Promise.race([grantInserted, grantTransaction]);
    let revocationFinished = false;
    const concurrentRevocation = database
      .$transaction(async (transaction) => {
        await transaction.invitationRecipient.update({
          where: { id: concurrentRecipient.id },
          data: { revokedAt: new Date() },
        });
      })
      .then(() => {
        revocationFinished = true;
      });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(revocationFinished).toBe(false);
    } finally {
      releaseGrantTransaction();
    }
    await Promise.all([grantTransaction, concurrentRevocation]);
    expect(
      await database.guestAccessGrant
        .findUniqueOrThrow({ where: { id: concurrentGrantId } })
        .then((grant) => grant.revokedAt),
    ).not.toBeNull();
    await database.invitationRecipient.delete({
      where: { id: concurrentRecipient.id },
    });
    await database.household.delete({
      where: { id: concurrentHousehold.id },
    });

    const variant = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/invitation-site/variants`)
      .set("Origin", origin)
      .set("Idempotency-Key", `variant-${randomUUID()}`)
      .send({
        name: "Familie apropiată",
        code: `familie-${randomUUID().slice(0, 8)}`,
        overrides: {
          document: {
            sections: [
              {
                id: "hero",
                content: { variantMarker: "family-variant" },
              },
            ],
          },
        },
      })
      .expect(201);
    const recipientBeforeVariant =
      await database.invitationRecipient.findUniqueOrThrow({
        where: { id: recipientId },
      });
    await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/invitation-recipients/${recipientId}/variant`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${recipientBeforeVariant.version}"`)
      .send({ variantId: variant.body.data.id })
      .expect(422);

    const links = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/invitation-recipients/${recipientId}/access-links`,
      )
      .set("Origin", origin)
      .send({ channels: ["MANUAL", "WHATSAPP"] })
      .expect(201);
    const manualUrl = links.body.data.items.find(
      (item: { channel: string }) => item.channel === "MANUAL",
    ).url;
    const manualGrant = await database.guestAccessGrant.findFirstOrThrow({
      where: {
        invitationRecipientId: recipientId,
        channel: "MANUAL",
        revokedAt: null,
      },
    });
    await database.guestAccessGrant.update({
      where: { id: manualGrant.id },
      data: { revokedAt: new Date() },
    });
    const reactivated = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/invitation-recipients/${recipientId}/access-links`,
      )
      .set("Origin", origin)
      .send({ channels: ["MANUAL"] })
      .expect(201);
    expect(reactivated.body.data.items[0].url).toBe(manualUrl);
    expect(reactivated.body.data.items[0].reused).toBe(false);
    expect(
      await database.guestAccessGrant.count({
        where: {
          invitationRecipientId: recipientId,
          channel: "MANUAL",
          revokedAt: null,
        },
      }),
    ).toBe(1);
    await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/invitation-recipients/${recipientId}/qr?format=svg`,
      )
      .expect(200);
    expect(
      await database.guestAccessGrant.count({
        where: {
          invitationRecipientId: recipientId,
          channel: { in: ["MANUAL", "WHATSAPP", "QR"] },
          revokedAt: null,
        },
      }),
    ).toBe(3);

    const nextDraft = await owner.agent
      .put(`/api/v1/workspaces/${workspaceId}/invitation-site/draft`)
      .set("Origin", origin)
      .set("If-Match", `"${site.body.data.version}"`)
      .send({
        slug: site.body.data.slug,
        defaultLanguage: site.body.data.defaultLanguage,
        availableLanguages: site.body.data.availableLanguages,
        accessPolicy: "TOKEN_ONLY",
        document: {
          sections: [
            {
              id: "hero",
              type: "hero",
              title: "Ana & Mihai",
              visible: true,
              content: {
                names: "Ana & Mihai",
                actionUrl: "https://weddingos.local/rsvp",
                revisionMarker: "republished",
                mediaId: invitationMediaId,
              },
            },
          ],
        },
        settings: site.body.data.published.settings,
      })
      .expect(200);
    const republished = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/invitation-site/publish`)
      .set("Origin", origin)
      .set("If-Match", `"${nextDraft.body.data.version}"`)
      .set("Idempotency-Key", `republish-${randomUUID()}`)
      .expect(201);
    const recipientBeforePublishedVariant =
      await database.invitationRecipient.findUniqueOrThrow({
        where: { id: recipientId },
      });
    await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/invitation-recipients/${recipientId}/variant`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${recipientBeforePublishedVariant.version}"`)
      .send({ variantId: variant.body.data.id })
      .expect(200);
    const legacyBootstrap = await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(legacyGuestToken)}`,
      )
      .expect(200);
    expect(legacyBootstrap.body.invitation.baseVersionId).toBe(
      republished.body.data.published.id,
    );
    expect(
      legacyBootstrap.body.invitation.document.sections[0].content
        .revisionMarker,
    ).toBe("republished");
    expect(
      legacyBootstrap.body.invitation.document.sections[0].content
        .variantMarker,
    ).toBe("family-variant");
    const guestMedia = await request(application.getHttpServer())
      .get(
        `/api/v1/guest/invitation-media/${invitationMediaId}?token=${encodeURIComponent(legacyGuestToken)}`,
      )
      .expect("Content-Type", /image\/png/)
      .expect(200);
    expect(Buffer.compare(guestMedia.body, invitationMedia)).toBe(0);

    const publishedVariant = (
      await owner.agent
        .get(`/api/v1/workspaces/${workspaceId}/invitation-site/variants`)
        .expect(200)
    ).body.data.items.find(
      (item: { id: string }) => item.id === variant.body.data.id,
    );
    const editedVariant = await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/invitation-site/variants/${publishedVariant.id}/draft`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${publishedVariant.version}"`)
      .send({
        overrides: {
          document: {
            sections: [
              {
                id: "hero",
                content: { variantMarker: "family-variant-next" },
              },
            ],
          },
        },
      })
      .expect(200);
    await owner.agent
      .delete(
        `/api/v1/workspaces/${workspaceId}/invitation-site/variants/${publishedVariant.id}`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${editedVariant.body.data.version}"`)
      .expect(422);
    const bootstrapAfterBlockedArchive = await request(
      application.getHttpServer(),
    )
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(legacyGuestToken)}`,
      )
      .expect(200);
    expect(
      bootstrapAfterBlockedArchive.body.invitation.document.sections[0].content
        .variantMarker,
    ).toBe("family-variant");
    const recipientBeforeBaseAssignment =
      await database.invitationRecipient.findUniqueOrThrow({
        where: { id: recipientId },
      });
    await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/invitation-recipients/${recipientId}/variant`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${recipientBeforeBaseAssignment.version}"`)
      .send({ variantId: null })
      .expect(200);
    await owner.agent
      .delete(
        `/api/v1/workspaces/${workspaceId}/invitation-site/variants/${publishedVariant.id}`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${editedVariant.body.data.version}"`)
      .expect(200);

    await request(application.getHttpServer())
      .post("/api/v1/guest/link-access")
      .send({
        token: legacyGuestToken,
        idempotencyKey: `legacy-link-${randomUUID()}`,
      })
      .expect(201);
    const identityRows = await database.invitationRecipient.findMany({
      where: {
        workspaceId,
        invitationSiteId: site.body.data.id,
        revokedAt: null,
        OR: [{ householdId }, { guestId: childGuestId }],
      },
    });
    expect(identityRows).toHaveLength(2);
    expect(identityRows.every((row) => row.lastAccessedAt)).toBe(true);
    const legacyRecipientRow =
      await database.invitationRecipient.findUniqueOrThrow({
        where: { id: legacyRecipient.id },
      });
    const grantsBeforeRecipientRevocation =
      await database.guestAccessGrant.findMany({
        where: { invitationRecipientId: legacyRecipient.id, revokedAt: null },
        select: { id: true },
      });
    expect(grantsBeforeRecipientRevocation.length).toBeGreaterThan(0);
    const recipientRevokedAt = new Date();
    await database.invitationRecipient.update({
      where: { id: legacyRecipient.id },
      data: { revokedAt: recipientRevokedAt },
    });
    expect(
      await database.guestAccessGrant.count({
        where: {
          id: { in: grantsBeforeRecipientRevocation.map((grant) => grant.id) },
          revokedAt: null,
        },
      }),
    ).toBe(0);
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(legacyGuestToken)}`,
      )
      .expect(401);
    await request(application.getHttpServer())
      .get(`/api/v1/guest/rsvp?token=${encodeURIComponent(legacyGuestToken)}`)
      .expect(401);
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/wedding-day/live?token=${encodeURIComponent(legacyGuestToken)}`,
      )
      .expect(401);

    const revokedGrant = await database.guestAccessGrant.findFirstOrThrow({
      where: { tokenHash: hashToken(legacyGuestToken) },
    });
    await database.guestAccessGrant.update({
      where: { id: revokedGrant.id },
      data: { revokedAt: null },
    });
    expect(
      await database.guestAccessGrant
        .findUniqueOrThrow({ where: { id: revokedGrant.id } })
        .then((grant) => grant.revokedAt),
    ).not.toBeNull();

    const grantCreatedAfterRevocationToken = `revoked-${randomUUID()}-${randomUUID()}`;
    const grantCreatedAfterRevocation = await database.guestAccessGrant.create({
      data: {
        workspaceId,
        invitationRecipientId: legacyRecipient.id,
        householdId,
        tokenHash: hashToken(grantCreatedAfterRevocationToken),
      },
    });
    expect(grantCreatedAfterRevocation.revokedAt).not.toBeNull();
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(grantCreatedAfterRevocationToken)}`,
      )
      .expect(401);

    await database.invitationRecipient.update({
      where: { id: legacyRecipient.id },
      data: { revokedAt: null, version: legacyRecipientRow.version },
    });
    legacyGuestToken = `legacy-restored-${randomUUID()}-${randomUUID()}`;
    await database.guestAccessGrant.create({
      data: {
        workspaceId,
        invitationRecipientId: legacyRecipient.id,
        householdId,
        tokenHash: hashToken(legacyGuestToken),
      },
    });
    const futureAccess = new Date(Date.now() + 60_000);
    await database.invitationRecipient.updateMany({
      where: {
        workspaceId,
        invitationSiteId: site.body.data.id,
        OR: [{ householdId }, { guestId: childGuestId }],
      },
      data: { lastAccessedAt: futureAccess },
    });
    const legacyGrant = await database.guestAccessGrant.findFirstOrThrow({
      where: { tokenHash: hashToken(legacyGuestToken) },
    });
    await database.guestAccessGrant.update({
      where: { id: legacyGrant.id },
      data: { lastUsedAt: futureAccess },
    });
    await request(application.getHttpServer())
      .post("/api/v1/guest/link-access")
      .send({
        token: legacyGuestToken,
        idempotencyKey: `legacy-out-of-order-${randomUUID()}`,
      })
      .expect(201);
    expect(
      (
        await database.invitationRecipient.findUniqueOrThrow({
          where: { id: legacyRecipient.id },
        })
      ).lastAccessedAt?.toISOString(),
    ).toBe(futureAccess.toISOString());
    expect(
      (
        await database.guestAccessGrant.findUniqueOrThrow({
          where: { id: legacyGrant.id },
        })
      ).lastUsedAt?.toISOString(),
    ).toBe(futureAccess.toISOString());

    const archivedHousehold = await database.household.create({
      data: {
        workspaceId,
        name: "Familia arhivată cu toate identitățile",
        preferredLanguage: "ro",
      },
    });
    const archivedHouseholdMember = await database.guest.create({
      data: {
        workspaceId,
        householdId: archivedHousehold.id,
        firstName: "Familie",
        lastName: "Arhivată",
        preferredLanguage: "ro",
      },
    });
    await database.household.update({
      where: { id: archivedHousehold.id },
      data: { primaryGuestId: archivedHouseholdMember.id },
    });
    const [archivedHouseholdRecipient, archivedMemberRecipient] =
      await Promise.all([
        database.invitationRecipient.create({
          data: {
            workspaceId,
            invitationSiteId: site.body.data.id,
            invitationVersionId: republished.body.data.published.id,
            householdId: archivedHousehold.id,
            preferredLanguage: "ro",
          },
        }),
        database.invitationRecipient.create({
          data: {
            workspaceId,
            invitationSiteId: site.body.data.id,
            invitationVersionId: republished.body.data.published.id,
            guestId: archivedHouseholdMember.id,
            preferredLanguage: "ro",
          },
        }),
      ]);
    const archivedHouseholdToken = `archive-household-${randomUUID()}-${randomUUID()}`;
    const archivedMemberToken = `archive-member-${randomUUID()}-${randomUUID()}`;
    await database.guestAccessGrant.createMany({
      data: [
        {
          workspaceId,
          invitationRecipientId: archivedHouseholdRecipient.id,
          householdId: archivedHousehold.id,
          tokenHash: hashToken(archivedHouseholdToken),
        },
        {
          workspaceId,
          invitationRecipientId: archivedMemberRecipient.id,
          householdId: archivedHousehold.id,
          tokenHash: hashToken(archivedMemberToken),
        },
      ],
    });
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(archivedHouseholdToken)}`,
      )
      .expect(200);
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(archivedMemberToken)}`,
      )
      .expect(200);
    await owner.agent
      .delete(
        `/api/v1/workspaces/${workspaceId}/households/${archivedHousehold.id}`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${archivedHousehold.version}"`)
      .expect(200);
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(archivedHouseholdToken)}`,
      )
      .expect(401);
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(archivedMemberToken)}`,
      )
      .expect(401);

    const memberOnlyHousehold = await database.household.create({
      data: {
        workspaceId,
        name: "Familia cu un singur membru arhivat",
        preferredLanguage: "ro",
      },
    });
    const archivedMemberOnly = await database.guest.create({
      data: {
        workspaceId,
        householdId: memberOnlyHousehold.id,
        firstName: "Membru",
        lastName: "Arhivat",
        preferredLanguage: "ro",
      },
    });
    await database.household.update({
      where: { id: memberOnlyHousehold.id },
      data: { primaryGuestId: archivedMemberOnly.id },
    });
    const [unrelatedHouseholdRecipient, archivedMemberOnlyRecipient] =
      await Promise.all([
        database.invitationRecipient.create({
          data: {
            workspaceId,
            invitationSiteId: site.body.data.id,
            invitationVersionId: republished.body.data.published.id,
            householdId: memberOnlyHousehold.id,
            preferredLanguage: "ro",
          },
        }),
        database.invitationRecipient.create({
          data: {
            workspaceId,
            invitationSiteId: site.body.data.id,
            invitationVersionId: republished.body.data.published.id,
            guestId: archivedMemberOnly.id,
            preferredLanguage: "ro",
          },
        }),
      ]);
    const unrelatedHouseholdToken = `unrelated-household-${randomUUID()}-${randomUUID()}`;
    const archivedMemberOnlyToken = `archive-one-member-${randomUUID()}-${randomUUID()}`;
    await database.guestAccessGrant.createMany({
      data: [
        {
          workspaceId,
          invitationRecipientId: unrelatedHouseholdRecipient.id,
          householdId: memberOnlyHousehold.id,
          tokenHash: hashToken(unrelatedHouseholdToken),
        },
        {
          workspaceId,
          invitationRecipientId: archivedMemberOnlyRecipient.id,
          householdId: memberOnlyHousehold.id,
          tokenHash: hashToken(archivedMemberOnlyToken),
        },
      ],
    });
    await owner.agent
      .delete(
        `/api/v1/workspaces/${workspaceId}/guests/${archivedMemberOnly.id}`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${archivedMemberOnly.version}"`)
      .expect(200);
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(archivedMemberOnlyToken)}`,
      )
      .expect(401);
    await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(unrelatedHouseholdToken)}`,
      )
      .expect(200);

    const moveSourceHousehold = await database.household.create({
      data: {
        workspaceId,
        name: "Familia înainte de mutare",
        preferredLanguage: "ro",
      },
    });
    const moveTargetHousehold = await database.household.create({
      data: {
        workspaceId,
        name: "Familia după mutare",
        preferredLanguage: "ro",
      },
    });
    const movedGuest = await database.guest.create({
      data: {
        workspaceId,
        householdId: moveSourceHousehold.id,
        firstName: "Invitat",
        lastName: "Mutat",
        preferredLanguage: "ro",
      },
    });
    const movedGuestRecipient = await database.invitationRecipient.create({
      data: {
        workspaceId,
        invitationSiteId: site.body.data.id,
        invitationVersionId: republished.body.data.published.id,
        guestId: movedGuest.id,
        preferredLanguage: "ro",
      },
    });
    const stableMovedGuestToken = `stable-moved-guest-${randomUUID()}-${randomUUID()}`;
    const movedGuestGrant = await database.guestAccessGrant.create({
      data: {
        workspaceId,
        invitationRecipientId: movedGuestRecipient.id,
        householdId: moveSourceHousehold.id,
        tokenHash: hashToken(stableMovedGuestToken),
      },
    });
    const beforeGuestMove = await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(stableMovedGuestToken)}`,
      )
      .expect(200);
    expect(beforeGuestMove.body.household.id).toBe(moveSourceHousehold.id);
    await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/guests/${movedGuest.id}`)
      .set("Origin", origin)
      .set("If-Match", `"${movedGuest.version}"`)
      .send({ householdId: moveTargetHousehold.id })
      .expect(200);
    const afterGuestMove = await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(stableMovedGuestToken)}`,
      )
      .expect(200);
    expect(afterGuestMove.body.household.id).toBe(moveTargetHousehold.id);
    expect(
      await database.guestAccessGrant.findUniqueOrThrow({
        where: { id: movedGuestGrant.id },
      }),
    ).toMatchObject({
      invitationRecipientId: movedGuestRecipient.id,
      householdId: moveTargetHousehold.id,
      revokedAt: null,
    });
    await database.invitationRecipient.updateMany({
      where: {
        id: { in: [unrelatedHouseholdRecipient.id, movedGuestRecipient.id] },
      },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });

    const listed = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/invitation-recipients`)
      .expect(200);
    expect(
      listed.body.data.items.filter(
        (item: { householdId: string | null }) =>
          item.householdId === householdId,
      ),
    ).toHaveLength(1);
    expect(listed.body.data.items[0].preferredLanguage).toBeTruthy();
    expect(listed.body.data.items[0].householdName).toBeTruthy();

    const pagingHouseholds = Array.from({ length: 51 }, (_, index) => ({
      id: randomUUID(),
      workspaceId,
      name: `Familia paginată ${index + 1}`,
    }));
    await database.household.createMany({ data: pagingHouseholds });
    const pagingRecipientIds = pagingHouseholds.map(() => randomUUID());
    await database.invitationRecipient.createMany({
      data: pagingHouseholds.map((household, index) => ({
        id: pagingRecipientIds[index]!,
        workspaceId,
        invitationSiteId: site.body.data.id,
        invitationVersionId: republished.body.data.published.id,
        householdId: household.id,
      })),
    });
    const firstPage = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/invitation-recipients`)
      .expect(200);
    expect(firstPage.body.data.items).toHaveLength(50);
    expect(firstPage.body.data.nextCursor).toBeTruthy();
    const secondPage = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/invitation-recipients?cursor=${firstPage.body.data.nextCursor}`,
      )
      .expect(200);
    expect(secondPage.body.data.items).toHaveLength(2);
    expect(secondPage.body.data.nextCursor).toBeNull();
    const pagedIds = [
      ...firstPage.body.data.items,
      ...secondPage.body.data.items,
    ].map((item: { id: string }) => item.id);
    expect(new Set(pagedIds).size).toBe(52);
    await database.invitationRecipient.updateMany({
      where: { id: { in: pagingRecipientIds } },
      data: { revokedAt: new Date() },
    });
  }, 120_000);

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
    const disabledEvent = await database.weddingEvent.findFirstOrThrow({
      where: { workspaceId, rsvpEnabled: true, deletedAt: null },
      orderBy: { position: "desc" },
    });
    await database.weddingEvent.update({
      where: { id: disabledEvent.id },
      data: { rsvpEnabled: false },
    });
    const bootstrap = await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(guestToken)}`)
      .expect(200);
    eventIds = bootstrap.body.events
      .filter((event: { rsvpEnabled: boolean }) => event.rsvpEnabled)
      .map((event: { id: string }) => event.id);
    expect(eventIds.length).toBeGreaterThanOrEqual(2);
    expect(
      bootstrap.body.events.some(
        (event: { id: string; rsvpEnabled: boolean }) =>
          event.id === disabledEvent.id && !event.rsvpEnabled,
      ),
    ).toBe(true);
    const members = bootstrap.body.household.members as Array<{
      id: string;
      plusOneAllowed: boolean;
      isPlusOne: boolean;
    }>;
    const requiredMembers = members.filter((member) => !member.isPlusOne);
    const omittedEventPayload = rsvpPayload(
      requiredMembers,
      "CONFIRMED",
      1,
      `rsvp-omitted-event-${randomUUID()}`,
    );
    const requiredMemberIndex = 0;
    omittedEventPayload.members[requiredMemberIndex]!.events.pop();
    await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(omittedEventPayload)
      .expect(422);
    const omittedMemberPayload = rsvpPayload(
      requiredMembers,
      "CONFIRMED",
      1,
      `rsvp-omitted-member-${randomUUID()}`,
    );
    omittedMemberPayload.members = omittedMemberPayload.members.filter(
      (_, index) => index !== requiredMemberIndex,
    );
    await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(omittedMemberPayload)
      .expect(422);
    const mixedEventPayload = rsvpPayload(
      requiredMembers,
      "CONFIRMED",
      1,
      `rsvp-disabled-event-${randomUUID()}`,
    );
    mixedEventPayload.members[0]!.events.push({
      eventId: disabledEvent.id,
      attendance: "CONFIRMED",
    });
    await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(mixedEventPayload)
      .expect(422);
    const firstPayload = rsvpPayload(
      requiredMembers,
      "CONFIRMED",
      1,
      `rsvp-${randomUUID()}`,
    );
    firstPayload.members[0]!.allergies = ["arahide"];
    firstPayload.members[0]!.allergyDetails = "Reacție severă";
    firstPayload.members[0]!.needsTransport = true;
    firstPayload.members[0]!.needsAccommodation = true;
    const competingPayload = {
      ...structuredClone(firstPayload),
      idempotencyKey: `rsvp-competing-${randomUUID()}`,
      message: "Răspuns concurent",
    };
    const [firstConcurrent, secondConcurrent] = await Promise.all([
      request(application.getHttpServer())
        .put("/api/v1/guest/rsvp")
        .send(firstPayload),
      request(application.getHttpServer())
        .put("/api/v1/guest/rsvp")
        .send(competingPayload),
    ]);
    const successfulConcurrent = [firstConcurrent, secondConcurrent].filter(
      (response) => response.status === 200,
    );
    const rejectedConcurrent = [firstConcurrent, secondConcurrent].filter(
      (response) => response.status === 412,
    );
    expect(successfulConcurrent).toHaveLength(1);
    expect(rejectedConcurrent).toHaveLength(1);
    const submitted = successfulConcurrent[0]!;
    submissionId = submitted.body.id;
    submissionVersion = submitted.body.version;
    const legacyBootstrapAfterRsvp = await request(application.getHttpServer())
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(legacyGuestToken)}`,
      )
      .expect(200);
    expect(legacyBootstrapAfterRsvp.body.rsvp.submissionId).toBe(submissionId);
    const hydratedPrimary =
      legacyBootstrapAfterRsvp.body.household.members.find(
        (member: { id: string }) => member.id === members[0]!.id,
      );
    expect(hydratedPrimary).toMatchObject({
      needsTransport: true,
      needsAccommodation: true,
      allergies: ["arahide"],
    });
    const canonicalIdentityRows = await database.invitationRecipient.findMany({
      where: {
        workspaceId,
        revokedAt: null,
        OR: [{ householdId }, { guestId: childGuestId }],
      },
    });
    expect(canonicalIdentityRows).toHaveLength(2);
    expect(
      canonicalIdentityRows.every(
        (row) => row.status === "RESPONDED" && row.rsvpCompletedAt,
      ),
    ).toBe(true);
    expect(
      await database.guestMenuSelection.count({
        where: { workspaceId, active: true },
      }),
    ).toBeGreaterThan(0);
    expect(await database.allergyIssue.count({ where: { workspaceId } })).toBe(
      1,
    );
    expect(
      await database.invitationRecipientInteraction.count({
        where: {
          workspaceId,
          invitationRecipientId: recipientId,
          type: "RSVP_COMPLETED",
        },
      }),
    ).toBe(1);

    const legacyUpdatePayload = rsvpPayload(
      requiredMembers,
      "CONFIRMED",
      submissionVersion,
      `legacy-update-${randomUUID()}`,
    );
    legacyUpdatePayload.token = legacyGuestToken;
    legacyUpdatePayload.members[0]!.needsTransport =
      hydratedPrimary.needsTransport;
    legacyUpdatePayload.members[0]!.needsAccommodation =
      hydratedPrimary.needsAccommodation;
    legacyUpdatePayload.members[0]!.allergies = hydratedPrimary.allergies;
    const legacyUpdate = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(legacyUpdatePayload)
      .expect(200);
    expect(legacyUpdate.body.id).toBe(submissionId);
    submissionVersion = legacyUpdate.body.version;
    const bootstrapAfterHydratedEdit = await request(
      application.getHttpServer(),
    )
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(legacyGuestToken)}`,
      )
      .expect(200);
    expect(
      bootstrapAfterHydratedEdit.body.household.members.find(
        (member: { id: string }) => member.id === members[0]!.id,
      ),
    ).toMatchObject({
      needsTransport: true,
      needsAccommodation: true,
      allergies: ["arahide"],
    });

    const renamedAllergyPayload = rsvpPayload(
      requiredMembers,
      "CONFIRMED",
      submissionVersion,
      `update-confirmed-${randomUUID()}`,
    );
    renamedAllergyPayload.members[0]!.allergies = ["nuci"];
    renamedAllergyPayload.members[0]!.allergyDetails = "Fără arahide";
    const confirmedUpdate = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(renamedAllergyPayload)
      .expect(200);
    const staleVersion = submissionVersion;
    submissionVersion = confirmedUpdate.body.version;
    const bootstrapAfterAllergyRename = await request(
      application.getHttpServer(),
    )
      .get(
        `/api/v1/guest/bootstrap?token=${encodeURIComponent(legacyGuestToken)}`,
      )
      .expect(200);
    expect(
      bootstrapAfterAllergyRename.body.household.members.find(
        (member: { id: string }) => member.id === members[0]!.id,
      ).allergies,
    ).toEqual(["nuci"]);
    const [retiredAllergy, activeAllergy] = await Promise.all([
      database.guestAllergy.findUniqueOrThrow({
        where: {
          guestId_label: { guestId: members[0]!.id, label: "arahide" },
        },
      }),
      database.guestAllergy.findUniqueOrThrow({
        where: {
          guestId_label: { guestId: members[0]!.id, label: "nuci" },
        },
      }),
    ]);
    expect(retiredAllergy).toMatchObject({ active: false });
    expect(retiredAllergy.deletedAt).toBeTruthy();
    expect(activeAllergy).toMatchObject({ active: true, deletedAt: null });
    expect(
      await database.allergyIssue
        .findUniqueOrThrow({ where: { allergyId: retiredAllergy.id } })
        .then((row) => row.status),
    ).toBe("RESOLVED");
    await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(
        rsvpPayload(
          requiredMembers,
          "DECLINED",
          staleVersion,
          `stale-${randomUUID()}`,
        ),
      )
      .expect(412);
    const declined = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(
        rsvpPayload(
          requiredMembers,
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
    const organizerSelection = await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/guest-menu-selections/${primaryGuestId}`,
      )
      .set("Origin", origin)
      .send({ menuId, selectionVersion: null })
      .expect(200);
    await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/guest-menu-selections/${primaryGuestId}`,
      )
      .set("Origin", origin)
      .send({
        menuId: null,
        selectionVersion: organizerSelection.body.data.version,
      })
      .expect(200)
      .expect(({ body }) => expect(body.data.menuId).toBeNull());
    await owner.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/guest-menu-selections/${primaryGuestId}`,
      )
      .set("Origin", origin)
      .send({ menuId, selectionVersion: null })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({
          guestId: primaryGuestId,
          menuId,
          source: "organizer",
        }),
      );
    const issue = await database.allergyIssue.findUniqueOrThrow({
      where: { allergyId: activeAllergy.id },
    });
    await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/allergy-issues/${issue.id}`)
      .set("Origin", origin)
      .set("If-Match", `"${issue.version}"`)
      .send({ status: "RESOLVED", resolutionNote: "Confirmat cu locația" })
      .expect(200);

    const plusOneMember = members.find((member) => member.isPlusOne);
    expect(plusOneMember).toBeTruthy();
    const rsvpSite = await database.invitationSite.findUniqueOrThrow({
      where: { workspaceId },
    });
    const plusOneRecipient = await database.invitationRecipient.create({
      data: {
        workspaceId,
        guestId: plusOneMember!.id,
        invitationSiteId: rsvpSite.id,
        invitationVersionId: rsvpSite.publishedVersionId!,
        preferredLanguage: "ro",
      },
    });
    const plusOneToken = `plus-one-removal-${randomUUID()}-${randomUUID()}`;
    await database.guestAccessGrant.create({
      data: {
        workspaceId,
        householdId,
        invitationRecipientId: plusOneRecipient.id,
        tokenHash: hashToken(plusOneToken),
      },
    });
    await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(plusOneToken)}`)
      .expect(200);
    const removePlusOne = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send({
        ...rsvpPayload(
          requiredMembers,
          "CONFIRMED",
          submissionVersion,
          `remove-plus-one-${randomUUID()}`,
        ),
        plusOne: { attending: false },
      })
      .expect(200);
    submissionVersion = removePlusOne.body.version;
    await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(plusOneToken)}`)
      .expect(401);
    expect(
      await database.guestAccessGrant.count({
        where: {
          invitationRecipientId: plusOneRecipient.id,
          revokedAt: null,
        },
      }),
    ).toBe(0);

    const lockedHousehold = await database.household.create({
      data: {
        workspaceId,
        name: "Familia răspuns unic",
        preferredLanguage: "ro",
      },
    });
    const lockedGuest = await database.guest.create({
      data: {
        workspaceId,
        householdId: lockedHousehold.id,
        firstName: "Ioana",
        lastName: "Răspuns",
        preferredLanguage: "ro",
      },
    });
    await database.household.update({
      where: { id: lockedHousehold.id },
      data: { primaryGuestId: lockedGuest.id },
    });
    const activeSite = await database.invitationSite.findUniqueOrThrow({
      where: { workspaceId },
    });
    const lockedRecipient = await database.invitationRecipient.create({
      data: {
        workspaceId,
        householdId: lockedHousehold.id,
        invitationSiteId: activeSite.id,
        invitationVersionId: activeSite.publishedVersionId!,
        preferredLanguage: "ro",
      },
    });
    const lockedToken = `locked-${randomUUID()}-${randomUUID()}`;
    await database.guestAccessGrant.create({
      data: {
        workspaceId,
        householdId: lockedHousehold.id,
        invitationRecipientId: lockedRecipient.id,
        tokenHash: hashToken(lockedToken),
      },
    });
    const currentForm = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/rsvp-form`)
      .expect(200);
    const lockedDraft = await owner.agent
      .put(`/api/v1/workspaces/${workspaceId}/rsvp-form`)
      .set("Origin", origin)
      .set("If-Match", `"${currentForm.body.data.version}"`)
      .send({
        config: {
          ...currentForm.body.data.draft.config,
          allowEdits: false,
        },
      })
      .expect(200);
    const lockedPublished = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/rsvp-form/publish`)
      .set("Origin", origin)
      .set("If-Match", `"${lockedDraft.body.data.version}"`)
      .set("Idempotency-Key", `rsvp-lock-${randomUUID()}`)
      .expect(201);
    const lockedBootstrap = await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(lockedToken)}`)
      .expect(200);
    expect(lockedBootstrap.body.allowEdits).toBe(true);
    const lockedPayload = {
      token: lockedToken,
      version: 1,
      idempotencyKey: `locked-first-${randomUUID()}`,
      members: [
        {
          guestId: lockedGuest.id,
          events: eventIds.map((eventId) => ({
            eventId,
            attendance: "CONFIRMED",
          })),
          menuId,
          allergies: [],
          needsTransport: false,
          needsAccommodation: false,
        },
      ],
      message: "Primul răspuns rămâne permis",
    };
    const lockedFirstSubmit = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(lockedPayload)
      .expect(200);
    const lockedAfterSubmit = await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(lockedToken)}`)
      .expect(200);
    expect(lockedAfterSubmit.body.allowEdits).toBe(false);
    await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send({
        ...lockedPayload,
        version: lockedFirstSubmit.body.version,
        idempotencyKey: `locked-second-${randomUUID()}`,
      })
      .expect(423);
    const nextLockedDraft = await owner.agent
      .put(`/api/v1/workspaces/${workspaceId}/rsvp-form`)
      .set("Origin", origin)
      .set("If-Match", `"${lockedPublished.body.data.version}"`)
      .send({
        config: {
          ...lockedPublished.body.data.published.config,
          allowEdits: false,
          plusOneQuestion: false,
          menuSelection: false,
          allergyCollection: false,
          accessibilityCollection: false,
          transportQuestion: false,
          accommodationQuestion: false,
          guestMessage: false,
        },
      })
      .expect(200);
    const nextLockedPublished = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/rsvp-form/publish`)
      .set("Origin", origin)
      .set("If-Match", `"${nextLockedDraft.body.data.version}"`)
      .set("Idempotency-Key", `rsvp-next-lock-${randomUUID()}`)
      .expect(201);
    const nextLockedBootstrap = await request(application.getHttpServer())
      .get(`/api/v1/guest/bootstrap?token=${encodeURIComponent(lockedToken)}`)
      .expect(200);
    expect(nextLockedBootstrap.body.allowEdits).toBe(true);
    expect(nextLockedBootstrap.body.rsvp.submissionId).toBeNull();
    expect(nextLockedBootstrap.body.rsvpConfig).toMatchObject({
      plusOneQuestion: false,
      menuSelection: false,
      allergyCollection: false,
      transportQuestion: false,
      accommodationQuestion: false,
      guestMessage: false,
    });
    expect(nextLockedBootstrap.body.menus).toEqual([]);
    const nextLockedPayload = {
      ...lockedPayload,
      version: 1,
      idempotencyKey: `locked-next-first-${randomUUID()}`,
      message: "Primul răspuns pentru versiunea nouă",
      plusOne: {
        attending: true,
        firstName: "Nu",
        lastName: "Se salvează",
        menuId,
      },
    };
    const nextLockedFirstSubmit = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(nextLockedPayload)
      .expect(200);
    const nextLockedReplay = await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send(nextLockedPayload)
      .expect(200);
    expect(nextLockedReplay.body).toEqual(nextLockedFirstSubmit.body);
    expect(
      await database.rsvpSubmission
        .findUniqueOrThrow({ where: { id: nextLockedFirstSubmit.body.id } })
        .then((row) => row.guestMessage),
    ).toBeNull();
    expect(
      await database.guestMenuSelection.count({
        where: { guestId: lockedGuest.id, active: true },
      }),
    ).toBe(0);
    expect(
      await database.guestAllergy.count({
        where: { guestId: lockedGuest.id, active: true },
      }),
    ).toBe(0);
    expect(
      await database.guest.count({
        where: { primaryGuestId: lockedGuest.id, isPlusOne: true },
      }),
    ).toBe(0);
    await request(application.getHttpServer())
      .put("/api/v1/guest/rsvp")
      .send({
        ...nextLockedPayload,
        version: nextLockedFirstSubmit.body.version,
        idempotencyKey: `locked-next-second-${randomUUID()}`,
      })
      .expect(423);
    await database.invitationRecipient.update({
      where: { id: lockedRecipient.id },
      data: { revokedAt: new Date() },
    });
    const restoredDraft = await owner.agent
      .put(`/api/v1/workspaces/${workspaceId}/rsvp-form`)
      .set("Origin", origin)
      .set("If-Match", `"${nextLockedPublished.body.data.version}"`)
      .send({
        config: {
          ...nextLockedPublished.body.data.published.config,
          allowEdits: true,
          plusOneQuestion: true,
          menuSelection: true,
          allergyCollection: true,
          accessibilityCollection: true,
          transportQuestion: true,
          accommodationQuestion: true,
          guestMessage: true,
        },
      })
      .expect(200);
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/rsvp-form/publish`)
      .set("Origin", origin)
      .set("If-Match", `"${restoredDraft.body.data.version}"`)
      .set("Idempotency-Key", `rsvp-unlock-${randomUUID()}`)
      .expect(201);
  }, 120_000);

  it("snapshots, fans out and delivers a campaign, dedupes signed webhooks, retries only failure, exports artifacts and projects activity", async () => {
    const site = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/invitation-site`)
      .expect(200);
    await database.household.update({
      where: { id: householdId },
      data: { country: "România", preferredLanguage: "ro" },
    });
    await database.invitationRecipient.updateMany({
      where: { workspaceId, householdId, revokedAt: null },
      data: { preferredLanguage: "ro" },
    });
    const segmentedCampaign = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/campaigns`)
      .set("Origin", origin)
      .set("Idempotency-Key", `campaign-segment-${randomUUID()}`)
      .send({
        name: "Segment internațional",
        purpose: "INFORMATION_UPDATE",
        channel: "EMAIL",
        invitationVersionId: site.body.data.published.id,
        template: { subject: "Detalii", body: "Mesaj segmentat." },
        audienceFilter: {
          householdIds: [householdId],
          countries: ["România"],
          preferredLanguages: ["ro"],
        },
      })
      .expect(201);
    const segmentedPreview = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/campaigns/${segmentedCampaign.body.data.id}/audience-preview`,
      )
      .expect(200);
    expect(segmentedPreview.body.data).toMatchObject({ total: 1, valid: 1 });
    await database.campaign.delete({
      where: { id: segmentedCampaign.body.data.id },
    });
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
    expect(preview.body.data.audienceRevision).toMatch(/^[a-f0-9]{64}$/);
    await database.guest.update({
      where: { id: primaryGuestId },
      data: { emailNormalized: `changed-${randomUUID()}@example.test` },
    });
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaign.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${audience.body.data.campaign.version}"`)
      .set("Idempotency-Key", `send-stale-audience-${randomUUID()}`)
      .send({
        transition: "SEND_NOW",
        audienceRevision: preview.body.data.audienceRevision,
      })
      .expect(409);
    await database.guest.update({
      where: { id: primaryGuestId },
      data: { emailNormalized: owner.email },
    });
    const confirmedPreview = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaign.body.data.id}/audience-preview`,
      )
      .expect(200);
    const queued = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaign.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${audience.body.data.campaign.version}"`)
      .set("Idempotency-Key", `send-${randomUUID()}`)
      .send({
        transition: "SEND_NOW",
        audienceRevision: confirmedPreview.body.data.audienceRevision,
      })
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
      await database.campaignRecipient.count({
        where: { campaignId: campaign.body.data.id },
      }),
    ).toBe(1);
    expect(
      await database.deliveryAttempt.count({
        where: { sourceId: delivery.id },
      }),
    ).toBe(1);
    expect(
      await database.guestAccessGrant.count({
        where: {
          invitationRecipientId: recipientId,
          channel: { in: ["EMAIL", "QR", "MANUAL", "WHATSAPP"] },
          revokedAt: null,
        },
      }),
    ).toBe(4);

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
    const retryPreview = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/campaigns/${retryCampaign.body.data.id}/audience-preview`,
      )
      .expect(200);
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/campaigns/${retryCampaign.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${retryCampaign.body.data.version}"`)
      .set("Idempotency-Key", `send-retry-${randomUUID()}`)
      .send({
        transition: "SEND_NOW",
        audienceRevision: retryPreview.body.data.audienceRevision,
      })
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
    const lateHousehold = await database.household.create({
      data: {
        workspaceId,
        name: "Familia adăugată după eșec",
        preferredLanguage: "ro",
      },
    });
    const lateGuest = await database.guest.create({
      data: {
        workspaceId,
        householdId: lateHousehold.id,
        firstName: "Târziu",
        lastName: "Invitat",
        emailNormalized: `late-${randomUUID()}@example.test`,
        preferredLanguage: "ro",
      },
    });
    await database.household.update({
      where: { id: lateHousehold.id },
      data: { primaryGuestId: lateGuest.id },
    });
    const lateRecipient = await database.invitationRecipient.create({
      data: {
        workspaceId,
        householdId: lateHousehold.id,
        invitationSiteId: site.body.data.id,
        invitationVersionId: site.body.data.published.id,
        preferredLanguage: "ro",
      },
    });
    const retryAudienceSize = await database.campaignRecipient.count({
      where: { campaignId: retryCampaign.body.data.id },
    });
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
      await database.campaignRecipient.count({
        where: { campaignId: retryCampaign.body.data.id },
      }),
    ).toBe(retryAudienceSize);
    expect(
      await database.campaignRecipient.count({
        where: {
          campaignId: retryCampaign.body.data.id,
          invitationRecipientId: lateRecipient.id,
        },
      }),
    ).toBe(0);
    expect(
      await database.deliveryAttempt.count({
        where: { sourceId: failedDelivery.id },
      }),
    ).toBe(2);
    await database.invitationRecipient.delete({
      where: { id: lateRecipient.id },
    });
    await database.guest.delete({ where: { id: lateGuest.id } });
    await database.household.delete({ where: { id: lateHousehold.id } });

    const addressSafetyCampaign = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/campaigns`)
      .set("Origin", origin)
      .set("Idempotency-Key", `campaign-address-safety-${randomUUID()}`)
      .send({
        name: "Campanie blocată la schimbarea adresei",
        purpose: "INVITATION",
        channel: "EMAIL",
        invitationVersionId: site.body.data.published.id,
        template: {
          subject: "Adresă confirmată",
          body: "Acest mesaj nu trebuie trimis după schimbarea adresei.",
        },
        audienceFilter: { householdIds: [householdId] },
      })
      .expect(201);
    const addressSafetyPreview = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/campaigns/${addressSafetyCampaign.body.data.id}/audience-preview`,
      )
      .expect(200);
    expect(addressSafetyPreview.body.data.valid).toBe(1);
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/campaigns/${addressSafetyCampaign.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${addressSafetyCampaign.body.data.version}"`)
      .set("Idempotency-Key", `schedule-address-safety-${randomUUID()}`)
      .send({
        transition: "SCHEDULE",
        scheduledAt: new Date(Date.now() + 5_000).toISOString(),
        audienceRevision: addressSafetyPreview.body.data.audienceRevision,
      })
      .expect(201);
    await database.guest.update({
      where: { id: primaryGuestId },
      data: { emailNormalized: `moved-${randomUUID()}@example.test` },
    });
    const addressSafetyRecipient =
      await database.campaignRecipient.findFirstOrThrow({
        where: { campaignId: addressSafetyCampaign.body.data.id },
      });
    await expect
      .poll(
        async () =>
          (
            await database.campaignRecipient.findUniqueOrThrow({
              where: { id: addressSafetyRecipient.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("FAILED");
    expect(
      await database.campaignRecipient.findUniqueOrThrow({
        where: { id: addressSafetyRecipient.id },
      }),
    ).toMatchObject({
      failureCode: "CAMPAIGN_ADDRESS_CHANGED",
      providerMessageId: null,
    });
    expect(
      await database.deliveryAttempt.count({
        where: { sourceId: addressSafetyRecipient.id, outcome: "SUCCEEDED" },
      }),
    ).toBe(0);
    await database.guest.update({
      where: { id: primaryGuestId },
      data: { emailNormalized: owner.email },
    });

    const withdrawnSafetyCampaign = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/campaigns`)
      .set("Origin", origin)
      .set("Idempotency-Key", `campaign-withdrawn-safety-${randomUUID()}`)
      .send({
        name: "Campanie blocată după retragerea invitației",
        purpose: "INVITATION",
        channel: "EMAIL",
        invitationVersionId: site.body.data.published.id,
        template: {
          subject: "Invitație retrasă",
          body: "Acest mesaj nu trebuie trimis după retragerea invitației.",
        },
        audienceFilter: { householdIds: [householdId] },
      })
      .expect(201);
    const withdrawnSafetyPreview = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/campaigns/${withdrawnSafetyCampaign.body.data.id}/audience-preview`,
      )
      .expect(200);
    expect(withdrawnSafetyPreview.body.data.valid).toBe(1);
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/campaigns/${withdrawnSafetyCampaign.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${withdrawnSafetyCampaign.body.data.version}"`)
      .set("Idempotency-Key", `schedule-withdrawn-safety-${randomUUID()}`)
      .send({
        transition: "SCHEDULE",
        scheduledAt: new Date(Date.now() + 5_000).toISOString(),
        audienceRevision: withdrawnSafetyPreview.body.data.audienceRevision,
      })
      .expect(201);
    const publishedSiteBeforeWithdrawal = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/invitation-site`)
      .expect(200);
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/invitation-site/unpublish`)
      .set("Origin", origin)
      .set("If-Match", `"${publishedSiteBeforeWithdrawal.body.data.version}"`)
      .expect(201);
    const withdrawnSafetyRecipient =
      await database.campaignRecipient.findFirstOrThrow({
        where: { campaignId: withdrawnSafetyCampaign.body.data.id },
      });
    await expect
      .poll(
        async () =>
          (
            await database.campaignRecipient.findUniqueOrThrow({
              where: { id: withdrawnSafetyRecipient.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("FAILED");
    expect(
      await database.campaignRecipient.findUniqueOrThrow({
        where: { id: withdrawnSafetyRecipient.id },
      }),
    ).toMatchObject({
      failureCode: "CAMPAIGN_TARGET_INACTIVE",
      providerMessageId: null,
    });
    expect(
      await database.deliveryAttempt.count({
        where: {
          sourceId: withdrawnSafetyRecipient.id,
          outcome: "SUCCEEDED",
        },
      }),
    ).toBe(0);

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
    expect(
      seatingDetail.body.data.guests.some(
        (guest: { menu: { id: string; name: string } | null }) =>
          guest.menu?.id === menuId && guest.menu.name === "Meniu clasic",
      ),
    ).toBe(true);
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}/publish`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${seatingDetail.body.data.version}"`)
      .set("Idempotency-Key", `seat-publish-${randomUUID()}`)
      .send({})
      .expect(201);
    const publishedTable = seatingDetail.body.data.tables[0];
    await owner.agent
      .patch(
        `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}/tables/${tableId}`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${publishedTable.version}"`)
      .send({ notes: "Masă verificată de organizator" })
      .expect(200);
    seatingDetail = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}`)
      .expect(200);
    expect(seatingDetail.body.data).toMatchObject({
      status: "published",
      hasUnpublishedChanges: true,
    });
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}/publish`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${seatingDetail.body.data.version}"`)
      .set("Idempotency-Key", `seat-republish-${randomUUID()}`)
      .send({})
      .expect(201);
    seatingDetail = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/seating-plans/${seatingId}`)
      .expect(200);
    expect(seatingDetail.body.data.hasUnpublishedChanges).toBe(false);
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
      (item: { guestId: string; weddingEventId: string }) =>
        item.guestId === primaryGuestId && item.weddingEventId === eventId,
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
    // Slice 3 covers imports, campaign delivery, exports and advanced
    // logistics. Keep the fixture's plan aligned with those paid capabilities
    // instead of allowing unrelated FREE-plan 402 responses to mask regressions.
    await database.workspaceSubscription.update({
      where: { workspaceId: id },
      data: {
        planKey: "PLUS",
        status: "ACTIVE",
        provider: "integration-test",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    });
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

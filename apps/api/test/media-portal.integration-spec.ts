import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@weddingos/database";
import { AppModule } from "../src/app.module";
import { ProblemFilter } from "../src/common/problem.filter";
import { SessionService } from "../src/auth/session.service";
import { DatabaseService } from "../src/common/database.service";
import { createOpaqueToken, hashToken } from "../src/guests/sensitive.crypto";
import { MEDIA_LIMITS } from "../src/event-day/media-portal.service";
import type { MediaPortalResource } from "@weddingos/contracts";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";

describe.sequential(
  "Participant QR collection with real RLS and storage",
  () => {
    const ownerDb = new PrismaClient({
      datasourceUrl: process.env.DATABASE_OWNER_URL,
    });
    let app: INestApplication;
    let database: DatabaseService;
    let workspaceId: string;
    let eventId: string;
    let ownerId: string;
    let cookie: string;
    let outsiderCookie: string;
    let secondWorkspaceId: string;
    let secondEventId: string;
    let secondCookie: string;
    let secondPortal: MediaPortalResource;
    let secondToken: string;
    let portal: MediaPortalResource;
    let token: string;
    let uploadedMomentId: string;
    let uploadedMomentToken: string;
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAn0lEQVRoge2SQQkAQRDDajJ+6mZtnoh7hIFCBKSh4fU00Q3YgOoV2YV6l+gGbED1iuxCvUt0AzagekV2od4lugEbUL0iu1DvEt2ADahekV2od4luwAZUr8gu1LtEN2ADqldkF+pdohuwAdUrsgv1LtEN2IDqFdmFepfoBmxA9YrsQr1LdAM2oHpFdqHeJboBG1C9IrtQ7xLdgA2oXvEPHxSZwVqzJi01AAAAAElFTkSuQmCC",
      "base64",
    );
    const input = () => ({
      uploadToken: createOpaqueToken(),
      consent: true,
      mediaType: "IMAGE",
      originalFileName: "moment.png",
      contentType: "image/png",
      sizeBytes: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      contributorName: "Andrei",
    });
    const auth = () => ({ Cookie: cookie, Origin: process.env.WEB_URL! });
    const publicHeaders = () => ({
      Authorization: `Bearer ${token}`,
      Origin: process.env.WEB_URL!,
    });
    beforeAll(async () => {
      const identity = await ownerDb.$queryRaw<
        { database_purpose: string; environment: string }[]
      >`SELECT * FROM database_identities WHERE id='singleton'`;
      expect(identity[0]).toMatchObject({
        database_purpose: "integration",
        environment: "test",
      });
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.use(cookieParser());
      app.useGlobalFilters(new ProblemFilter());
      await app.init();
      database = app.get(DatabaseService);
      const user = await ownerDb.user.create({
        data: {
          email: `qr-${randomUUID()}@example.test`,
          acceptedTermsVersion: "test",
          acceptedTermsAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });
      ownerId = user.id;
      await ownerDb.userProfile.create({
        data: { userId: user.id, firstName: "Andrei", lastName: "Test" },
      });
      await ownerDb.userPreference.create({ data: { userId: user.id } });
      const outsider = await ownerDb.user.create({
        data: {
          email: `qr-other-${randomUUID()}@example.test`,
          acceptedTermsVersion: "test",
          acceptedTermsAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });
      const secondOwner = await ownerDb.user.create({
        data: {
          email: `qr-second-${randomUUID()}@example.test`,
          acceptedTermsVersion: "test",
          acceptedTermsAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });
      await ownerDb.userProfile.create({
        data: {
          userId: secondOwner.id,
          firstName: "Maria",
          lastName: "Izolare",
        },
      });
      await ownerDb.userPreference.create({ data: { userId: secondOwner.id } });
      const workspace = await ownerDb.workspace.create({
        data: {
          title: "Summit QR test",
          createdById: user.id,
          updatedById: user.id,
        },
      });
      workspaceId = workspace.id;
      await ownerDb.eventProfile.create({
        data: {
          workspaceId,
          eventType: "conference",
          organizerName: "Echipa Summit",
          createdById: user.id,
          updatedById: user.id,
        },
      });
      const role = await ownerDb.roleTemplate.findUniqueOrThrow({
        where: { key: "couple_owner" },
      });
      await ownerDb.workspaceMembership.create({
        data: {
          workspaceId,
          userId: user.id,
          roleTemplateId: role.id,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await ownerDb.workspaceSubscription.create({
        data: {
          workspaceId,
          planKey: "PRO",
          status: "ACTIVE",
          createdById: user.id,
          updatedById: user.id,
        },
      });
      const event = await ownerDb.weddingEvent.create({
        data: {
          workspaceId,
          type: "CUSTOM",
          title: "Summit 2026",
          timezone: "Europe/Bucharest",
        },
      });
      eventId = event.id;
      const secondWorkspace = await ownerDb.workspace.create({
        data: {
          title: "Festival izolat",
          createdById: secondOwner.id,
          updatedById: secondOwner.id,
        },
      });
      secondWorkspaceId = secondWorkspace.id;
      await ownerDb.eventProfile.create({
        data: {
          workspaceId: secondWorkspaceId,
          eventType: "festival",
          organizerName: "Organizator izolat",
          createdById: secondOwner.id,
          updatedById: secondOwner.id,
        },
      });
      await ownerDb.workspaceMembership.create({
        data: {
          workspaceId: secondWorkspaceId,
          userId: secondOwner.id,
          roleTemplateId: role.id,
          createdById: secondOwner.id,
          updatedById: secondOwner.id,
        },
      });
      await ownerDb.workspaceSubscription.create({
        data: {
          workspaceId: secondWorkspaceId,
          planKey: "PRO",
          status: "ACTIVE",
          createdById: secondOwner.id,
          updatedById: secondOwner.id,
        },
      });
      const secondEvent = await ownerDb.weddingEvent.create({
        data: {
          workspaceId: secondWorkspaceId,
          type: "CUSTOM",
          title: "Festival privat 2026",
          timezone: "Europe/Bucharest",
        },
      });
      secondEventId = secondEvent.id;
      cookie = `weddingos_session=${(await app.get(SessionService).create(user.id, false)).rawToken}`;
      outsiderCookie = `weddingos_session=${(await app.get(SessionService).create(outsider.id, false)).rawToken}`;
      secondCookie = `weddingos_session=${(await app.get(SessionService).create(secondOwner.id, false)).rawToken}`;
      const s3 = new S3Client({
        endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
        region: "us-east-1",
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY!,
          secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY!,
        },
      });
      try {
        await s3.send(
          new HeadBucketCommand({ Bucket: process.env.OBJECT_STORAGE_BUCKET! }),
        );
      } catch {
        await s3.send(
          new CreateBucketCommand({
            Bucket: process.env.OBJECT_STORAGE_BUCKET!,
          }),
        );
      }
      s3.destroy();
    }, 60_000);
    afterAll(async () => {
      // Optional local browser handoff contains test-only credentials, never committed.
      if (process.env.MEDIA_QR_FIXTURE_PATH && portal)
        await writeFile(
          process.env.MEDIA_QR_FIXTURE_PATH,
          JSON.stringify({ workspaceId, eventId, cookie, token }),
          { mode: 0o600 },
        );
      await app?.close();
      await ownerDb.$disconnect();
    });

    it("requires organizer rights, creates a QR, reveals only public event metadata", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/media-portals`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/media-portals`)
        .set({ ...auth(), Cookie: outsiderCookie })
        .send({ weddingEventId: eventId })
        .expect(403);
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/media-portals`)
        .set(auth())
        .send({ weddingEventId: eventId })
        .expect(201);
      portal = response.body.data;
      token = portal.url.split("#")[1]!;
      expect(portal.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(portal.url).toBe(`${process.env.WEB_URL}/event-upload#${token}`);
      const result = await request(app.getHttpServer())
        .get("/api/v1/event-media")
        .set(publicHeaders())
        .expect(200);
      expect(result.body).toMatchObject({
        eventName: "Summit 2026",
        active: true,
      });
      expect(result.body.tokenEncrypted).toBeUndefined();
      expect(result.body.workspaceId).toBeUndefined();
      await request(app.getHttpServer()).get("/api/v1/event-media").expect(400);
      await request(app.getHttpServer())
        .get("/api/v1/event-media")
        .set("Authorization", `Bearer ${createOpaqueToken()}`)
        .expect(404);

      const secondResponse = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${secondWorkspaceId}/media-portals`)
        .set({ Cookie: secondCookie, Origin: process.env.WEB_URL! })
        .send({ weddingEventId: secondEventId })
        .expect(201);
      secondPortal = secondResponse.body.data;
      secondToken = secondPortal.url.split("#")[1]!;
      await request(app.getHttpServer())
        .get("/api/v1/event-media")
        .set("Authorization", `Bearer ${secondToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.eventName).toBe("Festival privat 2026");
          expect(body.workspaceId).toBeUndefined();
          expect(body.weddingEventId).toBeUndefined();
        });

      await expect(
        database.withContext(
          { mediaPortalTokenHash: hashToken(token) },
          (tx) =>
            tx.$executeRaw`INSERT INTO stored_objects (
              id, workspace_id, storage_provider, bucket, object_key,
              original_file_name, content_type_claimed, size_bytes,
              checksum_sha256, status, scan_status, updated_at
            ) VALUES (
              ${randomUUID()}::uuid, ${workspaceId}::uuid, 'bunny-s3', 'test',
              ${`private/guest-moments/${secondWorkspaceId}/${randomUUID()}`},
              'foreign-prefix.png', 'image/png', 1,
              ${"a".repeat(64)}, 'UPLOADING'::"StoredObjectStatus",
              'PENDING'::"StoredObjectScanStatus", NOW()
            )`,
        ),
      ).rejects.toThrow();
    });
    it("revokes public access when the event or workspace is removed", async () => {
      await ownerDb.weddingEvent.update({
        where: { id: eventId },
        data: { deletedAt: new Date() },
      });
      await request(app.getHttpServer())
        .get("/api/v1/event-media")
        .set(publicHeaders())
        .expect(404);
      await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(input())
        .expect(404);
      await ownerDb.weddingEvent.update({
        where: { id: eventId },
        data: { deletedAt: null },
      });
      await ownerDb.workspace.update({
        where: { id: workspaceId },
        data: { deletedAt: new Date() },
      });
      await request(app.getHttpServer())
        .get("/api/v1/event-media")
        .set(publicHeaders())
        .expect(404);
      await ownerDb.workspace.update({
        where: { id: workspaceId },
        data: { deletedAt: null },
      });
      await request(app.getHttpServer())
        .get("/api/v1/event-media")
        .set(publicHeaders())
        .expect(200);
    });
    it("honors plan changes and the three-day payment grace period", async () => {
      await ownerDb.workspaceSubscription.update({
        where: { workspaceId },
        data: {
          status: "PAST_DUE",
          gracePeriodEndAt: new Date(Date.now() + 3 * 86400_000),
        },
      });
      expect(
        (
          await request(app.getHttpServer())
            .get("/api/v1/event-media")
            .set(publicHeaders())
        ).body.active,
      ).toBe(true);
      await ownerDb.workspaceSubscription.update({
        where: { workspaceId },
        data: { gracePeriodEndAt: new Date(Date.now() - 1000) },
      });
      expect(
        (
          await request(app.getHttpServer())
            .get("/api/v1/event-media")
            .set(publicHeaders())
        ).body.active,
      ).toBe(false);
      await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(input())
        .expect(410);
      await ownerDb.workspaceSubscription.update({
        where: { workspaceId },
        data: { status: "ACTIVE", gracePeriodEndAt: null },
      });
    });
    it("rejects missing consent, unsafe types and oversized files", async () => {
      for (const [change, status] of [
        [{ consent: false }, 400],
        [{ contentType: "image/svg+xml" }, 400],
        [{ mediaType: "VIDEO" }, 422],
        [{ sizeBytes: MEDIA_LIMITS.imageMaxBytes + 1 }, 422],
      ] as const) {
        await request(app.getHttpServer())
          .post("/api/v1/event-media/uploads")
          .set(publicHeaders())
          .send({ ...input(), ...change })
          .expect(status);
      }
    });
    it("uploads to private storage, isolates individual upload access and completes exactly once", async () => {
      const body = input();
      uploadedMomentToken = body.uploadToken;
      const start = await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(body)
        .expect(201);
      uploadedMomentId = start.body.momentId as string;
      const replay = await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(body)
        .expect(201);
      expect(replay.body.momentId).toBe(start.body.momentId);
      const stored = await ownerDb.guestMomentMedia.findUniqueOrThrow({
        where: { guestMomentId: start.body.momentId },
      });
      expect(
        await database.withContext(
          {
            mediaPortalTokenHash: hashToken(token),
            mediaUploadTokenHash: hashToken(createOpaqueToken()),
          },
          (tx) => tx.guestMoment.findMany(),
        ),
      ).toEqual([]);
      expect(
        await database.withContext(
          { mediaPortalTokenHash: hashToken(token) },
          (tx) =>
            tx.storedObject.findMany({ where: { id: stored.storedObjectId } }),
        ),
      ).toEqual([]);
      const put = await fetch(start.body.upload.url, {
        method: "PUT",
        headers: start.body.upload.headers,
        body: bytes,
      });
      expect(put.ok).toBe(true);
      await request(app.getHttpServer())
        .post(`/api/v1/event-media/uploads/${start.body.momentId}/complete`)
        .set(publicHeaders())
        .send({ uploadToken: createOpaqueToken() })
        .expect(404);
      for (let retry = 0; retry < 2; retry++)
        await request(app.getHttpServer())
          .post(`/api/v1/event-media/uploads/${start.body.momentId}/complete`)
          .set(publicHeaders())
          .send({ uploadToken: body.uploadToken })
          .expect(201);
      expect(
        await ownerDb.outboxMessage.count({
          where: {
            aggregateId: start.body.momentId,
            eventName: "guest_moment.uploaded.v1",
          },
        }),
      ).toBe(1);
      const listing = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/guest-moments`)
        .set(auth())
        .expect(200);
      const listedMoment = listing.body.data.items.find(
        (m: { id: string }) => m.id === start.body.momentId,
      );
      expect(listedMoment).toMatchObject({
        contributorName: "Andrei",
        householdId: null,
      });
      expect(["PROCESSING", "PENDING_REVIEW"]).toContain(listedMoment.status);
      const finishedReplay = await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(body)
        .expect(201);
      expect(finishedReplay.body.completed).toBe(true);
    });
    it("processes Bunny media and exposes private CDN links to the organizer", async () => {
      let status = "PROCESSING";
      for (
        let attempt = 0;
        attempt < 80 && status === "PROCESSING";
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        status = (
          await ownerDb.guestMoment.findUniqueOrThrow({
            where: { id: uploadedMomentId },
            select: { status: true },
          })
        ).status;
      }
      expect(status).toBe("PENDING_REVIEW");

      const media = await ownerDb.guestMomentMedia.findUniqueOrThrow({
        where: { guestMomentId: uploadedMomentId },
      });
      expect(media.derivativeObjectId).toBeTruthy();
      const stored = await ownerDb.storedObject.findMany({
        where: {
          id: { in: [media.storedObjectId, media.derivativeObjectId!] },
        },
      });
      expect(stored).toHaveLength(2);
      expect(stored.every((object) => object.status === "AVAILABLE")).toBe(
        true,
      );
      if (process.env.EVENT_MEDIA_STORAGE_PROVIDER === "bunny-s3") {
        expect(
          stored.every((object) => object.storageProvider === "bunny-s3"),
        ).toBe(true);
        expect(
          stored.every(
            (object) =>
              object.bucket === process.env.EVENT_MEDIA_STORAGE_BUCKET,
          ),
        ).toBe(true);
      }

      const preview = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/guest-moments/${uploadedMomentId}/preview`,
        )
        .set(auth())
        .expect(200);
      const previewFetch = await fetch(preview.body.data.url);
      expect(previewFetch.status).toBe(200);
      expect(previewFetch.headers.get("content-type")).toContain("image/webp");

      const content = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/media-portals/moments/${uploadedMomentId}/content`,
        )
        .set(auth())
        .expect(200);
      expect(content.body.data.fileName).toBe("moment.png");
      const originalFetch = await fetch(content.body.data.url);
      expect(originalFetch.status).toBe(200);
      expect(Buffer.from(await originalFetch.arrayBuffer())).toEqual(bytes);
    }, 30_000);
    it("publishes approved moments into the live gallery behind the same QR", async () => {
      const enabled = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/media-portals/live-gallery`)
        .set(auth())
        .send({ weddingEventId: eventId, enabled: true })
        .expect(201);
      expect(enabled.body.data).toMatchObject({
        liveGalleryEnabled: true,
        liveGallery: { status: "PUBLISHED", itemCount: 0 },
      });

      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${secondWorkspaceId}/media-portals/live-gallery`,
        )
        .set({ Cookie: secondCookie, Origin: process.env.WEB_URL! })
        .send({ weddingEventId: secondEventId, enabled: true })
        .expect(201);

      const empty = await request(app.getHttpServer())
        .get("/api/v1/event-media/gallery")
        .set(publicHeaders())
        .expect(200);
      expect(empty.body).toMatchObject({
        enabled: true,
        gallery: { items: [] },
      });

      const before = await ownerDb.guestMoment.findUniqueOrThrow({
        where: { id: uploadedMomentId },
      });
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/guest-moments/${uploadedMomentId}/transitions`,
        )
        .set({
          ...auth(),
          "If-Match": `"${before.version}"`,
          "Idempotency-Key": randomUUID(),
        })
        .send({ transition: "APPROVE" })
        .expect(201)
        .expect(({ body }) => expect(body.data.status).toBe("PUBLISHED"));

      const gallery = await request(app.getHttpServer())
        .get("/api/v1/event-media/gallery")
        .set(publicHeaders())
        .expect(200);
      expect(gallery.body.gallery.items).toHaveLength(1);
      expect(gallery.body.gallery.items[0]).toMatchObject({
        momentId: uploadedMomentId,
        contributorName: "Andrei",
        mediaType: "IMAGE",
      });
      expect(
        (await fetch(gallery.body.gallery.items[0].previewUrl)).status,
      ).toBe(200);
      expect(
        (await fetch(gallery.body.gallery.items[0].contentUrl)).status,
      ).toBe(200);

      const isolated = await request(app.getHttpServer())
        .get("/api/v1/event-media/gallery")
        .set({
          Authorization: `Bearer ${secondToken}`,
          Origin: process.env.WEB_URL!,
        })
        .expect(200);
      expect(isolated.body).toMatchObject({
        enabled: true,
        gallery: { items: [] },
      });

      const approved = await ownerDb.guestMoment.findUniqueOrThrow({
        where: { id: uploadedMomentId },
      });
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/guest-moments/${uploadedMomentId}/transitions`,
        )
        .set({
          ...auth(),
          "If-Match": `"${approved.version}"`,
          "Idempotency-Key": randomUUID(),
        })
        .send({ transition: "HIDE" })
        .expect(201);
      expect(
        (
          await request(app.getHttpServer())
            .get("/api/v1/event-media/gallery")
            .set(publicHeaders())
            .expect(200)
        ).body.gallery.items,
      ).toEqual([]);

      const disabled = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/media-portals/live-gallery`)
        .set(auth())
        .send({ weddingEventId: eventId, enabled: false })
        .expect(201);
      expect(disabled.body.data.liveGalleryEnabled).toBe(false);
      portal = disabled.body.data;
      expect(
        (
          await request(app.getHttpServer())
            .get("/api/v1/event-media/gallery")
            .set(publicHeaders())
            .expect(200)
        ).body,
      ).toEqual({ enabled: false, gallery: null });
    }, 45_000);
    it("keeps organizer, portal, upload and object data isolated between tenants", async () => {
      const secondAuth = {
        Cookie: secondCookie,
        Origin: process.env.WEB_URL!,
      };
      const secondPublic = {
        Authorization: `Bearer ${secondToken}`,
        Origin: process.env.WEB_URL!,
      };

      // A session cookie never grants access to another organizer's workspace.
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${secondWorkspaceId}/media-portals`)
        .set(auth())
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/media-portals`)
        .set(secondAuth)
        .expect(403);

      const secondBody = {
        ...input(),
        contributorName: "Participant B",
        originalFileName: "moment-b.png",
      };
      const secondStart = await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(secondPublic)
        .send(secondBody)
        .expect(201);
      const secondMomentId = secondStart.body.momentId as string;
      const secondPut = await fetch(secondStart.body.upload.url, {
        method: "PUT",
        headers: secondStart.body.upload.headers,
        body: bytes,
      });
      expect(secondPut.ok).toBe(true);

      // Reusing an upload idempotency token in a different portal must be a
      // controlled conflict, never a server error or a reference to tenant A.
      const crossPortalReplay = await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(secondPublic)
        .send({ ...input(), uploadToken: uploadedMomentToken })
        .expect(409);
      expect(crossPortalReplay.body).not.toHaveProperty("workspaceId");
      expect(crossPortalReplay.body).not.toHaveProperty("momentId");

      await request(app.getHttpServer())
        .post(`/api/v1/event-media/uploads/${secondMomentId}/complete`)
        .set(secondPublic)
        .send({ uploadToken: secondBody.uploadToken })
        .expect(201);

      // A QR bearer and an upload token must belong to the same portal/moment.
      await request(app.getHttpServer())
        .post(`/api/v1/event-media/uploads/${uploadedMomentId}/complete`)
        .set(secondPublic)
        .send({ uploadToken: secondBody.uploadToken })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/event-media/uploads/${secondMomentId}/complete`)
        .set(publicHeaders())
        .send({ uploadToken: secondBody.uploadToken })
        .expect(404);

      const firstList = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/guest-moments`)
        .set(auth())
        .expect(200);
      const secondList = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${secondWorkspaceId}/guest-moments`)
        .set(secondAuth)
        .expect(200);
      expect(
        firstList.body.data.items.some(
          (moment: { id: string }) => moment.id === secondMomentId,
        ),
      ).toBe(false);
      expect(
        secondList.body.data.items.some(
          (moment: { id: string }) => moment.id === uploadedMomentId,
        ),
      ).toBe(false);
      expect(
        secondList.body.data.items.find(
          (moment: { id: string }) => moment.id === secondMomentId,
        ),
      ).toMatchObject({
        workspaceId: secondWorkspaceId,
        weddingEventId: secondEventId,
        contributorName: "Participant B",
      });

      // Even inside a valid workspace, foreign IDs cannot obtain preview,
      // original content, downloads or moderation side effects.
      for (const path of [
        `/api/v1/workspaces/${workspaceId}/guest-moments/${secondMomentId}/preview`,
        `/api/v1/workspaces/${workspaceId}/media-portals/moments/${secondMomentId}/content`,
        `/api/v1/workspaces/${workspaceId}/media-portals/moments/${secondMomentId}/download`,
      ])
        await request(app.getHttpServer()).get(path).set(auth()).expect(404);
      for (const path of [
        `/api/v1/workspaces/${secondWorkspaceId}/guest-moments/${uploadedMomentId}/preview`,
        `/api/v1/workspaces/${secondWorkspaceId}/media-portals/moments/${uploadedMomentId}/content`,
        `/api/v1/workspaces/${secondWorkspaceId}/media-portals/moments/${uploadedMomentId}/download`,
      ])
        await request(app.getHttpServer())
          .get(path)
          .set(secondAuth)
          .expect(404);
      const moderationCasesBefore =
        await ownerDb.guestMomentModerationCase.count({
          where: { guestMomentId: secondMomentId },
        });
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/guest-moments/${secondMomentId}/transitions`,
        )
        .set({ ...auth(), "If-Match": '"1"', "Idempotency-Key": randomUUID() })
        .send({ transition: "REJECT", reason: "cross-tenant-probe" })
        .expect(404);
      expect(
        await ownerDb.guestMomentModerationCase.count({
          where: { guestMomentId: secondMomentId },
        }),
      ).toBe(moderationCasesBefore);

      // RLS itself is a second boundary below controller/service filtering.
      const visibleToFirst = await database.withContext(
        { userId: ownerId, workspaceId },
        async (tx) => ({
          moments: await tx.guestMoment.findMany({
            where: { id: secondMomentId },
          }),
          media: await tx.guestMomentMedia.findMany({
            where: { guestMomentId: secondMomentId },
          }),
          sessions: await tx.guestMomentUploadSession.findMany({
            where: { guestMomentId: secondMomentId },
          }),
          portals: await tx.eventMediaPortal.findMany({
            where: { id: secondPortal.id },
          }),
        }),
      );
      expect(visibleToFirst).toEqual({
        moments: [],
        media: [],
        sessions: [],
        portals: [],
      });
      const secondStored = await ownerDb.guestMomentMedia.findUniqueOrThrow({
        where: { guestMomentId: secondMomentId },
      });
      expect(
        await database.withContext({ userId: ownerId, workspaceId }, (tx) =>
          tx.storedObject.findMany({
            where: { id: secondStored.storedObjectId },
          }),
        ),
      ).toEqual([]);

      const physicalObject = await ownerDb.storedObject.findUniqueOrThrow({
        where: { id: secondStored.storedObjectId },
      });
      expect(physicalObject.workspaceId).toBe(secondWorkspaceId);
      expect(
        physicalObject.objectKey.startsWith(
          `private/guest-moments/${secondWorkspaceId}/${secondMomentId}/`,
        ) ||
          physicalObject.objectKey.startsWith(
            `private/guest-moment-originals/${secondWorkspaceId}/${secondMomentId}.`,
          ),
      ).toBe(true);

      // A signed URL is a short-lived bearer; tampering with it must fail.
      let secondStatus = "PROCESSING";
      for (
        let attempt = 0;
        attempt < 80 && secondStatus === "PROCESSING";
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        secondStatus = (
          await ownerDb.guestMoment.findUniqueOrThrow({
            where: { id: secondMomentId },
            select: { status: true },
          })
        ).status;
      }
      expect(secondStatus).toBe("PENDING_REVIEW");
      const secondContent = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${secondWorkspaceId}/media-portals/moments/${secondMomentId}/content`,
        )
        .set(secondAuth)
        .expect(200);
      const url = new URL(secondContent.body.data.url);
      url.searchParams.set("token", `x${url.searchParams.get("token")}`);
      expect((await fetch(url)).status).toBe(403);

      // A public request cannot choose or override its destination tenant/event.
      const smuggled = await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send({
          ...input(),
          weddingEventId: secondEventId,
          workspaceId: secondWorkspaceId,
        })
        .expect(201);
      const smuggledMoment = await ownerDb.guestMoment.findUniqueOrThrow({
        where: { id: smuggled.body.momentId },
      });
      expect(smuggledMoment.workspaceId).toBe(workspaceId);
      expect(smuggledMoment.weddingEventId).toBe(eventId);
    }, 45_000);
    it("rejects mismatched upload body, stale settings and quota overrun", async () => {
      const body = input();
      await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(body)
        .expect(201);
      await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send({ ...body, checksumSha256: "a".repeat(64) })
        .expect(409);
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/media-portals`)
        .set(auth())
        .send({ weddingEventId: eventId, version: 999, active: false })
        .expect(409);
      await ownerDb.eventMediaPortal.update({
        where: { id: portal.id },
        data: { reservedBytes: BigInt(MEDIA_LIMITS.maximumBytes) },
      });
      await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(input())
        .expect(409);
      await ownerDb.eventMediaPortal.update({
        where: { id: portal.id },
        data: { reservedBytes: 0 },
      });
    });
    it("serializes concurrent retries and renews an expired upload", async () => {
      const body = input();
      const responses = await Promise.all(
        [0, 1].map(() =>
          request(app.getHttpServer())
            .post("/api/v1/event-media/uploads")
            .set(publicHeaders())
            .send(body)
            .expect(201),
        ),
      );
      const momentId = responses[0]!.body.momentId as string;
      expect(responses[1]!.body.momentId).toBe(momentId);
      await request(app.getHttpServer())
        .post(`/api/v1/event-media/uploads/${momentId}/complete`)
        .set(publicHeaders())
        .send({ uploadToken: body.uploadToken })
        .expect(422);
      await ownerDb.guestMomentUploadSession.updateMany({
        where: { guestMomentId: momentId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/event-media/uploads/${momentId}/complete`)
        .set(publicHeaders())
        .send({ uploadToken: body.uploadToken })
        .expect(409);
      const renewed = await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(body)
        .expect(201);
      expect(renewed.body.momentId).toBe(momentId);
      expect(new Date(renewed.body.upload.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });
    it("closes, reopens, rotates and expires QR access", async () => {
      let response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/media-portals`)
        .set(auth())
        .send({
          weddingEventId: eventId,
          version: portal.version,
          active: false,
        })
        .expect(201);
      portal = response.body.data;
      await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(input())
        .expect(410);
      expect(
        (
          await request(app.getHttpServer())
            .get("/api/v1/event-media")
            .set(publicHeaders())
        ).body.active,
      ).toBe(false);
      response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/media-portals`)
        .set(auth())
        .send({
          weddingEventId: eventId,
          version: portal.version,
          active: true,
          rotate: true,
        })
        .expect(201);
      portal = response.body.data;
      await request(app.getHttpServer())
        .get("/api/v1/event-media")
        .set(publicHeaders())
        .expect(404);
      token = portal.url.split("#")[1]!;
      await ownerDb.eventMediaPortal.update({
        where: { id: portal.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app.getHttpServer())
        .post("/api/v1/event-media/uploads")
        .set(publicHeaders())
        .send(input())
        .expect(410);
      await ownerDb.eventMediaPortal.update({
        where: { id: portal.id },
        data: { expiresAt: new Date(Date.now() + 86400_000) },
      });
      expect(
        (
          await database.withContext({ userId: ownerId, workspaceId }, (tx) =>
            tx.eventMediaPortal.findMany(),
          )
        ).length,
      ).toBe(1);
    });
  },
);

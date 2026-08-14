import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { createHash, randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import request from "supertest";
import { PrismaClient } from "@weddingos/database";
import { assertDestructiveDatabasePurpose } from "./database-identity";
import { encryptCommand } from "@weddingos/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ProblemFilter } from "../src/common/problem.filter";

const origin = process.env.WEB_URL!;
const ownerDatabase = new PrismaClient({
  datasourceUrl: process.env.DATABASE_OWNER_URL!,
});
const appDatabase = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL!,
});
const artifactRoot =
  process.env.ARTIFACT_ROOT ??
  "/mnt/c/home/andrei/test kimi/weddingos/ops/artifacts/activity-exports";

type TestAccount = {
  email: string;
  userId: string;
  agent: ReturnType<typeof request.agent>;
};

describe.sequential("Slice 1 API integration and isolation", () => {
  let application!: INestApplication;
  let slice2Owner: TestAccount | undefined;
  let slice2Outsider: TestAccount | undefined;

  beforeAll(async () => {
    await cleanDatabase();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    application = module.createNestApplication();
    application.use(cookieParser());
    application.useGlobalFilters(new ProblemFilter());
    await application.init();
  }, 180_000);

  afterAll(async () => {
    await application?.close();
    await ownerDatabase.$disconnect();
    await appDatabase.$disconnect();
  });

  it("registers, verifies through the delivered email, signs in and revokes the session", async () => {
    const account = await createVerifiedAccount("session");
    const me = await account.agent.get("/api/v1/me").expect(200);
    expect(me.body.data.user.email).toBe(account.email);
    expect(me.body.data.user.emailVerified).toBe(true);

    const sessions = await account.agent.get("/api/v1/me/sessions").expect(200);
    expect(sessions.body.data).toHaveLength(1);
    expect(sessions.body.data[0].current).toBe(true);

    await account.agent
      .delete("/api/v1/auth/session")
      .set("Origin", origin)
      .expect(204);
    await account.agent.get("/api/v1/me").expect(401);
  }, 120_000);

  it("preserves provider registration intent and destination through email verification", async () => {
    const email = `provider-registration-${Date.now()}@example.test`;
    const returnTo = "/vendor?setup=1&source=registration";
    const registration = await request(application.getHttpServer())
      .post("/api/v1/auth/registrations")
      .set("Origin", origin)
      .send({
        firstName: "Test",
        lastName: "Provider",
        email,
        password: "WeddingOS2026!",
        registrationIntent: "SERVICE_PROVIDER",
        returnTo,
        acceptedTermsVersion: "2026-07-18",
        marketingConsent: false,
      })
      .expect(201);
    const token = await waitForEmailToken(
      email,
      "Confirmă adresa de email Sarbato",
    );

    const tokenRecord = await ownerDatabase.authOneTimeToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(tokenRecord.metadata).toMatchObject({
      registrationIntent: "SERVICE_PROVIDER",
      returnTo,
    });

    await ownerDatabase.authOneTimeToken.update({
      where: { id: tokenRecord.id },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    await request(application.getHttpServer())
      .post("/api/v1/auth/email-verification-requests")
      .set("Origin", origin)
      .send({ email })
      .expect(202);
    const resentToken = await waitForEmailToken(
      email,
      "Confirmă adresa de email Sarbato",
      token,
    );
    const resentTokenRecord =
      await ownerDatabase.authOneTimeToken.findUniqueOrThrow({
        where: { tokenHash: hashToken(resentToken) },
      });
    expect(resentTokenRecord.metadata).toMatchObject({
      registrationIntent: "SERVICE_PROVIDER",
      returnTo,
    });

    const verified = await request(application.getHttpServer())
      .post("/api/v1/auth/email-verifications")
      .set("Origin", origin)
      .send({ token: resentToken })
      .expect(200);
    expect(verified.body.data).toEqual({
      verified: true,
      registrationIntent: "SERVICE_PROVIDER",
      returnTo,
    });

    const preference = await ownerDatabase.userPreference.findUniqueOrThrow({
      where: { userId: registration.body.data.userId },
    });
    expect(preference.registrationIntent).toBe("SERVICE_PROVIDER");
  }, 120_000);

  it("creates a workspace atomically and replays the same idempotency key", async () => {
    const owner = await createVerifiedAccount("workspace");
    const payload = {
      title: "Ana & Mihai",
      partnerOneName: "Ana",
      partnerTwoName: "Mihai",
      weddingDate: "2027-09-12",
      location: "Brașov",
      locale: "ro-RO",
      timezone: "Europe/Bucharest",
      currency: "RON",
    };
    const first = await owner.agent
      .post("/api/v1/workspaces")
      .set("Origin", origin)
      .set("Idempotency-Key", "workspace-integration-key")
      .send(payload)
      .expect(201);
    const replay = await owner.agent
      .post("/api/v1/workspaces")
      .set("Origin", origin)
      .set("Idempotency-Key", "workspace-integration-key")
      .send(payload)
      .expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);

    const workspaceId = first.body.data.id as string;
    const bootstrap = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/bootstrap`)
      .expect(200);
    expect(bootstrap.body.data.membership.roleTemplate).toBe("couple_owner");
    expect(bootstrap.body.data.membership.capabilities).toContain(
      "team.invite",
    );

    const counts = await ownerDatabase.$transaction([
      ownerDatabase.workspace.count({ where: { id: workspaceId } }),
      ownerDatabase.weddingProfile.count({ where: { workspaceId } }),
      ownerDatabase.workspaceMembership.count({
        where: { workspaceId, userId: owner.userId },
      }),
      ownerDatabase.auditEvent.count({
        where: { workspaceId, action: "workspace.created.v1" },
      }),
      ownerDatabase.idempotencyRecord.count({ where: { workspaceId } }),
      ownerDatabase.backgroundJob.count({
        where: { workspaceId, type: "workspace.created.v1" },
      }),
      ownerDatabase.outboxMessage.count({
        where: { workspaceId, eventName: "workspace.created.v1" },
      }),
    ]);
    expect(counts).toEqual([1, 1, 1, 1, 1, 0, 1]);
    const outbox = await ownerDatabase.outboxMessage.findFirstOrThrow({
      where: { workspaceId, eventName: "workspace.created.v1" },
    });
    expect(
      await ownerDatabase.outboxConsumerExecution.count({
        where: { outboxMessageId: outbox.id },
      }),
    ).toBe(3);
  }, 120_000);

  it("rolls an outbox intent and its consumer ledger back atomically", async () => {
    const marker = randomUUID();
    await expect(
      ownerDatabase.$transaction(async (transaction) => {
        const outbox = await transaction.outboxMessage.create({
          data: {
            eventName: "workspace.updated.v1",
            aggregateType: "Workspace",
            aggregateId: marker,
            correlationId: marker,
            deduplicationKey: `rollback-outbox:${marker}`,
            payload: { occurredAt: new Date().toISOString(), subject: {} },
          },
        });
        await transaction.outboxConsumerExecution.create({
          data: {
            outboxMessageId: outbox.id,
            consumerName: "event_ack",
            deduplicationKey: `rollback-consumer:${marker}`,
          },
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    expect(
      await ownerDatabase.outboxConsumerExecution.count({
        where: { deduplicationKey: `rollback-consumer:${marker}` },
      }),
    ).toBe(0);
    expect(
      await ownerDatabase.outboxMessage.count({
        where: { correlationId: marker },
      }),
    ).toBe(0);
  });

  it("enforces application and PostgreSQL isolation across two workspaces", async () => {
    const userA = await createVerifiedAccount("isolation-a");
    const userB = await createVerifiedAccount("isolation-b");
    const workspaceA = await createWorkspace(
      userA,
      "Workspace A",
      "isolation-a",
    );
    const workspaceB = await createWorkspace(
      userB,
      "Workspace B",
      "isolation-b",
    );

    const listA = await userA.agent.get("/api/v1/workspaces").expect(200);
    expect(listA.body.data.map((item: { id: string }) => item.id)).toEqual([
      workspaceA,
    ]);
    await userA.agent
      .get(`/api/v1/workspaces/${workspaceB}/bootstrap`)
      .expect(403);
    await userA.agent
      .post(`/api/v1/workspaces/${workspaceB}/team-invitations`)
      .set("Origin", origin)
      .send({
        email: "blocked@example.test",
        roleTemplate: "viewer",
        capabilityOverrides: [],
      })
      .expect(403);
    await userA.agent
      .patch(`/api/v1/workspaces/${workspaceB}`)
      .set("Origin", origin)
      .send({ title: "Cross-tenant write", version: 1 })
      .expect(403);
    const teamB = await userB.agent
      .get(`/api/v1/workspaces/${workspaceB}/members`)
      .expect(200);
    await userA.agent
      .patch(
        `/api/v1/workspaces/${workspaceB}/members/${teamB.body.data.members[0].id}`,
      )
      .set("Origin", origin)
      .send({
        roleTemplate: "viewer",
        version: teamB.body.data.members[0].version,
      })
      .expect(403);

    const leaked = await appDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT
          set_config('app.current_user_id', ${userA.userId}, true),
          set_config('app.current_workspace_id', ${workspaceB}, true)
      `;
      return transaction.workspace.findMany({ where: { id: workspaceB } });
    });
    expect(leaked).toEqual([]);

    const pinnedApp = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await pinnedApp.connect();
    try {
      await pinnedApp.query("BEGIN");
      await pinnedApp.query(
        "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_workspace_id', $2, true)",
        [userA.userId, workspaceA],
      );
      expect(
        (
          await pinnedApp.query("SELECT id FROM workspaces WHERE id = $1", [
            workspaceA,
          ])
        ).rowCount,
      ).toBe(1);
      await pinnedApp.query("COMMIT");

      await pinnedApp.query("BEGIN");
      await pinnedApp.query(
        "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_workspace_id', $2, true)",
        [userB.userId, workspaceB],
      );
      expect(
        (
          await pinnedApp.query("SELECT id FROM workspaces WHERE id = $1", [
            workspaceA,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await pinnedApp.query("SELECT id FROM workspaces WHERE id = $1", [
            workspaceB,
          ])
        ).rowCount,
      ).toBe(1);
      await pinnedApp.query("COMMIT");

      await pinnedApp.query("BEGIN");
      expect(
        (
          await pinnedApp.query(
            "SELECT id FROM workspaces WHERE id = ANY($1::uuid[])",
            [[workspaceA, workspaceB]],
          )
        ).rowCount,
      ).toBe(0);
      await pinnedApp.query("COMMIT");
    } finally {
      await pinnedApp.query("ROLLBACK").catch(() => undefined);
      await pinnedApp.end();
    }

    const [outboxA, outboxB] = await Promise.all([
      ownerDatabase.outboxMessage.findFirstOrThrow({
        where: { workspaceId: workspaceA, eventName: "workspace.created.v1" },
      }),
      ownerDatabase.outboxMessage.findFirstOrThrow({
        where: { workspaceId: workspaceB, eventName: "workspace.created.v1" },
      }),
    ]);
    const [executionA, executionB] = await Promise.all([
      ownerDatabase.outboxConsumerExecution.findFirstOrThrow({
        where: { outboxMessageId: outboxA.id, consumerName: "event_ack" },
      }),
      ownerDatabase.outboxConsumerExecution.findFirstOrThrow({
        where: { outboxMessageId: outboxB.id, consumerName: "event_ack" },
      }),
    ]);
    const pinnedWorker = new Client({
      connectionString:
        "postgresql://weddingos_worker:weddingos_worker@127.0.0.1:54339/weddingos_integration?schema=public",
    });
    await pinnedWorker.connect();
    try {
      await pinnedWorker.query("BEGIN");
      expect(
        (await pinnedWorker.query("SELECT id FROM outbox_consumer_executions"))
          .rowCount,
      ).toBe(0);
      await pinnedWorker.query("COMMIT");

      for (const [execution, outbox, workspaceId, userId] of [
        [executionA, outboxA, workspaceA, userA.userId],
        [executionB, outboxB, workspaceB, userB.userId],
      ] as const) {
        await pinnedWorker.query("BEGIN");
        await pinnedWorker.query(
          "SELECT set_config('app.current_worker_id', 'integration-worker', true), set_config('app.current_consumer_execution_id', $1, true), set_config('app.current_job_id', '', true), set_config('app.current_workspace_id', $2, true), set_config('app.current_user_id', $3, true)",
          [execution.id, workspaceId, userId],
        );
        expect(
          (
            await pinnedWorker.query(
              "SELECT id FROM outbox_consumer_executions WHERE id = $1",
              [execution.id],
            )
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await pinnedWorker.query(
              "SELECT id FROM outbox_messages WHERE id = $1",
              [outbox.id],
            )
          ).rowCount,
        ).toBe(1);
        const otherId =
          execution.id === executionA.id ? executionB.id : executionA.id;
        expect(
          (
            await pinnedWorker.query(
              "SELECT id FROM outbox_consumer_executions WHERE id = $1",
              [otherId],
            )
          ).rowCount,
        ).toBe(0);
        await pinnedWorker.query("COMMIT");
      }

      await pinnedWorker.query("BEGIN");
      await pinnedWorker.query(
        "SELECT set_config('app.current_worker_id', 'integration-worker', true), set_config('app.current_consumer_execution_id', $1, true), set_config('app.current_job_id', '', true), set_config('app.current_workspace_id', $2, true), set_config('app.current_user_id', $3, true)",
        [executionA.id, workspaceB, userB.userId],
      );
      expect(
        (
          await pinnedWorker.query(
            "SELECT id FROM activity_items WHERE workspace_id = $1",
            [workspaceB],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await pinnedWorker.query(
            "SELECT id FROM notifications WHERE workspace_id = $1",
            [workspaceB],
          )
        ).rowCount,
      ).toBe(0);
      await pinnedWorker.query("COMMIT");

      await pinnedWorker.query("BEGIN");
      expect(
        (await pinnedWorker.query("SELECT id FROM outbox_consumer_executions"))
          .rowCount,
      ).toBe(0);
      await pinnedWorker.query("COMMIT");
    } finally {
      await pinnedWorker.query("ROLLBACK").catch(() => undefined);
      await pinnedWorker.end();
    }
  }, 180_000);

  it("binds invitations to the target email and blocks access immediately after removal", async () => {
    const owner = await createVerifiedAccount("invite-owner");
    const partner = await createVerifiedAccount("invite-partner");
    const attacker = await createVerifiedAccount("invite-attacker");
    const workspaceId = await createWorkspace(
      owner,
      "Invitations",
      "invitation-workspace",
    );

    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/team-invitations`)
      .set("Origin", origin)
      .send({
        email: partner.email,
        roleTemplate: "couple_partner",
        capabilityOverrides: [],
      })
      .expect(201);
    const invitationToken = await waitForEmailToken(
      partner.email,
      "Invitație în Invitations",
    );

    await attacker.agent
      .post(
        `/api/v1/team-invitations/${encodeURIComponent(invitationToken)}/accept`,
      )
      .set("Origin", origin)
      .expect(403);
    await partner.agent
      .post(
        `/api/v1/team-invitations/${encodeURIComponent(invitationToken)}/accept`,
      )
      .set("Origin", origin)
      .expect(201);
    await partner.agent
      .get(`/api/v1/workspaces/${workspaceId}/bootstrap`)
      .expect(200);

    const team = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .expect(200);
    const partnerMembership = team.body.data.members.find(
      (member: { email: string }) => member.email === partner.email,
    );
    const updated = await owner.agent
      .patch(
        `/api/v1/workspaces/${workspaceId}/members/${partnerMembership.id}`,
      )
      .set("Origin", origin)
      .send({ roleTemplate: "viewer", version: partnerMembership.version })
      .expect(200);
    expect(updated.body.data.role).toBe("viewer");
    expect(updated.body.data.capabilities).toEqual([
      "accommodation.read",
      "announcement.read",
      "automation.read",
      "booking.read",
      "budget.read",
      "calendar.read",
      "check_in.read",
      "contingency.read",
      "contract.read",
      "copilot.read",
      "document.read",
      "expense.read",
      "gallery.read",
      "guest.read",
      "guest_moment.read",
      "incident.read",
      "invitation.read",
      "marketplace.read",
      "menu.read",
      "offer.read",
      "online_payment.read",
      "payment.read",
      "planning.read",
      "review.read",
      "review.report",
      "rfq.read",
      "risk.read",
      "rsvp.read",
      "seating.read",
      "signature.read",
      "task.read",
      "timeline.read",
      "transport.read",
      "wedding_day.read",
      "workspace.read",
    ]);
    await owner.agent
      .delete(
        `/api/v1/workspaces/${workspaceId}/members/${partnerMembership.id}`,
      )
      .set("Origin", origin)
      .expect(204);
    await partner.agent
      .get(`/api/v1/workspaces/${workspaceId}/bootstrap`)
      .expect(403);

    await partner.agent
      .post(
        `/api/v1/team-invitations/${encodeURIComponent(invitationToken)}/accept`,
      )
      .set("Origin", origin)
      .expect(409);

    const auditActions = await ownerDatabase.auditEvent.findMany({
      where: { workspaceId },
      select: { action: true },
    });
    expect(auditActions.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "membership.invited.v1",
        "membership.invitation_accepted.v1",
        "membership.role_changed.v1",
        "membership.removed.v1",
      ]),
    );
  }, 180_000);

  it("protects the last owner from downgrade and removal", async () => {
    const owner = await createVerifiedAccount("last-owner");
    const workspaceId = await createWorkspace(
      owner,
      "Owner Guard",
      "owner-guard",
    );
    const team = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .expect(200);
    const membership = team.body.data.members[0];

    const downgrade = await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/members/${membership.id}`)
      .set("Origin", origin)
      .send({ roleTemplate: "viewer", version: membership.version })
      .expect(409);
    expect(downgrade.body.code).toBe("LAST_OWNER_PROTECTED");

    const removal = await owner.agent
      .delete(`/api/v1/workspaces/${workspaceId}/members/${membership.id}`)
      .set("Origin", origin)
      .expect(409);
    expect(removal.body.code).toBe("LAST_OWNER_PROTECTED");
  }, 120_000);

  it("rotates invitation tokens on resend and enforces revoke and decline states", async () => {
    const owner = await createVerifiedAccount("invitation-lifecycle-owner");
    const target = await createVerifiedAccount("invitation-lifecycle-target");
    const workspaceId = await createWorkspace(
      owner,
      "Invitation Lifecycle",
      "invitation-lifecycle",
    );
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/team-invitations`)
      .set("Origin", origin)
      .send({
        email: target.email,
        roleTemplate: "viewer",
        capabilityOverrides: [],
      })
      .expect(201);
    const firstToken = await waitForEmailToken(
      target.email,
      "Invitație în Invitation Lifecycle",
    );
    const team = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .expect(200);
    const invitationId = team.body.data.invitations[0].id as string;
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/team-invitations/${invitationId}/resend`,
      )
      .set("Origin", origin)
      .expect(201);
    const rotatedToken = await waitForEmailToken(
      target.email,
      "Invitație în Invitation Lifecycle",
      firstToken,
    );
    expect(rotatedToken).not.toBe(firstToken);
    await request(application.getHttpServer())
      .get(`/api/v1/team-invitations/${encodeURIComponent(firstToken)}`)
      .expect(404);
    await owner.agent
      .delete(
        `/api/v1/workspaces/${workspaceId}/team-invitations/${invitationId}`,
      )
      .set("Origin", origin)
      .expect(204);
    const revoked = await request(application.getHttpServer())
      .get(`/api/v1/team-invitations/${encodeURIComponent(rotatedToken)}`)
      .expect(410);
    expect(revoked.body.code).toBe("INVITATION_REVOKED");

    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/team-invitations`)
      .set("Origin", origin)
      .send({
        email: target.email,
        roleTemplate: "viewer",
        capabilityOverrides: [],
      })
      .expect(201);
    const declineToken = await waitForEmailToken(
      target.email,
      "Invitație în Invitation Lifecycle",
      [firstToken, rotatedToken],
    );
    await target.agent
      .post(
        `/api/v1/team-invitations/${encodeURIComponent(declineToken)}/decline`,
      )
      .set("Origin", origin)
      .expect(201);
    await target.agent
      .post(
        `/api/v1/team-invitations/${encodeURIComponent(declineToken)}/decline`,
      )
      .set("Origin", origin)
      .expect(409);
  }, 180_000);

  it("resets a password once and immediately revokes every existing session", async () => {
    const account = await createVerifiedAccount("password-reset");
    const returnTo = "/vendor-invitation?token=password-reset-return";
    const secondAgent = request.agent(application.getHttpServer());
    await secondAgent
      .post("/api/v1/auth/sessions")
      .set("Origin", origin)
      .send({
        email: account.email,
        password: "WeddingOS2026!",
        remember: true,
      })
      .expect(200);

    await request(application.getHttpServer())
      .post("/api/v1/auth/password-reset-requests")
      .set("Origin", origin)
      .send({ email: account.email, returnTo })
      .expect(202);
    const token = await waitForEmailToken(
      account.email,
      "Resetează parola Sarbato",
    );
    const reset = await request(application.getHttpServer())
      .post("/api/v1/auth/password-resets")
      .set("Origin", origin)
      .send({ token, password: "WeddingOS2027!" })
      .expect(200);
    expect(reset.body.data).toEqual({ reset: true, returnTo });
    await account.agent.get("/api/v1/me").expect(401);
    await secondAgent.get("/api/v1/me").expect(401);
    const replay = await request(application.getHttpServer())
      .post("/api/v1/auth/password-resets")
      .set("Origin", origin)
      .send({ token, password: "WeddingOS2028!" })
      .expect(400);
    expect(replay.body.code).toBe("TOKEN_INVALID");
  }, 180_000);

  it("preserves the requested destination through a magic-link session", async () => {
    const account = await createVerifiedAccount("magic-link-return");
    const returnTo = "/invitation?token=magic-link-return";
    await request(application.getHttpServer())
      .post("/api/v1/auth/magic-link-requests")
      .set("Origin", origin)
      .send({ email: account.email, returnTo })
      .expect(202);
    const token = await waitForEmailToken(
      account.email,
      "Linkul tău magic Sarbato",
    );
    const magicAgent = request.agent(application.getHttpServer());
    const exchanged = await magicAgent
      .post("/api/v1/auth/magic-link-exchanges")
      .set("Origin", origin)
      .send({ token })
      .expect(200);
    expect(exchanged.body.data).toMatchObject({
      authenticated: true,
      returnTo,
    });
    await magicAgent.get("/api/v1/me").expect(200);
  }, 180_000);

  it("lists two sessions, revokes one owned session, and preserves the other", async () => {
    const account = await createVerifiedAccount("session-revoke");
    const secondAgent = request.agent(application.getHttpServer());
    await secondAgent
      .post("/api/v1/auth/sessions")
      .set("Origin", origin)
      .set("User-Agent", "WeddingOS-E2E-Second")
      .send({
        email: account.email,
        password: "WeddingOS2026!",
        remember: true,
      })
      .expect(200);
    const sessions = await account.agent.get("/api/v1/me/sessions").expect(200);
    expect(sessions.body.data).toHaveLength(2);
    const other = sessions.body.data.find(
      (session: { current: boolean }) => !session.current,
    );
    await account.agent
      .delete(`/api/v1/me/sessions/${other.id}`)
      .set("Origin", origin)
      .expect(204);
    await secondAgent.get("/api/v1/me").expect(401);
    await account.agent.get("/api/v1/me").expect(200);
  }, 120_000);

  it("keeps public registration and reset responses enumeration-safe", async () => {
    const account = await createVerifiedAccount("enumeration");
    const duplicate = await request(application.getHttpServer())
      .post("/api/v1/auth/registrations")
      .set("Origin", origin)
      .send({
        firstName: "Other",
        lastName: "Name",
        email: account.email.toUpperCase(),
        password: "WeddingOS2026!",
        acceptedTermsVersion: "2026-07-18",
      })
      .expect(201);
    expect(duplicate.body.data.emailVerificationRequired).toBe(true);
    expect(duplicate.body.data.userId).not.toBe(account.userId);

    const known = await request(application.getHttpServer())
      .post("/api/v1/auth/password-reset-requests")
      .set("Origin", origin)
      .send({ email: account.email })
      .expect(202);
    const unknown = await request(application.getHttpServer())
      .post("/api/v1/auth/password-reset-requests")
      .set("Origin", origin)
      .send({ email: `unknown-${Date.now()}@example.test` })
      .expect(202);
    expect(unknown.body.data).toEqual(known.body.data);
    expect(unknown.body.meta.requestId).not.toBe(known.body.meta.requestId);
  }, 180_000);

  it("rejects unknown and expired verification tokens", async () => {
    const unknown = await request(application.getHttpServer())
      .post("/api/v1/auth/email-verifications")
      .set("Origin", origin)
      .send({ token: "not-a-real-token-but-long-enough-for-validation-12345" })
      .expect(400);
    expect(unknown.body.code).toBe("TOKEN_INVALID");

    const email = `expired-${Date.now()}@example.test`;
    await request(application.getHttpServer())
      .post("/api/v1/auth/registrations")
      .set("Origin", origin)
      .send({
        firstName: "Expired",
        lastName: "Token",
        email,
        password: "WeddingOS2026!",
        acceptedTermsVersion: "2026-07-18",
      })
      .expect(201);
    const token = await waitForEmailToken(
      email,
      "Confirmă adresa de email Sarbato",
    );
    await ownerDatabase.authOneTimeToken.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await request(application.getHttpServer())
      .post("/api/v1/auth/email-verifications")
      .set("Origin", origin)
      .send({ token })
      .expect(410);
    expect(expired.body.code).toBe("TOKEN_EXPIRED");
  }, 180_000);

  it("persists onboarding incrementally, exposes conflicts and projects notifications and activity", async () => {
    const { owner, outsider } = await getSlice2Accounts();
    const workspaceId = await createWorkspace(
      owner,
      "Onboarding Slice 2A",
      `onboarding-${randomUUID()}`,
    );
    const initial = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .expect(200);
    const missingPrecondition = await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .set("Origin", origin)
      .send({ currentStep: 2 })
      .expect(428);
    expect(missingPrecondition.body.code).toBe("PRECONDITION_REQUIRED");
    const first = await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .set("Origin", origin)
      .set("If-Match", `"${initial.body.data.version}"`)
      .send({ currentStep: 2, couple: { confirmed: true, partnerOne: "Ana" } })
      .expect(200);
    const stale = await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .set("Origin", origin)
      .set("If-Match", `"${initial.body.data.version}"`)
      .send({ currentStep: 3, location: { confirmed: true, city: "Cluj" } })
      .expect(412);
    expect(stale.body).toMatchObject({
      code: "VERSION_CONFLICT",
      latestVersion: first.body.data.version,
    });

    const saved = await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .set("Origin", origin)
      .set("If-Match", `"${first.body.data.version}"`)
      .send({
        currentStep: 8,
        couple: {
          confirmed: true,
          partnerOne: "Ana",
          partnerTwo: "Mihai",
          title: "Ana & Mihai",
        },
        dateEvents: { confirmed: true, exactDate: "2027-09-12" },
        location: { confirmed: true, city: "Brașov" },
        guests: { confirmed: true, estimatedTotal: 160 },
        budget: { confirmed: true, targetMinor: 18000000, currency: "RON" },
        style: { confirmed: true, selected: "garden" },
        existingProgress: { confirmed: true, venue: true },
        planningPreferences: { confirmed: true, aiAssistance: "balanced" },
      })
      .expect(200);
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/onboarding/complete`)
      .set("Origin", origin)
      .set("Idempotency-Key", `missing-if-match-${randomUUID()}`)
      .expect(428);
    const completionKey = `complete-${randomUUID()}`;
    const complete = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/onboarding/complete`)
      .set("Origin", origin)
      .set("If-Match", `"${saved.body.data.version}"`)
      .set("Idempotency-Key", completionKey)
      .expect(201);
    expect(complete.body.data).toMatchObject({
      completed: true,
      planGeneration: "not_started",
    });
    const jobId = complete.body.data.jobId as string;
    const replay = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/onboarding/complete`)
      .set("Origin", origin)
      .set("If-Match", `"${saved.body.data.version}"`)
      .set("Idempotency-Key", completionKey)
      .expect(201);
    expect(replay.body.data.jobId).toBe(jobId);
    const replayWithDifferentKey = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/onboarding/complete`)
      .set("Origin", origin)
      .set("If-Match", `"${saved.body.data.version}"`)
      .set("Idempotency-Key", `different-${randomUUID()}`)
      .expect(201);
    expect(replayWithDifferentKey.body.data.jobId).toBe(jobId);
    await outsider.agent.get(`/api/v1/jobs/${jobId}`).expect(404);
    await expect
      .poll(
        async () =>
          (
            await ownerDatabase.backgroundJob.findUniqueOrThrow({
              where: { id: jobId },
            })
          ).status,
        { timeout: 30_000 },
      )
      .toBe("COMPLETED");
    expect(
      (await owner.agent.get(`/api/v1/jobs/${jobId}`).expect(200)).body.data
        .status,
    ).toBe("completed");
    const readinessOutboxes = await ownerDatabase.outboxMessage.findMany({
      where: {
        workspaceId,
        eventName: "onboarding.ready_for_plan_generation.v1",
      },
    });
    expect(readinessOutboxes).toHaveLength(1);
    expect(
      await ownerDatabase.outboxConsumerExecution.findMany({
        where: { outboxMessageId: readinessOutboxes[0].id },
        select: { consumerName: true, status: true },
        orderBy: { consumerName: "asc" },
      }),
    ).toEqual([
      { consumerName: "activity_projection", status: "COMPLETED" },
      { consumerName: "event_ack", status: "COMPLETED" },
      { consumerName: "notification_projection", status: "COMPLETED" },
    ]);

    const reloaded = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .expect(200);
    expect(reloaded.body.data).toMatchObject({
      status: "ready",
      currentStep: 8,
    });
    expect(
      await ownerDatabase.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: {
          title: true,
          currency: true,
          weddingProfile: {
            select: {
              partnerOneName: true,
              partnerTwoName: true,
              weddingDate: true,
              location: true,
            },
          },
        },
      }),
    ).toMatchObject({
      title: "Ana & Mihai",
      currency: "RON",
      weddingProfile: {
        partnerOneName: "Ana",
        partnerTwoName: "Mihai",
        weddingDate: new Date("2027-09-12T00:00:00.000Z"),
        location: "Brașov",
      },
    });
    const notifications = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/notifications`)
      .expect(200);
    expect(
      notifications.body.data.items.some(
        (item: { title: string }) => item.title === "Onboarding finalizat",
      ),
    ).toBe(true);
    const activity = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/activity`)
      .expect(200);
    expect(
      activity.body.data.items.map((item: { action: string }) => item.action),
    ).toContain("ready_for_plan_generation");

    const projectedNotification = notifications.body.data.items.find(
      (item: { title: string }) => item.title === "Onboarding finalizat",
    ) as { id: string; version: number };
    const activityCountBeforeLifecycle = await ownerDatabase.activityItem.count(
      { where: { workspaceId } },
    );
    await owner.agent
      .patch(
        `/api/v1/workspaces/${workspaceId}/notifications/${projectedNotification.id}`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${projectedNotification.version}"`)
      .send({ read: true })
      .expect(200);
    await owner.agent
      .delete(
        `/api/v1/workspaces/${workspaceId}/notifications/${projectedNotification.id}`,
      )
      .set("Origin", origin)
      .expect(204);
    await expect
      .poll(
        async () =>
          ownerDatabase.outboxMessage.count({
            where: {
              workspaceId,
              eventName: {
                in: ["notification.read.v1", "notification.dismissed.v1"],
              },
              status: "PROCESSED",
            },
          }),
        { timeout: 30_000 },
      )
      .toBe(2);
    const lifecycleOutboxes = await ownerDatabase.outboxMessage.findMany({
      where: {
        workspaceId,
        eventName: {
          in: ["notification.read.v1", "notification.dismissed.v1"],
        },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    const lifecycleExecutions =
      await ownerDatabase.outboxConsumerExecution.findMany({
        where: {
          outboxMessageId: { in: lifecycleOutboxes.map(({ id }) => id) },
        },
        select: { outboxMessageId: true, consumerName: true },
        orderBy: { createdAt: "asc" },
      });
    expect(lifecycleOutboxes).toHaveLength(2);
    expect(lifecycleExecutions.map(({ consumerName }) => consumerName)).toEqual(
      ["event_ack", "event_ack"],
    );
    expect(
      await ownerDatabase.activityItem.count({ where: { workspaceId } }),
    ).toBe(activityCountBeforeLifecycle);
  }, 240_000);

  it("recovers stale dispatcher and worker claims without replaying a completed sibling", async () => {
    const { owner } = await getSlice2Accounts();
    const workspaceId = await createWorkspace(
      owner,
      "Consumer recovery",
      `consumer-recovery-${randomUUID()}`,
    );
    const marker = randomUUID();
    const created = await ownerDatabase.$transaction(async (transaction) => {
      const job = await transaction.backgroundJob.create({
        data: {
          workspaceId,
          actorUserId: owner.userId,
          type: "workspace.updated.v1",
          userVisible: true,
          status: "RUNNING",
          correlationId: marker,
          deduplicationKey: `consumer-recovery-job:${marker}`,
          payload: { occurredAt: new Date().toISOString(), subject: {} },
        },
      });
      const outbox = await transaction.outboxMessage.create({
        data: {
          eventName: "workspace.updated.v1",
          aggregateType: "Workspace",
          aggregateId: workspaceId,
          workspaceId,
          actorUserId: owner.userId,
          backgroundJobId: job.id,
          correlationId: marker,
          deduplicationKey: `consumer-recovery-outbox:${marker}`,
          status: "PROCESSING",
          payload: {
            occurredAt: new Date().toISOString(),
            subject: { workspaceId },
            notification: {
              recipientUserId: owner.userId,
              kind: "recovery",
              priority: "normal",
              title: "Consumer recuperat",
              body: "Proiecția a fost reluată din PostgreSQL.",
            },
            activity: {
              category: "recovery",
              action: "consumer_recovered",
              summary: "Execuția consumerului a fost recuperată.",
            },
          },
        },
      });
      const staleAt = new Date(Date.now() - 3 * 60 * 1000);
      const ack = await transaction.outboxConsumerExecution.create({
        data: {
          outboxMessageId: outbox.id,
          backgroundJobId: job.id,
          consumerName: "event_ack",
          status: "COMPLETED",
          completedAt: new Date(),
          attempts: 1,
          deduplicationKey: `consumer-recovery-ack:${marker}`,
        },
      });
      const notification = await transaction.outboxConsumerExecution.create({
        data: {
          outboxMessageId: outbox.id,
          backgroundJobId: job.id,
          consumerName: "notification_projection",
          status: "ENQUEUED",
          lockedAt: staleAt,
          lockedBy: "crashed-dispatcher",
          deduplicationKey: `consumer-recovery-notification:${marker}`,
        },
      });
      const activity = await transaction.outboxConsumerExecution.create({
        data: {
          outboxMessageId: outbox.id,
          backgroundJobId: job.id,
          consumerName: "activity_projection",
          status: "PROCESSING",
          lockedAt: staleAt,
          lockedBy: "crashed-worker",
          deduplicationKey: `consumer-recovery-activity:${marker}`,
        },
      });
      return { job, outbox, ack, notification, activity };
    });

    await expect
      .poll(
        async () =>
          (
            await ownerDatabase.backgroundJob.findUniqueOrThrow({
              where: { id: created.job.id },
            })
          ).status,
        { timeout: 30_000 },
      )
      .toBe("COMPLETED");
    const executions = await ownerDatabase.outboxConsumerExecution.findMany({
      where: { outboxMessageId: created.outbox.id },
      orderBy: { consumerName: "asc" },
    });
    expect(
      executions.map(({ consumerName, status }) => ({ consumerName, status })),
    ).toEqual([
      { consumerName: "activity_projection", status: "COMPLETED" },
      { consumerName: "event_ack", status: "COMPLETED" },
      { consumerName: "notification_projection", status: "COMPLETED" },
    ]);
    expect(
      executions.find((execution) => execution.id === created.ack.id)?.attempts,
    ).toBe(1);
    expect(
      await ownerDatabase.notification.count({
        where: { sourceEventId: created.outbox.id },
      }),
    ).toBe(1);
    expect(
      await ownerDatabase.activityItem.count({
        where: { sourceEventId: created.outbox.id },
      }),
    ).toBe(1);
  }, 180_000);

  it("records the at-least-once window when provider success precedes acknowledgement", async () => {
    const { owner } = await getSlice2Accounts();
    const workspaceId = await createWorkspace(
      owner,
      "Provider acknowledgement",
      `provider-ack-${randomUUID()}`,
    );
    const marker = randomUUID();
    const created = await ownerDatabase.$transaction(async (transaction) => {
      const job = await transaction.backgroundJob.create({
        data: {
          workspaceId,
          actorUserId: owner.userId,
          type: "password.changed.v1",
          userVisible: true,
          status: "RETRYING",
          attempts: 1,
          correlationId: marker,
          deduplicationKey: `provider-ack-job:${marker}`,
          payload: { occurredAt: new Date().toISOString(), subject: {} },
        },
      });
      const outbox = await transaction.outboxMessage.create({
        data: {
          eventName: "password.changed.v1",
          aggregateType: "User",
          aggregateId: owner.userId,
          workspaceId,
          actorUserId: owner.userId,
          backgroundJobId: job.id,
          correlationId: marker,
          deduplicationKey: `provider-ack-outbox:${marker}`,
          status: "FAILED",
          payload: { occurredAt: new Date().toISOString(), subject: {} },
          encryptedHeaders: encryptCommand(
            {
              kind: "password-changed",
              recipient: owner.email,
              values: { firstName: "Test" },
            },
            {
              keyId: "local-v1",
              secret: "weddingos-local-outbox-encryption-key-change-production",
            },
          ),
        },
      });
      await transaction.outboxConsumerExecution.create({
        data: {
          outboxMessageId: outbox.id,
          backgroundJobId: job.id,
          consumerName: "event_ack",
          status: "COMPLETED",
          completedAt: new Date(),
          attempts: 1,
          deduplicationKey: `provider-ack-event:${marker}`,
        },
      });
      const email = await transaction.outboxConsumerExecution.create({
        data: {
          outboxMessageId: outbox.id,
          backgroundJobId: job.id,
          consumerName: "email",
          status: "FAILED",
          attempts: 1,
          availableAt: new Date(),
          deduplicationKey: `provider-ack-email:${marker}`,
        },
      });
      await transaction.deliveryAttempt.create({
        data: {
          consumerExecutionId: email.id,
          backgroundJobId: job.id,
          workspaceId,
          sourceType: "outbox_consumer_execution",
          sourceId: email.id,
          provider: "smtp",
          recipientReference: hashToken(owner.email),
          attemptNumber: 1,
          outcome: "SUCCEEDED",
          providerMessageId: `<accepted-before-ack-${marker}@provider.test>`,
        },
      });
      return { job, outbox, email };
    });

    await expect
      .poll(
        async () =>
          (
            await ownerDatabase.backgroundJob.findUniqueOrThrow({
              where: { id: created.job.id },
            })
          ).status,
        { timeout: 30_000 },
      )
      .toBe("COMPLETED");
    const attempts = await ownerDatabase.deliveryAttempt.findMany({
      where: { consumerExecutionId: created.email.id },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts.map((attempt) => attempt.outcome)).toEqual([
      "SUCCEEDED",
      "SUCCEEDED",
    ]);
    expect(attempts[1].attemptNumber).toBe(2);
    expect(
      (
        await ownerDatabase.outboxMessage.findUniqueOrThrow({
          where: { id: created.outbox.id },
        })
      ).status,
    ).toBe("PROCESSED");
  }, 180_000);

  it("creates an owner-only bounded CSV artifact and deletes it after expiry", async () => {
    const { owner, outsider } = await getSlice2Accounts();
    const workspaceId = await createWorkspace(
      owner,
      "Activity export",
      `activity-export-${randomUUID()}`,
    );
    await expect
      .poll(
        async () =>
          ownerDatabase.activityItem.count({ where: { workspaceId } }),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    const response = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/activity-exports`)
      .set("Origin", origin)
      .set("Idempotency-Key", `activity-export-${randomUUID()}`)
      .send({})
      .expect(201);
    const jobId = response.body.data.id as string;
    await expect
      .poll(
        async () =>
          (
            await ownerDatabase.backgroundJob.findUniqueOrThrow({
              where: { id: jobId },
            })
          ).status,
        { timeout: 30_000 },
      )
      .toBe("COMPLETED");
    expect(
      (await owner.agent.get(`/api/v1/jobs/${jobId}`).expect(200)).body.data
        .status,
    ).toBe("completed");
    const artifact = await ownerDatabase.generatedArtifact.findUniqueOrThrow({
      where: { backgroundJobId: jobId },
    });
    expect(artifact).toMatchObject({
      status: "READY",
      ownerUserId: owner.userId,
      workspaceId,
      kind: "activity_csv",
      mediaType: "text/csv; charset=utf-8",
    });
    expect(Number(artifact.sizeBytes)).toBeLessThanOrEqual(5_242_880);
    expect(artifact.rowCount).toBeLessThanOrEqual(10_000);
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      access(join(artifactRoot, artifact.storageKey)),
    ).resolves.toBeUndefined();
    const download = await owner.agent
      .get(`/api/v1/jobs/${jobId}/artifact`)
      .expect(200);
    expect(download.headers["content-type"]).toContain("text/csv");
    expect(download.headers["content-disposition"]).toContain(
      "weddingos-activity-",
    );
    await outsider.agent.get(`/api/v1/jobs/${jobId}/artifact`).expect(404);
    const visibleJob = await ownerDatabase.backgroundJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(JSON.stringify(visibleJob.result)).not.toContain("occurred_at,");

    await ownerDatabase.generatedArtifact.update({
      where: { id: artifact.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect
      .poll(
        async () =>
          (
            await ownerDatabase.generatedArtifact.findUniqueOrThrow({
              where: { id: artifact.id },
            })
          ).status,
        { timeout: 15_000 },
      )
      .toBe("DELETED");
    await expect
      .poll(
        async () => {
          try {
            await access(join(artifactRoot, artifact.storageKey));
            return false;
          } catch {
            return true;
          }
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await owner.agent.get(`/api/v1/jobs/${jobId}/artifact`).expect(404);
  }, 240_000);

  it("persists a permanent worker failure as a visible dead letter", async () => {
    const { owner } = await getSlice2Accounts();
    const workspaceId = await createWorkspace(
      owner,
      "Dead letter",
      `dead-letter-${randomUUID()}`,
    );
    const marker = randomUUID();
    const job = await ownerDatabase.$transaction(async (transaction) => {
      const created = await transaction.backgroundJob.create({
        data: {
          workspaceId,
          actorUserId: owner.userId,
          type: "workspace.updated.v1",
          userVisible: true,
          correlationId: marker,
          deduplicationKey: `dead-letter-job:${marker}`,
          maxAttempts: 3,
          payload: { occurredAt: new Date().toISOString(), subject: {} },
        },
      });
      const outbox = await transaction.outboxMessage.create({
        data: {
          eventName: "workspace.updated.v1",
          aggregateType: "Workspace",
          aggregateId: workspaceId,
          workspaceId,
          actorUserId: owner.userId,
          backgroundJobId: created.id,
          correlationId: marker,
          deduplicationKey: `dead-letter-outbox:${marker}`,
          payload: { occurredAt: new Date().toISOString(), subject: {} },
          encryptedHeaders: "v1.invalid-envelope",
          maxAttempts: 3,
        },
      });
      const [ack, email] = await Promise.all([
        transaction.outboxConsumerExecution.create({
          data: {
            outboxMessageId: outbox.id,
            backgroundJobId: created.id,
            consumerName: "event_ack",
            status: "COMPLETED",
            completedAt: new Date(),
            deduplicationKey: `dead-letter-ack:${marker}`,
          },
        }),
        transaction.outboxConsumerExecution.create({
          data: {
            outboxMessageId: outbox.id,
            backgroundJobId: created.id,
            consumerName: "email",
            maxAttempts: 3,
            deduplicationKey: `dead-letter-email:${marker}`,
          },
        }),
      ]);
      return { job: created, outbox, ack, email };
    });
    await expect
      .poll(
        async () =>
          (
            await ownerDatabase.backgroundJob.findUniqueOrThrow({
              where: { id: job.job.id },
            })
          ).status,
        { timeout: 30_000 },
      )
      .toBe("DEAD_LETTER");
    const [outbox, attempt] = await Promise.all([
      ownerDatabase.outboxMessage.findUniqueOrThrow({
        where: { id: job.outbox.id },
      }),
      ownerDatabase.deliveryAttempt.findFirstOrThrow({
        where: { consumerExecutionId: job.email.id },
      }),
    ]);
    expect(outbox.status).toBe("DEAD_LETTER");
    expect(outbox.encryptedHeaders).toBeNull();
    expect(attempt.outcome).toBe("PERMANENT_FAILURE");
    expect(
      await ownerDatabase.outboxConsumerExecution.findUniqueOrThrow({
        where: { id: job.ack.id },
      }),
    ).toMatchObject({ status: "COMPLETED", attempts: 0 });
    const visible = await owner.agent
      .get(`/api/v1/jobs/${job.job.id}`)
      .expect(200);
    expect(visible.body.data.status).toBe("dead_letter");
    expect(visible.body.data.error.code).toBe("COMMAND_INVALID");
  }, 180_000);

  it("rate-limits repeated login failures", async () => {
    const { owner: account } = await getSlice2Accounts();
    let limited = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const response = await request(application.getHttpServer())
        .post("/api/v1/auth/sessions")
        .set("Origin", origin)
        .send({
          email: account.email,
          password: "WrongPassword2026!",
          remember: false,
        });
      if (response.status === 429) {
        expect(response.body.code).toBe("RATE_LIMITED");
        limited = true;
        break;
      }
      expect(response.status).toBe(401);
      expect(response.body.code).toBe("INVALID_CREDENTIALS");
    }
    expect(limited).toBe(true);
  }, 180_000);

  async function getSlice2Accounts(): Promise<{
    owner: TestAccount;
    outsider: TestAccount;
  }> {
    slice2Owner ??= await createVerifiedAccount("slice-2a-owner");
    slice2Outsider ??= await createVerifiedAccount("slice-2a-outsider");
    return { owner: slice2Owner, outsider: slice2Outsider };
  }

  async function createVerifiedAccount(label: string): Promise<TestAccount> {
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
    const token = await waitForEmailToken(
      email,
      "Confirmă adresa de email Sarbato",
    );
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

  async function createWorkspace(
    account: TestAccount,
    title: string,
    key: string,
  ): Promise<string> {
    const response = await account.agent
      .post("/api/v1/workspaces")
      .set("Origin", origin)
      .set("Idempotency-Key", key)
      .send({ title, partnerOneName: "A", partnerTwoName: "B" })
      .expect(201);
    return response.body.data.id as string;
  }
});

async function cleanDatabase() {
  await assertDestructiveDatabasePurpose(ownerDatabase, "integration");
  const tables = await ownerDatabase.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'database_identities', 'role_templates', 'vendor_role_templates', 'subscription_products', 'subscription_plans', 'subscription_prices', 'subscription_plan_entitlements', 'platform_fee_policies', 'platform_roles', 'legal_documents', 'legal_document_versions', 'consent_purposes', 'data_retention_policies', 'data_retention_rules')
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await ownerDatabase.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}

async function waitForEmailToken(
  email: string,
  subject: string,
  excludedToken?: string | string[],
): Promise<string> {
  const excludedTokens = new Set(
    Array.isArray(excludedToken)
      ? excludedToken
      : excludedToken
        ? [excludedToken]
        : [],
  );
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
    const summaries = list.messages.filter(
      (message) =>
        message.Subject === subject &&
        message.To.some((recipient) => recipient.Address === email),
    );
    for (const summary of summaries) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) {
        const token = decodeURIComponent(match[1]);
        if (!excludedTokens.has(token)) return token;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Email token not delivered to ${email}`);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

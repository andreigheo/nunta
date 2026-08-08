import { createHash, randomBytes } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { CapabilityKey } from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";

type Transaction = Prisma.TransactionClient;

type ProgramInput = {
  key: string;
  name: string;
  status: string;
  releaseVersion: string;
  termsDocumentVersionId?: string | null;
  privacyDocumentVersionId?: string | null;
  limitsDocumentVersionId?: string | null;
};

type CohortInput = {
  programId: string;
  key: string;
  name: string;
  description: string;
  targetCounts: Record<string, number>;
  startsAt?: string | null;
  endsAt?: string | null;
};

type InvitationInput = {
  programId: string;
  cohortId: string;
  organizationId?: string | null;
  email: string;
  participantType: string;
  expiresInHours: number;
};

type AcceptanceInput = {
  token: string;
  betaTermsAccepted: true;
  privacyNoticeAcknowledged: true;
  knownLimitationsAcknowledged: true;
  analyticsConsent: boolean;
};

type FeedbackInput = {
  type: string;
  severity: string;
  currentRoute: string;
  browserMetadata: Record<string, unknown>;
  description: string;
  expectedBehavior: string;
  actualBehavior: string;
  screenshotObjectId?: string | null;
  correlationId?: string | null;
};

type TriageInput = {
  status: string;
  severity?: string;
  duplicateOfId?: string | null;
  reason: string;
  version: number;
};

type ProductEventInput = {
  eventName: string;
  route?: string | null;
  sessionId?: string | null;
  properties: Record<string, string | number | boolean | null>;
  occurredAt?: string;
};

@Injectable()
export class BetaService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async programs(userId: string) {
    return this.platformContext(userId, "platform.beta.read", async (tx) => ({
      items: (
        await tx.betaProgram.findMany({
          where: { environment: this.environment.NODE_ENV },
          orderBy: { createdAt: "desc" },
        })
      ).map((row) => this.programView(row)),
    }));
  }

  async createProgram(
    userId: string,
    input: ProgramInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(userId, "platform.beta.manage", async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "beta.program.create",
        idempotencyKey,
        input,
      );
      if (replay) return replay;
      const program = await tx.betaProgram.create({
        data: {
          environment: this.environment.NODE_ENV,
          key: input.key,
          name: input.name,
          status: input.status,
          releaseVersion: input.releaseVersion,
          termsDocumentVersionId: input.termsDocumentVersionId,
          privacyDocumentVersionId: input.privacyDocumentVersionId,
          limitsDocumentVersionId: input.limitsDocumentVersionId,
          createdById: userId,
        },
      });
      const response = this.programView(program);
      await this.audit(
        tx,
        userId,
        "platform.beta.manage",
        "beta.program.created",
        "BETA_PROGRAM",
        program.id,
        `Created beta program ${program.key}`,
        response,
        correlationId,
      );
      await this.saveReplay(
        tx,
        userId,
        "beta.program.create",
        idempotencyKey,
        input,
        response,
      );
      return response;
    });
  }

  async cohorts(userId: string) {
    return this.platformContext(userId, "platform.beta.read", async (tx) => ({
      items: (
        await tx.betaCohort.findMany({
          where: {
            programId: {
              in: (
                await tx.betaProgram.findMany({
                  where: { environment: this.environment.NODE_ENV },
                  select: { id: true },
                })
              ).map((row) => row.id),
            },
          },
          orderBy: { createdAt: "desc" },
        })
      ).map((row) => this.safe(row)),
    }));
  }

  async createCohort(
    userId: string,
    input: CohortInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(userId, "platform.beta.manage", async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "beta.cohort.create",
        idempotencyKey,
        input,
      );
      if (replay) return replay;
      await this.assertProgram(tx, input.programId);
      const cohort = await tx.betaCohort.create({
        data: {
          programId: input.programId,
          key: input.key,
          name: input.name,
          description: input.description,
          targetCounts: this.json(input.targetCounts),
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          createdById: userId,
        },
      });
      const response = this.safe(cohort);
      await this.audit(
        tx,
        userId,
        "platform.beta.manage",
        "beta.cohort.created",
        "BETA_COHORT",
        cohort.id,
        `Created beta cohort ${cohort.key}`,
        response,
        correlationId,
      );
      await this.saveReplay(
        tx,
        userId,
        "beta.cohort.create",
        idempotencyKey,
        input,
        response,
      );
      return response;
    });
  }

  async participants(userId: string) {
    return this.platformContext(userId, "platform.beta.read", async (tx) => ({
      items: (
        await tx.betaParticipant.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      ).map((row) => this.participantView(row)),
    }));
  }

  async invitations(userId: string) {
    return this.platformContext(userId, "platform.beta.read", async (tx) => ({
      items: (
        await tx.betaInvitation.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      ).map((row) => this.invitationView(row)),
    }));
  }

  async createInvitation(
    userId: string,
    input: InvitationInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(userId, "platform.beta.invite", async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "beta.invitation.create",
        idempotencyKey,
        input,
      );
      if (replay)
        return {
          ...(replay as Record<string, unknown>),
          acceptanceToken: null,
          tokenDisclosure: "NOT_REISSUED_ON_IDEMPOTENT_REPLAY",
        };
      await this.assertProgram(tx, input.programId);
      const cohort = await tx.betaCohort.findFirst({
        where: { id: input.cohortId, programId: input.programId },
      });
      if (!cohort) this.notFound("Beta cohort not found in program.");
      const rawToken = randomBytes(32).toString("base64url");
      const invitation = await tx.betaInvitation.create({
        data: {
          programId: input.programId,
          cohortId: input.cohortId,
          organizationId: input.organizationId,
          participantType: input.participantType,
          targetEmailHash: this.hashEmail(input.email),
          tokenHash: this.hash(rawToken),
          expiresAt: new Date(Date.now() + input.expiresInHours * 3_600_000),
          sentAt: new Date(),
          createdById: userId,
        },
      });
      const response = {
        invitation: this.invitationView(invitation),
        acceptanceToken: rawToken,
        tokenDisclosure: "RETURNED_ONCE_NOT_STORED",
      };
      await this.audit(
        tx,
        userId,
        "platform.beta.invite",
        "beta.invitation.created",
        "BETA_INVITATION",
        invitation.id,
        "Created beta invitation using an email hash",
        this.invitationView(invitation),
        correlationId,
      );
      await this.saveReplay(
        tx,
        userId,
        "beta.invitation.create",
        idempotencyKey,
        input,
        {
          invitation: this.invitationView(invitation),
          acceptanceToken: null,
          tokenDisclosure: "NOT_STORED_OR_REISSUED",
        },
      );
      return response;
    });
  }

  async acceptInvitation(
    userId: string,
    email: string,
    input: AcceptanceInput,
    correlationId: string,
  ) {
    const tokenHash = this.hash(input.token);
    return this.database.withContext(
      { userId, invitationTokenHash: tokenHash, correlationId },
      async (tx) => {
        const invitation = await tx.betaInvitation.findUnique({
          where: { tokenHash },
        });
        if (!invitation)
          problem(
            "TOKEN_INVALID",
            HttpStatus.NOT_FOUND,
            "Beta invitation is invalid",
          );
        if (invitation.status === "REVOKED")
          problem(
            "INVITATION_REVOKED",
            HttpStatus.GONE,
            "Beta invitation was revoked",
          );
        if (invitation.status !== "INVITED")
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            "Beta invitation was already used",
          );
        if (invitation.expiresAt.getTime() <= Date.now())
          problem(
            "TOKEN_EXPIRED",
            HttpStatus.GONE,
            "Beta invitation has expired",
          );
        if (invitation.targetEmailHash !== this.hashEmail(email))
          problem(
            "FORBIDDEN",
            HttpStatus.FORBIDDEN,
            "Invitation is assigned to another account",
          );
        const now = new Date();
        const participant = await tx.betaParticipant.upsert({
          where: {
            programId_userId: { programId: invitation.programId, userId },
          },
          create: {
            programId: invitation.programId,
            cohortId: invitation.cohortId,
            organizationId: invitation.organizationId,
            userId,
            emailHash: invitation.targetEmailHash,
            participantType: invitation.participantType,
            status: "ONBOARDING",
            consentedAt: now,
            privacyAcknowledgedAt: now,
            limitationsAcknowledgedAt: now,
            onboardingChecklist: {},
          },
          update: {
            cohortId: invitation.cohortId,
            organizationId: invitation.organizationId,
            participantType: invitation.participantType,
            status: "ONBOARDING",
            consentedAt: now,
            privacyAcknowledgedAt: now,
            limitationsAcknowledgedAt: now,
            version: { increment: 1 },
          },
        });
        await tx.betaAccessGrant.upsert({
          where: { participantId: participant.id },
          create: {
            participantId: participant.id,
            scopeType: "PROGRAM",
            scopeId: invitation.programId,
          },
          update: {
            status: "ACTIVE",
            revokedAt: null,
            validFrom: now,
            version: { increment: 1 },
          },
        });
        const updated = await tx.betaInvitation.updateMany({
          where: { id: invitation.id, version: invitation.version },
          data: {
            status: "ACCEPTED",
            acceptedAt: now,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.conflict();
        await tx.userConsentRecord.createMany({
          data: [
            {
              userId,
              purpose: "BETA_PARTICIPATION",
              processingBasis: "CONSENT",
              status: "GRANTED",
              source: "BETA_INVITATION",
              occurredAt: now,
            },
            {
              userId,
              purpose: "BETA_PRODUCT_ANALYTICS",
              processingBasis: "CONSENT",
              status: input.analyticsConsent ? "GRANTED" : "DECLINED",
              source: "BETA_INVITATION",
              occurredAt: now,
            },
          ],
        });
        return {
          participant: this.participantView(participant),
          analyticsConsent: input.analyticsConsent,
          releaseVersion: await this.releaseVersion(tx, participant.programId),
        };
      },
    );
  }

  async status(userId: string) {
    return this.database.withContext({ userId }, async (tx) => {
      const participant = await tx.betaParticipant.findFirst({
        where: { userId, status: { not: "REMOVED" } },
        orderBy: { createdAt: "desc" },
      });
      if (!participant) return { participant: null, betaAccess: false };
      const grant = await tx.betaAccessGrant.findUnique({
        where: { participantId: participant.id },
      });
      return {
        participant: this.participantView(participant),
        betaAccess:
          grant?.status === "ACTIVE" &&
          (!grant.validUntil || grant.validUntil.getTime() > Date.now()),
        releaseVersion: await this.releaseVersion(tx, participant.programId),
        environment: this.environment.NODE_ENV,
        sandbox: this.environment.NODE_ENV !== "production",
      };
    });
  }

  async updateOnboarding(
    userId: string,
    input: { version: number; checklist: Record<string, boolean> },
  ) {
    return this.database.withContext({ userId }, async (tx) => {
      const participant = await this.participantForUser(tx, userId);
      const completed = Object.values(input.checklist).every(Boolean);
      const updated = await tx.betaParticipant.updateMany({
        where: { id: participant.id, userId, version: input.version },
        data: {
          onboardingChecklist: this.json(input.checklist),
          status: completed ? "ACTIVE" : "ONBOARDING",
          activatedAt: completed ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) this.conflict();
      const current = await tx.betaParticipant.findUnique({
        where: { id: participant.id },
      });
      return this.participantView(current!);
    });
  }

  async removeParticipant(
    userId: string,
    participantId: string,
    input: { version: number; reason: string },
    correlationId: string,
  ) {
    return this.platformContext(userId, "platform.beta.manage", async (tx) => {
      const participant = await tx.betaParticipant.findUnique({
        where: { id: participantId },
      });
      if (!participant) this.notFound("Beta participant not found.");
      const changed = await tx.betaParticipant.updateMany({
        where: { id: participantId, version: input.version },
        data: {
          status: "REMOVED",
          removedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) this.conflict();
      await tx.betaAccessGrant.updateMany({
        where: { participantId, status: "ACTIVE" },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const current = await tx.betaParticipant.findUnique({
        where: { id: participantId },
      });
      await this.audit(
        tx,
        userId,
        "platform.beta.manage",
        "beta.participant.removed",
        "BETA_PARTICIPANT",
        participantId,
        input.reason,
        this.participantView(current!),
        correlationId,
      );
      return this.participantView(current!);
    });
  }

  async feedback(userId: string) {
    return this.database.withContext({ userId }, async (tx) => ({
      items: (
        await tx.betaFeedback.findMany({
          where: { createdById: userId },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      ).map((row) => this.feedbackView(row)),
    }));
  }

  async feedbackDetail(userId: string, feedbackId: string) {
    return this.database.withContext({ userId }, async (tx) => {
      const feedback = await tx.betaFeedback.findFirst({
        where: { id: feedbackId, createdById: userId },
      });
      if (!feedback) this.notFound("Beta feedback not found.");
      return {
        ...this.feedbackView(feedback),
        messages: (
          await tx.betaFeedbackMessage.findMany({
            where: { feedbackId, internal: false },
            orderBy: { createdAt: "asc" },
          })
        ).map((row) => this.safe(row)),
        history: (
          await tx.betaFeedbackStatusHistory.findMany({
            where: { feedbackId },
            orderBy: { createdAt: "asc" },
          })
        ).map((row) => this.safe(row)),
      };
    });
  }

  async createFeedback(
    userId: string,
    input: FeedbackInput,
    idempotencyKey: string,
  ) {
    return this.database.withContext({ userId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "beta.feedback.create",
        idempotencyKey,
        input,
      );
      if (replay) return replay;
      const participant = await this.participantForUser(tx, userId);
      const feedback = await tx.betaFeedback.create({
        data: {
          participantId: participant.id,
          createdById: userId,
          type: input.type,
          severity: input.severity,
          currentRoute: input.currentRoute,
          browserMetadata: this.json(input.browserMetadata),
          description: input.description,
          expectedBehavior: input.expectedBehavior,
          actualBehavior: input.actualBehavior,
          screenshotObjectId: input.screenshotObjectId,
          correlationId: input.correlationId,
          releaseVersion: await this.releaseVersion(tx, participant.programId),
        },
      });
      const response = this.feedbackView(feedback);
      await this.saveReplay(
        tx,
        userId,
        "beta.feedback.create",
        idempotencyKey,
        input,
        response,
      );
      return response;
    });
  }

  async addFeedbackMessage(
    userId: string,
    feedbackId: string,
    input: { body: string; version: number },
    expectedVersion: number,
  ) {
    if (input.version !== expectedVersion) this.conflict();
    return this.database.withContext({ userId }, async (tx) => {
      const feedback = await tx.betaFeedback.findFirst({
        where: { id: feedbackId, createdById: userId },
      });
      if (!feedback) this.notFound("Beta feedback not found.");
      if (feedback.version !== expectedVersion) this.conflict();
      const message = await tx.betaFeedbackMessage.create({
        data: { feedbackId, authorUserId: userId, body: input.body },
      });
      const changed = await tx.betaFeedback.updateMany({
        where: { id: feedbackId, version: expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) this.conflict();
      return { ...this.safe(message), version: expectedVersion + 1 };
    });
  }

  async triageFeedback(
    userId: string,
    feedbackId: string,
    input: TriageInput,
    expectedVersion: number,
    correlationId: string,
  ) {
    if (input.version !== expectedVersion) this.conflict();
    return this.platformContext(userId, "platform.beta.triage", async (tx) => {
      const feedback = await tx.betaFeedback.findUnique({
        where: { id: feedbackId },
      });
      if (!feedback) this.notFound("Beta feedback not found.");
      if (feedback.version !== expectedVersion) this.conflict();
      if (input.duplicateOfId === feedbackId)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Feedback cannot duplicate itself",
        );
      const severity = input.severity ?? feedback.severity;
      const changed = await tx.betaFeedback.updateMany({
        where: { id: feedbackId, version: expectedVersion },
        data: {
          status: input.status,
          severity,
          duplicateOfId: input.duplicateOfId,
          resolvedAt: ["RESOLVED", "DECLINED", "DUPLICATE"].includes(
            input.status,
          )
            ? new Date()
            : null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) this.conflict();
      await tx.betaFeedbackStatusHistory.create({
        data: {
          feedbackId,
          fromStatus: feedback.status,
          toStatus: input.status,
          changedById: userId,
          reason: input.reason,
        },
      });
      if (["HIGH", "CRITICAL"].includes(severity)) {
        await tx.platformSupportCase.create({
          data: {
            requesterUserId: feedback.createdById,
            type: "BETA_URGENT_BLOCKER",
            priority: severity === "CRITICAL" ? "URGENT" : "HIGH",
            subject: `Beta feedback ${feedbackId}`,
            description: `${input.reason}\n\n${feedback.description}`.slice(
              0,
              4000,
            ),
          },
        });
      }
      const current = await tx.betaFeedback.findUnique({
        where: { id: feedbackId },
      });
      await this.audit(
        tx,
        userId,
        "platform.beta.triage",
        "beta.feedback.triaged",
        "BETA_FEEDBACK",
        feedbackId,
        input.reason,
        this.feedbackView(current!),
        correlationId,
      );
      return this.feedbackView(current!);
    });
  }

  async adminFeedback(userId: string) {
    return this.platformContext(userId, "platform.beta.read", async (tx) => ({
      items: (
        await tx.betaFeedback.findMany({
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
          take: 500,
        })
      ).map((row) => this.feedbackView(row)),
    }));
  }

  async recordProductEvent(
    userId: string,
    sessionId: string,
    input: ProductEventInput,
    correlationId: string,
  ) {
    if (!this.environment.BETA_ANALYTICS_ENABLED)
      return { recorded: false, reason: "ANALYTICS_DISABLED" };
    return this.database.withContext({ userId }, async (tx) => {
      const participant = await this.participantForUser(tx, userId);
      const consent = await tx.userConsentRecord.findFirst({
        where: {
          userId,
          purpose: "BETA_PRODUCT_ANALYTICS",
          status: "GRANTED",
        },
        orderBy: { occurredAt: "desc" },
      });
      if (!consent) return { recorded: false, reason: "CONSENT_NOT_GRANTED" };
      const event = await tx.betaProductEvent.create({
        data: {
          participantId: participant.id,
          userId,
          eventName: input.eventName,
          route: input.route,
          sessionIdHash: this.hash(sessionId),
          properties: this.json(input.properties),
          correlationId,
          releaseVersion: await this.releaseVersion(tx, participant.programId),
          occurredAt: input.occurredAt
            ? new Date(input.occurredAt)
            : new Date(),
        },
      });
      return { recorded: true, eventId: event.id };
    });
  }

  async metrics(userId: string) {
    return this.platformContext(userId, "platform.beta.read", async (tx) => {
      const [participants, feedback, events, support, incidents, backup] =
        await Promise.all([
          tx.betaParticipant.groupBy({ by: ["status"], _count: true }),
          tx.betaFeedback.groupBy({
            by: ["status", "severity"],
            _count: true,
          }),
          tx.betaProductEvent.groupBy({ by: ["eventName"], _count: true }),
          tx.platformSupportCase.count({
            where: {
              type: { startsWith: "BETA_" },
              status: { notIn: ["RESOLVED", "CLOSED"] },
            },
          }),
          tx.platformIncident.count({
            where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
          }),
          tx.backupRun.findFirst({
            where: { environment: this.environment.NODE_ENV },
            orderBy: { createdAt: "desc" },
          }),
        ]);
      return {
        generatedAt: new Date().toISOString(),
        environment: this.environment.NODE_ENV,
        releaseVersion: this.environment.BETA_RELEASE_VERSION ?? null,
        participants,
        feedback,
        productEvents: events,
        openBetaSupportCases: support,
        openIncidents: incidents,
        latestBackup: backup ? this.safe(backup) : null,
      };
    });
  }

  async exitCriteria(userId: string) {
    const metrics = await this.metrics(userId);
    const participantCounts = new Map(
      metrics.participants.map((row) => [row.status, row._count]),
    );
    const criticalOpen = metrics.feedback
      .filter(
        (row) =>
          row.severity === "CRITICAL" &&
          !["RESOLVED", "DECLINED", "DUPLICATE"].includes(row.status),
      )
      .reduce((total, row) => total + row._count, 0);
    const checks = {
      activeParticipants: (participantCounts.get("ACTIVE") ?? 0) >= 5,
      noCriticalFeedbackOpen: criticalOpen === 0,
      noIncidentsOpen: metrics.openIncidents === 0,
      verifiedBackup:
        metrics.latestBackup?.status === "VERIFIED" ||
        metrics.latestBackup?.status === "COMPLETED",
      externalBetaConfiguration:
        this.environment.NODE_ENV === "beta" &&
        Boolean(this.environment.BETA_PUBLIC_URL),
    };
    return {
      checks,
      passed: Object.values(checks).every(Boolean),
      publicLaunchReady: false,
      verdict: Object.values(checks).every(Boolean)
        ? "CONTROLLED_BETA_ENVIRONMENT_READY"
        : "CONTROLLED_BETA_BLOCKED",
      metrics,
    };
  }

  private async participantForUser(tx: Transaction, userId: string) {
    const participant = await tx.betaParticipant.findFirst({
      where: {
        userId,
        status: { in: ["ONBOARDING", "ACTIVE", "COMPLETED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!participant)
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Active beta participation required",
      );
    return participant;
  }

  private async assertProgram(tx: Transaction, programId: string) {
    const program = await tx.betaProgram.findFirst({
      where: { id: programId, environment: this.environment.NODE_ENV },
    });
    if (!program) this.notFound("Beta program not found in this environment.");
    return program;
  }

  private async releaseVersion(tx: Transaction, programId: string) {
    const program = await tx.betaProgram.findUnique({
      where: { id: programId },
      select: { releaseVersion: true },
    });
    return (
      program?.releaseVersion ??
      this.environment.BETA_RELEASE_VERSION ??
      "beta-unversioned"
    );
  }

  private async platformContext<T>(
    userId: string,
    capability: CapabilityKey,
    operation: (tx: Transaction) => Promise<T>,
  ) {
    return this.database.withContext({ userId }, async (tx) => {
      const result = await tx.$queryRaw<Array<{ allowed: boolean }>>`
        SELECT public.weddingos_has_platform_capability(${capability}) AS allowed
      `;
      if (!result[0]?.allowed)
        problem(
          "PLATFORM_CAPABILITY_REQUIRED",
          HttpStatus.FORBIDDEN,
          "Platform capability required",
          undefined,
          undefined,
          { requiredCapability: capability },
        );
      return operation(tx);
    });
  }

  private async audit(
    tx: Transaction,
    actorUserId: string,
    capability: CapabilityKey,
    action: string,
    targetType: string,
    targetId: string,
    reason: string,
    after: unknown,
    correlationId: string,
  ) {
    await tx.platformAdminAction.create({
      data: {
        actorUserId,
        capability,
        action,
        targetType,
        targetId,
        environment: this.environment.NODE_ENV,
        reason,
        afterRedacted: this.json(after),
        outcome: "SUCCESS",
        correlationId,
      },
    });
  }

  private async replay(
    tx: Transaction,
    actorUserId: string,
    operation: string,
    key: string,
    request: unknown,
  ) {
    const existing = await tx.idempotencyRecord.findUnique({
      where: { actorUserId_operation_key: { actorUserId, operation, key } },
    });
    if (!existing) return null;
    if (existing.requestHash !== this.hash(request))
      problem(
        "IDEMPOTENCY_KEY_REUSED",
        HttpStatus.CONFLICT,
        "Idempotency key reused with different beta operation",
      );
    return this.safe(existing.responseBody);
  }

  private async saveReplay(
    tx: Transaction,
    actorUserId: string,
    operation: string,
    key: string,
    request: unknown,
    response: unknown,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        actorUserId,
        operation,
        key,
        requestHash: this.hash(request),
        responseStatus: 200,
        responseBody: this.json(response),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  }

  private programView<T extends Record<string, unknown>>(program: T) {
    const {
      termsDocumentVersionId: _terms,
      privacyDocumentVersionId: _privacy,
      limitsDocumentVersionId: _limits,
      ...safe
    } = program;
    return this.safe(safe);
  }

  private participantView<T extends Record<string, unknown>>(participant: T) {
    const { emailHash: _emailHash, ...safe } = participant;
    return this.safe(safe);
  }

  private invitationView<T extends Record<string, unknown>>(invitation: T) {
    const {
      targetEmailHash: _emailHash,
      tokenHash: _tokenHash,
      ...safe
    } = invitation;
    return this.safe(safe);
  }

  private feedbackView<T extends Record<string, unknown>>(feedback: T) {
    return this.safe(feedback);
  }

  private hashEmail(email: string) {
    return this.hash(email.trim().toLowerCase());
  }

  private hash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private safe<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ) as T;
  }

  private conflict(): never {
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Version conflict",
      "Beta resource changed while the request was in progress.",
    );
  }

  private notFound(detail: string): never {
    problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Not found", detail);
  }
}

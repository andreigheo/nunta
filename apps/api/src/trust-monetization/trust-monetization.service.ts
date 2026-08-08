import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { CapabilityKey } from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import {
  PAYOUT_ACCOUNT_PROVIDER,
  SUBSCRIPTION_BILLING_PROVIDER,
  type PayoutAccountProvider,
  type SubscriptionBillingProvider,
} from "./providers";

type Tx = Prisma.TransactionClient;
type Input = Record<string, unknown>;
type Criterion =
  | "QUALITY"
  | "COMMUNICATION"
  | "RELIABILITY"
  | "VALUE"
  | "PROFESSIONALISM"
  | "FLEXIBILITY";
const criteria: Criterion[] = [
  "QUALITY",
  "COMMUNICATION",
  "RELIABILITY",
  "VALUE",
  "PROFESSIONALISM",
  "FLEXIBILITY",
];

@Injectable()
export class TrustMonetizationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(SUBSCRIPTION_BILLING_PROVIDER)
    private readonly subscriptionProvider: SubscriptionBillingProvider,
    @Inject(PAYOUT_ACCOUNT_PROVIDER)
    private readonly payoutProvider: PayoutAccountProvider,
  ) {}

  async reviewEligibilities(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const bookings = await tx.vendorBooking.findMany({
        where: { workspaceId, status: "COMPLETED" },
        orderBy: { serviceEndAt: "desc" },
      });
      for (const booking of bookings) {
        const existing = await tx.reviewEligibility.findUnique({
          where: {
            bookingId_eligibleUserId: {
              bookingId: booking.id,
              eligibleUserId: userId,
            },
          },
        });
        if (existing) continue;
        const eligibility = await tx.reviewEligibility.create({
          data: {
            workspaceId,
            vendorOrganizationId: booking.vendorOrganizationId,
            bookingId: booking.id,
            eligibleUserId: userId,
            eligibilityType: "COMPLETED_BOOKING",
            dedupeKey: `review-eligibility:${booking.id}:${userId}`,
          },
        });
        await this.emit(tx, {
          event: "review.eligibility_created.v1",
          aggregateType: "ReviewEligibility",
          aggregateId: eligibility.id,
          workspaceId,
          vendorOrganizationId: booking.vendorOrganizationId,
          actorUserId: userId,
          version: eligibility.version,
          summary: `Poți evalua colaborarea pentru bookingul ${booking.title}.`,
          actionUrl: "/reviews",
        });
      }
      const rows = await tx.reviewEligibility.findMany({
        where: { workspaceId, eligibleUserId: userId },
        orderBy: { eligibleAt: "desc" },
      });
      const bookingRows = await tx.vendorBooking.findMany({
        where: { id: { in: rows.map((row) => row.bookingId) } },
      });
      const reviewRows = await tx.vendorReview.findMany({
        where: {
          eligibilityId: { in: rows.map((row) => row.id) },
          authorUserId: userId,
        },
      });
      return {
        items: rows.map((row) =>
          safe({
            ...row,
            booking: bookingRows.find(
              (booking) => booking.id === row.bookingId,
            ),
            review:
              reviewRows.find((review) => review.eligibilityId === row.id) ??
              null,
          }),
        ),
      };
    });
  }

  async createReview(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      if (input.authenticityConfirmed !== true)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.UNPROCESSABLE_ENTITY,
          "Authenticity confirmation is required",
        );
      const eligibilityId = uuidValue(input.eligibilityId, "eligibilityId");
      const existing = await tx.vendorReview.findUnique({
        where: { eligibilityId },
      });
      if (existing) return this.reviewDetailTx(tx, existing.id);
      const eligibility = await tx.reviewEligibility.findFirst({
        where: {
          id: eligibilityId,
          workspaceId,
          eligibleUserId: userId,
          status: "ELIGIBLE",
        },
      });
      if (!eligibility)
        problem(
          "REVIEW_NOT_ELIGIBLE",
          HttpStatus.CONFLICT,
          "Review eligibility is not active",
        );
      const booking = await tx.vendorBooking.findFirst({
        where: {
          id: eligibility.bookingId,
          workspaceId,
          vendorOrganizationId: eligibility.vendorOrganizationId,
          status: "COMPLETED",
        },
      });
      if (!booking)
        problem(
          "REVIEW_NOT_ELIGIBLE",
          HttpStatus.CONFLICT,
          "Booking is not eligible for review",
        );
      const reviewId = randomUUID();
      const normalized = normalizeReview(input);
      const review = await tx.vendorReview.create({
        data: {
          id: reviewId,
          workspaceId,
          vendorOrganizationId: eligibility.vendorOrganizationId,
          bookingId: eligibility.bookingId,
          eligibilityId,
          authorUserId: userId,
          overallRating: normalized.overallRating,
          title: normalized.title,
          publicDisplayName: displayName(input.publicDisplayName),
        },
      });
      const version = await this.createReviewVersion(
        tx,
        review,
        userId,
        normalized,
      );
      await tx.vendorReview.update({
        where: { id: review.id },
        data: { currentDraftVersionId: version.id },
      });
      await this.emit(tx, {
        event: "review.draft_created.v1",
        aggregateType: "VendorReview",
        aggregateId: review.id,
        workspaceId,
        vendorOrganizationId: review.vendorOrganizationId,
        actorUserId: userId,
        version: review.version,
        dedupeSuffix: key,
        summary: "Ciorna evaluării a fost salvată.",
        actionUrl: `/reviews?review=${review.id}`,
      });
      return this.reviewDetailTx(tx, review.id);
    });
  }

  async review(userId: string, workspaceId: string, reviewId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const review = await this.ownedReview(tx, userId, workspaceId, reviewId);
      return this.reviewDetailTx(tx, review.id);
    });
  }

  async updateReviewDraft(
    userId: string,
    workspaceId: string,
    reviewId: string,
    version: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const review = await this.ownedReview(tx, userId, workspaceId, reviewId);
      assertVersion(review.version, version);
      if (
        review.publishedAt &&
        Date.now() - review.publishedAt.getTime() >
          this.environment.REVIEW_EDIT_WINDOW_DAYS * 86_400_000
      )
        problem(
          "REVIEW_EDIT_WINDOW_CLOSED",
          HttpStatus.CONFLICT,
          "Review edit window is closed",
        );
      if (["WITHDRAWN", "REJECTED", "ARCHIVED"].includes(review.status))
        problem(
          "REVIEW_NOT_ELIGIBLE",
          HttpStatus.CONFLICT,
          "Review can no longer be edited",
        );
      const current = await this.currentVersion(tx, review);
      const normalized = normalizeReview({
        title: input.title ?? current.title,
        body: input.body ?? current.body,
        overallRating: input.overallRating ?? current.overallRating,
        criteria: input.criteria ?? current.criterionSnapshot,
      });
      const next = await this.createReviewVersion(
        tx,
        review,
        userId,
        normalized,
      );
      const updated = await tx.vendorReview.update({
        where: { id: review.id },
        data: {
          title: normalized.title,
          overallRating: normalized.overallRating,
          publicDisplayName:
            input.publicDisplayName === undefined
              ? review.publicDisplayName
              : displayName(input.publicDisplayName),
          currentDraftVersionId: next.id,
          editedAt: review.publishedAt ? new Date() : review.editedAt,
          version: { increment: 1 },
        },
      });
      await this.emit(tx, {
        event: "review.updated.v1",
        aggregateType: "VendorReview",
        aggregateId: review.id,
        workspaceId,
        vendorOrganizationId: review.vendorOrganizationId,
        actorUserId: userId,
        version: updated.version,
        summary: "Ciorna evaluării a fost actualizată.",
        actionUrl: `/reviews?review=${review.id}`,
      });
      return this.reviewDetailTx(tx, review.id);
    });
  }

  async submitReview(
    userId: string,
    workspaceId: string,
    reviewId: string,
    version: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const review = await this.ownedReview(tx, userId, workspaceId, reviewId);
      if (review.status === "SUBMITTED")
        return this.reviewDetailTx(tx, review.id);
      assertVersion(review.version, version);
      if (!review.currentDraftVersionId)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Review has no draft version",
        );
      await tx.vendorReviewVersion.update({
        where: { id: review.currentDraftVersionId },
        data: { immutable: true, submittedAt: new Date() },
      });
      const updated = await tx.vendorReview.update({
        where: { id: review.id },
        data: {
          status: review.publishedVersionId ? "PUBLISHED" : "SUBMITTED",
          version: { increment: 1 },
        },
      });
      await this.emit(tx, {
        event: "review.submitted.v1",
        aggregateType: "VendorReview",
        aggregateId: review.id,
        workspaceId,
        vendorOrganizationId: review.vendorOrganizationId,
        actorUserId: userId,
        version: updated.version,
        summary: "Evaluarea a fost trimisă pentru publicare.",
        actionUrl: `/reviews?review=${review.id}`,
      });
      return this.reviewDetailTx(tx, review.id);
    });
  }

  async publishReview(
    userId: string,
    workspaceId: string,
    reviewId: string,
    version: number,
    key: string,
    authenticityConfirmed: boolean,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      if (!authenticityConfirmed)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.UNPROCESSABLE_ENTITY,
          "Authenticity confirmation is required",
        );
      const review = await this.ownedReview(tx, userId, workspaceId, reviewId);
      if (review.status === "PUBLISHED" && review.publishedVersionId)
        return this.reviewDetailTx(tx, review.id);
      assertVersion(review.version, version);
      const eligibility = await tx.reviewEligibility.findFirst({
        where: {
          id: review.eligibilityId,
          status: { in: ["ELIGIBLE", "CONSUMED"] },
        },
      });
      if (!eligibility || !review.currentDraftVersionId)
        problem(
          "REVIEW_NOT_ELIGIBLE",
          HttpStatus.CONFLICT,
          "Review cannot be published",
        );
      const draft = await tx.vendorReviewVersion.findUnique({
        where: { id: review.currentDraftVersionId },
      });
      if (!draft)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Draft version is missing",
        );
      if (!draft.immutable) {
        await tx.vendorReviewVersion.update({
          where: { id: draft.id },
          data: {
            immutable: true,
            submittedAt: draft.submittedAt ?? new Date(),
          },
        });
      }
      const updated = await tx.vendorReview.update({
        where: { id: review.id },
        data: {
          status: "PUBLISHED",
          publishedVersionId: draft.id,
          currentDraftVersionId: null,
          publishedAt: review.publishedAt ?? new Date(),
          editedAt: review.publishedAt ? new Date() : null,
          version: { increment: 1 },
        },
      });
      await tx.reviewEligibility.update({
        where: { id: eligibility.id },
        data: {
          status: "CONSUMED",
          consumedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.rebuildRating(tx, review.vendorOrganizationId);
      await this.emit(tx, {
        event: "review.published.v1",
        aggregateType: "VendorReview",
        aggregateId: review.id,
        workspaceId,
        vendorOrganizationId: review.vendorOrganizationId,
        actorUserId: userId,
        version: updated.version,
        dedupeSuffix: key,
        summary: "Evaluarea verificată a fost publicată.",
        actionUrl: `/marketplace/review/${review.id}`,
      });
      return this.reviewDetailTx(tx, review.id);
    });
  }

  async withdrawReview(
    userId: string,
    workspaceId: string,
    reviewId: string,
    version: number,
    key: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const review = await this.ownedReview(tx, userId, workspaceId, reviewId);
      if (review.status === "WITHDRAWN")
        return this.reviewDetailTx(tx, review.id);
      assertVersion(review.version, version);
      const updated = await tx.vendorReview.update({
        where: { id: review.id },
        data: {
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.vendorReviewReply.updateMany({
        where: { reviewId, status: "PUBLISHED" },
        data: { status: "HIDDEN", version: { increment: 1 } },
      });
      await this.rebuildRating(tx, review.vendorOrganizationId);
      await this.emit(tx, {
        event: "review.withdrawn.v1",
        aggregateType: "VendorReview",
        aggregateId: review.id,
        workspaceId,
        vendorOrganizationId: review.vendorOrganizationId,
        actorUserId: userId,
        version: updated.version,
        dedupeSuffix: key,
        summary: "Evaluarea a fost retrasă.",
        actionUrl: "/reviews",
      });
      return this.reviewDetailTx(tx, review.id);
    });
  }

  async reportReview(
    userId: string,
    workspaceId: string,
    reviewId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const review = await tx.vendorReview.findFirst({
        where: { id: reviewId, status: "PUBLISHED" },
      });
      if (!review) notFound("Review not found");
      const report = await tx.vendorReviewReport.upsert({
        where: { dedupeKey: `review-report:${userId}:${key}` },
        create: {
          reviewId,
          vendorOrganizationId: review.vendorOrganizationId,
          reporterUserId: userId,
          reason: text(input.reason, 80),
          detailsPrivate: optionalText(input.details, 2000),
          dedupeKey: `review-report:${userId}:${key}`,
        },
        update: {},
      });
      const moderation = await tx.vendorReviewModerationCase.upsert({
        where: {
          sourceType_sourceId: { sourceType: "REPORT", sourceId: report.id },
        },
        create: {
          reviewId,
          vendorOrganizationId: review.vendorOrganizationId,
          sourceType: "REPORT",
          sourceId: report.id,
          priority: ["PRIVATE_INFORMATION", "HARASSMENT"].includes(
            report.reason,
          )
            ? "HIGH"
            : "NORMAL",
        },
        update: {},
      });
      await this.emit(tx, {
        event: "review.reported.v1",
        aggregateType: "VendorReview",
        aggregateId: review.id,
        workspaceId: review.workspaceId,
        vendorOrganizationId: review.vendorOrganizationId,
        actorUserId: userId,
        version: review.version,
        dedupeSuffix: key,
        summary: "Raportul a intrat în moderare.",
        actionUrl: `/reviews?review=${review.id}`,
      });
      return safe({ report, moderationCaseId: moderation.id });
    });
  }

  async vendorReviews(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const reviews = await tx.vendorReview.findMany({
        where: { vendorOrganizationId: organizationId },
        orderBy: { createdAt: "desc" },
      });
      return {
        items: await Promise.all(
          reviews.map((review) => this.reviewDetailTx(tx, review.id)),
        ),
        summary: await this.ratingSummaryTx(tx, organizationId),
      };
    });
  }

  async vendorReview(userId: string, organizationId: string, reviewId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const row = await tx.vendorReview.findFirst({
        where: { id: reviewId, vendorOrganizationId: organizationId },
      });
      if (!row) notFound("Review not found");
      return this.reviewDetailTx(tx, reviewId, true);
    });
  }

  async putReply(
    userId: string,
    organizationId: string,
    reviewId: string,
    expectedVersion: number | null,
    input: Input,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const review = await tx.vendorReview.findFirst({
        where: {
          id: reviewId,
          vendorOrganizationId: organizationId,
          status: { in: ["PUBLISHED", "UNDER_REVIEW"] },
        },
      });
      if (!review || !review.publishedVersionId)
        notFound("Published review not found");
      const current = await tx.vendorReviewReply.findUnique({
        where: {
          reviewId_vendorOrganizationId: {
            reviewId,
            vendorOrganizationId: organizationId,
          },
        },
      });
      if (current && expectedVersion !== null)
        assertVersion(current.version, expectedVersion);
      const reply = current
        ? await tx.vendorReviewReply.update({
            where: { id: current.id },
            data: {
              body: text(input.body, 2000),
              editedAt: current.publishedAt ? new Date() : current.editedAt,
              version: { increment: 1 },
            },
          })
        : await tx.vendorReviewReply.create({
            data: {
              reviewId,
              reviewVersionId: review.publishedVersionId,
              vendorOrganizationId: organizationId,
              authorUserId: userId,
              body: text(input.body, 2000),
            },
          });
      return safe(reply);
    });
  }

  async publishReply(
    userId: string,
    organizationId: string,
    reviewId: string,
    version: number,
    key: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const reply = await tx.vendorReviewReply.findUnique({
        where: {
          reviewId_vendorOrganizationId: {
            reviewId,
            vendorOrganizationId: organizationId,
          },
        },
      });
      if (!reply) notFound("Review reply not found");
      if (reply.status === "PUBLISHED") return safe(reply);
      assertVersion(reply.version, version);
      const updated = await tx.vendorReviewReply.update({
        where: { id: reply.id },
        data: {
          status: "PUBLISHED",
          publishedAt: reply.publishedAt ?? new Date(),
          version: { increment: 1 },
        },
      });
      const review = await tx.vendorReview.findUniqueOrThrow({
        where: { id: reviewId },
      });
      await this.emit(tx, {
        event: "review.reply_published.v1",
        aggregateType: "VendorReview",
        aggregateId: review.id,
        workspaceId: review.workspaceId,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: review.version,
        dedupeSuffix: key,
        summary: "Furnizorul a publicat un răspuns.",
        actionUrl: `/marketplace/review/${review.id}`,
      });
      return safe(updated);
    });
  }

  async createReviewDispute(
    userId: string,
    organizationId: string,
    reviewId: string,
    version: number,
    key: string,
    input: Input,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const review = await tx.vendorReview.findFirst({
        where: { id: reviewId, vendorOrganizationId: organizationId },
      });
      if (!review) notFound("Review not found");
      const existing = await tx.vendorReviewDispute.findUnique({
        where: {
          reviewId_vendorOrganizationId: {
            reviewId,
            vendorOrganizationId: organizationId,
          },
        },
      });
      if (existing) return safe(existing);
      assertVersion(review.version, version);
      const dispute = await tx.vendorReviewDispute.create({
        data: {
          reviewId,
          vendorOrganizationId: organizationId,
          openedByUserId: userId,
          reason: text(input.reason, 1000),
          statementPrivate: text(input.statementPrivate, 4000),
        },
      });
      await tx.vendorReviewModerationCase.create({
        data: {
          reviewId,
          vendorOrganizationId: organizationId,
          sourceType: "DISPUTE",
          sourceId: dispute.id,
          priority: "HIGH",
        },
      });
      await this.emit(tx, {
        event: "review.dispute_opened.v1",
        aggregateType: "VendorReview",
        aggregateId: review.id,
        workspaceId: review.workspaceId,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: review.version,
        dedupeSuffix: key,
        summary: "Contestația review-ului a fost deschisă.",
        actionUrl: `/vendor/reviews?review=${review.id}`,
      });
      return safe(dispute);
    });
  }

  async reviewDisputes(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => ({
      items: (
        await tx.vendorReviewDispute.findMany({
          where: { vendorOrganizationId: organizationId },
          orderBy: { openedAt: "desc" },
        })
      ).map(safe),
    }));
  }

  async publicReviews(userId: string, slug: string, query: Input) {
    return this.database.withContext({ userId }, async (tx) => {
      const profile = await tx.vendorProfile.findFirst({
        where: { slug, publicationStatus: "PUBLISHED" },
      });
      if (!profile) notFound("Vendor profile not found");
      const take = Math.min(Math.max(Number(query.limit ?? 20), 1), 50);
      const reviews = await tx.vendorReview.findMany({
        where: {
          vendorOrganizationId: profile.vendorOrganizationId,
          status: "PUBLISHED",
          verificationStatus: { not: "REVOKED" },
        },
        orderBy: { publishedAt: query.sort === "oldest" ? "asc" : "desc" },
        take,
      });
      return {
        items: await Promise.all(
          reviews.map((review) => this.publicReviewTx(tx, review)),
        ),
        summary: await this.ratingSummaryTx(tx, profile.vendorOrganizationId),
        nextCursor: null,
      };
    });
  }

  async publicRatingSummary(userId: string, slug: string) {
    return this.database.withContext({ userId }, async (tx) => {
      const profile = await tx.vendorProfile.findFirst({
        where: { slug, publicationStatus: "PUBLISHED" },
      });
      if (!profile) notFound("Vendor profile not found");
      return this.ratingSummaryTx(tx, profile.vendorOrganizationId);
    });
  }

  async moderationQueue(userId: string) {
    return this.platformContext(
      userId,
      "platform.review_moderate",
      async (tx) => ({
        items: (
          await tx.vendorReviewModerationCase.findMany({
            orderBy: [{ priority: "desc" }, { openedAt: "asc" }],
          })
        ).map(safe),
      }),
    );
  }

  async moderationCase(userId: string, caseId: string) {
    return this.platformContext(
      userId,
      "platform.review_view_private",
      async (tx) => {
        const row = await tx.vendorReviewModerationCase.findUnique({
          where: { id: caseId },
        });
        if (!row) notFound("Moderation case not found");
        return safe({
          ...row,
          review: await this.reviewDetailTx(tx, row.reviewId, true),
          decisions: await tx.vendorReviewModerationDecision.findMany({
            where: { caseId },
            orderBy: { createdAt: "asc" },
          }),
        });
      },
    );
  }

  async transitionModeration(
    userId: string,
    caseId: string,
    version: number,
    status: string,
  ) {
    return this.platformContext(
      userId,
      "platform.review_moderate",
      async (tx) => {
        const row = await tx.vendorReviewModerationCase.findUnique({
          where: { id: caseId },
        });
        if (!row) notFound("Moderation case not found");
        assertVersion(row.version, version);
        if (
          ![
            "OPEN",
            "TRIAGED",
            "INVESTIGATING",
            "AWAITING_INFORMATION",
            "RESOLVED",
            "CLOSED",
          ].includes(status)
        )
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Invalid moderation status",
          );
        return safe(
          await tx.vendorReviewModerationCase.update({
            where: { id: caseId },
            data: {
              status: status as never,
              resolvedAt: ["RESOLVED", "CLOSED"].includes(status)
                ? new Date()
                : null,
              version: { increment: 1 },
            },
          }),
        );
      },
    );
  }

  async decideModeration(
    userId: string,
    caseId: string,
    version: number,
    key: string,
    input: Input,
  ) {
    return this.platformContext(
      userId,
      "platform.review_decide",
      async (tx) => {
        const moderation = await tx.vendorReviewModerationCase.findUnique({
          where: { id: caseId },
        });
        if (!moderation) notFound("Moderation case not found");
        const existing = await tx.vendorReviewModerationDecision.findUnique({
          where: { idempotencyKey: key },
        });
        if (existing) return safe(existing);
        assertVersion(moderation.version, version);
        const review = await tx.vendorReview.findUniqueOrThrow({
          where: { id: moderation.reviewId },
        });
        const decision = text(input.decision, 80);
        const previous = {
          status: review.status,
          verificationStatus: review.verificationStatus,
          publishedVersionId: review.publishedVersionId,
        };
        const row = await tx.vendorReviewModerationDecision.create({
          data: {
            caseId,
            reviewId: review.id,
            decision: decision as never,
            reason: text(input.reason, 2000),
            actorUserId: userId,
            previousPublicState: previous,
            idempotencyKey: key,
          },
        });
        const data: Prisma.VendorReviewUpdateInput = {
          version: { increment: 1 },
        };
        if (["HIDE_CONTENT", "SUSPEND_REVIEW"].includes(decision))
          data.status = "HIDDEN";
        if (decision === "RESTORE_CONTENT") data.status = "PUBLISHED";
        if (decision === "REJECT_REVIEW") data.status = "REJECTED";
        if (decision === "REVOKE_VERIFICATION")
          data.verificationStatus = "REVOKED";
        await tx.vendorReview.update({ where: { id: review.id }, data });
        await tx.vendorReviewModerationCase.update({
          where: { id: caseId },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.rebuildRating(tx, review.vendorOrganizationId);
        await this.emit(tx, {
          event: "review.moderation_decided.v1",
          aggregateType: "VendorReview",
          aggregateId: review.id,
          workspaceId: review.workspaceId,
          vendorOrganizationId: review.vendorOrganizationId,
          actorUserId: userId,
          version: review.version + 1,
          dedupeSuffix: key,
          summary: `Moderare review: ${decision.toLowerCase()}.`,
          actionUrl: `/reviews?review=${review.id}`,
        });
        return safe(row);
      },
    );
  }

  async subscriptionPlans(userId: string) {
    return this.database.withContext({ userId }, async (tx) => {
      const plans = await tx.subscriptionPlan.findMany({
        where: { status: "ACTIVE" },
        orderBy: { position: "asc" },
      });
      const products = await tx.subscriptionProduct.findMany({
        where: { id: { in: plans.map((plan) => plan.productId) } },
      });
      const prices = await tx.subscriptionPrice.findMany({
        where: {
          productId: { in: plans.map((plan) => plan.productId) },
          active: true,
        },
      });
      const entitlements = await tx.subscriptionPlanEntitlement.findMany({
        where: { planId: { in: plans.map((plan) => plan.id) } },
      });
      return {
        items: plans.map((plan) =>
          safe({
            ...plan,
            product: products.find((item) => item.id === plan.productId),
            prices: prices.filter((item) => item.productId === plan.productId),
            entitlements: entitlementMap(
              entitlements.filter((item) => item.planId === plan.id),
            ),
          }),
        ),
      };
    });
  }

  async subscription(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) =>
      safe(await this.ensureSubscription(tx, organizationId)),
    );
  }

  async entitlements(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const subscription = await this.ensureSubscription(tx, organizationId);
      const snapshot = await this.ensureEntitlementSnapshot(tx, subscription);
      return safe({
        planId: snapshot.planId,
        subscribedPlanId: subscription.planId,
        subscriptionStatus: subscription.status,
        snapshot,
      });
    });
  }

  async usage(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const [services, packages, portfolio, members] = await Promise.all([
        tx.vendorService.count({
          where: {
            vendorOrganizationId: organizationId,
            active: true,
            deletedAt: null,
          },
        }),
        tx.vendorPackage.count({
          where: {
            vendorOrganizationId: organizationId,
            active: true,
            deletedAt: null,
          },
        }),
        tx.vendorPortfolioReference.count({
          where: {
            vendorOrganizationId: organizationId,
            published: true,
            deletedAt: null,
          },
        }),
        tx.vendorOrganizationMembership.count({
          where: { vendorOrganizationId: organizationId, status: "ACTIVE" },
        }),
      ]);
      const periodEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );
      const resources = {
        MAX_ACTIVE_SERVICES: services,
        MAX_ACTIVE_PACKAGES: packages,
        MAX_PORTFOLIO_ASSETS: portfolio,
        TEAM_MEMBER_LIMIT: members,
      };
      await Promise.all(
        Object.entries(resources).map(([entitlementKey, used]) =>
          tx.vendorUsageCounter.upsert({
            where: {
              vendorOrganizationId_entitlementKey_periodStart: {
                vendorOrganizationId: organizationId,
                entitlementKey,
                periodStart: monthStart,
              },
            },
            create: {
              vendorOrganizationId: organizationId,
              entitlementKey,
              periodStart: monthStart,
              periodEnd,
              used,
            },
            update: { used, periodEnd, version: { increment: 1 } },
          }),
        ),
      );
      return {
        counters: (
          await tx.vendorUsageCounter.findMany({
            where: {
              vendorOrganizationId: organizationId,
              periodStart: monthStart,
            },
          })
        ).map(safe),
        resources: {
          activeServices: services,
          activePackages: packages,
          portfolioAssets: portfolio,
          teamMembers: members,
        },
      };
    });
  }

  async createSubscriptionCheckout(
    userId: string,
    organizationId: string,
    key: string,
    input: Input,
  ) {
    const context = await this.vendorContext(
      userId,
      organizationId,
      async (tx) => {
        const organization = await tx.vendorOrganization.findUniqueOrThrow({
          where: { id: organizationId },
        });
        const plan = await tx.subscriptionPlan.findFirst({
          where: { key: text(input.planKey, 64), status: "ACTIVE" },
        });
        if (!plan) notFound("Subscription plan not found");
        const price = await tx.subscriptionPrice.findFirst({
          where: {
            productId: plan.productId,
            active: true,
            ...(input.priceId
              ? { id: uuidValue(input.priceId, "priceId") }
              : {}),
          },
        });
        if (!price) notFound("Subscription price not found");
        const existingCheckout = await tx.subscriptionCheckout.findUnique({
          where: {
            vendorOrganizationId_createdById_idempotencyKey: {
              vendorOrganizationId: organizationId,
              createdById: userId,
              idempotencyKey: key,
            },
          },
        });
        const subscription = await this.ensureSubscription(tx, organizationId);
        const trialUsed = Boolean(
          await tx.vendorSubscriptionHistory.findFirst({
            where: {
              vendorOrganizationId: organizationId,
              eventType: "TRIAL_STARTED",
            },
            select: { id: true },
          }),
        );
        return {
          organization,
          plan,
          price,
          subscription,
          existingCheckout,
          trialUsed,
        };
      },
    );
    if (context.existingCheckout)
      return safe({
        checkout: context.existingCheckout,
        subscription: context.subscription,
      });
    const customer = context.subscription.providerCustomerId
      ? { providerCustomerId: context.subscription.providerCustomerId }
      : await this.subscriptionProvider.createCustomer({
          organizationId,
          email: context.organization.contactEmail,
        });
    const checkoutId = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const providerCheckout = await this.subscriptionProvider.createCheckout({
      checkoutId,
      customerId: customer.providerCustomerId,
      priceId: context.price.providerPriceId ?? context.price.id,
      expiresAt,
    });
    return this.vendorContext(userId, organizationId, async (tx) => {
      const now = new Date();
      const trialEnd =
        context.price.trialDays > 0 && !context.trialUsed
          ? new Date(now.getTime() + context.price.trialDays * 86_400_000)
          : null;
      const periodEnd = new Date(now.getTime() + 30 * 86_400_000);
      const subscription = await tx.vendorSubscription.update({
        where: { id: context.subscription.id },
        data: {
          planId: context.plan.id,
          priceId: context.price.id,
          provider: this.environment.SUBSCRIPTION_PROVIDER,
          providerCustomerId: customer.providerCustomerId,
          providerSubscriptionId: `fake-subscription-${context.subscription.id}`,
          status: trialEnd ? "TRIALING" : "ACTIVE",
          trialStartAt: trialEnd ? now : null,
          trialEndAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          version: { increment: 1 },
        },
      });
      const checkout = await tx.subscriptionCheckout.create({
        data: {
          id: checkoutId,
          vendorOrganizationId: organizationId,
          planId: context.plan.id,
          priceId: context.price.id,
          provider: this.environment.SUBSCRIPTION_PROVIDER,
          providerCheckoutId: providerCheckout.providerCheckoutId,
          hostedUrl: providerCheckout.url,
          status: "COMPLETED",
          expiresAt,
          createdById: userId,
          idempotencyKey: key,
        },
      });
      await this.replaceEntitlementSnapshot(tx, subscription);
      await tx.vendorSubscriptionPeriod.upsert({
        where: {
          subscriptionId_startsAt_endsAt: {
            subscriptionId: subscription.id,
            startsAt: now,
            endsAt: periodEnd,
          },
        },
        create: {
          vendorOrganizationId: organizationId,
          subscriptionId: subscription.id,
          startsAt: now,
          endsAt: periodEnd,
          statusSnapshot: subscription.status,
        },
        update: { statusSnapshot: subscription.status },
      });
      await tx.vendorSubscriptionHistory.create({
        data: {
          vendorOrganizationId: organizationId,
          subscriptionId: subscription.id,
          eventType: trialEnd ? "TRIAL_STARTED" : "ACTIVATED",
          statusFrom: context.subscription.status,
          statusTo: subscription.status,
          sourceType: "SUBSCRIPTION_CHECKOUT",
          sourceId: checkout.id,
        },
      });
      await this.emit(tx, {
        event: "subscription.checkout_created.v1",
        aggregateType: "VendorSubscription",
        aggregateId: subscription.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: subscription.version,
        dedupeSuffix: key,
        summary: "Checkout-ul abonamentului a fost creat.",
        actionUrl: "/vendor/billing",
      });
      await this.emit(tx, {
        event: trialEnd
          ? "subscription.trial_started.v1"
          : "subscription.activated.v1",
        aggregateType: "VendorSubscription",
        aggregateId: subscription.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: subscription.version,
        dedupeSuffix: checkout.id,
        summary: trialEnd
          ? "Perioada de trial a început."
          : "Abonamentul este activ.",
        actionUrl: "/vendor/billing",
      });
      return safe({ checkout, subscription });
    });
  }

  async createPortalSession(
    userId: string,
    organizationId: string,
    key: string,
  ) {
    const subscription = await this.vendorContext(
      userId,
      organizationId,
      (tx) => this.ensureSubscription(tx, organizationId),
    );
    if (!subscription.providerCustomerId)
      problem(
        "FEATURE_DISABLED",
        HttpStatus.CONFLICT,
        "Subscription has no provider customer",
      );
    return this.subscriptionProvider.createPortalSession({
      customerId: subscription.providerCustomerId,
      returnPath: "/vendor/billing",
      idempotencyKey: key,
    });
  }

  async cancelSubscription(
    userId: string,
    organizationId: string,
    version: number,
    key: string,
  ) {
    const subscription = await this.vendorContext(
      userId,
      organizationId,
      (tx) => this.ensureSubscription(tx, organizationId),
    );
    if (subscription.cancelAtPeriodEnd) return safe(subscription);
    assertVersion(subscription.version, version);
    if (subscription.providerSubscriptionId)
      await this.subscriptionProvider.cancelSubscription({
        providerSubscriptionId: subscription.providerSubscriptionId,
        atPeriodEnd: true,
      });
    return this.vendorContext(userId, organizationId, async (tx) => {
      const updated = await tx.vendorSubscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.emit(tx, {
        event: "subscription.cancelled.v1",
        aggregateType: "VendorSubscription",
        aggregateId: updated.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: updated.version,
        dedupeSuffix: key,
        summary: "Abonamentul se va opri la finalul perioadei.",
        actionUrl: "/vendor/billing",
      });
      return safe(updated);
    });
  }

  async resumeSubscription(
    userId: string,
    organizationId: string,
    version: number,
    key: string,
  ) {
    const subscription = await this.vendorContext(
      userId,
      organizationId,
      (tx) => this.ensureSubscription(tx, organizationId),
    );
    if (!subscription.cancelAtPeriodEnd && subscription.status !== "CANCELLED")
      return safe(subscription);
    assertVersion(subscription.version, version);
    if (subscription.providerSubscriptionId)
      await this.subscriptionProvider.resumeSubscription(
        subscription.providerSubscriptionId,
      );
    return this.vendorContext(userId, organizationId, async (tx) => {
      const updated = await tx.vendorSubscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          status:
            subscription.status === "CANCELLED"
              ? "ACTIVE"
              : subscription.status,
          version: { increment: 1 },
        },
      });
      await this.emit(tx, {
        event: "subscription.resumed.v1",
        aggregateType: "VendorSubscription",
        aggregateId: updated.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: updated.version,
        dedupeSuffix: key,
        summary: "Abonamentul a fost reluat.",
        actionUrl: "/vendor/billing",
      });
      return safe(updated);
    });
  }

  async subscriptionWebhook(
    provider: string,
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    if (provider !== this.environment.SUBSCRIPTION_PROVIDER)
      problem(
        "SUBSCRIPTION_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Unknown subscription provider",
      );
    const event = this.subscriptionProvider.verifyWebhook(
      rawBody,
      signature,
      timestamp,
    );
    const customerId = optionalString(event.data.customerId);
    const providerSubscriptionId = optionalString(event.data.subscriptionId);
    await this.insertSubscriptionEvent(
      provider,
      event,
      customerId,
      providerSubscriptionId,
    );
    const context = await this.database.$queryRaw<
      Array<{
        vendor_organization_id: string;
        subscription_id: string;
        actor_user_id: string;
      }>
    >`
      SELECT * FROM public.weddingos_resolve_subscription_provider_actor(${provider}, ${customerId}, ${providerSubscriptionId})
    `;
    const resolved = context[0];
    if (!resolved)
      problem(
        "SUBSCRIPTION_EVENT_INVALID",
        HttpStatus.NOT_FOUND,
        "Subscription provider context not found",
      );
    let replay = false;
    await this.database.withContext(
      {
        userId: resolved.actor_user_id,
        vendorOrganizationId: resolved.vendor_organization_id,
      },
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-event:${provider}:${event.id}`}))`;
        const providerEvent = await tx.subscriptionProviderEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider,
              providerEventId: event.id,
            },
          },
        });
        if (!providerEvent)
          problem(
            "SUBSCRIPTION_EVENT_INVALID",
            HttpStatus.NOT_FOUND,
            "Persisted subscription event not found",
          );
        if (providerEvent.payloadHash !== event.payloadHash)
          problem(
            "SUBSCRIPTION_EVENT_INVALID",
            HttpStatus.CONFLICT,
            "Provider event identifier was reused with a different payload",
          );
        if (providerEvent.status === "PROCESSED") {
          replay = true;
          return;
        }
        await tx.subscriptionProviderEvent.update({
          where: { id: providerEvent.id },
          data: { status: "PROCESSING" },
        });
        const current = await tx.vendorSubscription.findUniqueOrThrow({
          where: { id: resolved.subscription_id },
        });
        const newerProcessedEvent =
          await tx.subscriptionProviderEvent.findFirst({
            where: {
              id: { not: providerEvent.id },
              status: "PROCESSED",
              occurredAt: { gt: providerEvent.occurredAt },
              OR: [
                ...(providerEvent.providerSubscriptionId
                  ? [
                      {
                        providerSubscriptionId:
                          providerEvent.providerSubscriptionId,
                      },
                    ]
                  : []),
                ...(providerEvent.providerCustomerId
                  ? [
                      {
                        providerCustomerId: providerEvent.providerCustomerId,
                      },
                    ]
                  : []),
              ],
            },
            select: { id: true },
          });
        if (newerProcessedEvent) {
          await tx.subscriptionProviderEvent.update({
            where: { id: providerEvent.id },
            data: { status: "PROCESSED", processedAt: new Date() },
          });
          return;
        }
        const mapped = mapSubscriptionEvent(event.type, current.status);
        const now = new Date();
        const periodStart = dateValue(event.data.periodStart);
        const periodEnd = dateValue(event.data.periodEnd);
        const updated = await tx.vendorSubscription.update({
          where: { id: current.id },
          data: {
            status: mapped.status,
            gracePeriodEndAt:
              mapped.status === "PAST_DUE"
                ? new Date(
                    now.getTime() +
                      this.environment.SUBSCRIPTION_GRACE_PERIOD_DAYS *
                        86_400_000,
                  )
                : ["ACTIVE", "TRIALING"].includes(mapped.status)
                  ? null
                  : current.gracePeriodEndAt,
            currentPeriodStart: periodStart ?? current.currentPeriodStart,
            currentPeriodEnd: periodEnd ?? current.currentPeriodEnd,
            cancelAtPeriodEnd:
              mapped.status === "CANCELLED" ? true : current.cancelAtPeriodEnd,
            version: { increment: 1 },
          },
        });
        const invoiceId = optionalString(event.data.invoiceId);
        if (invoiceId) {
          const amountDueMinor = nonnegativeInteger(
            event.data.amountDueMinor ?? 0,
            "amountDueMinor",
          );
          const amountPaidMinor = nonnegativeInteger(
            event.data.amountPaidMinor ??
              (event.type === "invoice.paid" ? amountDueMinor : 0),
            "amountPaidMinor",
          );
          await tx.subscriptionInvoiceRecord.upsert({
            where: { providerInvoiceId: invoiceId },
            create: {
              vendorOrganizationId: resolved.vendor_organization_id,
              subscriptionId: current.id,
              providerInvoiceId: invoiceId,
              amountDueMinor: BigInt(amountDueMinor),
              amountPaidMinor: BigInt(amountPaidMinor),
              currency: currencyValue(event.data.currency ?? "RON"),
              status: event.type === "invoice.paid" ? "PAID" : "FAILED",
              periodStart,
              periodEnd,
              providerMetadataRedacted: {
                eventType: event.type,
                provider,
              },
            },
            update: {
              amountDueMinor: BigInt(amountDueMinor),
              amountPaidMinor: BigInt(amountPaidMinor),
              status: event.type === "invoice.paid" ? "PAID" : "FAILED",
              periodStart,
              periodEnd,
              providerMetadataRedacted: {
                eventType: event.type,
                provider,
              },
            },
          });
        }
        if (periodStart && periodEnd && periodStart < periodEnd)
          await tx.vendorSubscriptionPeriod.upsert({
            where: {
              subscriptionId_startsAt_endsAt: {
                subscriptionId: current.id,
                startsAt: periodStart,
                endsAt: periodEnd,
              },
            },
            create: {
              vendorOrganizationId: resolved.vendor_organization_id,
              subscriptionId: current.id,
              startsAt: periodStart,
              endsAt: periodEnd,
              statusSnapshot: updated.status,
              providerInvoiceId: invoiceId,
            },
            update: {
              statusSnapshot: updated.status,
              providerInvoiceId: invoiceId,
            },
          });
        await tx.subscriptionProviderEvent.update({
          where: { id: providerEvent.id },
          data: { status: "PROCESSED", processedAt: now },
        });
        await tx.vendorSubscriptionHistory.create({
          data: {
            vendorOrganizationId: resolved.vendor_organization_id,
            subscriptionId: current.id,
            eventType: event.type,
            statusFrom: current.status,
            statusTo: updated.status,
            sourceType: "PROVIDER_EVENT",
            sourceId: event.id,
          },
        });
        if (updated.status !== current.status)
          await this.replaceEntitlementSnapshot(tx, updated);
        await this.emit(tx, {
          event: mapped.event,
          aggregateType: "VendorSubscription",
          aggregateId: updated.id,
          vendorOrganizationId: resolved.vendor_organization_id,
          actorUserId: resolved.actor_user_id,
          version: updated.version,
          dedupeSuffix: event.id,
          summary: `Abonament: ${updated.status.toLowerCase()}.`,
          actionUrl: "/vendor/billing",
        });
      },
    );
    return { accepted: true, replay };
  }

  async payoutAccount(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) =>
      safe(
        await tx.vendorPayoutAccount.findUnique({
          where: { vendorOrganizationId: organizationId },
        }),
      ),
    );
  }

  async createPayoutAccount(
    userId: string,
    organizationId: string,
    key: string,
    input: Input,
  ) {
    const existing = await this.vendorContext(userId, organizationId, (tx) =>
      tx.vendorPayoutAccount.findUnique({
        where: { vendorOrganizationId: organizationId },
      }),
    );
    if (existing) return safe(existing);
    const country = text(input.country ?? "RO", 2).toUpperCase();
    const currency = currencyValue(input.currency ?? "RON");
    const provider = await this.payoutProvider.createAccount({
      organizationId,
      country,
      currency,
    });
    return this.vendorContext(userId, organizationId, async (tx) => {
      const account = await tx.vendorPayoutAccount.create({
        data: {
          vendorOrganizationId: organizationId,
          provider: this.environment.PAYOUT_PROVIDER,
          providerAccountId: provider.providerAccountId,
          status: "PENDING",
          country,
          defaultCurrency: currency,
        },
      });
      await this.emit(tx, {
        event: "payout.account_created.v1",
        aggregateType: "VendorPayoutAccount",
        aggregateId: account.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: account.version,
        dedupeSuffix: key,
        summary: "Contul de payout a fost creat la provider.",
        actionUrl: "/vendor/payouts",
      });
      return safe(account);
    });
  }

  async createPayoutOnboarding(
    userId: string,
    organizationId: string,
    key: string,
  ) {
    const account = await this.vendorContext(
      userId,
      organizationId,
      async (tx) => {
        const row = await tx.vendorPayoutAccount.findUnique({
          where: { vendorOrganizationId: organizationId },
        });
        if (!row)
          problem(
            "PAYOUT_ACCOUNT_NOT_READY",
            HttpStatus.CONFLICT,
            "Create payout account first",
          );
        const replay = await tx.vendorPayoutOnboardingSession.findUnique({
          where: {
            vendorOrganizationId_createdById_idempotencyKey: {
              vendorOrganizationId: organizationId,
              createdById: userId,
              idempotencyKey: key,
            },
          },
        });
        return { row, replay };
      },
    );
    if (account.replay) return safe(account.replay);
    const sessionId = randomUUID();
    const link = await this.payoutProvider.createOnboardingLink({
      accountId: account.row.providerAccountId,
      sessionId,
    });
    const providerState = await this.payoutProvider.getAccount(
      account.row.providerAccountId,
    );
    return this.vendorContext(userId, organizationId, async (tx) => {
      const session = await tx.vendorPayoutOnboardingSession.create({
        data: {
          id: sessionId,
          vendorOrganizationId: organizationId,
          payoutAccountId: account.row.id,
          providerLinkId: link.providerLinkId,
          hostedUrl: link.url,
          status: providerState.status === "ACTIVE" ? "COMPLETED" : "OPEN",
          expiresAt: new Date(link.expiresAt),
          createdById: userId,
          idempotencyKey: key,
          completedAt: providerState.status === "ACTIVE" ? new Date() : null,
        },
      });
      const updated = await tx.vendorPayoutAccount.update({
        where: { id: account.row.id },
        data: {
          status: providerState.status,
          chargesEnabled: providerState.chargesEnabled,
          payoutsEnabled: providerState.payoutsEnabled,
          detailsSubmitted: providerState.detailsSubmitted,
          requirementsDue: providerState.requirementsDue,
          version: { increment: 1 },
        },
      });
      if (updated.status === "ACTIVE")
        await this.emit(tx, {
          event: "payout.onboarding_completed.v1",
          aggregateType: "VendorPayoutAccount",
          aggregateId: updated.id,
          vendorOrganizationId: organizationId,
          actorUserId: userId,
          version: updated.version,
          dedupeSuffix: session.id,
          summary: "Onboardingul pentru payout este complet.",
          actionUrl: "/vendor/payouts",
        });
      return safe({ ...session, account: updated });
    });
  }

  async balance(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      await this.syncAllocations(tx, userId, organizationId);
      return this.balanceTx(tx, organizationId);
    });
  }

  async settlements(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => ({
      items: (
        await tx.vendorSettlement.findMany({
          where: { vendorOrganizationId: organizationId },
          orderBy: { createdAt: "desc" },
        })
      ).map(safe),
    }));
  }

  async settlement(
    userId: string,
    organizationId: string,
    settlementId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const row = await tx.vendorSettlement.findFirst({
        where: { id: settlementId, vendorOrganizationId: organizationId },
      });
      if (!row) notFound("Settlement not found");
      const lines = await tx.vendorSettlementLine.findMany({
        where: { settlementId },
      });
      return safe({ ...row, lines });
    });
  }

  async payouts(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => ({
      items: (
        await tx.vendorPayout.findMany({
          where: { vendorOrganizationId: organizationId },
          orderBy: { requestedAt: "desc" },
        })
      ).map(safe),
    }));
  }

  async payout(userId: string, organizationId: string, payoutId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const row = await tx.vendorPayout.findFirst({
        where: { id: payoutId, vendorOrganizationId: organizationId },
      });
      if (!row) notFound("Payout not found");
      return safe({
        ...row,
        attempts: await tx.vendorPayoutAttempt.findMany({
          where: { payoutId },
          orderBy: { attemptNumber: "asc" },
        }),
      });
    });
  }

  async calculateSettlement(
    userId: string,
    organizationId: string,
    key: string,
    input: Input,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${organizationId}`}))`;
      const replay = await tx.vendorSettlement.findUnique({
        where: {
          vendorOrganizationId_idempotencyKey: {
            vendorOrganizationId: organizationId,
            idempotencyKey: key,
          },
        },
      });
      if (replay) return safe(replay);
      await this.syncAllocations(tx, userId, organizationId);
      const account = await tx.vendorPayoutAccount.findUnique({
        where: { vendorOrganizationId: organizationId },
      });
      if (!account || account.status !== "ACTIVE" || !account.payoutsEnabled)
        problem(
          "PAYOUT_ACCOUNT_NOT_READY",
          HttpStatus.CONFLICT,
          "Payout account is not active",
        );
      const currency = currencyValue(input.currency ?? account.defaultCurrency);
      const periodEnd = dateValue(input.periodEnd) ?? new Date();
      const periodStart =
        dateValue(input.periodStart) ??
        new Date(periodEnd.getTime() - 31 * 86_400_000);
      const entries = await tx.vendorPayableEntry.findMany({
        where: {
          vendorOrganizationId: organizationId,
          currency,
          status: "CONFIRMED",
          availableAt: { lte: periodEnd },
        },
        orderBy: { createdAt: "asc" },
      });
      const settledIds = new Set(
        (
          await tx.vendorSettlementLine.findMany({
            select: { payableEntryId: true },
          })
        ).map((line) => line.payableEntryId),
      );
      const eligible = entries.filter((entry) => !settledIds.has(entry.id));
      const net = eligible.reduce(
        (sum, entry) =>
          sum + payableEntrySign(entry.entryType) * Number(entry.amountMinor),
        0,
      );
      if (net < this.environment.PAYOUT_MINIMUM_MINOR)
        problem(
          "SETTLEMENT_NOT_PAYABLE",
          HttpStatus.CONFLICT,
          "Eligible balance is below payout threshold",
        );
      const settlement = await tx.vendorSettlement.create({
        data: {
          vendorOrganizationId: organizationId,
          payoutAccountId: account.id,
          currency,
          periodStart,
          periodEnd,
          grossMinor: sumType(eligible, "PAYMENT_EARNED"),
          platformFeeMinor: sumType(eligible, "PLATFORM_FEE"),
          refundMinor: sumType(eligible, "REFUND_ADJUSTMENT"),
          disputeHoldMinor: sumType(eligible, "DISPUTE_HOLD"),
          reserveMinor: sumType(eligible, "RESERVE_HOLD"),
          netPayoutMinor: BigInt(net),
          status: "READY",
          idempotencyKey: key,
        },
      });
      await tx.vendorSettlementLine.createMany({
        data: eligible.map((entry) => ({
          settlementId: settlement.id,
          allocationId: entry.allocationId,
          payableEntryId: entry.id,
          amountMinor: entry.amountMinor,
          currency,
        })),
      });
      await this.emit(tx, {
        event: "payout.settlement_created.v1",
        aggregateType: "VendorSettlement",
        aggregateId: settlement.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: settlement.version,
        dedupeSuffix: key,
        summary: "Settlement-ul a fost calculat.",
        actionUrl: `/vendor/payouts?settlement=${settlement.id}`,
      });
      return safe(settlement);
    });
  }

  async finalizeSettlement(
    userId: string,
    organizationId: string,
    settlementId: string,
    version: number,
    key: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const row = await tx.vendorSettlement.findFirst({
        where: { id: settlementId, vendorOrganizationId: organizationId },
      });
      if (!row) notFound("Settlement not found");
      if (["FINALIZED", "PAYOUT_PENDING", "PAID"].includes(row.status))
        return safe(row);
      assertVersion(row.version, version);
      if (row.status !== "READY")
        problem(
          "SETTLEMENT_NOT_PAYABLE",
          HttpStatus.CONFLICT,
          "Settlement is not ready",
        );
      const updated = await tx.vendorSettlement.update({
        where: { id: row.id },
        data: {
          status: "FINALIZED",
          finalizedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.emit(tx, {
        event: "payout.settlement_finalized.v1",
        aggregateType: "VendorSettlement",
        aggregateId: updated.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: updated.version,
        dedupeSuffix: key,
        summary: "Settlement-ul a fost finalizat și este imuabil.",
        actionUrl: `/vendor/payouts?settlement=${updated.id}`,
      });
      return safe(updated);
    });
  }

  async createPayout(
    userId: string,
    organizationId: string,
    settlementId: string,
    key: string,
  ) {
    const reserved = await this.vendorContext(
      userId,
      organizationId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${settlementId}`}))`;
        const existing = await tx.vendorPayout.findUnique({
          where: { settlementId },
        });
        if (existing) {
          const attempts = await tx.vendorPayoutAttempt.findMany({
            where: { payoutId: existing.id },
            orderBy: { attemptNumber: "desc" },
          });
          const keyedAttempt = attempts.find(
            (attempt) => attempt.idempotencyKey === key,
          );
          if (existing.status === "FAILED" && keyedAttempt)
            return { payout: existing, replay: true as const };
          if (
            !["REQUESTED", "FAILED"].includes(existing.status) ||
            (existing.status === "REQUESTED" && existing.providerPayoutId)
          )
            return { payout: existing, replay: true as const };
          const account = await tx.vendorPayoutAccount.findFirst({
            where: {
              id: existing.payoutAccountId,
              vendorOrganizationId: organizationId,
              status: "ACTIVE",
              payoutsEnabled: true,
            },
          });
          if (!account)
            problem(
              "PAYOUT_ACCOUNT_NOT_READY",
              HttpStatus.CONFLICT,
              "Payout account no longer exists",
            );
          if (existing.status === "FAILED") {
            const attemptNumber = (attempts[0]?.attemptNumber ?? 0) + 1;
            await tx.vendorPayoutAttempt.create({
              data: {
                payoutId: existing.id,
                attemptNumber,
                status: "REQUESTED",
                idempotencyKey: key,
              },
            });
            const payout = await tx.vendorPayout.update({
              where: { id: existing.id },
              data: {
                providerPayoutId: null,
                status: "REQUESTED",
                failureCode: null,
                failureMessageRedacted: null,
                processingAt: null,
                failedAt: null,
                version: { increment: 1 },
              },
            });
            await tx.vendorSettlement.update({
              where: { id: existing.settlementId },
              data: { status: "PAYOUT_PENDING", version: { increment: 1 } },
            });
            await this.emit(tx, {
              event: "payout.requested.v1",
              aggregateType: "VendorPayout",
              aggregateId: payout.id,
              vendorOrganizationId: organizationId,
              actorUserId: userId,
              version: payout.version,
              dedupeSuffix: key,
              summary: `Payout retry ${attemptNumber} solicitat.`,
              actionUrl: `/vendor/payouts?payout=${payout.id}`,
            });
            return {
              payout,
              account,
              attemptNumber,
              replay: false as const,
            };
          }
          return {
            payout: existing,
            account,
            attemptNumber: attempts[0]?.attemptNumber ?? 1,
            replay: false as const,
          };
        }
        const settlement = await tx.vendorSettlement.findFirst({
          where: {
            id: settlementId,
            vendorOrganizationId: organizationId,
            status: "FINALIZED",
          },
        });
        if (!settlement)
          problem(
            "SETTLEMENT_NOT_PAYABLE",
            HttpStatus.CONFLICT,
            "Settlement is not finalized",
          );
        const account = await tx.vendorPayoutAccount.findFirst({
          where: {
            id: settlement.payoutAccountId,
            vendorOrganizationId: organizationId,
            status: "ACTIVE",
            payoutsEnabled: true,
          },
        });
        if (!account)
          problem(
            "PAYOUT_ACCOUNT_NOT_READY",
            HttpStatus.CONFLICT,
            "Payout account is not active",
          );
        const payout = await tx.vendorPayout.create({
          data: {
            vendorOrganizationId: organizationId,
            settlementId,
            payoutAccountId: account.id,
            provider: this.environment.PAYOUT_PROVIDER,
            currency: settlement.currency,
            amountMinor: settlement.netPayoutMinor,
            status: "REQUESTED",
            idempotencyKey: key,
          },
        });
        await tx.vendorPayoutAttempt.create({
          data: {
            payoutId: payout.id,
            attemptNumber: 1,
            status: "REQUESTED",
            idempotencyKey: key,
          },
        });
        await tx.vendorSettlement.update({
          where: { id: settlement.id },
          data: { status: "PAYOUT_PENDING", version: { increment: 1 } },
        });
        await this.emit(tx, {
          event: "payout.requested.v1",
          aggregateType: "VendorPayout",
          aggregateId: payout.id,
          vendorOrganizationId: organizationId,
          actorUserId: userId,
          version: payout.version,
          dedupeSuffix: key,
          summary: "Payout solicitat providerului configurat.",
          actionUrl: `/vendor/payouts?payout=${payout.id}`,
        });
        return { payout, account, attemptNumber: 1, replay: false as const };
      },
    );
    if (reserved.replay) return safe(reserved.payout);
    const result = await this.payoutProvider.createPayout({
      payoutId: reserved.payout.id,
      accountId: reserved.account.providerAccountId,
      amountMinor: Number(reserved.payout.amountMinor),
      currency: reserved.payout.currency,
    });
    return this.vendorContext(userId, organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${reserved.payout.id}`}))`;
      const current = await tx.vendorPayout.findUnique({
        where: { id: reserved.payout.id },
      });
      if (!current)
        problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Payout not found");
      if (current.status !== "REQUESTED" || current.providerPayoutId)
        return safe(current);
      const status = result.status;
      const updated = await tx.vendorPayout.update({
        where: { id: reserved.payout.id },
        data: {
          providerPayoutId: result.providerPayoutId,
          status,
          processingAt: status === "PROCESSING" ? new Date() : null,
          paidAt: status === "PAID" ? new Date() : null,
          failedAt: status === "FAILED" ? new Date() : null,
          failureCode: status === "FAILED" ? "PROVIDER_FAILED" : null,
          version: { increment: 1 },
        },
      });
      await tx.vendorPayoutAttempt.update({
        where: {
          payoutId_attemptNumber: {
            payoutId: updated.id,
            attemptNumber: reserved.attemptNumber,
          },
        },
        data: {
          providerAttemptId: `${result.providerPayoutId}:${reserved.attemptNumber}`,
          status,
          completedAt: status === "PROCESSING" ? null : new Date(),
        },
      });
      if (status === "PAID") {
        await tx.vendorPayableEntry.create({
          data: {
            vendorOrganizationId: organizationId,
            entryType: "PAYOUT",
            amountMinor: updated.amountMinor,
            currency: updated.currency,
            sourceType: "VENDOR_PAYOUT",
            sourceId: updated.id,
            availableAt: new Date(),
          },
        });
        await tx.vendorSettlement.update({
          where: { id: updated.settlementId },
          data: { status: "PAID" },
        });
      } else if (status === "FAILED")
        await tx.vendorSettlement.update({
          where: { id: updated.settlementId },
          data: { status: "FAILED" },
        });
      await this.emit(tx, {
        event:
          status === "PAID"
            ? "payout.paid.v1"
            : status === "FAILED"
              ? "payout.failed.v1"
              : "payout.processing.v1",
        aggregateType: "VendorPayout",
        aggregateId: updated.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        version: updated.version,
        dedupeSuffix: key,
        summary: `Payout: ${status.toLowerCase()}.`,
        actionUrl: `/vendor/payouts?payout=${updated.id}`,
      });
      return safe(updated);
    });
  }

  async payoutWebhook(
    provider: string,
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    if (provider !== this.environment.PAYOUT_PROVIDER)
      problem(
        "PAYOUT_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Unknown payout provider",
      );
    const event = this.payoutProvider.verifyWebhook(
      rawBody,
      signature,
      timestamp,
    );
    const accountId = optionalString(event.data.accountId);
    const providerPayoutId = optionalString(event.data.payoutId);
    await this.insertPayoutEvent(provider, event, accountId, providerPayoutId);
    const context = await this.database.$queryRaw<
      Array<{
        vendor_organization_id: string;
        payout_account_id: string;
        payout_id: string | null;
        actor_user_id: string;
      }>
    >`
      SELECT * FROM public.weddingos_resolve_payout_provider_actor(${provider}, ${accountId}, ${providerPayoutId})
    `;
    const resolved = context[0];
    if (!resolved)
      problem(
        "PAYOUT_EVENT_INVALID",
        HttpStatus.NOT_FOUND,
        "Payout provider context not found",
      );
    let replay = false;
    await this.database.withContext(
      {
        userId: resolved.actor_user_id,
        vendorOrganizationId: resolved.vendor_organization_id,
      },
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout-event:${provider}:${event.id}`}))`;
        const providerEvent = await tx.payoutProviderEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider,
              providerEventId: event.id,
            },
          },
        });
        if (!providerEvent)
          problem(
            "PAYOUT_EVENT_INVALID",
            HttpStatus.NOT_FOUND,
            "Persisted payout event not found",
          );
        if (providerEvent.payloadHash !== event.payloadHash)
          problem(
            "PAYOUT_EVENT_INVALID",
            HttpStatus.CONFLICT,
            "Provider event identifier was reused with a different payload",
          );
        if (providerEvent.status === "PROCESSED") {
          replay = true;
          return;
        }
        await tx.payoutProviderEvent.update({
          where: { id: providerEvent.id },
          data: { status: "PROCESSING" },
        });
        if (event.type === "account.updated") {
          const state = await this.payoutProvider.getAccount(accountId!);
          await tx.vendorPayoutAccount.update({
            where: { id: resolved.payout_account_id },
            data: {
              status: state.status,
              chargesEnabled: state.chargesEnabled,
              payoutsEnabled: state.payoutsEnabled,
              detailsSubmitted: state.detailsSubmitted,
              requirementsDue: state.requirementsDue,
              version: { increment: 1 },
            },
          });
        }
        if (resolved.payout_id)
          await this.applyPayoutEvent(
            tx,
            resolved.vendor_organization_id,
            resolved.actor_user_id,
            resolved.payout_id,
            event.type,
            event.id,
          );
        await tx.payoutProviderEvent.update({
          where: { id: providerEvent.id },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
      },
    );
    return { accepted: true, replay };
  }

  async vendorOverview(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      await this.syncAllocations(tx, userId, organizationId);
      const subscription = await this.ensureSubscription(tx, organizationId);
      const publishedReviews = await tx.vendorReview.findMany({
        where: { vendorOrganizationId: organizationId, status: "PUBLISHED" },
        select: { id: true },
      });
      const repliedReviewIds = new Set(
        (
          await tx.vendorReviewReply.findMany({
            where: { vendorOrganizationId: organizationId },
            select: { reviewId: true },
          })
        ).map((reply) => reply.reviewId),
      );
      const [summary, disputesOpen, balance, failedPayouts] = await Promise.all(
        [
          this.ratingSummaryTx(tx, organizationId),
          tx.vendorReviewDispute.count({
            where: {
              vendorOrganizationId: organizationId,
              status: { in: ["OPEN", "EVIDENCE_REQUESTED", "UNDER_REVIEW"] },
            },
          }),
          this.balanceTx(tx, organizationId),
          tx.vendorPayout.count({
            where: { vendorOrganizationId: organizationId, status: "FAILED" },
          }),
        ],
      );
      const awaitingReply = publishedReviews.filter(
        (review) => !repliedReviewIds.has(review.id),
      ).length;
      return safe({
        reviews: {
          averageScaled: summary.overallAverageScaled,
          publishedCount: summary.publishedReviewCount,
          awaitingReply,
          disputesOpen,
        },
        subscription: {
          planKey:
            (
              await tx.subscriptionPlan.findUnique({
                where: { id: subscription.planId },
              })
            )?.key ?? "FREE",
          status: subscription.status,
          trialEndsAt: subscription.trialEndAt,
          currentPeriodEndsAt: subscription.currentPeriodEnd,
          gracePeriodEndsAt: subscription.gracePeriodEndAt,
        },
        payouts: { ...balance, failedPayouts },
      });
    });
  }

  async vendorSearch(userId: string, organizationId: string, rawQuery: string) {
    const query = rawQuery.trim();
    if (query.length < 2) return { items: [] };
    return this.vendorContext(userId, organizationId, async (tx) => {
      const membership = await tx.vendorOrganizationMembership.findFirstOrThrow(
        {
          where: {
            vendorOrganizationId: organizationId,
            userId,
            status: "ACTIVE",
          },
        },
      );
      const [role, overrides] = await Promise.all([
        tx.vendorRoleTemplate.findUniqueOrThrow({
          where: { id: membership.roleTemplateId },
        }),
        tx.vendorMembershipCapabilityOverride.findMany({
          where: { membershipId: membership.id },
        }),
      ]);
      const capabilities = new Set(
        Array.isArray(role.capabilities) ? role.capabilities.map(String) : [],
      );
      for (const override of overrides) {
        if (override.effect === "ALLOW") capabilities.add(override.capability);
        else capabilities.delete(override.capability);
      }
      const items: Array<Record<string, unknown>> = [];
      if (capabilities.has("vendor.review.read")) {
        const reviews = await tx.vendorReview.findMany({
          where: { vendorOrganizationId: organizationId },
          select: { id: true, status: true },
        });
        const versions = reviews.length
          ? await tx.vendorReviewVersion.findMany({
              where: {
                reviewId: { in: reviews.map((review) => review.id) },
                OR: [
                  { title: { contains: query, mode: "insensitive" } },
                  { body: { contains: query, mode: "insensitive" } },
                ],
              },
              orderBy: { createdAt: "desc" },
              take: 8,
            })
          : [];
        for (const version of versions) {
          const review = reviews.find((row) => row.id === version.reviewId);
          items.push({
            id: version.reviewId,
            type: "REVIEW",
            title: version.title,
            subtitle: `Review ${String(review?.status ?? "draft").toLowerCase()}`,
            actionUrl: `/vendor/reviews?organization=${organizationId}&review=${version.reviewId}`,
          });
        }
        const disputes = await tx.vendorReviewDispute.findMany({
          where: {
            vendorOrganizationId: organizationId,
            reason: { contains: query, mode: "insensitive" },
          },
          orderBy: { openedAt: "desc" },
          take: 6,
        });
        for (const dispute of disputes)
          items.push({
            id: dispute.id,
            type: "REVIEW_DISPUTE",
            title: `Contestație ${dispute.status.toLowerCase()}`,
            subtitle: dispute.reason,
            actionUrl: `/vendor/reviews?organization=${organizationId}&review=${dispute.reviewId}`,
          });
      }
      if (capabilities.has("vendor.subscription.read")) {
        const subscription = await this.ensureSubscription(tx, organizationId);
        const plans = await tx.subscriptionPlan.findMany({
          where: {
            status: "ACTIVE",
            OR: [
              { key: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          },
          orderBy: { position: "asc" },
          take: 8,
        });
        const currentPlan = await tx.subscriptionPlan.findUnique({
          where: { id: subscription.planId },
        });
        if (
          [subscription.status, currentPlan?.key, currentPlan?.name]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(query.toLowerCase()),
            )
        )
          items.push({
            id: subscription.id,
            type: "VENDOR_SUBSCRIPTION",
            title: `Abonament ${currentPlan?.name ?? "Vendor OS"}`,
            subtitle: subscription.status.toLowerCase(),
            actionUrl: `/vendor/billing?organization=${organizationId}`,
          });
        for (const plan of plans)
          if (plan.id !== currentPlan?.id)
            items.push({
              id: plan.id,
              type: "SUBSCRIPTION_PLAN",
              title: plan.name,
              subtitle: plan.description,
              actionUrl: `/vendor/billing?organization=${organizationId}`,
            });
      }
      return { items: items.slice(0, 20) };
    });
  }

  async platformSettlements(userId: string) {
    return this.platformContext(
      userId,
      "platform.settlement.read",
      async (tx) => ({
        items: (
          await tx.vendorSettlement.findMany({ orderBy: { createdAt: "desc" } })
        ).map(safe),
      }),
    );
  }

  async platformProducts(userId: string) {
    return this.platformContext(
      userId,
      "platform.subscription.read",
      async (tx) => ({
        items: (
          await tx.subscriptionProduct.findMany({
            orderBy: { createdAt: "asc" },
          })
        ).map(safe),
      }),
    );
  }

  async platformPrices(userId: string) {
    return this.platformContext(
      userId,
      "platform.subscription.read",
      async (tx) => ({
        items: (
          await tx.subscriptionPrice.findMany({ orderBy: { createdAt: "asc" } })
        ).map(safe),
      }),
    );
  }

  async createPlatformProduct(userId: string, key: string, input: Input) {
    return this.platformContext(
      userId,
      "platform.subscription.write_plans",
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-product:${key}`}))`;
        const productKey = text(input.key, 80).toLowerCase();
        const existing = await tx.subscriptionProduct.findUnique({
          where: { key: productKey },
        });
        if (existing) return safe(existing);
        return safe(
          await tx.subscriptionProduct.create({
            data: {
              key: productKey,
              name: text(input.name, 160),
              description:
                input.description === undefined
                  ? ""
                  : text(input.description, 1000),
              status: "DRAFT",
            },
          }),
        );
      },
    );
  }

  async updatePlatformProduct(
    userId: string,
    productId: string,
    version: number,
    input: Input,
  ) {
    return this.platformContext(
      userId,
      "platform.subscription.write_plans",
      async (tx) => {
        const row = await tx.subscriptionProduct.findUnique({
          where: { id: productId },
        });
        if (!row) notFound("Subscription product not found");
        assertVersion(row.version, version);
        const status =
          input.status === undefined ? undefined : catalogStatus(input.status);
        return safe(
          await tx.subscriptionProduct.update({
            where: { id: row.id },
            data: {
              ...(input.name === undefined
                ? {}
                : { name: text(input.name, 160) }),
              ...(input.description === undefined
                ? {}
                : { description: text(input.description, 1000) }),
              ...(status ? { status } : {}),
              version: { increment: 1 },
            },
          }),
        );
      },
    );
  }

  async createPlatformPrice(userId: string, key: string, input: Input) {
    return this.platformContext(
      userId,
      "platform.subscription.write_plans",
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-price:${key}`}))`;
        const amount = Number(input.amountMinor);
        if (!Number.isSafeInteger(amount) || amount < 0)
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "amountMinor is invalid",
          );
        const interval = billingInterval(input.billingInterval);
        const productId = uuidValue(input.productId, "productId");
        const provider =
          optionalString(input.provider) ??
          this.environment.SUBSCRIPTION_PROVIDER;
        const currency = currencyValue(input.currency);
        const existing = await tx.subscriptionPrice.findFirst({
          where: {
            productId,
            provider,
            currency,
            amountMinor: BigInt(amount),
            billingInterval: interval,
            active: true,
          },
        });
        if (existing) return safe(existing);
        return safe(
          await tx.subscriptionPrice.create({
            data: {
              productId,
              provider,
              providerPriceId: optionalString(input.providerPriceId),
              currency,
              amountMinor: BigInt(amount),
              billingInterval: interval,
              billingIntervalCount: positiveInteger(
                input.billingIntervalCount ?? 1,
                "billingIntervalCount",
              ),
              trialDays: nonnegativeInteger(input.trialDays ?? 0, "trialDays"),
            },
          }),
        );
      },
    );
  }

  async updatePlatformPrice(
    userId: string,
    priceId: string,
    version: number,
    input: Input,
  ) {
    return this.platformContext(
      userId,
      "platform.subscription.write_plans",
      async (tx) => {
        const row = await tx.subscriptionPrice.findUnique({
          where: { id: priceId },
        });
        if (!row) notFound("Subscription price not found");
        assertVersion(row.version, version);
        return safe(
          await tx.subscriptionPrice.update({
            where: { id: row.id },
            data: {
              ...(input.active === undefined
                ? {}
                : { active: input.active === true }),
              ...(input.providerPriceId === undefined
                ? {}
                : { providerPriceId: optionalString(input.providerPriceId) }),
              version: { increment: 1 },
            },
          }),
        );
      },
    );
  }

  async platformCalculateSettlement(userId: string, key: string, input: Input) {
    await this.platformContext(
      userId,
      "platform.settlement.calculate",
      async () => undefined,
    );
    const organizationId = uuidValue(
      input.vendorOrganizationId,
      "vendorOrganizationId",
    );
    const actor = await this.resolveVendorActor(organizationId);
    return this.calculateSettlement(actor, organizationId, key, input);
  }

  async platformFinalizeSettlement(
    userId: string,
    settlementId: string,
    version: number,
    key: string,
  ) {
    const organizationId = await this.platformContext(
      userId,
      "platform.settlement.finalize",
      async (tx) => {
        const row = await tx.vendorSettlement.findUnique({
          where: { id: settlementId },
        });
        if (!row) notFound("Settlement not found");
        return row.vendorOrganizationId;
      },
    );
    return this.finalizeSettlement(
      await this.resolveVendorActor(organizationId),
      organizationId,
      settlementId,
      version,
      key,
    );
  }

  async platformCreatePayout(
    userId: string,
    settlementId: string,
    key: string,
  ) {
    const organizationId = await this.platformContext(
      userId,
      "platform.payout.create",
      async (tx) => {
        const row = await tx.vendorSettlement.findUnique({
          where: { id: settlementId },
        });
        if (!row) notFound("Settlement not found");
        return row.vendorOrganizationId;
      },
    );
    return this.createPayout(
      await this.resolveVendorActor(organizationId),
      organizationId,
      settlementId,
      key,
    );
  }

  private async syncAllocations(
    tx: Tx,
    actorUserId: string,
    organizationId: string,
  ) {
    const checkouts = await tx.onlinePaymentCheckout.findMany({
      where: { vendorOrganizationId: organizationId, bookingId: { not: null } },
    });
    if (!checkouts.length) return;
    const transactions = await tx.onlinePaymentTransaction.findMany({
      where: {
        checkoutId: { in: checkouts.map((checkout) => checkout.id) },
        status: {
          in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"],
        },
      },
    });
    const [profile, subscription] = await Promise.all([
      tx.vendorProfile.findUnique({
        where: { vendorOrganizationId: organizationId },
        select: { categories: true },
      }),
      tx.vendorSubscription.findUnique({
        where: { vendorOrganizationId: organizationId },
        select: { planId: true },
      }),
    ]);
    const now = new Date();
    const policies = await tx.platformFeePolicy.findMany({
      where: {
        status: "ACTIVE",
        activeFrom: { lte: now },
        AND: [
          { OR: [{ activeUntil: null }, { activeUntil: { gt: now } }] },
          {
            OR: [
              { scope: "GLOBAL" },
              ...(profile?.categories.length
                ? [
                    {
                      scope: "VENDOR_CATEGORY" as const,
                      vendorCategory: { in: profile.categories },
                    },
                  ]
                : []),
              ...(subscription
                ? [
                    {
                      scope: "SUBSCRIPTION_PLAN" as const,
                      subscriptionPlanId: subscription.planId,
                    },
                  ]
                : []),
              {
                scope: "VENDOR_OVERRIDE",
                vendorOrganizationId: organizationId,
              },
            ],
          },
        ],
      },
      orderBy: { activeFrom: "desc" },
    });
    const scopePriority = {
      GLOBAL: 0,
      VENDOR_CATEGORY: 1,
      SUBSCRIPTION_PLAN: 2,
      VENDOR_OVERRIDE: 3,
    } as const;
    for (const transaction of transactions) {
      const policy = policies
        .filter(
          (candidate) =>
            candidate.currency === null ||
            candidate.currency === transaction.currency,
        )
        .sort(
          (left, right) =>
            scopePriority[right.scope] - scopePriority[left.scope],
        )[0];
      if (!policy) continue;
      const checkout = checkouts.find(
        (item) => item.id === transaction.checkoutId,
      )!;
      if (!checkout.bookingId || !checkout.vendorOrganizationId) continue;
      let allocation = await tx.marketplacePaymentAllocation.findUnique({
        where: { transactionId: transaction.id },
      });
      if (!allocation) {
        const gross = Number(transaction.amountCapturedMinor);
        const fee = calculatePlatformFeeMinor(gross, policy);
        allocation = await tx.marketplacePaymentAllocation.create({
          data: {
            transactionId: transaction.id,
            workspaceId: transaction.workspaceId,
            vendorOrganizationId: organizationId,
            bookingId: checkout.bookingId,
            currency: transaction.currency,
            grossMinor: BigInt(gross),
            platformFeeMinor: BigInt(fee),
            vendorNetMinor: BigInt(gross - fee),
            eligibleForPayoutMinor: BigInt(gross - fee),
            availableAt: new Date(
              (transaction.capturedAt ?? transaction.createdAt).getTime() +
                this.environment.PAYOUT_HOLD_DAYS * 86_400_000,
            ),
            feePolicySnapshot: safe(policy) as Prisma.InputJsonValue,
          },
        });
        await tx.vendorPayableEntry.createMany({
          data: [
            {
              vendorOrganizationId: organizationId,
              allocationId: allocation.id,
              entryType: "PAYMENT_EARNED",
              amountMinor: allocation.grossMinor,
              currency: allocation.currency,
              sourceType: "ONLINE_TRANSACTION",
              sourceId: transaction.id,
              availableAt: allocation.availableAt,
            },
            {
              vendorOrganizationId: organizationId,
              allocationId: allocation.id,
              entryType: "PLATFORM_FEE",
              amountMinor: allocation.platformFeeMinor,
              currency: allocation.currency,
              sourceType: "ONLINE_TRANSACTION",
              sourceId: transaction.id,
              availableAt: allocation.availableAt,
            },
          ],
          skipDuplicates: true,
        });
        await this.emit(tx, {
          event: "payout.allocation_created.v1",
          aggregateType: "MarketplacePaymentAllocation",
          aggregateId: allocation.id,
          workspaceId: transaction.workspaceId,
          vendorOrganizationId: organizationId,
          actorUserId,
          version: allocation.version,
          summary: "Plata capturată a fost alocată pentru settlement.",
          actionUrl: "/vendor/payouts",
        });
      }
      const refunds = await tx.onlinePaymentRefund.findMany({
        where: { transactionId: transaction.id, status: "SUCCEEDED" },
      });
      for (const refund of refunds) {
        const created = await tx.vendorPayableEntry.createMany({
          data: [
            {
              vendorOrganizationId: organizationId,
              allocationId: allocation.id,
              entryType: "REFUND_ADJUSTMENT",
              amountMinor: refund.amountMinor,
              currency: refund.currency,
              sourceType: "ONLINE_REFUND",
              sourceId: refund.id,
              availableAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });
        if (created.count)
          await this.emit(tx, {
            event: "payout.refund_adjusted.v1",
            aggregateType: "MarketplacePaymentAllocation",
            aggregateId: allocation.id,
            workspaceId: transaction.workspaceId,
            vendorOrganizationId: organizationId,
            actorUserId,
            version: allocation.version,
            dedupeSuffix: refund.id,
            summary: "Refund-ul a creat o ajustare compensatorie în payable.",
            actionUrl: "/vendor/payouts",
          });
      }
      let refunded = refunds.reduce(
        (sum, refund) => sum + Number(refund.amountMinor),
        0,
      );
      if (transaction.status === "REFUNDED" && refunded === 0) {
        refunded = Number(allocation.grossMinor);
        const created = await tx.vendorPayableEntry.createMany({
          data: [
            {
              vendorOrganizationId: organizationId,
              allocationId: allocation.id,
              entryType: "REFUND_ADJUSTMENT",
              amountMinor: allocation.grossMinor,
              currency: allocation.currency,
              sourceType: "PAYMENT_DISPUTE_LOST",
              sourceId: transaction.id,
              availableAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });
        if (created.count)
          await this.emit(tx, {
            event: "payout.refund_adjusted.v1",
            aggregateType: "MarketplacePaymentAllocation",
            aggregateId: allocation.id,
            workspaceId: transaction.workspaceId,
            vendorOrganizationId: organizationId,
            actorUserId,
            version: allocation.version,
            dedupeSuffix: `dispute-lost:${transaction.id}`,
            summary: "Dispute-ul pierdut a creat carry-forward negativ.",
            actionUrl: "/vendor/payouts",
          });
      }
      const disputed =
        transaction.status === "DISPUTED"
          ? Math.max(0, Number(allocation.vendorNetMinor) - refunded)
          : 0;
      if (disputed > 0) {
        const created = await tx.vendorPayableEntry.createMany({
          data: [
            {
              vendorOrganizationId: organizationId,
              allocationId: allocation.id,
              entryType: "DISPUTE_HOLD",
              amountMinor: BigInt(disputed),
              currency: allocation.currency,
              sourceType: "ONLINE_TRANSACTION",
              sourceId: transaction.id,
              availableAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });
        if (created.count)
          await this.emit(tx, {
            event: "payout.dispute_held.v1",
            aggregateType: "MarketplacePaymentAllocation",
            aggregateId: allocation.id,
            workspaceId: transaction.workspaceId,
            vendorOrganizationId: organizationId,
            actorUserId,
            version: allocation.version,
            dedupeSuffix: transaction.id,
            summary: "Suma disputată a fost blocată din payout.",
            actionUrl: "/vendor/payouts",
          });
      }
      if (disputed === 0) {
        const hold = await tx.vendorPayableEntry.findUnique({
          where: {
            entryType_sourceType_sourceId: {
              entryType: "DISPUTE_HOLD",
              sourceType: "ONLINE_TRANSACTION",
              sourceId: transaction.id,
            },
          },
        });
        if (hold) {
          const created = await tx.vendorPayableEntry.createMany({
            data: [
              {
                vendorOrganizationId: organizationId,
                allocationId: allocation.id,
                entryType: "DISPUTE_RELEASE",
                amountMinor: hold.amountMinor,
                currency: hold.currency,
                sourceType: "ONLINE_TRANSACTION",
                sourceId: transaction.id,
                availableAt: new Date(),
              },
            ],
            skipDuplicates: true,
          });
          if (created.count)
            await this.emit(tx, {
              event: "payout.dispute_released.v1",
              aggregateType: "MarketplacePaymentAllocation",
              aggregateId: allocation.id,
              workspaceId: transaction.workspaceId,
              vendorOrganizationId: organizationId,
              actorUserId,
              version: allocation.version,
              dedupeSuffix: transaction.id,
              summary: "Hold-ul dispute-ului câștigat a fost eliberat.",
              actionUrl: "/vendor/payouts",
            });
        }
      }
      const eligible = Math.max(
        0,
        Number(allocation.vendorNetMinor) - refunded - disputed,
      );
      allocation = await tx.marketplacePaymentAllocation.update({
        where: { id: allocation.id },
        data: {
          refundedMinor: BigInt(refunded),
          disputedMinor: BigInt(disputed),
          eligibleForPayoutMinor: BigInt(eligible),
          status: disputed
            ? "DISPUTED"
            : refunded >= Number(allocation.grossMinor)
              ? "REFUNDED"
              : refunded
                ? "PARTIALLY_REFUNDED"
                : allocation.availableAt <= new Date()
                  ? "ELIGIBLE"
                  : "ALLOCATED",
          version: { increment: 1 },
        },
      });
    }
  }

  private async balanceTx(tx: Tx, organizationId: string) {
    const entries = await tx.vendorPayableEntry.findMany({
      where: { vendorOrganizationId: organizationId, status: "CONFIRMED" },
    });
    const currency = entries[0]?.currency ?? "RON";
    const now = new Date();
    const value = (subset: typeof entries) =>
      subset.reduce(
        (sum, entry) =>
          sum + payableEntrySign(entry.entryType) * Number(entry.amountMinor),
        0,
      );
    return {
      currency,
      availableMinor: Math.max(
        0,
        value(entries.filter((entry) => entry.availableAt <= now)),
      ),
      pendingMinor: Math.max(
        0,
        value(entries.filter((entry) => entry.availableAt > now)),
      ),
      heldMinor: Math.max(
        0,
        sumType(entries, "DISPUTE_HOLD") -
          sumType(entries, "DISPUTE_RELEASE") +
          sumType(entries, "RESERVE_HOLD") -
          sumType(entries, "RESERVE_RELEASE"),
      ),
      disputedMinor: Math.max(
        0,
        sumType(entries, "DISPUTE_HOLD") - sumType(entries, "DISPUTE_RELEASE"),
      ),
      carryForwardMinor: Math.min(0, value(entries)),
      nextEligiblePayoutAt:
        entries
          .filter((entry) => entry.availableAt > now)
          .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime())[0]
          ?.availableAt ?? null,
    };
  }

  private async applyPayoutEvent(
    tx: Tx,
    organizationId: string,
    actorUserId: string,
    payoutId: string,
    eventType: string,
    eventId: string,
  ) {
    const payout = await tx.vendorPayout.findUniqueOrThrow({
      where: { id: payoutId },
    });
    if (payout.status === "RETURNED") return;
    if (payout.status === "PAID" && eventType !== "payout.returned") return;
    const status =
      eventType === "payout.paid"
        ? "PAID"
        : eventType === "payout.failed"
          ? "FAILED"
          : eventType === "payout.returned"
            ? "RETURNED"
            : "PROCESSING";
    const updated = await tx.vendorPayout.update({
      where: { id: payout.id },
      data: {
        status,
        paidAt: status === "PAID" ? new Date() : payout.paidAt,
        failedAt: status === "FAILED" ? new Date() : payout.failedAt,
        returnedAt: status === "RETURNED" ? new Date() : payout.returnedAt,
        version: { increment: 1 },
      },
    });
    const latestAttempt = await tx.vendorPayoutAttempt.findFirst({
      where: { payoutId: payout.id },
      orderBy: { attemptNumber: "desc" },
    });
    if (latestAttempt)
      await tx.vendorPayoutAttempt.update({
        where: { id: latestAttempt.id },
        data: {
          status,
          completedAt: status === "PROCESSING" ? null : new Date(),
        },
      });
    if (status === "PAID")
      await tx.vendorPayableEntry.createMany({
        data: [
          {
            vendorOrganizationId: organizationId,
            entryType: "PAYOUT",
            amountMinor: payout.amountMinor,
            currency: payout.currency,
            sourceType: "VENDOR_PAYOUT",
            sourceId: payout.id,
            availableAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });
    if (status === "RETURNED")
      await tx.vendorPayableEntry.createMany({
        data: [
          {
            vendorOrganizationId: organizationId,
            entryType: "PAYOUT_REVERSAL",
            amountMinor: payout.amountMinor,
            currency: payout.currency,
            sourceType: "VENDOR_PAYOUT",
            sourceId: payout.id,
            availableAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });
    if (status === "PAID")
      await tx.vendorSettlement.update({
        where: { id: payout.settlementId },
        data: { status: "PAID" },
      });
    else if (status === "FAILED")
      await tx.vendorSettlement.update({
        where: { id: payout.settlementId },
        data: { status: "FAILED" },
      });
    await this.emit(tx, {
      event:
        status === "PAID"
          ? "payout.paid.v1"
          : status === "FAILED"
            ? "payout.failed.v1"
            : status === "RETURNED"
              ? "payout.returned.v1"
              : "payout.processing.v1",
      aggregateType: "VendorPayout",
      aggregateId: payout.id,
      vendorOrganizationId: organizationId,
      actorUserId,
      version: updated.version,
      dedupeSuffix: eventId,
      summary: `Payout provider: ${status.toLowerCase()}.`,
      actionUrl: `/vendor/payouts?payout=${payout.id}`,
    });
  }

  private async ensureSubscription(tx: Tx, organizationId: string) {
    const existing = await tx.vendorSubscription.findUnique({
      where: { vendorOrganizationId: organizationId },
    });
    if (existing) {
      if (
        existing.status === "PAST_DUE" &&
        existing.gracePeriodEndAt &&
        existing.gracePeriodEndAt <= new Date()
      ) {
        const expired = await tx.vendorSubscription.update({
          where: { id: existing.id },
          data: { status: "EXPIRED", version: { increment: 1 } },
        });
        await tx.vendorSubscriptionHistory.create({
          data: {
            vendorOrganizationId: organizationId,
            subscriptionId: existing.id,
            eventType: "GRACE_EXPIRED",
            statusFrom: existing.status,
            statusTo: expired.status,
            sourceType: "LIFECYCLE_POLICY",
            sourceId: existing.gracePeriodEndAt.toISOString(),
          },
        });
        await this.replaceEntitlementSnapshot(tx, expired);
        return expired;
      }
      return existing;
    }
    const plan = await tx.subscriptionPlan.findUnique({
      where: { key: "FREE" },
    });
    if (!plan) throw new Error("FREE subscription plan is missing");
    const subscription = await tx.vendorSubscription.create({
      data: {
        vendorOrganizationId: organizationId,
        planId: plan.id,
        provider: this.environment.SUBSCRIPTION_PROVIDER,
        status: "ACTIVE",
      },
    });
    await this.ensureEntitlementSnapshot(tx, subscription);
    return subscription;
  }

  private async ensureEntitlementSnapshot(
    tx: Tx,
    subscription: {
      id: string;
      vendorOrganizationId: string;
      planId: string;
      status?: string;
    },
  ) {
    const existing = await tx.vendorEntitlementSnapshot.findFirst({
      where: {
        vendorOrganizationId: subscription.vendorOrganizationId,
        supersededAt: null,
      },
      orderBy: { effectiveAt: "desc" },
    });
    const effectivePlanId = await this.effectiveEntitlementPlanId(
      tx,
      subscription,
    );
    return existing?.planId === effectivePlanId
      ? existing
      : this.replaceEntitlementSnapshot(tx, subscription);
  }

  private async replaceEntitlementSnapshot(
    tx: Tx,
    subscription: {
      id: string;
      vendorOrganizationId: string;
      planId: string;
      status?: string;
    },
  ) {
    const effectivePlanId = await this.effectiveEntitlementPlanId(
      tx,
      subscription,
    );
    const rows = await tx.subscriptionPlanEntitlement.findMany({
      where: { planId: effectivePlanId },
    });
    await tx.vendorEntitlementSnapshot.updateMany({
      where: {
        vendorOrganizationId: subscription.vendorOrganizationId,
        supersededAt: null,
      },
      data: { supersededAt: new Date() },
    });
    return tx.vendorEntitlementSnapshot.create({
      data: {
        vendorOrganizationId: subscription.vendorOrganizationId,
        subscriptionId: subscription.id,
        planId: effectivePlanId,
        entitlements: entitlementMap(rows) as Prisma.InputJsonValue,
      },
    });
  }

  private async effectiveEntitlementPlanId(
    tx: Tx,
    subscription: { planId: string; status?: string },
  ) {
    if (
      !subscription.status ||
      !["CANCELLED", "EXPIRED", "UNPAID"].includes(subscription.status)
    )
      return subscription.planId;
    const free = await tx.subscriptionPlan.findUnique({
      where: { key: "FREE" },
    });
    if (!free) throw new Error("FREE subscription plan is missing");
    return free.id;
  }

  private async insertSubscriptionEvent(
    provider: string,
    event: { id: string; type: string; occurredAt: Date; payloadHash: string },
    customerId: string | null,
    subscriptionId: string | null,
  ) {
    try {
      await this.database.$executeRaw`
        INSERT INTO "subscription_provider_events"
          ("id", "provider", "provider_event_id", "provider_customer_id", "provider_subscription_id", "event_type", "payload_hash", "occurred_at", "received_at", "status")
        VALUES
          (${randomUUID()}::uuid, ${provider}, ${event.id}, ${customerId}, ${subscriptionId}, ${event.type}, ${event.payloadHash}, ${event.occurredAt}, now(), 'RECEIVED')
      `;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }

  private async insertPayoutEvent(
    provider: string,
    event: { id: string; type: string; occurredAt: Date; payloadHash: string },
    accountId: string | null,
    payoutId: string | null,
  ) {
    try {
      await this.database.$executeRaw`
        INSERT INTO "payout_provider_events"
          ("id", "provider", "provider_event_id", "provider_account_id", "provider_payout_id", "event_type", "payload_hash", "occurred_at", "received_at", "status")
        VALUES
          (${randomUUID()}::uuid, ${provider}, ${event.id}, ${accountId}, ${payoutId}, ${event.type}, ${event.payloadHash}, ${event.occurredAt}, now(), 'RECEIVED')
      `;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }

  private async createReviewVersion(
    tx: Tx,
    review: { id: string },
    userId: string,
    normalized: ReturnType<typeof normalizeReview>,
  ) {
    const count = await tx.vendorReviewVersion.count({
      where: { reviewId: review.id },
    });
    const hash = createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex");
    const version = await tx.vendorReviewVersion.create({
      data: {
        reviewId: review.id,
        versionNumber: count + 1,
        title: normalized.title,
        body: normalized.body,
        overallRating: normalized.overallRating,
        criterionSnapshot: normalized.criteria,
        contentHash: hash,
        createdById: userId,
      },
    });
    await tx.vendorReviewCriterionRating.createMany({
      data: criteria.map((criterion) => ({
        reviewId: review.id,
        versionId: version.id,
        criterion,
        rating: normalized.criteria[criterion],
      })),
    });
    return version;
  }

  private async ownedReview(
    tx: Tx,
    userId: string,
    workspaceId: string,
    reviewId: string,
  ) {
    const row = await tx.vendorReview.findFirst({
      where: { id: reviewId, workspaceId, authorUserId: userId },
    });
    if (!row) notFound("Review not found");
    return row;
  }

  private async currentVersion(
    tx: Tx,
    review: {
      currentDraftVersionId: string | null;
      publishedVersionId: string | null;
    },
  ) {
    const id = review.currentDraftVersionId ?? review.publishedVersionId;
    if (!id)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.CONFLICT,
        "Review version is missing",
      );
    return tx.vendorReviewVersion.findUniqueOrThrow({ where: { id } });
  }

  private async reviewDetailTx(
    tx: Tx,
    reviewId: string,
    includePrivate = false,
  ) {
    const review = await tx.vendorReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) notFound("Review not found");
    const versions = await tx.vendorReviewVersion.findMany({
      where: { reviewId },
      orderBy: { versionNumber: "asc" },
    });
    const ratings = await tx.vendorReviewCriterionRating.findMany({
      where: {
        reviewId,
        versionId: { in: versions.map((version) => version.id) },
      },
    });
    const reply = await tx.vendorReviewReply.findUnique({
      where: {
        reviewId_vendorOrganizationId: {
          reviewId,
          vendorOrganizationId: review.vendorOrganizationId,
        },
      },
    });
    return safe({
      ...review,
      versions,
      criteria: ratings,
      reply,
      ...(includePrivate
        ? {
            dispute: await tx.vendorReviewDispute.findUnique({
              where: {
                reviewId_vendorOrganizationId: {
                  reviewId,
                  vendorOrganizationId: review.vendorOrganizationId,
                },
              },
            }),
          }
        : {}),
    });
  }

  private async publicReviewTx(
    tx: Tx,
    review: {
      id: string;
      vendorOrganizationId: string;
      publishedVersionId: string | null;
      publicDisplayName: string;
      publishedAt: Date | null;
      verificationStatus: string;
      overallRating: number;
    },
  ) {
    if (!review.publishedVersionId)
      throw new Error("Published review has no version");
    const version = await tx.vendorReviewVersion.findUniqueOrThrow({
      where: { id: review.publishedVersionId },
    });
    const criterionRatings = await tx.vendorReviewCriterionRating.findMany({
      where: { versionId: version.id },
    });
    const reply = await tx.vendorReviewReply.findFirst({
      where: {
        reviewId: review.id,
        vendorOrganizationId: review.vendorOrganizationId,
        status: "PUBLISHED",
      },
    });
    return safe({
      id: review.id,
      title: version.title,
      body: version.body,
      overallRating: review.overallRating,
      criteria: Object.fromEntries(
        criterionRatings.map((item) => [item.criterion, item.rating]),
      ),
      publicDisplayName: review.publicDisplayName,
      publishedAt: review.publishedAt,
      verified: review.verificationStatus === "VERIFIED_BOOKING",
      reply: reply
        ? {
            body: reply.body,
            publishedAt: reply.publishedAt,
            editedAt: reply.editedAt,
          }
        : null,
    });
  }

  private async rebuildRating(tx: Tx, organizationId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rating:${organizationId}`}))`;
    const reviews = await tx.vendorReview.findMany({
      where: {
        vendorOrganizationId: organizationId,
        status: "PUBLISHED",
        verificationStatus: { not: "REVOKED" },
        publishedVersionId: { not: null },
      },
    });
    const versionIds = reviews
      .map((review) => review.publishedVersionId!)
      .filter(Boolean);
    const ratings = await tx.vendorReviewCriterionRating.findMany({
      where: { versionId: { in: versionIds } },
    });
    const avg = (values: number[]) =>
      values.length
        ? Math.round(
            (values.reduce((sum, value) => sum + value, 0) * 100) /
              values.length,
          )
        : null;
    const data = {
      publishedReviewCount: reviews.length,
      verifiedReviewCount: reviews.filter(
        (review) => review.verificationStatus === "VERIFIED_BOOKING",
      ).length,
      overallAverageScaled: avg(reviews.map((review) => review.overallRating)),
      qualityAverageScaled: avg(
        ratings
          .filter((item) => item.criterion === "QUALITY")
          .map((item) => item.rating),
      ),
      communicationAverageScaled: avg(
        ratings
          .filter((item) => item.criterion === "COMMUNICATION")
          .map((item) => item.rating),
      ),
      reliabilityAverageScaled: avg(
        ratings
          .filter((item) => item.criterion === "RELIABILITY")
          .map((item) => item.rating),
      ),
      valueAverageScaled: avg(
        ratings
          .filter((item) => item.criterion === "VALUE")
          .map((item) => item.rating),
      ),
      professionalismAverageScaled: avg(
        ratings
          .filter((item) => item.criterion === "PROFESSIONALISM")
          .map((item) => item.rating),
      ),
      flexibilityAverageScaled: avg(
        ratings
          .filter((item) => item.criterion === "FLEXIBILITY")
          .map((item) => item.rating),
      ),
      rating1Count: reviews.filter((review) => review.overallRating === 1)
        .length,
      rating2Count: reviews.filter((review) => review.overallRating === 2)
        .length,
      rating3Count: reviews.filter((review) => review.overallRating === 3)
        .length,
      rating4Count: reviews.filter((review) => review.overallRating === 4)
        .length,
      rating5Count: reviews.filter((review) => review.overallRating === 5)
        .length,
      lastReviewAt:
        reviews.sort(
          (a, b) =>
            (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
        )[0]?.publishedAt ?? null,
    };
    return tx.vendorRatingAggregate.upsert({
      where: { vendorOrganizationId: organizationId },
      create: { vendorOrganizationId: organizationId, ...data },
      update: { ...data, version: { increment: 1 } },
    });
  }

  private async ratingSummaryTx(tx: Tx, organizationId: string) {
    const aggregate = await tx.vendorRatingAggregate.findUnique({
      where: { vendorOrganizationId: organizationId },
    });
    return safe(
      aggregate ?? {
        vendorOrganizationId: organizationId,
        publishedReviewCount: 0,
        verifiedReviewCount: 0,
        overallAverageScaled: null,
        qualityAverageScaled: null,
        communicationAverageScaled: null,
        reliabilityAverageScaled: null,
        valueAverageScaled: null,
        professionalismAverageScaled: null,
        flexibilityAverageScaled: null,
        rating1Count: 0,
        rating2Count: 0,
        rating3Count: 0,
        rating4Count: 0,
        rating5Count: 0,
        lastReviewAt: null,
        emptyLabel: "Nicio evaluare încă",
      },
    );
  }

  private async vendorContext<T>(
    userId: string,
    organizationId: string,
    operation: (tx: Tx) => Promise<T>,
  ) {
    return this.database.withContext(
      { userId, vendorOrganizationId: organizationId },
      operation,
    );
  }

  private async platformContext<T>(
    userId: string,
    capability: CapabilityKey,
    operation: (tx: Tx) => Promise<T>,
  ) {
    return this.database.withContext({ userId }, async (tx) => {
      const allowed = await tx.$queryRaw<
        Array<{ allowed: boolean }>
      >`SELECT public.weddingos_has_platform_capability(${capability}) AS allowed`;
      if (!allowed[0]?.allowed)
        problem(
          "FORBIDDEN",
          HttpStatus.FORBIDDEN,
          "Platform capability required",
          undefined,
          undefined,
          { requiredCapability: capability },
        );
      return operation(tx);
    });
  }

  private async resolveVendorActor(organizationId: string) {
    const rows = await this.database.$queryRaw<
      Array<{ actor_user_id: string }>
    >`SELECT * FROM public.weddingos_resolve_vendor_actor(${organizationId}::uuid)`;
    if (!rows[0])
      problem(
        "NOT_FOUND",
        HttpStatus.NOT_FOUND,
        "Vendor organization has no active member",
      );
    return rows[0].actor_user_id;
  }

  private async emit(
    tx: Tx,
    input: {
      event: string;
      aggregateType: string;
      aggregateId: string;
      workspaceId?: string;
      vendorOrganizationId?: string;
      actorUserId: string;
      version: number;
      summary: string;
      actionUrl: string;
      dedupeSuffix?: string;
    },
  ) {
    await this.asyncEvents.record(tx, {
      eventName: input.event,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      aggregateVersion: input.version,
      workspaceId: input.workspaceId,
      vendorOrganizationId: input.vendorOrganizationId,
      actorUserId: input.actorUserId,
      deduplicationKey: `${input.event}:${input.aggregateId}:${input.version}:${input.dedupeSuffix ?? "state"}`,
      payload: {
        ...(input.workspaceId
          ? {
              activity: {
                category: input.event.split(".")[0],
                action: input.event,
                summary: input.summary,
                entityType: input.aggregateType,
                entityId: input.aggregateId,
              },
            }
          : {}),
        ...(input.workspaceId
          ? {
              notification: {
                recipientUserId: input.actorUserId,
                module: input.event.split(".")[0],
                kind: input.event,
                priority:
                  input.event.includes("failed") ||
                  input.event.includes("dispute")
                    ? "high"
                    : "normal",
                title: input.summary,
                body: input.summary,
                actionUrl: input.actionUrl,
              },
            }
          : {}),
        ...(input.vendorOrganizationId
          ? {
              vendorNotificationProjection: {
                vendorOrganizationId: input.vendorOrganizationId,
              },
            }
          : {}),
      },
    });
  }
}

function normalizeReview(input: Input) {
  const title = text(input.title, 180);
  const body = text(input.body, 4000);
  if (body.length < 20)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Review body must contain at least 20 characters",
    );
  if (/<[^>]+>|\b(?:iban|cvv|password|secret|token)\b/i.test(body))
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Review contains prohibited private content",
    );
  const overallRating = rating(input.overallRating);
  const source = input.criteria as Record<string, unknown> | undefined;
  if (!source || typeof source !== "object")
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "All review criteria are required",
    );
  const normalizedCriteria = Object.fromEntries(
    criteria.map((criterion) => [criterion, rating(source[criterion])]),
  ) as Record<Criterion, number>;
  const average =
    criteria.reduce(
      (sum, criterion) => sum + normalizedCriteria[criterion],
      0,
    ) / criteria.length;
  if (Math.abs(overallRating - average) > 1.25)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Overall rating is inconsistent with criteria",
    );
  return { title, body, overallRating, criteria: normalizedCriteria };
}

function entitlementMap(
  rows: Array<{
    key: string;
    valueType: string;
    booleanValue: boolean | null;
    integerValue: number | null;
    stringValue: string | null;
  }>,
) {
  return Object.fromEntries(
    rows.map((row) => [
      row.key,
      row.valueType === "BOOLEAN"
        ? row.booleanValue
        : row.valueType === "INTEGER"
          ? row.integerValue
          : row.stringValue,
    ]),
  );
}

export function mapSubscriptionEvent(
  type: string,
  current: string,
): {
  status:
    | "TRIALING"
    | "ACTIVE"
    | "PAST_DUE"
    | "CANCELLED"
    | "GRACE_PERIOD"
    | "PAUSED"
    | "UNPAID"
    | "INCOMPLETE"
    | "EXPIRED";
  event: string;
} {
  const map: Record<
    string,
    { status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED"; event: string }
  > = {
    "trial.started": {
      status: "TRIALING",
      event: "subscription.trial_started.v1",
    },
    "subscription.active": {
      status: "ACTIVE",
      event: "subscription.activated.v1",
    },
    "invoice.paid": { status: "ACTIVE", event: "subscription.renewed.v1" },
    "invoice.failed": { status: "PAST_DUE", event: "subscription.past_due.v1" },
    "subscription.cancelled": {
      status: "CANCELLED",
      event: "subscription.cancelled.v1",
    },
    "subscription.resumed": {
      status: "ACTIVE",
      event: "subscription.resumed.v1",
    },
  };
  if (type === "subscription.plan_changed")
    return {
      status: current as never,
      event: "subscription.plan_changed.v1",
    };
  return (
    map[type] ?? {
      status: current as never,
      event: "subscription.entitlements_updated.v1",
    }
  );
}

export function calculatePlatformFeeMinor(
  gross: number,
  policy: {
    ruleType: string;
    percentageBasisPoints: number | null;
    fixedMinor: bigint | null;
    minimumFeeMinor: bigint | null;
    maximumFeeMinor: bigint | null;
  },
) {
  const percentage = Math.floor(
    (gross * (policy.percentageBasisPoints ?? 0) + 5000) / 10000,
  );
  const fixed = Number(policy.fixedMinor ?? 0);
  let fee =
    policy.ruleType === "PERCENTAGE"
      ? percentage
      : policy.ruleType === "FIXED"
        ? fixed
        : percentage + fixed;
  if (policy.minimumFeeMinor !== null)
    fee = Math.max(fee, Number(policy.minimumFeeMinor));
  if (policy.maximumFeeMinor !== null)
    fee = Math.min(fee, Number(policy.maximumFeeMinor));
  return Math.min(gross, Math.max(0, fee));
}

export function payableEntrySign(type: string) {
  return [
    "PAYMENT_EARNED",
    "DISPUTE_RELEASE",
    "PAYOUT_REVERSAL",
    "RESERVE_RELEASE",
  ].includes(type)
    ? 1
    : -1;
}
function sumType(
  rows: Array<{ entryType: string; amountMinor: bigint }>,
  type: string,
) {
  return rows
    .filter((row) => row.entryType === type)
    .reduce((sum, row) => sum + Number(row.amountMinor), 0);
}
function rating(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 5)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Rating must be an integer between 1 and 5",
    );
  return number;
}
function text(value: unknown, max = 4000) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Text field is invalid",
    );
  return value.trim();
}
function optionalText(value: unknown, max: number) {
  return value === undefined || value === null || value === ""
    ? null
    : text(value, max);
}
function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}
function uuidValue(value: unknown, field: string) {
  const textValue = String(value ?? "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      textValue,
    )
  )
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      `${field} must be a UUID`,
    );
  return textValue;
}
function currencyValue(value: unknown) {
  const result = String(value ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(result))
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Currency is invalid",
    );
  return result;
}
function catalogStatus(value: unknown) {
  const result = String(value);
  if (!["DRAFT", "ACTIVE", "ARCHIVED"].includes(result))
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Catalog status is invalid",
    );
  return result as "DRAFT" | "ACTIVE" | "ARCHIVED";
}
function billingInterval(value: unknown) {
  const result = String(value);
  if (!["MONTH", "YEAR"].includes(result))
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Billing interval is invalid",
    );
  return result as "MONTH" | "YEAR";
}
function positiveInteger(value: unknown, field: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      `${field} is invalid`,
    );
  return result;
}
function nonnegativeInteger(value: unknown, field: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      `${field} is invalid`,
    );
  return result;
}
function displayName(value: unknown) {
  const result = typeof value === "string" ? value.trim() : "Cuplu verificat";
  return result ? result.slice(0, 120) : "Cuplu verificat";
}
function dateValue(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function assertVersion(actual: number, expected: number) {
  if (actual !== expected)
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Resource version conflict",
      undefined,
      undefined,
      { latestVersion: actual },
    );
}
function notFound(detail: string): never {
  return problem(
    "NOT_FOUND",
    HttpStatus.NOT_FOUND,
    "Resource not found",
    detail,
  );
}
function isUnique(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const value = error as {
    code?: unknown;
    meta?: { code?: unknown; message?: unknown };
  };
  return (
    value.code === "P2002" ||
    (value.code === "P2010" &&
      (value.meta?.code === "23505" ||
        String(value.meta?.message ?? "").includes("23505")))
  );
}
function safe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? Number(item) : item,
    ),
  ) as T;
}

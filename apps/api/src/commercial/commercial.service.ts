import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import {
  capabilityKeySchema,
  calculateBudgetSummary,
  calculateOfferTotals,
  type CapabilityKey,
} from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";
import {
  createOpaqueToken,
  encryptSensitive,
  hashToken,
  stableHash,
} from "../guests/sensitive.crypto";

type Transaction = Prisma.TransactionClient;
type JsonObject = Record<string, unknown>;

@Injectable()
export class CommercialService {
  private readonly sensitiveKey: { keyId: string; secret: string };

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {
    this.sensitiveKey = {
      keyId: environment.OUTBOX_ENCRYPTION_KEY_ID,
      secret: environment.OUTBOX_ENCRYPTION_KEY,
    };
  }

  async vendorOrganizations(userId: string) {
    const memberships = await this.database.withContext({ userId }, (tx) =>
      tx.vendorOrganizationMembership.findMany({
        where: { userId, status: "ACTIVE" },
        orderBy: { joinedAt: "asc" },
      }),
    );
    const items = await Promise.all(
      memberships.map((membership) =>
        this.database.withContext(
          { userId, vendorOrganizationId: membership.vendorOrganizationId },
          async (tx) => {
            const [organization, role, profile, overrides] = await Promise.all([
              tx.vendorOrganization.findUnique({
                where: { id: membership.vendorOrganizationId },
              }),
              tx.vendorRoleTemplate.findUnique({
                where: { id: membership.roleTemplateId },
              }),
              tx.vendorProfile.findUnique({
                where: {
                  vendorOrganizationId: membership.vendorOrganizationId,
                },
              }),
              tx.vendorMembershipCapabilityOverride.findMany({
                where: { membershipId: membership.id },
              }),
            ]);
            return organization
              ? vendorOrganizationResponse(
                  organization,
                  role?.key,
                  profile,
                  effectiveVendorCapabilities(role?.capabilities, overrides),
                )
              : null;
          },
        ),
      ),
    );
    return { items: items.filter((item) => item !== null) };
  }

  async createVendorOrganization(
    userId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    const organizationId = randomUUID();
    return this.database.withContext(
      { userId, vendorOrganizationId: organizationId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          "vendor.organization.create",
          key,
          input,
        );
        if (replay) return replay;
        const role = await tx.vendorRoleTemplate.findUniqueOrThrow({
          where: { key: "vendor_owner" },
        });
        const organization = await tx.vendorOrganization.create({
          data: {
            id: organizationId,
            legalName: text(input.legalName),
            displayName: text(input.displayName),
            country: text(input.country),
            registrationNumberEncrypted: encryptSensitive(
              nullableText(input.registrationNumber),
              this.sensitiveKey,
            ),
            taxIdEncrypted: encryptSensitive(
              nullableText(input.taxId),
              this.sensitiveKey,
            ),
            billingEmailEncrypted: encryptSensitive(
              nullableText(input.billingEmail),
              this.sensitiveKey,
            ),
            contactEmail: text(input.contactEmail),
            contactPhoneEncrypted: encryptSensitive(
              nullableText(input.contactPhone),
              this.sensitiveKey,
            ),
            websiteUrl: nullableText(input.websiteUrl),
            status: "ACTIVE",
            createdById: userId,
            updatedById: userId,
          },
        });
        await tx.vendorOrganizationMembership.create({
          data: {
            vendorOrganizationId: organization.id,
            userId,
            roleTemplateId: role.id,
            status: "ACTIVE",
            joinedAt: new Date(),
            createdById: userId,
            updatedById: userId,
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "vendor.organization_created.v1",
          aggregateType: "VendorOrganization",
          aggregateId: organization.id,
          vendorOrganizationId: organization.id,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `vendor-organization-created:${organization.id}`,
          payload: { subject: { vendorOrganizationId: organization.id } },
        });
        const response = vendorOrganizationResponse(
          organization,
          role.key,
          null,
        );
        await this.saveReplay(
          tx,
          null,
          userId,
          "vendor.organization.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async vendorOrganization(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const [organization, membership, profile] = await Promise.all([
        tx.vendorOrganization.findUnique({ where: { id: organizationId } }),
        tx.vendorOrganizationMembership.findFirst({
          where: {
            vendorOrganizationId: organizationId,
            userId,
            status: "ACTIVE",
          },
        }),
        tx.vendorProfile.findUnique({
          where: { vendorOrganizationId: organizationId },
        }),
      ]);
      if (!organization || !membership)
        notFound("Organizația furnizorului nu există.");
      const [role, overrides] = await Promise.all([
        tx.vendorRoleTemplate.findUnique({
          where: { id: membership.roleTemplateId },
        }),
        tx.vendorMembershipCapabilityOverride.findMany({
          where: { membershipId: membership.id },
        }),
      ]);
      return vendorOrganizationResponse(
        organization,
        role?.key,
        profile,
        effectiveVendorCapabilities(role?.capabilities, overrides),
      );
    });
  }

  async updateVendorOrganization(
    userId: string,
    organizationId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorOrganization.findUnique({
        where: { id: organizationId },
      });
      if (!current) notFound("Organizația furnizorului nu există.");
      assertVersion(current.version, version);
      const row = await tx.vendorOrganization.update({
        where: { id: organizationId },
        data: {
          ...(input.legalName !== undefined
            ? { legalName: text(input.legalName) }
            : {}),
          ...(input.displayName !== undefined
            ? { displayName: text(input.displayName) }
            : {}),
          ...(input.country !== undefined
            ? { country: text(input.country) }
            : {}),
          ...(input.registrationNumber !== undefined
            ? {
                registrationNumberEncrypted: encryptSensitive(
                  nullableText(input.registrationNumber),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.taxId !== undefined
            ? {
                taxIdEncrypted: encryptSensitive(
                  nullableText(input.taxId),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.billingEmail !== undefined
            ? {
                billingEmailEncrypted: encryptSensitive(
                  nullableText(input.billingEmail),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.contactEmail !== undefined
            ? { contactEmail: text(input.contactEmail) }
            : {}),
          ...(input.contactPhone !== undefined
            ? {
                contactPhoneEncrypted: encryptSensitive(
                  nullableText(input.contactPhone),
                  this.sensitiveKey,
                ),
              }
            : {}),
          ...(input.websiteUrl !== undefined
            ? { websiteUrl: nullableText(input.websiteUrl) }
            : {}),
          updatedById: userId,
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name: "vendor.organization_updated.v1",
        aggregate: "VendorOrganization",
        id: row.id,
        version: row.version,
        vendorOrganizationId: row.id,
        actorUserId: userId,
        correlationId,
      });
      return vendorOrganizationResponse(row);
    });
  }

  async archiveVendorOrganization(
    userId: string,
    organizationId: string,
    version: number,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorOrganization.findUnique({
        where: { id: organizationId },
      });
      if (!current) notFound("Organizația furnizorului nu există.");
      assertVersion(current.version, version);
      const openBookings = await tx.vendorBooking.count({
        where: {
          vendorOrganizationId: organizationId,
          status: {
            in: ["PENDING_CONTRACT", "CONFIRMED", "IN_PROGRESS", "DISPUTED"],
          },
        },
      });
      if (openBookings > 0)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Organizația are rezervări active",
        );
      const row = await tx.vendorOrganization.update({
        where: { id: organizationId },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          updatedById: userId,
          version: { increment: 1 },
        },
      });
      return { id: row.id, status: row.status, version: row.version };
    });
  }

  async vendorMembers(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const memberships = await tx.vendorOrganizationMembership.findMany({
        where: { vendorOrganizationId: organizationId },
        orderBy: { createdAt: "asc" },
      });
      const items = await Promise.all(
        memberships.map(async (membership) => {
          const [user, role] = await Promise.all([
            tx.user.findUnique({
              where: { id: membership.userId },
              include: { profile: true },
            }),
            tx.vendorRoleTemplate.findUnique({
              where: { id: membership.roleTemplateId },
            }),
          ]);
          return {
            id: membership.id,
            userId: membership.userId,
            name: user?.profile
              ? `${user.profile.firstName} ${user.profile.lastName}`
              : (user?.email ?? "Membru"),
            email: user?.email,
            role: role?.key,
            status: membership.status,
            version: membership.version,
          };
        }),
      );
      return { items };
    });
  }

  async inviteVendorMember(
    userId: string,
    organizationId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "vendor.member.invite",
        key,
        input,
      );
      if (replay) return replay;
      const role = await tx.vendorRoleTemplate.findUniqueOrThrow({
        where: { key: text(input.role) },
      });
      const organization = await tx.vendorOrganization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      const token = createOpaqueToken();
      const invitation = await tx.vendorOrganizationInvitation.create({
        data: {
          vendorOrganizationId: organizationId,
          email: text(input.email).toLowerCase(),
          roleTemplateId: role.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          sentAt: new Date(),
          createdById: userId,
        },
      });
      await this.asyncEvents.record(tx, {
        eventName: "vendor.member_invited.v1",
        aggregateType: "VendorOrganizationInvitation",
        aggregateId: invitation.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
        deduplicationKey: `vendor-member-invited:${invitation.id}:g${invitation.tokenGeneration}`,
        payload: {
          subject: { vendorOrganizationInvitationId: invitation.id },
          vendorNotificationProjection: {
            vendorOrganizationId: organizationId,
          },
        },
        email: {
          kind: "vendor-invitation",
          recipient: invitation.email,
          values: {
            organizationName: organization.displayName,
            roleName: role.name,
            token,
          },
        },
      });
      const response = {
        id: invitation.id,
        email: invitation.email,
        role: role.key,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      };
      await this.saveReplay(
        tx,
        null,
        userId,
        "vendor.member.invite",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async vendorInvitationPreview(userId: string, rawToken: string) {
    const rows = await this.database.withContext(
      { userId },
      (tx) =>
        tx.$queryRaw<
          Array<{
            invitation_id: string;
            vendor_organization_id: string;
            vendor_display_name: string;
            role_name: string;
            expires_at: Date;
            invitation_version: number;
          }>
        >`SELECT * FROM public.weddingos_vendor_invitation_preview(${hashToken(rawToken)}::char(64), ${userId}::uuid)`,
    );
    const invitation = rows[0];
    if (!invitation)
      problem(
        "TOKEN_INVALID",
        HttpStatus.NOT_FOUND,
        "Invitația nu este disponibilă",
      );
    return {
      id: invitation.invitation_id,
      vendorOrganizationId: invitation.vendor_organization_id,
      organizationName: invitation.vendor_display_name,
      roleName: invitation.role_name,
      expiresAt: invitation.expires_at,
      version: invitation.invitation_version,
    };
  }

  async acceptVendorInvitation(
    userId: string,
    rawToken: string,
    correlationId: string,
  ) {
    const rows = await this.database.withContext(
      { userId },
      (tx) =>
        tx.$queryRaw<
          Array<{
            invitation_id: string;
            vendor_organization_id: string;
            membership_id: string;
          }>
        >`SELECT * FROM public.weddingos_accept_vendor_invitation(${hashToken(rawToken)}::char(64), ${userId}::uuid)`,
    );
    const accepted = rows[0];
    if (!accepted)
      problem(
        "TOKEN_INVALID",
        HttpStatus.NOT_FOUND,
        "Invitația nu este disponibilă",
      );
    await this.vendorContext(userId, accepted.vendor_organization_id, (tx) =>
      this.event(tx, {
        name: "vendor.member_invitation_accepted.v1",
        aggregate: "VendorOrganizationInvitation",
        id: accepted.invitation_id,
        version: 2,
        vendorOrganizationId: accepted.vendor_organization_id,
        actorUserId: userId,
        correlationId,
        vendorNotificationProjection: {
          vendorOrganizationId: accepted.vendor_organization_id,
        },
      }),
    );
    return {
      accepted: true,
      invitationId: accepted.invitation_id,
      vendorOrganizationId: accepted.vendor_organization_id,
      membershipId: accepted.membership_id,
    };
  }

  async declineVendorInvitation(
    userId: string,
    rawToken: string,
    correlationId: string,
  ) {
    const rows = await this.database.withContext(
      { userId },
      (tx) =>
        tx.$queryRaw<
          Array<{ invitation_id: string; vendor_organization_id: string }>
        >`
        SELECT * FROM public.weddingos_decline_vendor_invitation(${hashToken(rawToken)}::char(64), ${userId}::uuid)
      `,
    );
    const declined = rows[0];
    if (!declined)
      problem(
        "TOKEN_INVALID",
        HttpStatus.NOT_FOUND,
        "Invitația nu este disponibilă",
      );
    await this.vendorContext(userId, declined.vendor_organization_id, (tx) =>
      this.event(tx, {
        name: "vendor.member_invitation_declined.v1",
        aggregate: "VendorOrganizationInvitation",
        id: declined.invitation_id,
        version: 2,
        vendorOrganizationId: declined.vendor_organization_id,
        actorUserId: userId,
        correlationId,
        vendorNotificationProjection: {
          vendorOrganizationId: declined.vendor_organization_id,
        },
      }),
    );
    return { declined: true };
  }

  async resendVendorInvitation(
    userId: string,
    organizationId: string,
    invitationId: string,
    version: number,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const invitation = await tx.vendorOrganizationInvitation.findFirst({
        where: { id: invitationId, vendorOrganizationId: organizationId },
      });
      if (!invitation) notFound("Invitația nu există.");
      assertVersion(invitation.version, version);
      if (invitation.status !== "PENDING")
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Invitația nu mai poate fi retrimisă",
        );
      const token = createOpaqueToken();
      const row = await tx.vendorOrganizationInvitation.update({
        where: { id: invitation.id },
        data: {
          tokenHash: hashToken(token),
          tokenGeneration: { increment: 1 },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          sentAt: new Date(),
          version: { increment: 1 },
        },
      });
      const [organization, role] = await Promise.all([
        tx.vendorOrganization.findUniqueOrThrow({
          where: { id: organizationId },
        }),
        tx.vendorRoleTemplate.findUniqueOrThrow({
          where: { id: row.roleTemplateId },
        }),
      ]);
      await this.asyncEvents.record(tx, {
        eventName: "vendor.member_invited.v1",
        aggregateType: "VendorOrganizationInvitation",
        aggregateId: row.id,
        aggregateVersion: row.version,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
        deduplicationKey: `vendor-member-invited:${row.id}:g${row.tokenGeneration}`,
        payload: { subject: { vendorOrganizationInvitationId: row.id } },
        email: {
          kind: "vendor-invitation",
          recipient: row.email,
          values: {
            organizationName: organization.displayName,
            roleName: role.name,
            token,
          },
        },
      });
      return {
        id: row.id,
        status: row.status,
        expiresAt: row.expiresAt,
        version: row.version,
      };
    });
  }

  async revokeVendorInvitation(
    userId: string,
    organizationId: string,
    invitationId: string,
    version: number,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const invitation = await tx.vendorOrganizationInvitation.findFirst({
        where: { id: invitationId, vendorOrganizationId: organizationId },
      });
      if (!invitation) notFound("Invitația nu există.");
      assertVersion(invitation.version, version);
      if (invitation.status !== "PENDING")
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Invitația nu mai poate fi revocată",
        );
      const row = await tx.vendorOrganizationInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedById: userId,
          tokenHash: hashToken(
            `${invitation.tokenHash}:revoked:${randomUUID()}`,
          ),
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name: "vendor.member_invitation_revoked.v1",
        aggregate: "VendorOrganizationInvitation",
        id: row.id,
        version: row.version,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
        vendorNotificationProjection: { vendorOrganizationId: organizationId },
      });
      return { id: row.id, status: row.status, version: row.version };
    });
  }

  async updateVendorMember(
    userId: string,
    organizationId: string,
    memberId: string,
    version: number,
    input: JsonObject,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorOrganizationMembership.findFirst({
        where: { id: memberId, vendorOrganizationId: organizationId },
      });
      if (!current) notFound("Membrul furnizorului nu există.");
      assertVersion(current.version, version);
      const role = input.role
        ? await tx.vendorRoleTemplate.findUniqueOrThrow({
            where: { key: text(input.role) },
          })
        : null;
      if (current.userId === userId && input.status === "REMOVED")
        await this.protectLastVendorOwner(tx, organizationId, current.id);
      const row = await tx.vendorOrganizationMembership.update({
        where: { id: current.id },
        data: {
          ...(role ? { roleTemplateId: role.id } : {}),
          ...(input.status
            ? { status: text(input.status) as "ACTIVE" | "REMOVED" }
            : {}),
          ...(input.status === "REMOVED" ? { removedAt: new Date() } : {}),
          updatedById: userId,
          version: { increment: 1 },
        },
      });
      return {
        id: row.id,
        role: role?.key,
        status: row.status,
        version: row.version,
      };
    });
  }

  async removeVendorMember(
    userId: string,
    organizationId: string,
    memberId: string,
    version: number,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorOrganizationMembership.findFirst({
        where: { id: memberId, vendorOrganizationId: organizationId },
      });
      if (!current) notFound("Membrul furnizorului nu există.");
      assertVersion(current.version, version);
      await this.protectLastVendorOwner(tx, organizationId, current.id);
      const row = await tx.vendorOrganizationMembership.update({
        where: { id: current.id },
        data: {
          status: "REMOVED",
          removedAt: new Date(),
          updatedById: userId,
          version: { increment: 1 },
        },
      });
      return { id: row.id, status: row.status, version: row.version };
    });
  }

  async vendorProfile(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const profile = await tx.vendorProfile.findUnique({
        where: { vendorOrganizationId: organizationId },
      });
      if (!profile) return null;
      return vendorProfileResponse(profile);
    });
  }

  async upsertVendorProfile(
    userId: string,
    organizationId: string,
    version: number | null,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorProfile.findUnique({
        where: { vendorOrganizationId: organizationId },
      });
      if (current && version === null)
        problem(
          "PRECONDITION_REQUIRED",
          HttpStatus.PRECONDITION_REQUIRED,
          "If-Match required",
        );
      if (current && version !== null) assertVersion(current.version, version);
      const data = {
        slug: text(input.slug),
        headline: text(input.headline),
        description: text(input.description),
        shortDescription: text(input.shortDescription),
        logoUrl: nullableText(input.logoUrl),
        coverImageUrl: nullableText(input.coverImageUrl),
        categories:
          input.categories as Prisma.VendorProfileCreateInput["categories"],
        customCategoryLabel: nullableText(input.customCategoryLabel),
        languages: input.languages as string[],
        yearsExperience: nullableNumber(input.yearsExperience),
        pricingVisibility: text(
          input.pricingVisibility,
        ) as Prisma.VendorProfileCreateInput["pricingVisibility"],
        startingPriceMinor: toNullableBigInt(input.startingPriceMinor),
        currency: text(input.currency),
        responseTimeLabel: nullableText(input.responseTimeLabel),
        publicEmail: nullableText(input.publicEmail),
        publicPhone: nullableText(input.publicPhone),
        updatedById: userId,
      };
      const profile = current
        ? await tx.vendorProfile.update({
            where: { id: current.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.vendorProfile.create({
            data: { vendorOrganizationId: organizationId, ...data },
          });
      const organization = await tx.vendorOrganization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      const region = await tx.vendorServiceRegion.findFirst({
        where: { vendorOrganizationId: organizationId },
      });
      if (!region)
        await tx.vendorServiceRegion.create({
          data: {
            vendorOrganizationId: organizationId,
            country: organization.country,
          },
        });
      await this.event(tx, {
        name: "vendor.profile_updated.v1",
        aggregate: "VendorProfile",
        id: profile.id,
        version: profile.version,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
      });
      return vendorProfileResponse(profile);
    });
  }

  async publishVendorProfile(
    userId: string,
    organizationId: string,
    version: number,
    publish: boolean,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorProfile.findUnique({
        where: { vendorOrganizationId: organizationId },
      });
      if (!current) notFound("Profilul furnizorului nu există.");
      assertVersion(current.version, version);
      if (publish) {
        const entitlement = await this.ensureVendorEntitlementSnapshot(
          tx,
          organizationId,
        );
        if (
          readEntitlement(entitlement.entitlements, "PROFILE_PUBLICATION") !==
          true
        )
          problem(
            "ENTITLEMENT_REQUIRED",
            HttpStatus.PAYMENT_REQUIRED,
            "Planul curent nu permite publicarea profilului",
            undefined,
            undefined,
            { requiredCapability: "vendor.profile.publish" },
          );
      }
      const status = publish ? "PUBLISHED" : "UNPUBLISHED";
      const profile = await tx.vendorProfile.update({
        where: { id: current.id },
        data: {
          publicationStatus: status,
          publishedAt: publish ? new Date() : current.publishedAt,
          version: { increment: 1 },
          updatedById: userId,
        },
      });
      await this.event(tx, {
        name: publish
          ? "vendor.profile_published.v1"
          : "vendor.profile_unpublished.v1",
        aggregate: "VendorProfile",
        id: profile.id,
        version: profile.version,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
      });
      return vendorProfileResponse(profile);
    });
  }

  async vendorServices(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const services = await tx.vendorService.findMany({
        where: { vendorOrganizationId: organizationId, deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
      return {
        items: await Promise.all(
          services.map(async (service) => ({
            ...moneySafe(service),
            packages: (
              await tx.vendorPackage.findMany({
                where: { serviceId: service.id, deletedAt: null },
                orderBy: { position: "asc" },
              })
            ).map(moneySafe),
          })),
        ),
      };
    });
  }

  async createVendorService(
    userId: string,
    organizationId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "vendor.service.create",
        key,
        input,
      );
      if (replay) return replay;
      const entitlement = await this.ensureVendorEntitlementSnapshot(
        tx,
        organizationId,
      );
      const limit = Number(
        readEntitlement(entitlement.entitlements, "MAX_ACTIVE_SERVICES"),
      );
      if (Boolean(input.active) && Number.isInteger(limit)) {
        const active = await tx.vendorService.count({
          where: {
            vendorOrganizationId: organizationId,
            active: true,
            deletedAt: null,
          },
        });
        if (active >= limit)
          problem(
            "USAGE_LIMIT_REACHED",
            HttpStatus.PAYMENT_REQUIRED,
            "Ai atins limita de servicii active a planului curent",
            undefined,
            undefined,
            { requiredCapability: "vendor.services.write" },
          );
      }
      const service = await tx.vendorService.create({
        data: {
          vendorOrganizationId: organizationId,
          category: text(
            input.category,
          ) as Prisma.VendorServiceCreateInput["category"],
          customCategoryLabel: nullableText(input.customCategoryLabel),
          name: text(input.name),
          description: text(input.description),
          pricingModel: text(
            input.pricingModel,
          ) as Prisma.VendorServiceCreateInput["pricingModel"],
          startingPriceMinor: toNullableBigInt(input.startingPriceMinor),
          currency: text(input.currency),
          active: Boolean(input.active),
          createdById: userId,
        },
      });
      await this.event(tx, {
        name: "vendor.service_created.v1",
        aggregate: "VendorService",
        id: service.id,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
      });
      const response = moneySafe(service);
      await this.saveReplay(
        tx,
        null,
        userId,
        "vendor.service.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateVendorService(
    userId: string,
    organizationId: string,
    serviceId: string,
    version: number,
    input: JsonObject,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorService.findFirst({
        where: {
          id: serviceId,
          vendorOrganizationId: organizationId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Serviciul nu există.");
      assertVersion(current.version, version);
      const row = await tx.vendorService.update({
        where: { id: current.id },
        data: {
          ...(input.category !== undefined
            ? {
                category: text(
                  input.category,
                ) as Prisma.VendorServiceUpdateInput["category"],
              }
            : {}),
          ...(input.customCategoryLabel !== undefined
            ? { customCategoryLabel: nullableText(input.customCategoryLabel) }
            : {}),
          ...(input.name !== undefined ? { name: text(input.name) } : {}),
          ...(input.description !== undefined
            ? { description: text(input.description) }
            : {}),
          ...(input.pricingModel !== undefined
            ? {
                pricingModel: text(
                  input.pricingModel,
                ) as Prisma.VendorServiceUpdateInput["pricingModel"],
              }
            : {}),
          ...(input.startingPriceMinor !== undefined
            ? { startingPriceMinor: toNullableBigInt(input.startingPriceMinor) }
            : {}),
          ...(input.currency !== undefined
            ? { currency: text(input.currency) }
            : {}),
          ...(input.active !== undefined
            ? { active: Boolean(input.active) }
            : {}),
          version: { increment: 1 },
        },
      });
      return moneySafe(row);
    });
  }

  async deleteVendorService(
    userId: string,
    organizationId: string,
    serviceId: string,
    version: number,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorService.findFirst({
        where: {
          id: serviceId,
          vendorOrganizationId: organizationId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Serviciul nu există.");
      assertVersion(current.version, version);
      const row = await tx.vendorService.update({
        where: { id: current.id },
        data: {
          active: false,
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async createVendorPackage(
    userId: string,
    organizationId: string,
    serviceId: string,
    key: string,
    input: JsonObject,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const service = await tx.vendorService.findFirst({
        where: {
          id: serviceId,
          vendorOrganizationId: organizationId,
          deletedAt: null,
        },
      });
      if (!service) notFound("Serviciul nu există.");
      const replay = await this.replay(
        tx,
        userId,
        "vendor.package.create",
        key,
        { serviceId, ...input },
      );
      if (replay) return replay;
      const row = await tx.vendorPackage.create({
        data: {
          vendorOrganizationId: organizationId,
          serviceId,
          name: text(input.name),
          description: text(input.description),
          basePriceMinor: toNullableBigInt(input.basePriceMinor),
          currency: text(input.currency),
          includedItems: jsonInput(input.includedItems ?? []),
          excludedItems: jsonInput(input.excludedItems ?? []),
          guestLimit: nullableNumber(input.guestLimit),
          durationMinutes: nullableNumber(input.durationMinutes),
          active: Boolean(input.active),
          position: number(input.position),
          createdById: userId,
        },
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        null,
        userId,
        "vendor.package.create",
        key,
        { serviceId, ...input },
        response,
      );
      return response;
    });
  }

  async updateVendorPackage(
    userId: string,
    organizationId: string,
    packageId: string,
    version: number,
    input: JsonObject,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorPackage.findFirst({
        where: {
          id: packageId,
          vendorOrganizationId: organizationId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Pachetul nu există.");
      assertVersion(current.version, version);
      const row = await tx.vendorPackage.update({
        where: { id: current.id },
        data: packageUpdate(input),
      });
      return moneySafe(row);
    });
  }

  async deleteVendorPackage(
    userId: string,
    organizationId: string,
    packageId: string,
    version: number,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorPackage.findFirst({
        where: {
          id: packageId,
          vendorOrganizationId: organizationId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Pachetul nu există.");
      assertVersion(current.version, version);
      const row = await tx.vendorPackage.update({
        where: { id: current.id },
        data: {
          active: false,
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async vendorAvailability(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => ({
      items: await tx.vendorAvailabilityBlock.findMany({
        where: { vendorOrganizationId: organizationId, deletedAt: null },
        orderBy: { startAt: "asc" },
      }),
    }));
  }

  async createAvailability(
    userId: string,
    organizationId: string,
    key: string,
    input: JsonObject,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "vendor.availability.create",
        key,
        input,
      );
      if (replay) return replay;
      const row = await tx.vendorAvailabilityBlock.create({
        data: {
          vendorOrganizationId: organizationId,
          startAt: date(input.startAt),
          endAt: date(input.endAt),
          status: text(
            input.status,
          ) as Prisma.VendorAvailabilityBlockCreateInput["status"],
          source: text(input.source),
          notePrivate: nullableText(input.notePrivate),
          createdById: userId,
        },
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        null,
        userId,
        "vendor.availability.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateAvailability(
    userId: string,
    organizationId: string,
    blockId: string,
    version: number,
    input: JsonObject,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorAvailabilityBlock.findFirst({
        where: {
          id: blockId,
          vendorOrganizationId: organizationId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Intervalul de disponibilitate nu există.");
      assertVersion(current.version, version);
      const row = await tx.vendorAvailabilityBlock.update({
        where: { id: current.id },
        data: {
          ...(input.startAt !== undefined
            ? { startAt: date(input.startAt) }
            : {}),
          ...(input.endAt !== undefined ? { endAt: date(input.endAt) } : {}),
          ...(input.status !== undefined
            ? {
                status: text(
                  input.status,
                ) as Prisma.VendorAvailabilityBlockUpdateInput["status"],
              }
            : {}),
          ...(input.source !== undefined ? { source: text(input.source) } : {}),
          ...(input.notePrivate !== undefined
            ? { notePrivate: nullableText(input.notePrivate) }
            : {}),
          version: { increment: 1 },
        },
      });
      return moneySafe(row);
    });
  }

  async deleteAvailability(
    userId: string,
    organizationId: string,
    blockId: string,
    version: number,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const current = await tx.vendorAvailabilityBlock.findFirst({
        where: {
          id: blockId,
          vendorOrganizationId: organizationId,
          deletedAt: null,
        },
      });
      if (!current) notFound("Intervalul de disponibilitate nu există.");
      assertVersion(current.version, version);
      if (current.source === "BOOKING")
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Intervalul provine dintr-o rezervare activă",
        );
      const row = await tx.vendorAvailabilityBlock.update({
        where: { id: current.id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async marketplaceVendors(
    userId: string,
    query: Record<string, string | undefined>,
  ) {
    return this.database.withContext({ userId }, async (tx) => {
      const allowedSorts = [
        "RELEVANCE",
        "NEWEST",
        "STARTING_PRICE_ASC",
        "STARTING_PRICE_DESC",
        "RESPONSE_TIME",
      ];
      if (query.sort && !allowedSorts.includes(query.sort))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Sortare marketplace invalidă",
        );
      if (query.search && query.search.trim().length > 120)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Căutarea marketplace este prea lungă",
        );
      if (query.date && !/^\d{4}-\d{2}-\d{2}$/.test(query.date))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Data marketplace este invalidă",
        );
      const take = Math.min(Math.max(Number(query.limit ?? 24), 1), 50);
      const normalizedSearch = query.search?.trim().toLowerCase();
      const profiles = await tx.vendorProfile.findMany({
        where: {
          publicationStatus: "PUBLISHED",
          ...(query.category
            ? {
                categories: {
                  has: query.category as Prisma.EnumVendorCategoryFilter["equals"],
                },
              }
            : {}),
          ...(query.language ? { languages: { has: query.language } } : {}),
          ...(query.verified === "true"
            ? { verificationStatus: "VERIFIED" }
            : {}),
          ...(normalizedSearch
            ? {
                OR: [
                  {
                    headline: {
                      contains: normalizedSearch,
                      mode: "insensitive",
                    },
                  },
                  {
                    shortDescription: {
                      contains: normalizedSearch,
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {}),
          ...(query.priceMax
            ? { startingPriceMinor: { lte: BigInt(query.priceMax) } }
            : {}),
        },
        orderBy: marketplaceOrder(query.sort),
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const filtered = [];
      for (const profile of profiles) {
        const [organizationState] = await tx.$queryRaw<
          Array<{ active: boolean }>
        >`
          SELECT public.weddingos_public_vendor_organization_active(${profile.vendorOrganizationId}::uuid) AS active
        `;
        if (!organizationState?.active) continue;
        const regions = await tx.vendorServiceRegion.findMany({
          where: { vendorOrganizationId: profile.vendorOrganizationId },
        });
        if (
          query.country &&
          !regions.some(
            (region) =>
              region.country.toLowerCase() === query.country!.toLowerCase(),
          )
        )
          continue;
        if (
          query.region &&
          !regions.some(
            (region) =>
              region.region?.toLowerCase() === query.region!.toLowerCase(),
          )
        )
          continue;
        if (
          query.city &&
          !regions.some(
            (region) =>
              region.city?.toLowerCase() === query.city!.toLowerCase(),
          )
        )
          continue;
        let availabilityStatus:
          "AVAILABLE" | "TENTATIVE" | "UNAVAILABLE" | "UNKNOWN" = "UNKNOWN";
        if (query.date) {
          const start = new Date(`${query.date}T00:00:00.000Z`);
          const end = new Date(`${query.date}T23:59:59.999Z`);
          const availability = await tx.vendorAvailabilityBlock.findMany({
            where: {
              vendorOrganizationId: profile.vendorOrganizationId,
              deletedAt: null,
              startAt: { lte: end },
              endAt: { gte: start },
            },
            select: { status: true },
          });
          availabilityStatus = availability.some((item) =>
            ["UNAVAILABLE", "BOOKED"].includes(item.status),
          )
            ? "UNAVAILABLE"
            : availability.some((item) => item.status === "TENTATIVE")
              ? "TENTATIVE"
              : availability.some((item) => item.status === "AVAILABLE")
                ? "AVAILABLE"
                : "UNKNOWN";
          if (availabilityStatus !== "AVAILABLE") continue;
        }
        const services = await tx.vendorService.findMany({
          where: {
            vendorOrganizationId: profile.vendorOrganizationId,
            active: true,
            deletedAt: null,
          },
        });
        if (
          query.service &&
          !services.some((service) =>
            service.name.toLowerCase().includes(query.service!.toLowerCase()),
          )
        )
          continue;
        filtered.push({
          ...vendorProfileResponse(profile),
          ratingSummary: moneySafe(
            await tx.vendorRatingAggregate.findUnique({
              where: { vendorOrganizationId: profile.vendorOrganizationId },
            }),
          ),
          availabilityStatus,
          services: services.map(moneySafe),
          serviceRegions: regions.map(moneySafe),
        });
      }
      return {
        items: filtered.slice(0, take),
        nextCursor: profiles.length > take ? profiles[take - 1]!.id : null,
        availableSorts: allowedSorts,
      };
    });
  }

  async marketplaceVendor(userId: string, slug: string) {
    return this.database.withContext({ userId }, async (tx) => {
      const profile = await tx.vendorProfile.findFirst({
        where: { slug, publicationStatus: "PUBLISHED" },
      });
      if (!profile) notFound("Furnizorul nu există sau nu este publicat.");
      const [organizationState] = await tx.$queryRaw<
        Array<{ active: boolean }>
      >`
        SELECT public.weddingos_public_vendor_organization_active(${profile.vendorOrganizationId}::uuid) AS active
      `;
      if (!organizationState?.active)
        notFound("Furnizorul nu există sau nu este publicat.");
      const [services, packages, regions, portfolio] = await Promise.all([
        tx.vendorService.findMany({
          where: {
            vendorOrganizationId: profile.vendorOrganizationId,
            active: true,
            deletedAt: null,
          },
        }),
        tx.vendorPackage.findMany({
          where: {
            vendorOrganizationId: profile.vendorOrganizationId,
            active: true,
            deletedAt: null,
          },
          orderBy: { position: "asc" },
        }),
        tx.vendorServiceRegion.findMany({
          where: { vendorOrganizationId: profile.vendorOrganizationId },
        }),
        tx.vendorPortfolioReference.findMany({
          where: {
            vendorOrganizationId: profile.vendorOrganizationId,
            published: true,
            deletedAt: null,
          },
          orderBy: { position: "asc" },
        }),
      ]);
      return {
        ...vendorProfileResponse(profile),
        ratingSummary: moneySafe(
          await tx.vendorRatingAggregate.findUnique({
            where: { vendorOrganizationId: profile.vendorOrganizationId },
          }),
        ),
        availabilityStatus: "UNKNOWN" as const,
        services: services.map(moneySafe),
        packages: packages.map(moneySafe),
        serviceRegions: regions.map(moneySafe),
        portfolio: portfolio.map((item) => ({
          ...moneySafe(item),
          url: `/api/v1/marketplace/portfolio-assets/${item.artifactId}`,
        })),
      };
    });
  }

  async favorites(userId: string, workspaceId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const favorites = await tx.vendorFavorite.findMany({
        where: { workspaceId, userId },
        orderBy: { createdAt: "desc" },
      });
      const items = await Promise.all(
        favorites.map(async (favorite) => {
          const profile = await tx.vendorProfile.findUnique({
            where: { vendorOrganizationId: favorite.vendorOrganizationId },
          });
          return profile
            ? { favoriteId: favorite.id, ...vendorProfileResponse(profile) }
            : null;
        }),
      );
      return { items: items.filter((item) => item !== null) };
    });
  }

  async setFavorite(
    userId: string,
    workspaceId: string,
    vendorOrganizationId: string,
    active: boolean,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const profile = await tx.vendorProfile.findFirst({
        where: { vendorOrganizationId, publicationStatus: "PUBLISHED" },
      });
      if (!profile) notFound("Furnizorul public nu există.");
      if (!active) {
        await tx.vendorFavorite.deleteMany({
          where: { workspaceId, userId, vendorOrganizationId },
        });
        return { vendorOrganizationId, favorite: false };
      }
      await tx.vendorFavorite.upsert({
        where: {
          workspaceId_userId_vendorOrganizationId: {
            workspaceId,
            userId,
            vendorOrganizationId,
          },
        },
        create: { workspaceId, userId, vendorOrganizationId },
        update: {},
      });
      return { vendorOrganizationId, favorite: true };
    });
  }

  async shortlists(userId: string, workspaceId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const rows = await tx.vendorShortlist.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      return {
        items: await Promise.all(
          rows.map(async (row) => ({
            ...row,
            vendors: await tx.vendorShortlistItem.findMany({
              where: { shortlistId: row.id },
              orderBy: { position: "asc" },
            }),
          })),
        ),
      };
    });
  }

  async createShortlist(
    userId: string,
    workspaceId: string,
    key: string,
    input: JsonObject,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "vendor.shortlist.create",
        key,
        input,
      );
      if (replay) return replay;
      const row = await tx.vendorShortlist.create({
        data: {
          workspaceId,
          name: text(input.name),
          category: input.category
            ? (text(
                input.category,
              ) as Prisma.VendorShortlistCreateInput["category"])
            : null,
          createdById: userId,
        },
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "vendor.shortlist.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateShortlist(
    userId: string,
    workspaceId: string,
    shortlistId: string,
    version: number,
    input: JsonObject,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.vendorShortlist.findFirst({
        where: { id: shortlistId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Lista scurtă nu există.");
      assertVersion(current.version, version);
      return tx.vendorShortlist.update({
        where: { id: current.id },
        data: {
          ...(input.name !== undefined ? { name: text(input.name) } : {}),
          ...(input.category !== undefined
            ? {
                category: input.category
                  ? (text(
                      input.category,
                    ) as Prisma.VendorShortlistUpdateInput["category"])
                  : null,
              }
            : {}),
          version: { increment: 1 },
        },
      });
    });
  }

  async deleteShortlist(
    userId: string,
    workspaceId: string,
    shortlistId: string,
    version: number,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.vendorShortlist.findFirst({
        where: { id: shortlistId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Lista scurtă nu există.");
      assertVersion(current.version, version);
      const row = await tx.vendorShortlist.update({
        where: { id: current.id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async setShortlistVendor(
    userId: string,
    workspaceId: string,
    shortlistId: string,
    vendorOrganizationId: string,
    active: boolean,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const shortlist = await tx.vendorShortlist.findFirst({
        where: { id: shortlistId, workspaceId, deletedAt: null },
      });
      if (!shortlist) notFound("Lista scurtă nu există.");
      if (!active) {
        await tx.vendorShortlistItem.deleteMany({
          where: { shortlistId, vendorOrganizationId },
        });
        return { shortlistId, vendorOrganizationId, included: false };
      }
      const profile = await tx.vendorProfile.findFirst({
        where: { vendorOrganizationId, publicationStatus: "PUBLISHED" },
      });
      if (!profile) notFound("Furnizorul public nu există.");
      const position = await tx.vendorShortlistItem.count({
        where: { shortlistId },
      });
      await tx.vendorShortlistItem.upsert({
        where: {
          shortlistId_vendorOrganizationId: {
            shortlistId,
            vendorOrganizationId,
          },
        },
        create: {
          workspaceId,
          shortlistId,
          vendorOrganizationId,
          position,
          createdById: userId,
        },
        update: {},
      });
      return { shortlistId, vendorOrganizationId, included: true };
    });
  }

  async rfqs(
    userId: string,
    workspaceId: string,
    query: Record<string, string | undefined>,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const take = 50;
      const rows = await tx.requestForQuote.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...(query.status
            ? {
                status:
                  query.status as Prisma.RequestForQuoteWhereInput["status"],
              }
            : {}),
          ...(query.category
            ? {
                category:
                  query.category as Prisma.RequestForQuoteWhereInput["category"],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      return {
        items: await Promise.all(
          rows.slice(0, take).map((row) => this.mapRfq(tx, row)),
        ),
        nextCursor: rows.length > take ? rows[take - 1]!.id : null,
      };
    });
  }

  async createRfq(
    userId: string,
    workspaceId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(tx, userId, "rfq.create", key, input);
      if (replay) return replay;
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      assertCurrency(text(input.currency), workspace.currency);
      const row = await tx.requestForQuote.create({
        data: {
          workspaceId,
          title: text(input.title),
          category: text(
            input.category,
          ) as Prisma.RequestForQuoteCreateInput["category"],
          description: text(input.description),
          weddingEventId: nullableText(input.weddingEventId),
          eventDate: input.eventDate ? date(input.eventDate) : null,
          guestCount: nullableNumber(input.guestCount),
          locationSnapshot: jsonInput(input.locationSnapshot ?? {}),
          budgetRangeMinMinor: toNullableBigInt(input.budgetRangeMinMinor),
          budgetRangeMaxMinor: toNullableBigInt(input.budgetRangeMaxMinor),
          currency: text(input.currency),
          awardPolicy: "SINGLE_AWARD",
          responseDeadline: date(input.responseDeadline),
          createdById: userId,
          idempotencyKey: key,
        },
      });
      await this.replaceRfqChildren(tx, workspaceId, row.id, input);
      await this.event(tx, {
        name: "rfq.created.v1",
        aggregate: "RequestForQuote",
        id: row.id,
        workspaceId,
        actorUserId: userId,
        correlationId,
        activity: {
          category: "commercial",
          action: "rfq_created",
          summary: `Solicitarea „${row.title}” a fost creată.`,
          entityType: "RequestForQuote",
          entityId: row.id,
        },
      });
      const response = await this.mapRfq(tx, row);
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "rfq.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async rfq(userId: string, workspaceId: string, rfqId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const row = await tx.requestForQuote.findFirst({
        where: { id: rfqId, workspaceId, deletedAt: null },
      });
      if (!row) notFound("Solicitarea nu există.");
      return this.mapRfq(tx, row);
    });
  }

  async updateRfq(
    userId: string,
    workspaceId: string,
    rfqId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.requestForQuote.findFirst({
        where: { id: rfqId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Solicitarea nu există.");
      assertVersion(current.version, version);
      if (!(["DRAFT", "READY"] as string[]).includes(current.status))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Solicitarea trimisă nu mai poate fi editată direct",
        );
      if (input.currency !== undefined) {
        const workspace = await tx.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
        });
        assertCurrency(text(input.currency), workspace.currency);
      }
      const row = await tx.requestForQuote.update({
        where: { id: current.id },
        data: rfqUpdate(input),
      });
      if (input.requirements !== undefined || input.questions !== undefined)
        await this.replaceRfqChildren(tx, workspaceId, row.id, input);
      await this.event(tx, {
        name: "rfq.updated.v1",
        aggregate: "RequestForQuote",
        id: row.id,
        version: row.version,
        workspaceId,
        actorUserId: userId,
        correlationId,
      });
      return this.mapRfq(tx, row);
    });
  }

  async deleteRfq(
    userId: string,
    workspaceId: string,
    rfqId: string,
    version: number,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.requestForQuote.findFirst({
        where: { id: rfqId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Solicitarea nu există.");
      assertVersion(current.version, version);
      if (
        !(["DRAFT", "CANCELLED", "ARCHIVED"] as string[]).includes(
          current.status,
        )
      )
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Solicitarea activă trebuie anulată înainte de ștergere",
        );
      const row = await tx.requestForQuote.update({
        where: { id: current.id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async rfqRecipients(userId: string, workspaceId: string, rfqId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      await this.requireRfq(tx, workspaceId, rfqId);
      return {
        items: await tx.rfqRecipient.findMany({
          where: { rfqId },
          orderBy: { createdAt: "asc" },
        }),
      };
    });
  }

  async replaceRfqRecipients(
    userId: string,
    workspaceId: string,
    rfqId: string,
    version: number,
    input: JsonObject,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const rfq = await this.requireRfq(tx, workspaceId, rfqId);
      assertVersion(rfq.version, version);
      if (!(["DRAFT", "READY"] as string[]).includes(rfq.status))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Destinatarii nu mai pot fi schimbați după trimitere",
        );
      const ids = input.vendorOrganizationIds as string[];
      const profiles = await tx.vendorProfile.findMany({
        where: {
          vendorOrganizationId: { in: ids },
          publicationStatus: "PUBLISHED",
        },
      });
      if (profiles.length !== ids.length)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Unul sau mai mulți furnizori nu sunt publicați",
        );
      await tx.rfqRecipient.deleteMany({ where: { rfqId } });
      await tx.rfqRecipient.createMany({
        data: ids.map((vendorOrganizationId) => ({
          workspaceId,
          rfqId,
          vendorOrganizationId,
          status: "PENDING" as const,
          expiresAt: rfq.responseDeadline,
        })),
      });
      await tx.requestForQuote.update({
        where: { id: rfq.id },
        data: { version: { increment: 1 } },
      });
      return {
        items: await tx.rfqRecipient.findMany({
          where: { rfqId },
          orderBy: { createdAt: "asc" },
        }),
        version: rfq.version + 1,
      };
    });
  }

  async recipientPreview(userId: string, workspaceId: string, rfqId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const rfq = await this.requireRfq(tx, workspaceId, rfqId);
      const recipients = await tx.rfqRecipient.findMany({ where: { rfqId } });
      const items = [];
      for (const recipient of recipients) {
        const profile = await tx.vendorProfile.findUnique({
          where: { vendorOrganizationId: recipient.vendorOrganizationId },
        });
        items.push({
          recipientId: recipient.id,
          vendorOrganizationId: recipient.vendorOrganizationId,
          vendor: profile ? publicVendorSnapshot(profile) : null,
          deliverable: profile?.publicationStatus === "PUBLISHED",
        });
      }
      return {
        rfq: moneySafe(rfq),
        items,
        canSend: items.length > 0 && items.every((item) => item.deliverable),
      };
    });
  }

  async transitionRfq(
    userId: string,
    workspaceId: string,
    rfqId: string,
    version: number,
    key: string | null,
    transition: string,
    reason: string | null,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      if (transition === "SEND" && !key)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Idempotency-Key required",
        );
      if (transition === "SEND" && key) {
        const replay = await this.replay(tx, userId, "rfq.send", key, {
          rfqId,
          version,
        });
        if (replay) return replay;
      }
      const current = await this.requireRfq(tx, workspaceId, rfqId);
      assertVersion(current.version, version);
      const next = rfqTransition(current.status, transition);
      const recipients = await tx.rfqRecipient.findMany({ where: { rfqId } });
      if (transition === "SEND" && recipients.length === 0)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Selectează cel puțin un furnizor",
        );
      if (transition === "SEND") {
        for (const recipient of recipients) {
          const profile = await tx.vendorProfile.findFirst({
            where: {
              vendorOrganizationId: recipient.vendorOrganizationId,
              publicationStatus: "PUBLISHED",
            },
          });
          if (!profile)
            problem(
              "VALIDATION_FAILED",
              HttpStatus.CONFLICT,
              "Un furnizor selectat nu mai este public",
            );
          await tx.rfqRecipientSnapshot.upsert({
            where: { rfqRecipientId: recipient.id },
            create: {
              workspaceId,
              rfqRecipientId: recipient.id,
              vendorOrganizationId: recipient.vendorOrganizationId,
              vendorDisplayName: profile.headline,
              vendorProfileSlug: profile.slug,
              payload: jsonInput(publicVendorSnapshot(profile)),
            },
            update: {},
          });
          await tx.rfqRecipient.update({
            where: { id: recipient.id },
            data: { status: "QUEUED", version: { increment: 1 } },
          });
          await this.asyncEvents.record(tx, {
            eventName: "rfq.sent.v1",
            aggregateType: "RfqRecipient",
            aggregateId: recipient.id,
            workspaceId,
            vendorOrganizationId: recipient.vendorOrganizationId,
            actorUserId: userId,
            correlationId,
            idempotencyKey: key ?? undefined,
            deduplicationKey: `rfq-delivery:${recipient.id}`,
            payload: {
              subject: { rfqId, recipientId: recipient.id },
              rfqDelivery: { recipientId: recipient.id },
              vendorNotificationProjection: {
                vendorOrganizationId: recipient.vendorOrganizationId,
              },
            },
          });
        }
      }
      const row = await tx.requestForQuote.update({
        where: { id: current.id },
        data: {
          status: next,
          ...(transition === "SEND" ? { sentAt: new Date() } : {}),
          ...(transition === "CLOSE" ? { closedAt: new Date() } : {}),
          ...(transition === "CANCEL" ? { cancellationReason: reason } : {}),
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name:
          transition === "SEND"
            ? "rfq.sent.v1"
            : transition === "CANCEL"
              ? "rfq.cancelled.v1"
              : "rfq.updated.v1",
        aggregate: "RequestForQuote",
        id: row.id,
        version: row.version,
        workspaceId,
        actorUserId: userId,
        correlationId,
        activity: {
          category: "commercial",
          action: `rfq_${transition.toLowerCase()}`,
          summary: `Solicitarea „${row.title}” a fost ${transition.toLowerCase()}.`,
          entityType: "RequestForQuote",
          entityId: row.id,
        },
      });
      const response = await this.mapRfq(tx, row);
      if (transition === "SEND" && key)
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "rfq.send",
          key,
          { rfqId, version },
          response,
        );
      return response;
    });
  }

  async vendorRfqs(userId: string, organizationId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const recipients = await tx.rfqRecipient.findMany({
        where: {
          vendorOrganizationId: organizationId,
          status: { notIn: ["CANCELLED"] },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        items: await Promise.all(
          recipients.map(async (recipient) => {
            const rfq = await tx.requestForQuote.findUnique({
              where: { id: recipient.rfqId },
            });
            return rfq
              ? {
                  recipient: moneySafe(recipient),
                  rfq: await this.mapVendorRfq(tx, rfq, organizationId),
                }
              : null;
          }),
        ).then((items) => items.filter((item) => item !== null)),
      };
    });
  }

  async vendorRfq(userId: string, organizationId: string, rfqId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const recipient = await tx.rfqRecipient.findFirst({
        where: {
          rfqId,
          vendorOrganizationId: organizationId,
          status: { notIn: ["CANCELLED"] },
        },
      });
      if (!recipient)
        notFound("Solicitarea nu a fost adresată acestei organizații.");
      const rfq = await tx.requestForQuote.findUnique({ where: { id: rfqId } });
      if (!rfq) notFound("Solicitarea nu există.");
      return {
        recipient: moneySafe(recipient),
        rfq: await this.mapVendorRfq(tx, rfq, organizationId),
      };
    });
  }

  async vendorRfqAction(
    userId: string,
    organizationId: string,
    rfqId: string,
    action: "open" | "decline",
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const recipient = await tx.rfqRecipient.findFirst({
        where: { rfqId, vendorOrganizationId: organizationId },
      });
      if (!recipient)
        notFound("Solicitarea nu a fost adresată acestei organizații.");
      if (action === "open" && recipient.status === "SENT") {
        await tx.rfqRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "OPENED",
            openedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      if (action === "decline") {
        if (["RESPONDED", "CANCELLED", "EXPIRED"].includes(recipient.status))
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Solicitarea nu mai poate fi refuzată",
          );
        await tx.rfqRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "DECLINED",
            declinedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          name: "rfq.declined.v1",
          aggregate: "RfqRecipient",
          id: recipient.id,
          workspaceId: recipient.workspaceId,
          vendorOrganizationId: organizationId,
          actorUserId: userId,
          correlationId,
        });
      }
      return this.vendorRfq(userId, organizationId, rfqId);
    });
  }

  async createOffer(
    userId: string,
    organizationId: string,
    rfqId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const replay = await this.replay(tx, userId, "vendor.offer.create", key, {
        rfqId,
        ...input,
      });
      if (replay) return replay;
      const recipient = await tx.rfqRecipient.findFirst({
        where: {
          rfqId,
          vendorOrganizationId: organizationId,
          status: { in: ["SENT", "OPENED"] },
        },
      });
      if (!recipient)
        notFound("Solicitarea nu este disponibilă pentru ofertare.");
      const rfq = await tx.requestForQuote.findUnique({ where: { id: rfqId } });
      if (!rfq || ["CLOSED", "CANCELLED", "ARCHIVED"].includes(rfq.status))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Solicitarea nu mai acceptă oferte",
        );
      assertCurrency(text(input.currency), rfq.currency);
      const totals = offerTotals(input);
      const offer = await tx.vendorOffer.create({
        data: {
          workspaceId: recipient.workspaceId,
          vendorOrganizationId: organizationId,
          rfqId,
          rfqRecipientId: recipient.id,
          currency: text(input.currency),
          subtotalMinor: BigInt(totals.subtotalMinor),
          discountMinor: BigInt(totals.discountMinor),
          taxMinor: BigInt(totals.taxMinor),
          totalMinor: BigInt(totals.totalMinor),
          depositMinor: toNullableBigInt(input.depositMinor),
          validUntil: input.validUntil ? date(input.validUntil) : null,
          idempotencyKey: key,
          createdById: userId,
        },
      });
      await this.createOfferVersion(tx, offer, 1, input, userId, totals);
      await this.event(tx, {
        name: "offer.draft_created.v1",
        aggregate: "VendorOffer",
        id: offer.id,
        workspaceId: offer.workspaceId,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
        offerProjection: { offerId: offer.id },
      });
      const response = await this.mapOffer(tx, offer);
      await this.saveReplay(
        tx,
        null,
        userId,
        "vendor.offer.create",
        key,
        { rfqId, ...input },
        response,
      );
      return response;
    });
  }

  async vendorOffer(userId: string, organizationId: string, offerId: string) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const offer = await tx.vendorOffer.findFirst({
        where: { id: offerId, vendorOrganizationId: organizationId },
      });
      if (!offer) notFound("Oferta nu există.");
      return this.mapOffer(tx, offer);
    });
  }

  async updateOfferDraft(
    userId: string,
    organizationId: string,
    offerId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const offer = await tx.vendorOffer.findFirst({
        where: { id: offerId, vendorOrganizationId: organizationId },
      });
      if (!offer) notFound("Oferta nu există.");
      assertVersion(offer.version, version);
      if (!(["DRAFT", "REVISION_REQUESTED"] as string[]).includes(offer.status))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Oferta nu este editabilă",
        );
      const currentVersion = await this.offerVersion(tx, offer);
      const merged = await this.mergeOfferInput(tx, currentVersion.id, input);
      const rfq = await tx.requestForQuote.findUniqueOrThrow({
        where: { id: offer.rfqId },
      });
      assertCurrency(text(merged.currency), rfq.currency);
      const totals = offerTotals(merged);
      const nextVersion = offer.currentVersionNumber + 1;
      await this.createOfferVersion(
        tx,
        offer,
        nextVersion,
        merged,
        userId,
        totals,
      );
      const row = await tx.vendorOffer.update({
        where: { id: offer.id },
        data: {
          status: offer.status === "REVISION_REQUESTED" ? "REVISED" : "DRAFT",
          currentVersionNumber: nextVersion,
          currency: text(merged.currency),
          subtotalMinor: BigInt(totals.subtotalMinor),
          discountMinor: BigInt(totals.discountMinor),
          taxMinor: BigInt(totals.taxMinor),
          totalMinor: BigInt(totals.totalMinor),
          depositMinor: toNullableBigInt(merged.depositMinor),
          validUntil: merged.validUntil ? date(merged.validUntil) : null,
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name: "offer.revised.v1",
        aggregate: "VendorOffer",
        id: row.id,
        version: row.version,
        workspaceId: row.workspaceId,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
        offerProjection: { offerId: row.id },
      });
      return this.mapOffer(tx, row);
    });
  }

  async submitOffer(
    userId: string,
    organizationId: string,
    offerId: string,
    version: number,
    key: string,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const replay = await this.replay(tx, userId, "vendor.offer.submit", key, {
        offerId,
        version,
      });
      if (replay) return replay;
      const offer = await tx.vendorOffer.findFirst({
        where: { id: offerId, vendorOrganizationId: organizationId },
      });
      if (!offer) notFound("Oferta nu există.");
      assertVersion(offer.version, version);
      if (!(["DRAFT", "REVISED"] as string[]).includes(offer.status))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Oferta nu poate fi trimisă în starea curentă",
        );
      if (offer.validUntil && offer.validUntil <= new Date())
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Oferta a expirat înainte de trimitere",
        );
      const row = await tx.vendorOffer.update({
        where: { id: offer.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.rfqRecipient.update({
        where: { id: row.rfqRecipientId },
        data: {
          status: "RESPONDED",
          respondedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.refreshRfqResponseStatus(tx, row.rfqId);
      await this.event(tx, {
        name: "offer.submitted.v1",
        aggregate: "VendorOffer",
        id: row.id,
        version: row.version,
        workspaceId: row.workspaceId,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
        offerProjection: { offerId: row.id },
        notification: await this.workspaceNotification(
          tx,
          row.workspaceId,
          "offer_submitted",
          "Ofertă nouă",
          "Un furnizor a trimis o ofertă.",
          `/offers/${row.id}`,
        ),
        activity: {
          category: "commercial",
          action: "offer_submitted",
          summary: "A fost trimisă o ofertă nouă.",
          entityType: "VendorOffer",
          entityId: row.id,
        },
      });
      const response = await this.mapOffer(tx, row);
      await this.saveReplay(
        tx,
        null,
        userId,
        "vendor.offer.submit",
        key,
        { offerId, version },
        response,
      );
      return response;
    });
  }

  async withdrawOffer(
    userId: string,
    organizationId: string,
    offerId: string,
    version: number,
    correlationId: string,
  ) {
    return this.vendorContext(userId, organizationId, async (tx) => {
      const offer = await tx.vendorOffer.findFirst({
        where: { id: offerId, vendorOrganizationId: organizationId },
      });
      if (!offer) notFound("Oferta nu există.");
      assertVersion(offer.version, version);
      if (
        ["ACCEPTED", "REJECTED", "WITHDRAWN", "SUPERSEDED"].includes(
          offer.status,
        )
      )
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Oferta nu mai poate fi retrasă",
        );
      const row = await tx.vendorOffer.update({
        where: { id: offer.id },
        data: { status: "WITHDRAWN", version: { increment: 1 } },
      });
      await this.event(tx, {
        name: "offer.withdrawn.v1",
        aggregate: "VendorOffer",
        id: row.id,
        version: row.version,
        workspaceId: row.workspaceId,
        vendorOrganizationId: organizationId,
        actorUserId: userId,
        correlationId,
        offerProjection: { offerId: row.id },
      });
      return this.mapOffer(tx, row);
    });
  }

  async offers(
    userId: string,
    workspaceId: string,
    query: Record<string, string | undefined>,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const rows = await tx.vendorOffer.findMany({
        where: {
          workspaceId,
          ...(query.rfqId ? { rfqId: query.rfqId } : {}),
          ...(query.status
            ? { status: query.status as Prisma.VendorOfferWhereInput["status"] }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
      });
      return {
        items: await Promise.all(rows.map((row) => this.mapOffer(tx, row))),
      };
    });
  }

  async offer(userId: string, workspaceId: string, offerId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const offer = await tx.vendorOffer.findFirst({
        where: { id: offerId, workspaceId },
      });
      if (!offer) notFound("Oferta nu există.");
      return this.mapOffer(tx, offer);
    });
  }

  async offerComparison(userId: string, workspaceId: string, rfqId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      await this.requireRfq(tx, workspaceId, rfqId);
      const offers = await tx.vendorOffer.findMany({
        where: {
          workspaceId,
          rfqId,
          status: {
            in: [
              "SUBMITTED",
              "UNDER_REVIEW",
              "REVISION_REQUESTED",
              "REVISED",
              "ACCEPTED",
              "REJECTED",
            ],
          },
        },
        orderBy: [{ totalMinor: "asc" }, { submittedAt: "asc" }],
      });
      const mapped = await Promise.all(
        offers.map((offer) => this.mapOffer(tx, offer)),
      );
      const totals = offers.map((offer) => Number(offer.totalMinor));
      const min = totals.length ? Math.min(...totals) : 0;
      return {
        rfqId,
        currency: offers[0]?.currency ?? null,
        weights: {
          PRICE: 40,
          COVERAGE: 25,
          AVAILABILITY: 15,
          PAYMENT_FLEXIBILITY: 10,
          RESPONSE_COMPLETENESS: 10,
        },
        items: mapped.map((item) => {
          const total = number(item.totalMinor);
          const priceScore =
            total > 0 && min > 0 ? Math.round((min / total) * 100) : 0;
          return {
            ...item,
            score: {
              total: priceScore * 0.4 + 60,
              explanation:
                "Scor determinist: preț 40%, acoperire 25%, disponibilitate 15%, flexibilitate plată 10%, completitudine 10%.",
              components: {
                PRICE: priceScore,
                COVERAGE: 100,
                AVAILABILITY: 100,
                PAYMENT_FLEXIBILITY: 50,
                RESPONSE_COMPLETENESS: 100,
              },
            },
          };
        }),
        recommendation: null,
      };
    });
  }

  async transitionOffer(
    userId: string,
    workspaceId: string,
    offerId: string,
    version: number,
    key: string | null,
    transition: string,
    reason: string | null,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      if (transition === "ACCEPT" && !key)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Idempotency-Key required",
        );
      if (transition === "ACCEPT" && key) {
        const replay = await this.replay(tx, userId, "offer.accept", key, {
          offerId,
          version,
        });
        if (replay) return replay;
      }
      const offer = await tx.vendorOffer.findFirst({
        where: { id: offerId, workspaceId },
      });
      if (!offer) notFound("Oferta nu există.");
      assertVersion(offer.version, version);
      const next = offerTransition(offer.status, transition);
      if (transition === "REQUEST_REVISION" && !reason)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Motivul reviziei este obligatoriu",
        );
      let booking = null;
      let contract = null;
      if (transition === "ACCEPT") {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${offer.rfqId}, 0))
        `;
        const [rfq, workspace, recipient, acceptedVersion, partyRows] =
          await Promise.all([
            tx.requestForQuote.findUniqueOrThrow({
              where: { id: offer.rfqId },
            }),
            tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
            tx.rfqRecipient.findUniqueOrThrow({
              where: { id: offer.rfqRecipientId },
            }),
            this.offerVersion(tx, offer),
            tx.$queryRaw<
              Array<{
                organization_status: string;
                legal_name: string;
                display_name: string;
                country: string;
                profile_publication_status: string;
                public_profile: Prisma.JsonValue;
              }>
            >`SELECT * FROM public.weddingos_offer_acceptance_party_context(
            ${workspaceId}::uuid,
            ${offer.id}::uuid,
            ${offer.vendorOrganizationId}::uuid
          )`,
          ]);
        const party = partyRows[0];
        if (!party) notFound("Relația comercială nu este disponibilă.");
        if (rfq.awardPolicy !== "SINGLE_AWARD")
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Politica de atribuire nu este disponibilă în acest slice",
          );
        if (rfq.awardedOfferId && rfq.awardedOfferId !== offer.id)
          problem(
            "RFQ_ALREADY_AWARDED",
            HttpStatus.CONFLICT,
            "Solicitarea are deja o ofertă câștigătoare",
          );
        if (["CANCELLED", "ARCHIVED"].includes(rfq.status))
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Solicitarea nu mai poate fi atribuită",
          );
        if (offer.validUntil && offer.validUntil <= new Date())
          problem("VALIDATION_FAILED", HttpStatus.CONFLICT, "Oferta a expirat");
        if (recipient.status !== "RESPONDED")
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Destinatarul ofertei nu este într-o stare acceptabilă",
          );
        if (party.organization_status !== "ACTIVE")
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Organizația furnizorului nu mai este activă",
          );
        assertCurrency(rfq.currency, workspace.currency);
        assertCurrency(offer.currency, workspace.currency);
        assertCurrency(acceptedVersion.currency, workspace.currency);
        if (
          acceptedVersion.subtotalMinor !== offer.subtotalMinor ||
          acceptedVersion.discountMinor !== offer.discountMinor ||
          acceptedVersion.taxMinor !== offer.taxMinor ||
          acceptedVersion.totalMinor !== offer.totalMinor
        )
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Totalurile ofertei nu mai corespund versiunii acceptate",
          );
        if (rfq.eventDate) {
          const [availability] = await tx.$queryRaw<
            Array<{ statuses: string[] }>
          >`SELECT public.weddingos_offer_acceptance_availability(
            ${workspaceId}::uuid,
            ${offer.id}::uuid,
            ${offer.vendorOrganizationId}::uuid
          ) AS statuses`;
          const statuses = availability?.statuses ?? [];
          const explicitlyAvailable = statuses.includes("AVAILABLE");
          const blocked = statuses.some((status) =>
            ["TENTATIVE", "UNAVAILABLE", "BOOKED"].includes(status),
          );
          if (!explicitlyAvailable || blocked)
            problem(
              "AVAILABILITY_NOT_CONFIRMED",
              HttpStatus.CONFLICT,
              "Disponibilitatea furnizorului nu este confirmată explicit",
            );
        }
        const existing = await tx.vendorBooking.findUnique({
          where: { offerId: offer.id },
        });
        if (existing) {
          booking = existing;
        } else {
          const requirements = await tx.rfqRequirement.findMany({
            where: { rfqId: rfq.id },
            orderBy: { position: "asc" },
          });
          const answers = await tx.vendorOfferAnswer.findMany({
            where: { offerVersionId: acceptedVersion.id },
          });
          booking = await tx.vendorBooking.create({
            data: {
              workspaceId,
              vendorOrganizationId: offer.vendorOrganizationId,
              offerId: offer.id,
              rfqId: offer.rfqId,
              title: rfq.title,
              currency: offer.currency,
              totalMinor: offer.totalMinor,
              depositMinor: offer.depositMinor,
              serviceStartAt: rfq.eventDate,
              serviceEndAt: rfq.eventDate,
              acceptedOfferVersion: offer.currentVersionNumber,
              acceptedOfferVersionId: acceptedVersion.id,
              vendorSnapshot: jsonInput({
                id: offer.vendorOrganizationId,
                displayName: party.display_name,
                profile: party.public_profile,
              }),
              commercialSnapshot: jsonInput({
                offerId: offer.id,
                offerVersionId: acceptedVersion.id,
                offerVersion: offer.currentVersionNumber,
                currency: offer.currency,
                subtotalMinor: moneyNumber(offer.subtotalMinor),
                discountMinor: moneyNumber(offer.discountMinor),
                taxMinor: moneyNumber(offer.taxMinor),
                totalMinor: moneyNumber(offer.totalMinor),
                depositMinor: moneyNumber(offer.depositMinor),
                availabilityConfirmation:
                  acceptedVersion.availabilityConfirmation,
                cancellationTerms: acceptedVersion.cancellationTerms,
              }),
              rfqSnapshot: jsonInput({
                id: rfq.id,
                title: rfq.title,
                eventDate: rfq.eventDate,
                requirements: moneySafe(requirements),
                answers: moneySafe(answers),
              }),
              createdById: userId,
            },
          });
          const lines = await tx.vendorOfferLineItem.findMany({
            where: {
              offerVersionId: acceptedVersion.id,
              OR: [{ optional: false }, { selected: true }],
            },
            orderBy: { position: "asc" },
          });
          await tx.bookingServiceItem.createMany({
            data: lines.map((line) => ({
              workspaceId,
              vendorOrganizationId: offer.vendorOrganizationId,
              bookingId: booking!.id,
              sourceOfferLineItemId: line.id,
              name: line.name,
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              unitPriceMinor: line.unitPriceMinor,
              totalMinor: line.lineTotalMinor,
            })),
          });
          const acceptedTerms = acceptedVersion.terms as JsonObject;
          const paymentSchedule = Array.isArray(acceptedTerms.paymentSchedule)
            ? acceptedTerms.paymentSchedule
            : [];
          const contractDocument = {
            ...initialContractDocument(rfq, offer, lines),
            paymentSchedule,
          };
          const partySnapshots = {
            wedding: { workspaceId: workspace.id, title: workspace.title },
            vendor: {
              vendorOrganizationId: offer.vendorOrganizationId,
              legalName: party.legal_name,
              displayName: party.display_name,
              country: party.country,
            },
          };
          const contractSummary = `Contract operațional pentru ${rfq.title}`;
          const serviceScope = {
            lineItemIds: lines.map((line) => line.id),
          };
          const paymentTerms = {
            currency: offer.currency,
            depositMinor: moneyNumber(offer.depositMinor),
            totalMinor: moneyNumber(offer.totalMinor),
            paymentSchedule,
          };
          const cancellationTerms = acceptedVersion.cancellationTerms;
          contract = await tx.vendorContract.create({
            data: {
              workspaceId,
              vendorOrganizationId: offer.vendorOrganizationId,
              bookingId: booking.id,
              createdById: userId,
            },
          });
          const contractVersion = await tx.vendorContractVersion.create({
            data: {
              workspaceId,
              vendorOrganizationId: offer.vendorOrganizationId,
              contractId: contract.id,
              versionNumber: 1,
              kind: "INITIAL",
              document: jsonInput(contractDocument),
              partySnapshots: jsonInput(partySnapshots),
              summary: contractSummary,
              serviceScope: jsonInput(serviceScope),
              paymentTerms: jsonInput(paymentTerms),
              cancellationTerms,
              contentHash: contractContentHash({
                document: contractDocument,
                partySnapshots,
                summary: contractSummary,
                serviceScope,
                paymentTerms,
                cancellationTerms,
              }),
              createdById: userId,
            },
          });
          await this.projectAcceptedOfferToBudget(
            tx,
            userId,
            workspaceId,
            offer,
            booking.id,
            contract.id,
            contractVersion.id,
            rfq.category,
          );
          await this.asyncEvents.record(tx, {
            eventName: "booking.created.v1",
            aggregateType: "VendorBooking",
            aggregateId: booking.id,
            workspaceId,
            vendorOrganizationId: offer.vendorOrganizationId,
            actorUserId: userId,
            correlationId,
            deduplicationKey: `booking-created:${booking.id}`,
            payload: {
              subject: { bookingId: booking.id },
              bookingProjection: { bookingId: booking.id },
              vendorNotificationProjection: {
                vendorOrganizationId: offer.vendorOrganizationId,
              },
              activity: {
                category: "commercial",
                action: "booking_created",
                summary: `Rezervarea „${booking.title}” a fost creată.`,
                entityType: "VendorBooking",
                entityId: booking.id,
              },
            },
          });
        }
        await tx.requestForQuote.update({
          where: { id: rfq.id },
          data: { awardedOfferId: offer.id, version: { increment: 1 } },
        });
        await tx.vendorOffer.updateMany({
          where: {
            rfqId: offer.rfqId,
            id: { not: offer.id },
            status: {
              in: [
                "SUBMITTED",
                "UNDER_REVIEW",
                "REVISION_REQUESTED",
                "REVISED",
              ],
            },
          },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      if (transition === "REQUEST_REVISION") {
        const thread = await tx.negotiationThread.upsert({
          where: { offerId: offer.id },
          create: {
            workspaceId,
            vendorOrganizationId: offer.vendorOrganizationId,
            offerId: offer.id,
          },
          update: { status: "OPEN", version: { increment: 1 } },
        });
        await tx.negotiationMessage.create({
          data: {
            workspaceId,
            vendorOrganizationId: offer.vendorOrganizationId,
            threadId: thread.id,
            senderType: "WEDDING",
            senderUserId: userId,
            type: "REVISION_REQUEST",
            body: reason!,
          },
        });
      }
      const row = await tx.vendorOffer.update({
        where: { id: offer.id },
        data: {
          status: next,
          ...(transition === "ACCEPT" ? { acceptedAt: new Date() } : {}),
          ...(transition === "REJECT" ? { rejectedAt: new Date() } : {}),
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name:
          transition === "ACCEPT"
            ? "offer.accepted.v1"
            : transition === "REQUEST_REVISION"
              ? "offer.revision_requested.v1"
              : transition === "REJECT"
                ? "offer.rejected.v1"
                : "offer.updated.v1",
        aggregate: "VendorOffer",
        id: row.id,
        version: row.version,
        workspaceId,
        vendorOrganizationId: row.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        offerProjection: { offerId: row.id },
        vendorNotificationProjection: {
          vendorOrganizationId: row.vendorOrganizationId,
        },
        activity: {
          category: "commercial",
          action: `offer_${transition.toLowerCase()}`,
          summary: `Oferta a fost ${transition.toLowerCase()}.`,
          entityType: "VendorOffer",
          entityId: row.id,
        },
      });
      const response = {
        offer: await this.mapOffer(tx, row),
        booking: booking ? moneySafe(booking) : null,
        contract: contract ? moneySafe(contract) : null,
      };
      if (transition === "ACCEPT" && key)
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "offer.accept",
          key,
          { offerId, version },
          response,
        );
      return response;
    });
  }

  async negotiationMessages(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    offerId: string,
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const thread = await tx.negotiationThread.findUnique({
        where: { offerId },
      });
      if (!thread) return { thread: null, items: [] };
      const items = await tx.negotiationMessage.findMany({
        where: { threadId: thread.id, deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
      return {
        thread: moneySafe(thread),
        items: items.map((item) => ({ ...item, body: item.body })),
      };
    });
  }

  async addNegotiationMessage(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    offerId: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const offer = await tx.vendorOffer.findUnique({ where: { id: offerId } });
      if (!offer) notFound("Oferta nu există.");
      const thread = await tx.negotiationThread.upsert({
        where: { offerId },
        create: {
          workspaceId: offer.workspaceId,
          vendorOrganizationId: offer.vendorOrganizationId,
          offerId,
        },
        update: {
          status: "OPEN",
          lastMessageAt: new Date(),
          version: { increment: 1 },
        },
      });
      const row = await tx.negotiationMessage.create({
        data: {
          workspaceId: offer.workspaceId,
          vendorOrganizationId: offer.vendorOrganizationId,
          threadId: thread.id,
          senderType: tenant.organizationId ? "VENDOR" : "WEDDING",
          senderUserId: userId,
          body: text(input.body),
          type: "MESSAGE",
        },
      });
      await this.event(tx, {
        name: "negotiation.message_sent.v1",
        aggregate: "NegotiationMessage",
        id: row.id,
        workspaceId: offer.workspaceId,
        vendorOrganizationId: offer.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
      });
      return moneySafe(row);
    });
  }

  async bookings(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const rows = await tx.vendorBooking.findMany({
        where: tenant.workspaceId
          ? { workspaceId: tenant.workspaceId }
          : { vendorOrganizationId: tenant.organizationId },
        orderBy: [{ serviceStartAt: "asc" }, { createdAt: "desc" }],
      });
      return {
        items: await Promise.all(rows.map((row) => this.mapBooking(tx, row))),
      };
    });
  }

  async booking(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    bookingId: string,
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const row = await tx.vendorBooking.findFirst({
        where: {
          id: bookingId,
          ...(tenant.workspaceId
            ? { workspaceId: tenant.workspaceId }
            : { vendorOrganizationId: tenant.organizationId }),
        },
      });
      if (!row) notFound("Rezervarea nu există.");
      return this.mapBooking(tx, row);
    });
  }

  async updateBooking(
    userId: string,
    workspaceId: string,
    bookingId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.vendorBooking.findFirst({
        where: { id: bookingId, workspaceId },
      });
      if (!current) notFound("Rezervarea nu există.");
      assertVersion(current.version, version);
      if (["COMPLETED", "CANCELLED", "ARCHIVED"].includes(current.status))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Rezervarea nu mai poate fi editată",
        );
      const row = await tx.vendorBooking.update({
        where: { id: current.id },
        data: {
          ...(input.title !== undefined ? { title: text(input.title) } : {}),
          ...(input.serviceStartAt !== undefined
            ? {
                serviceStartAt: input.serviceStartAt
                  ? date(input.serviceStartAt)
                  : null,
              }
            : {}),
          ...(input.serviceEndAt !== undefined
            ? {
                serviceEndAt: input.serviceEndAt
                  ? date(input.serviceEndAt)
                  : null,
              }
            : {}),
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name: "booking.updated.v1",
        aggregate: "VendorBooking",
        id: row.id,
        version: row.version,
        workspaceId,
        vendorOrganizationId: row.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        bookingProjection: { bookingId: row.id },
      });
      return this.mapBooking(tx, row);
    });
  }

  async transitionBooking(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    bookingId: string,
    version: number,
    transition: string,
    reason: string | null,
    correlationId: string,
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const current = await tx.vendorBooking.findFirst({
        where: {
          id: bookingId,
          ...(tenant.workspaceId
            ? { workspaceId: tenant.workspaceId }
            : { vendorOrganizationId: tenant.organizationId }),
        },
      });
      if (!current) notFound("Rezervarea nu există.");
      assertVersion(current.version, version);
      if (
        tenant.workspaceId &&
        !["CANCEL", "DISPUTE", "ARCHIVE"].includes(transition)
      )
        problem(
          "FORBIDDEN",
          HttpStatus.FORBIDDEN,
          "Tranziție rezervată furnizorului",
        );
      if (
        tenant.organizationId &&
        !["START", "COMPLETE", "DISPUTE"].includes(transition)
      )
        problem(
          "FORBIDDEN",
          HttpStatus.FORBIDDEN,
          "Tranziție rezervată workspace-ului",
        );
      if (["CANCEL", "DISPUTE"].includes(transition) && !reason)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Motivul este obligatoriu",
        );
      const next = bookingTransition(current.status, transition);
      const row = await tx.vendorBooking.update({
        where: { id: current.id },
        data: {
          status: next,
          ...(transition === "CANCEL"
            ? { cancelledAt: new Date(), cancellationReason: reason }
            : {}),
          version: { increment: 1 },
        },
      });
      if (transition === "CANCEL") {
        await tx.vendorAvailabilityBlock.updateMany({
          where: { bookingId: row.id, source: "BOOKING", deletedAt: null },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        await tx.paymentScheduleEntry.updateMany({
          where: {
            bookingId: row.id,
            paidMinor: 0,
            deletedAt: null,
            dueAt: { gt: new Date() },
          },
          data: {
            status: "CANCELLED",
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await tx.budgetItem.updateMany({
          where: {
            workspaceId: row.workspaceId,
            sourceChainKey: `offer:${row.offerId}`,
          },
          data: {
            status: "CANCELLED",
            committedMinor: 0,
            version: { increment: 1 },
          },
        });
      }
      await this.event(tx, {
        name:
          transition === "CANCEL"
            ? "booking.cancelled.v1"
            : transition === "COMPLETE"
              ? "booking.completed.v1"
              : "booking.updated.v1",
        aggregate: "VendorBooking",
        id: row.id,
        version: row.version,
        workspaceId: row.workspaceId,
        vendorOrganizationId: row.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        bookingProjection: { bookingId: row.id },
        vendorNotificationProjection: {
          vendorOrganizationId: row.vendorOrganizationId,
        },
        activity: {
          category: "commercial",
          action: `booking_${transition.toLowerCase()}`,
          summary: `Rezervarea „${row.title}” a fost actualizată.`,
          entityType: "VendorBooking",
          entityId: row.id,
        },
      });
      return this.mapBooking(tx, row);
    });
  }

  async contracts(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const rows = await tx.vendorContract.findMany({
        where: tenant.workspaceId
          ? { workspaceId: tenant.workspaceId }
          : { vendorOrganizationId: tenant.organizationId },
        orderBy: { updatedAt: "desc" },
      });
      return {
        items: await Promise.all(rows.map((row) => this.mapContract(tx, row))),
      };
    });
  }

  async contract(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    contractId: string,
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const row = await tx.vendorContract.findFirst({
        where: {
          id: contractId,
          ...(tenant.workspaceId
            ? { workspaceId: tenant.workspaceId }
            : { vendorOrganizationId: tenant.organizationId }),
        },
      });
      if (!row) notFound("Contractul nu există.");
      return this.mapContract(tx, row);
    });
  }

  async updateContractDraft(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    contractId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const contract = await tx.vendorContract.findFirst({
        where: {
          id: contractId,
          ...(tenant.workspaceId
            ? { workspaceId: tenant.workspaceId }
            : { vendorOrganizationId: tenant.organizationId }),
        },
      });
      if (!contract) notFound("Contractul nu există.");
      assertVersion(contract.version, version);
      if (["ACKNOWLEDGED", "CANCELLED", "ARCHIVED"].includes(contract.status))
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Contractul agreat sau închis nu poate fi rescris",
        );
      const nextVersion = contract.currentVersionNumber + 1;
      const document = input.document as JsonObject;
      const currentVersion = await tx.vendorContractVersion.findUniqueOrThrow({
        where: {
          contractId_versionNumber: {
            contractId: contract.id,
            versionNumber: contract.currentVersionNumber,
          },
        },
      });
      const summary = text(input.summary);
      const serviceScope = input.serviceScope as JsonObject;
      const paymentTerms = input.paymentTerms as JsonObject;
      const cancellationTerms = text(input.cancellationTerms);
      await tx.vendorContractVersion.create({
        data: {
          workspaceId: contract.workspaceId,
          vendorOrganizationId: contract.vendorOrganizationId,
          contractId: contract.id,
          versionNumber: nextVersion,
          kind: currentVersion.kind,
          baseVersionId: currentVersion.baseVersionId,
          document: jsonInput(document),
          partySnapshots: jsonInput(currentVersion.partySnapshots),
          summary,
          serviceScope: jsonInput(serviceScope),
          paymentTerms: jsonInput(paymentTerms),
          cancellationTerms,
          contentHash: contractContentHash({
            document,
            partySnapshots: currentVersion.partySnapshots,
            summary,
            serviceScope,
            paymentTerms,
            cancellationTerms,
          }),
          createdById: userId,
        },
      });
      const row = await tx.vendorContract.update({
        where: { id: contract.id },
        data: {
          currentVersionNumber: nextVersion,
          status: "DRAFT",
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name: "contract.version_created.v1",
        aggregate: "VendorContract",
        id: row.id,
        version: row.version,
        workspaceId: row.workspaceId,
        vendorOrganizationId: row.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        contractProjection: { contractId: row.id },
      });
      return this.mapContract(tx, row);
    });
  }

  async transitionContract(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    contractId: string,
    version: number,
    transition: string,
    reason: string | null,
    correlationId: string,
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const current = await tx.vendorContract.findFirst({
        where: {
          id: contractId,
          ...(tenant.workspaceId
            ? { workspaceId: tenant.workspaceId }
            : { vendorOrganizationId: tenant.organizationId }),
        },
      });
      if (!current) notFound("Contractul nu există.");
      assertVersion(current.version, version);
      if (transition === "START_AMENDMENT") {
        if (current.status !== "ACKNOWLEDGED" || !current.agreedVersionId)
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Numai un contract agreat poate porni un amendament",
          );
        const effective = await tx.vendorContractVersion.findUniqueOrThrow({
          where: { id: current.agreedVersionId },
        });
        const nextVersion = current.currentVersionNumber + 1;
        await tx.vendorContractVersion.create({
          data: {
            workspaceId: current.workspaceId,
            vendorOrganizationId: current.vendorOrganizationId,
            contractId: current.id,
            versionNumber: nextVersion,
            kind: "AMENDMENT",
            baseVersionId: effective.id,
            document: jsonInput(effective.document),
            partySnapshots: jsonInput(effective.partySnapshots),
            summary: effective.summary,
            serviceScope: jsonInput(effective.serviceScope),
            paymentTerms: jsonInput(effective.paymentTerms),
            cancellationTerms: effective.cancellationTerms,
            contentHash: effective.contentHash,
            createdById: userId,
          },
        });
        const amendment = await tx.vendorContract.update({
          where: { id: current.id },
          data: {
            status: "DRAFT",
            currentVersionNumber: nextVersion,
            readyAt: null,
            version: { increment: 1 },
          },
        });
        await this.event(tx, {
          name: "contract.version_created.v1",
          aggregate: "VendorContract",
          id: amendment.id,
          version: amendment.version,
          workspaceId: amendment.workspaceId,
          vendorOrganizationId: amendment.vendorOrganizationId,
          actorUserId: userId,
          correlationId,
          contractProjection: { contractId: amendment.id },
        });
        return this.mapContract(tx, amendment);
      }
      if (["REQUEST_CHANGES", "CANCEL"].includes(transition) && !reason)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Motivul este obligatoriu",
        );
      const next = contractTransition(current.status, transition);
      const row = await tx.vendorContract.update({
        where: { id: current.id },
        data: {
          status: next,
          ...(transition === "MARK_READY" ? { readyAt: new Date() } : {}),
          ...(transition === "CANCEL" ? { cancelledAt: new Date() } : {}),
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name:
          transition === "MARK_READY"
            ? "contract.ready_for_ack.v1"
            : transition === "REQUEST_CHANGES"
              ? "contract.changes_requested.v1"
              : transition === "CANCEL"
                ? "contract.cancelled.v1"
                : "contract.updated.v1",
        aggregate: "VendorContract",
        id: row.id,
        version: row.version,
        workspaceId: row.workspaceId,
        vendorOrganizationId: row.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        contractProjection: { contractId: row.id },
        vendorNotificationProjection: {
          vendorOrganizationId: row.vendorOrganizationId,
        },
        activity: {
          category: "commercial",
          action: `contract_${transition.toLowerCase()}`,
          summary: "Contractul operațional a fost actualizat.",
          entityType: "VendorContract",
          entityId: row.id,
        },
      });
      return this.mapContract(tx, row);
    });
  }

  async acknowledgeContract(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    contractId: string,
    version: number,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.tenantContext(userId, tenant, async (tx) => {
      const operation = tenant.workspaceId
        ? "contract.ack.wedding"
        : "contract.ack.vendor";
      const replay = await this.replay(tx, userId, operation, key, {
        contractId,
        version,
        ...input,
      });
      if (replay) return replay;
      const contract = await tx.vendorContract.findFirst({
        where: {
          id: contractId,
          ...(tenant.workspaceId
            ? { workspaceId: tenant.workspaceId }
            : { vendorOrganizationId: tenant.organizationId }),
        },
      });
      if (!contract) notFound("Contractul nu există.");
      assertVersion(contract.version, version);
      if (contract.status !== "READY_FOR_ACKNOWLEDGEMENT")
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Contractul nu este pregătit pentru confirmare",
        );
      const contractVersion = await tx.vendorContractVersion.findUniqueOrThrow({
        where: {
          contractId_versionNumber: {
            contractId,
            versionNumber: contract.currentVersionNumber,
          },
        },
      });
      if (text(input.contentHash) !== contractVersion.contentHash)
        problem(
          "VERSION_CONFLICT",
          HttpStatus.PRECONDITION_FAILED,
          "Conținutul contractului s-a schimbat",
        );
      const partyType = tenant.organizationId ? "VENDOR" : "WEDDING";
      await tx.contractPartyAcknowledgement.upsert({
        where: {
          contractVersionId_partyType: {
            contractVersionId: contractVersion.id,
            partyType,
          },
        },
        create: {
          workspaceId: contract.workspaceId,
          vendorOrganizationId: contract.vendorOrganizationId,
          contractId,
          contractVersionId: contractVersion.id,
          partyType,
          userId,
          typedName: text(input.typedName),
          statementVersion: text(input.statementVersion),
          contentHash: contractVersion.contentHash,
        },
        update: {
          userId,
          typedName: text(input.typedName),
          statementVersion: text(input.statementVersion),
          contentHash: contractVersion.contentHash,
          acknowledgedAt: new Date(),
        },
      });
      const acknowledgements = await tx.contractPartyAcknowledgement.findMany({
        where: { contractVersionId: contractVersion.id },
      });
      const agreed =
        acknowledgements.some(
          (item) =>
            item.partyType === "WEDDING" &&
            item.contentHash === contractVersion.contentHash,
        ) &&
        acknowledgements.some(
          (item) =>
            item.partyType === "VENDOR" &&
            item.contentHash === contractVersion.contentHash,
        );
      const row = await tx.vendorContract.update({
        where: { id: contract.id },
        data: {
          ...(agreed
            ? {
                status: "ACKNOWLEDGED",
                agreedVersionId: contractVersion.id,
                acknowledgedAt: new Date(),
              }
            : {}),
          version: { increment: 1 },
        },
      });
      if (agreed) {
        await tx.$queryRaw`
          SELECT public.weddingos_apply_effective_contract_projection(
            ${contract.id}::uuid,
            ${contractVersion.id}::uuid,
            ${userId}::uuid
          )
        `;
      }
      await this.event(tx, {
        name: agreed
          ? "contract.acknowledged.v1"
          : "contract.party_acknowledged.v1",
        aggregate: "VendorContract",
        id: row.id,
        version: row.version,
        workspaceId: row.workspaceId,
        vendorOrganizationId: row.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        contractProjection: { contractId: row.id },
        vendorNotificationProjection: {
          vendorOrganizationId: row.vendorOrganizationId,
        },
        activity: {
          category: "commercial",
          action: agreed
            ? "contract_acknowledged"
            : "contract_party_acknowledged",
          summary: agreed
            ? "Contractul operațional a fost confirmat de ambele părți."
            : "O parte a confirmat contractul în WeddingOS.",
          entityType: "VendorContract",
          entityId: row.id,
        },
      });
      const response = await this.mapContract(tx, row);
      await this.saveReplay(
        tx,
        tenant.workspaceId ?? null,
        userId,
        operation,
        key,
        { contractId, version, ...input },
        response,
      );
      return response;
    });
  }

  async exportContract(
    userId: string,
    workspaceId: string,
    contractId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(tx, userId, "contract.export", key, {
        contractId,
        ...input,
      });
      if (replay) return replay;
      const contract = await tx.vendorContract.findFirst({
        where: { id: contractId, workspaceId },
      });
      if (!contract) notFound("Contractul nu există.");
      const contractVersion = await tx.vendorContractVersion.findFirst({
        where: { id: text(input.contractVersionId), contractId },
      });
      if (!contractVersion) notFound("Versiunea contractului nu există.");
      const artifactId = randomUUID();
      const jobId = await this.asyncEvents.record(tx, {
        eventName: "contract.export_requested.v1",
        aggregateType: "VendorContract",
        aggregateId: contract.id,
        workspaceId,
        vendorOrganizationId: contract.vendorOrganizationId,
        actorUserId: userId,
        correlationId,
        idempotencyKey: key,
        deduplicationKey: `contract-export:${contractVersion.id}:${text(input.format)}:${key}`,
        userVisibleJob: true,
        payload: {
          subject: { contractId, artifactId },
          contractExport: {
            artifactId,
            contractVersionId: contractVersion.id,
            requestedByUserId: userId,
            format: text(input.format),
          },
          activity: {
            category: "commercial",
            action: "contract_export_requested",
            summary: "Exportul contractului a fost solicitat.",
            entityType: "VendorContract",
            entityId: contract.id,
          },
        },
      });
      if (!jobId) throw new Error("Contract export job was not created");
      const response = {
        job: mapJob(
          await tx.backgroundJob.findUniqueOrThrow({ where: { id: jobId } }),
        ),
        artifactId,
      };
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "contract.export",
        key,
        { contractId, ...input },
        response,
      );
      return response;
    });
  }

  async budget(userId: string, workspaceId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const plan = await tx.budgetPlan.findUnique({ where: { workspaceId } });
      if (!plan)
        return { plan: null, categories: [], items: [], summary: null };
      const [categories, items] = await Promise.all([
        tx.budgetCategory.findMany({
          where: { workspaceId, budgetPlanId: plan.id, deletedAt: null },
          orderBy: { position: "asc" },
        }),
        tx.budgetItem.findMany({
          where: { workspaceId, budgetPlanId: plan.id, deletedAt: null },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return {
        plan: moneySafe(plan),
        categories: categories.map(moneySafe),
        items: items.map(moneySafe),
        summary: budgetSummary(plan, categories, items),
      };
    });
  }

  async upsertBudget(
    userId: string,
    workspaceId: string,
    version: number | null,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(tx, userId, "budget.upsert", key, input);
      if (replay) return replay;
      const current = await tx.budgetPlan.findUnique({
        where: { workspaceId },
      });
      if (current && version === null)
        problem(
          "PRECONDITION_REQUIRED",
          HttpStatus.PRECONDITION_REQUIRED,
          "If-Match required",
        );
      if (current && version !== null) assertVersion(current.version, version);
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      const row = current
        ? await tx.budgetPlan.update({
            where: { id: current.id },
            data: {
              name: text(input.name),
              targetTotalMinor: BigInt(number(input.targetTotalMinor)),
              contingencyPercent: number(input.contingencyPercent),
              status: text(
                input.status,
              ) as Prisma.BudgetPlanUpdateInput["status"],
              version: { increment: 1 },
            },
          })
        : await tx.budgetPlan.create({
            data: {
              workspaceId,
              name: text(input.name),
              currency: workspace.currency,
              targetTotalMinor: BigInt(number(input.targetTotalMinor)),
              contingencyPercent: number(input.contingencyPercent),
              status: text(
                input.status,
              ) as Prisma.BudgetPlanCreateInput["status"],
              createdById: userId,
            },
          });
      await this.event(tx, {
        name: "budget.plan_updated.v1",
        aggregate: "BudgetPlan",
        id: row.id,
        version: row.version,
        workspaceId,
        actorUserId: userId,
        correlationId,
        budgetProjection: {},
        activity: {
          category: "finance",
          action: "budget_updated",
          summary: "Planul de buget a fost actualizat.",
          entityType: "BudgetPlan",
          entityId: row.id,
        },
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "budget.upsert",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async createBudgetCategory(
    userId: string,
    workspaceId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "budget.category.create",
        key,
        input,
      );
      if (replay) return replay;
      const plan = await this.requireBudget(tx, workspaceId);
      if (input.parentCategoryId) {
        const parent = await tx.budgetCategory.findFirst({
          where: {
            id: text(input.parentCategoryId),
            workspaceId,
            budgetPlanId: plan.id,
            deletedAt: null,
          },
        });
        if (!parent) notFound("Categoria părinte nu există.");
      }
      const row = await tx.budgetCategory.create({
        data: {
          workspaceId,
          budgetPlanId: plan.id,
          parentCategoryId: nullableText(input.parentCategoryId),
          name: text(input.name),
          canonicalType: nullableText(input.canonicalType),
          allocatedMinor: BigInt(number(input.allocatedMinor)),
          position: number(input.position),
          createdById: userId,
        },
      });
      await this.event(tx, {
        name: "budget.category_updated.v1",
        aggregate: "BudgetCategory",
        id: row.id,
        workspaceId,
        actorUserId: userId,
        correlationId,
        budgetProjection: {},
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "budget.category.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateBudgetCategory(
    userId: string,
    workspaceId: string,
    categoryId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.budgetCategory.findFirst({
        where: { id: categoryId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Categoria de buget nu există.");
      assertVersion(current.version, version);
      const row = await tx.budgetCategory.update({
        where: { id: current.id },
        data: {
          ...(input.parentCategoryId !== undefined
            ? { parentCategoryId: nullableText(input.parentCategoryId) }
            : {}),
          ...(input.name !== undefined ? { name: text(input.name) } : {}),
          ...(input.canonicalType !== undefined
            ? { canonicalType: nullableText(input.canonicalType) }
            : {}),
          ...(input.allocatedMinor !== undefined
            ? { allocatedMinor: BigInt(number(input.allocatedMinor)) }
            : {}),
          ...(input.position !== undefined
            ? { position: number(input.position) }
            : {}),
          version: { increment: 1 },
        },
      });
      await this.event(tx, {
        name: "budget.category_updated.v1",
        aggregate: "BudgetCategory",
        id: row.id,
        version: row.version,
        workspaceId,
        actorUserId: userId,
        correlationId,
        budgetProjection: {},
      });
      return moneySafe(row);
    });
  }

  async deleteBudgetCategory(
    userId: string,
    workspaceId: string,
    categoryId: string,
    version: number,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.budgetCategory.findFirst({
        where: { id: categoryId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Categoria de buget nu există.");
      assertVersion(current.version, version);
      const linked = await tx.budgetItem.count({
        where: { categoryId, deletedAt: null },
      });
      if (linked > 0)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Categoria conține elemente active",
        );
      const row = await tx.budgetCategory.update({
        where: { id: current.id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async budgetItems(userId: string, workspaceId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => ({
      items: (
        await tx.budgetItem.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        })
      ).map(moneySafe),
    }));
  }

  async createBudgetItem(
    userId: string,
    workspaceId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "budget.item.create",
        key,
        input,
      );
      if (replay) return replay;
      const plan = await this.requireBudget(tx, workspaceId);
      const category = await tx.budgetCategory.findFirst({
        where: {
          id: text(input.categoryId),
          workspaceId,
          budgetPlanId: plan.id,
          deletedAt: null,
        },
      });
      if (!category) notFound("Categoria de buget nu există.");
      const row = await tx.budgetItem.create({
        data: {
          workspaceId,
          budgetPlanId: plan.id,
          categoryId: category.id,
          name: text(input.name),
          description: nullableText(input.description),
          estimatedMinor: BigInt(number(input.estimatedMinor)),
          quotedMinor: toNullableBigInt(input.quotedMinor),
          committedMinor: toNullableBigInt(input.committedMinor),
          dueAt: input.dueAt ? date(input.dueAt) : null,
          vendorOrganizationId: nullableText(input.vendorOrganizationId),
          createdById: userId,
        },
      });
      await this.event(tx, {
        name: "budget.item_created.v1",
        aggregate: "BudgetItem",
        id: row.id,
        workspaceId,
        actorUserId: userId,
        correlationId,
        budgetProjection: { budgetItemId: row.id },
        activity: {
          category: "finance",
          action: "budget_item_created",
          summary: `Elementul de buget „${row.name}” a fost creat.`,
          entityType: "BudgetItem",
          entityId: row.id,
        },
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "budget.item.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async budgetItem(userId: string, workspaceId: string, itemId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const row = await tx.budgetItem.findFirst({
        where: { id: itemId, workspaceId, deletedAt: null },
      });
      if (!row) notFound("Elementul de buget nu există.");
      return {
        ...moneySafe(row),
        expenses: (
          await tx.expenseRecord.findMany({
            where: { budgetItemId: row.id, deletedAt: null },
            orderBy: { expenseDate: "desc" },
          })
        ).map(moneySafe),
        schedules: (
          await tx.paymentScheduleEntry.findMany({
            where: { budgetItemId: row.id, deletedAt: null },
            orderBy: { sequence: "asc" },
          })
        ).map(moneySafe),
      };
    });
  }

  async updateBudgetItem(
    userId: string,
    workspaceId: string,
    itemId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.budgetItem.findFirst({
        where: { id: itemId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Elementul de buget nu există.");
      assertVersion(current.version, version);
      if (
        input.manualOverrideMinor !== undefined &&
        input.manualOverrideMinor !== null &&
        !input.manualOverrideReason
      )
        problem(
          "VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "Motivul override-ului manual este obligatoriu",
        );
      const row = await tx.budgetItem.update({
        where: { id: current.id },
        data: {
          ...budgetItemUpdate(input),
          ...(input.manualOverrideMinor !== undefined
            ? {
                manualOverrideMinor: toNullableBigInt(
                  input.manualOverrideMinor,
                ),
                manualOverrideReason: nullableText(input.manualOverrideReason),
                manualOverrideById:
                  input.manualOverrideMinor === null ? null : userId,
                manualOverrideAt:
                  input.manualOverrideMinor === null ? null : new Date(),
              }
            : {}),
        },
      });
      await this.event(tx, {
        name: "budget.item_updated.v1",
        aggregate: "BudgetItem",
        id: row.id,
        version: row.version,
        workspaceId,
        actorUserId: userId,
        correlationId,
        budgetProjection: { budgetItemId: row.id },
      });
      return moneySafe(row);
    });
  }

  async deleteBudgetItem(
    userId: string,
    workspaceId: string,
    itemId: string,
    version: number,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.budgetItem.findFirst({
        where: { id: itemId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Elementul de buget nu există.");
      assertVersion(current.version, version);
      const payments = await tx.paymentRecord.count({
        where: {
          budgetItemId: itemId,
          status: { in: ["RECORDED", "CONFIRMED", "DISPUTED"] },
        },
      });
      if (payments > 0)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Elementul are plăți și nu poate fi șters",
        );
      const row = await tx.budgetItem.update({
        where: { id: current.id },
        data: {
          status: "CANCELLED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async budgetSummary(userId: string, workspaceId: string) {
    const result = await this.budget(userId, workspaceId);
    return result.summary;
  }

  async expenses(userId: string, workspaceId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => ({
      items: (
        await tx.expenseRecord.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: { expenseDate: "desc" },
        })
      ).map(moneySafe),
    }));
  }

  async createExpense(
    userId: string,
    workspaceId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "expense.create",
        key,
        input,
      );
      if (replay) return replay;
      const item = await tx.budgetItem.findFirst({
        where: { id: text(input.budgetItemId), workspaceId, deletedAt: null },
      });
      if (!item) notFound("Elementul de buget nu există.");
      const row = await tx.expenseRecord.create({
        data: {
          workspaceId,
          budgetItemId: item.id,
          description: text(input.description),
          amountMinor: BigInt(number(input.amountMinor)),
          expenseDate: date(input.expenseDate),
          status: text(
            input.status,
          ) as Prisma.ExpenseRecordCreateInput["status"],
          paymentMethodLabel: nullableText(input.paymentMethodLabel),
          reference: nullableText(input.reference),
          notesPrivate: nullableText(input.notesPrivate),
          createdById: userId,
        },
      });
      await this.event(tx, {
        name: "expense.created.v1",
        aggregate: "ExpenseRecord",
        id: row.id,
        workspaceId,
        actorUserId: userId,
        correlationId,
        budgetProjection: { budgetItemId: item.id },
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "expense.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateExpense(
    userId: string,
    workspaceId: string,
    expenseId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.expenseRecord.findFirst({
        where: { id: expenseId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Cheltuiala nu există.");
      assertVersion(current.version, version);
      const row = await tx.expenseRecord.update({
        where: { id: current.id },
        data: expenseUpdate(input),
      });
      await this.event(tx, {
        name: "expense.updated.v1",
        aggregate: "ExpenseRecord",
        id: row.id,
        version: row.version,
        workspaceId,
        actorUserId: userId,
        correlationId,
        budgetProjection: { budgetItemId: row.budgetItemId },
      });
      return moneySafe(row);
    });
  }

  async deleteExpense(
    userId: string,
    workspaceId: string,
    expenseId: string,
    version: number,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.expenseRecord.findFirst({
        where: { id: expenseId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Cheltuiala nu există.");
      assertVersion(current.version, version);
      const row = await tx.expenseRecord.update({
        where: { id: current.id },
        data: {
          status: "CANCELLED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async paymentSchedules(userId: string, workspaceId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const rows = await tx.paymentScheduleEntry.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: [{ dueAt: "asc" }, { sequence: "asc" }],
      });
      return {
        items: rows.map((row) =>
          moneySafe({ ...row, status: derivedScheduleStatus(row) }),
        ),
      };
    });
  }

  async createPaymentSchedule(
    userId: string,
    workspaceId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "payment.schedule.create",
        key,
        input,
      );
      if (replay) return replay;
      const item = await tx.budgetItem.findFirst({
        where: { id: text(input.budgetItemId), workspaceId, deletedAt: null },
      });
      if (!item) notFound("Elementul de buget nu există.");
      const plan = await tx.budgetPlan.findUniqueOrThrow({
        where: { workspaceId },
      });
      if (input.currency !== undefined)
        assertCurrency(text(input.currency), plan.currency);
      const dueAt = date(input.dueAt);
      const row = await tx.paymentScheduleEntry.create({
        data: {
          workspaceId,
          budgetItemId: item.id,
          bookingId: nullableText(input.bookingId),
          contractId: nullableText(input.contractId),
          vendorOrganizationId: nullableText(input.vendorOrganizationId),
          name: text(input.name),
          amountMinor: BigInt(number(input.amountMinor)),
          currency: plan.currency,
          dueAt,
          sequence: number(input.sequence),
          notes: nullableText(input.notes),
          createdById: userId,
        },
      });
      const reminderAt = new Date(
        Math.max(Date.now(), dueAt.getTime() - 24 * 60 * 60 * 1000),
      );
      await this.asyncEvents.record(tx, {
        eventName: "payment.reminder_scheduled.v1",
        aggregateType: "PaymentScheduleEntry",
        aggregateId: row.id,
        aggregateVersion: row.version,
        workspaceId,
        vendorOrganizationId: row.vendorOrganizationId ?? undefined,
        actorUserId: userId,
        correlationId,
        deduplicationKey: `payment-reminder:${row.id}:${row.version}`,
        availableAt: reminderAt,
        payload: {
          subject: { scheduleId: row.id },
          paymentReminder: { scheduleId: row.id, scheduleVersion: row.version },
        },
      });
      await this.event(tx, {
        name: "payment.schedule_created.v1",
        aggregate: "PaymentScheduleEntry",
        id: row.id,
        workspaceId,
        vendorOrganizationId: row.vendorOrganizationId ?? undefined,
        actorUserId: userId,
        correlationId,
        budgetProjection: { budgetItemId: item.id },
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "payment.schedule.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updatePaymentSchedule(
    userId: string,
    workspaceId: string,
    scheduleId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.paymentScheduleEntry.findFirst({
        where: { id: scheduleId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Scadența nu există.");
      assertVersion(current.version, version);
      if (input.currency !== undefined) {
        const plan = await tx.budgetPlan.findUniqueOrThrow({
          where: { workspaceId },
        });
        assertCurrency(text(input.currency), plan.currency);
      }
      const row = await tx.paymentScheduleEntry.update({
        where: { id: current.id },
        data: scheduleUpdate(input),
      });
      await this.event(tx, {
        name: "payment.schedule_updated.v1",
        aggregate: "PaymentScheduleEntry",
        id: row.id,
        version: row.version,
        workspaceId,
        vendorOrganizationId: row.vendorOrganizationId ?? undefined,
        actorUserId: userId,
        correlationId,
        budgetProjection: { budgetItemId: row.budgetItemId },
      });
      return moneySafe(row);
    });
  }

  async deletePaymentSchedule(
    userId: string,
    workspaceId: string,
    scheduleId: string,
    version: number,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.paymentScheduleEntry.findFirst({
        where: { id: scheduleId, workspaceId, deletedAt: null },
      });
      if (!current) notFound("Scadența nu există.");
      assertVersion(current.version, version);
      if (current.paidMinor > 0)
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Scadența are plăți asociate",
        );
      const row = await tx.paymentScheduleEntry.update({
        where: { id: current.id },
        data: {
          status: "CANCELLED",
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return { id: row.id, deleted: true, version: row.version };
    });
  }

  async payments(userId: string, workspaceId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => ({
      items: (
        await tx.paymentRecord.findMany({
          where: { workspaceId },
          orderBy: { paidAt: "desc" },
        })
      ).map(moneySafe),
    }));
  }

  async createPayment(
    userId: string,
    workspaceId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "payment.create",
        key,
        input,
      );
      if (replay) return replay;
      const item = await tx.budgetItem.findFirst({
        where: { id: text(input.budgetItemId), workspaceId, deletedAt: null },
      });
      if (!item) notFound("Elementul de buget nu există.");
      const plan = await tx.budgetPlan.findUniqueOrThrow({
        where: { workspaceId },
      });
      if (input.currency !== undefined)
        assertCurrency(text(input.currency), plan.currency);
      if (input.paymentScheduleEntryId) {
        const schedule = await tx.paymentScheduleEntry.findFirst({
          where: {
            id: text(input.paymentScheduleEntryId),
            workspaceId,
            budgetItemId: item.id,
            deletedAt: null,
          },
        });
        if (!schedule)
          notFound("Scadența nu există pentru acest element de buget.");
      }
      const row = await tx.paymentRecord.create({
        data: {
          workspaceId,
          paymentScheduleEntryId: nullableText(input.paymentScheduleEntryId),
          budgetItemId: item.id,
          bookingId: nullableText(input.bookingId),
          contractId: nullableText(input.contractId),
          vendorOrganizationId: nullableText(input.vendorOrganizationId),
          amountMinor: BigInt(number(input.amountMinor)),
          currency: plan.currency,
          entryType: "PAYMENT",
          paidAt: date(input.paidAt),
          method: text(
            input.method,
          ) as Prisma.PaymentRecordCreateInput["method"],
          reference: nullableText(input.reference),
          notesPrivate: nullableText(input.notesPrivate),
          idempotencyKey: key,
          createdById: userId,
        },
      });
      await this.recalculatePaymentProjection(
        tx,
        workspaceId,
        item.id,
        row.paymentScheduleEntryId,
      );
      await this.event(tx, {
        name: "payment.recorded.v1",
        aggregate: "PaymentRecord",
        id: row.id,
        workspaceId,
        vendorOrganizationId: row.vendorOrganizationId ?? undefined,
        actorUserId: userId,
        correlationId,
        paymentProjection: { paymentId: row.id },
        activity: {
          category: "finance",
          action: "payment_recorded",
          summary: "A fost înregistrată o plată efectuată extern.",
          entityType: "PaymentRecord",
          entityId: row.id,
        },
      });
      const response = moneySafe(row);
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "payment.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async payment(userId: string, workspaceId: string, paymentId: string) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const row = await tx.paymentRecord.findFirst({
        where: { id: paymentId, workspaceId },
      });
      if (!row) notFound("Plata nu există.");
      return moneySafe(row);
    });
  }

  async updatePayment(
    userId: string,
    workspaceId: string,
    paymentId: string,
    version: number,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.paymentRecord.findFirst({
        where: { id: paymentId, workspaceId },
      });
      if (!current) notFound("Plata nu există.");
      assertVersion(current.version, version);
      if (current.status !== "RECORDED")
        problem(
          "VALIDATION_FAILED",
          HttpStatus.CONFLICT,
          "Numai o plată neconfirmată poate fi editată",
        );
      if (input.currency !== undefined)
        assertCurrency(text(input.currency), current.currency);
      const row = await tx.paymentRecord.update({
        where: { id: current.id },
        data: paymentUpdate(input),
      });
      await this.recalculatePaymentProjection(
        tx,
        workspaceId,
        row.budgetItemId,
        row.paymentScheduleEntryId,
      );
      await this.event(tx, {
        name: "payment.updated.v1",
        aggregate: "PaymentRecord",
        id: row.id,
        version: row.version,
        workspaceId,
        vendorOrganizationId: row.vendorOrganizationId ?? undefined,
        actorUserId: userId,
        correlationId,
        paymentProjection: { paymentId: row.id },
      });
      return moneySafe(row);
    });
  }

  async transitionPayment(
    userId: string,
    workspaceId: string,
    paymentId: string,
    version: number,
    transition: string,
    reason: string,
    adjustmentAmountMinor: number | null,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const current = await tx.paymentRecord.findFirst({
        where: { id: paymentId, workspaceId },
      });
      if (!current) notFound("Plata nu există.");
      assertVersion(current.version, version);
      if (["REVERSE", "REFUND"].includes(transition)) {
        if (current.entryType !== "PAYMENT" || current.status !== "CONFIRMED")
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Numai o plată confirmată poate fi ajustată",
          );
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${current.id}, 0))
        `;
        const adjustments = await tx.paymentRecord.findMany({
          where: {
            originalPaymentId: current.id,
            entryType: { in: ["REVERSAL", "REFUND"] },
            status: "CONFIRMED",
          },
        });
        const adjustedMinor = adjustments.reduce(
          (sum, item) => sum + item.amountMinor,
          0n,
        );
        const remainingMinor = current.amountMinor - adjustedMinor;
        const requestedMinor =
          adjustmentAmountMinor === null
            ? remainingMinor
            : BigInt(adjustmentAmountMinor);
        if (
          requestedMinor <= 0 ||
          requestedMinor > remainingMinor ||
          (transition === "REVERSE" && requestedMinor !== remainingMinor)
        )
          problem(
            "PAYMENT_ADJUSTMENT_EXCEEDS_ORIGINAL",
            HttpStatus.CONFLICT,
            "Ajustarea depășește soldul plății originale",
          );
        const adjustment = await tx.paymentRecord.create({
          data: {
            workspaceId,
            paymentScheduleEntryId: current.paymentScheduleEntryId,
            budgetItemId: current.budgetItemId,
            bookingId: current.bookingId,
            contractId: current.contractId,
            vendorOrganizationId: current.vendorOrganizationId,
            amountMinor: requestedMinor,
            currency: current.currency,
            entryType: transition === "REVERSE" ? "REVERSAL" : "REFUND",
            originalPaymentId: current.id,
            reversalOfId: current.id,
            paidAt: new Date(),
            method: current.method,
            status: "CONFIRMED",
            reference: current.reference,
            notesPrivate: reason,
            createdById: userId,
            confirmedById: userId,
            confirmedAt: new Date(),
          },
        });
        await tx.paymentRecord.update({
          where: { id: current.id },
          data: { version: { increment: 1 } },
        });
        await this.recalculatePaymentProjection(
          tx,
          workspaceId,
          current.budgetItemId,
          current.paymentScheduleEntryId,
        );
        await this.event(tx, {
          name:
            transition === "REVERSE"
              ? "payment.reversed.v1"
              : "payment.refunded.v1",
          aggregate: "PaymentRecord",
          id: adjustment.id,
          version: adjustment.version,
          workspaceId,
          vendorOrganizationId: adjustment.vendorOrganizationId ?? undefined,
          actorUserId: userId,
          correlationId,
          paymentProjection: { paymentId: adjustment.id },
          activity: {
            category: "finance",
            action: `payment_${transition.toLowerCase()}`,
            summary:
              transition === "REVERSE"
                ? "A fost înregistrată o anulare contabilă a plății externe."
                : "A fost înregistrată o rambursare externă.",
            entityType: "PaymentRecord",
            entityId: adjustment.id,
          },
        });
        return moneySafe({
          originalPaymentId: current.id,
          adjustment,
          externalProcessing: false,
        });
      }
      const next = paymentTransition(current.status, transition);
      const row = await tx.paymentRecord.update({
        where: { id: current.id },
        data: {
          status: next,
          notesPrivate: [current.notesPrivate, reason]
            .filter(Boolean)
            .join("\n"),
          ...(transition === "CONFIRM"
            ? { confirmedById: userId, confirmedAt: new Date() }
            : {}),
          version: { increment: 1 },
        },
      });
      await this.recalculatePaymentProjection(
        tx,
        workspaceId,
        row.budgetItemId,
        row.paymentScheduleEntryId,
      );
      await this.event(tx, {
        name:
          transition === "CONFIRM"
            ? "payment.confirmed.v1"
            : transition === "REVERSE"
              ? "payment.reversed.v1"
              : transition === "REFUND"
                ? "payment.refunded.v1"
                : "payment.updated.v1",
        aggregate: "PaymentRecord",
        id: row.id,
        version: row.version,
        workspaceId,
        vendorOrganizationId: row.vendorOrganizationId ?? undefined,
        actorUserId: userId,
        correlationId,
        paymentProjection: { paymentId: row.id },
        activity: {
          category: "finance",
          action: `payment_${transition.toLowerCase()}`,
          summary: "Starea plății externe a fost actualizată.",
          entityType: "PaymentRecord",
          entityId: row.id,
        },
      });
      return moneySafe(row);
    });
  }

  async commercialExport(
    userId: string,
    workspaceId: string,
    key: string,
    input: JsonObject,
    correlationId: string,
  ) {
    return this.workspaceContext(userId, workspaceId, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        "commercial.export",
        key,
        input,
      );
      if (replay) return replay;
      const artifactId = randomUUID();
      const jobId = await this.asyncEvents.record(tx, {
        eventName: "commercial.export_requested.v1",
        aggregateType: "CommercialExport",
        aggregateId: artifactId,
        workspaceId,
        actorUserId: userId,
        correlationId,
        idempotencyKey: key,
        deduplicationKey: `commercial-export:${workspaceId}:${key}`,
        userVisibleJob: true,
        payload: {
          subject: { artifactId },
          commercialExport: {
            artifactId,
            requestedByUserId: userId,
            type: text(input.type),
            format: text(input.format),
            resourceId: nullableText(input.resourceId),
          },
          activity: {
            category: "finance",
            action: "commercial_export_requested",
            summary: "Exportul comercial a fost solicitat.",
            entityType: "CommercialExport",
            entityId: artifactId,
          },
        },
      });
      if (!jobId) throw new Error("Commercial export job was not created");
      const response = {
        job: mapJob(
          await tx.backgroundJob.findUniqueOrThrow({ where: { id: jobId } }),
        ),
        artifactId,
      };
      await this.saveReplay(
        tx,
        workspaceId,
        userId,
        "commercial.export",
        key,
        input,
        response,
      );
      return response;
    });
  }

  private workspaceContext<T>(
    userId: string,
    workspaceId: string,
    operation: (tx: Transaction) => Promise<T>,
  ) {
    return this.database.withContext({ userId, workspaceId }, operation);
  }

  private vendorContext<T>(
    userId: string,
    vendorOrganizationId: string,
    operation: (tx: Transaction) => Promise<T>,
  ) {
    return this.database.withContext(
      { userId, vendorOrganizationId },
      operation,
    );
  }

  private async ensureVendorEntitlementSnapshot(
    tx: Transaction,
    vendorOrganizationId: string,
  ) {
    const existing = await tx.vendorEntitlementSnapshot.findFirst({
      where: { vendorOrganizationId, supersededAt: null },
      orderBy: { effectiveAt: "desc" },
    });
    if (existing) return existing;
    const freePlan = await tx.subscriptionPlan.findUnique({
      where: { key: "FREE" },
    });
    if (!freePlan) throw new Error("FREE subscription plan is missing");
    const subscription = await tx.vendorSubscription.upsert({
      where: { vendorOrganizationId },
      create: {
        vendorOrganizationId,
        planId: freePlan.id,
        provider: this.environment.SUBSCRIPTION_PROVIDER,
        status: "ACTIVE",
      },
      update: {},
    });
    const rows = await tx.subscriptionPlanEntitlement.findMany({
      where: { planId: subscription.planId },
    });
    const entitlements = Object.fromEntries(
      rows.map((row) => [
        row.key,
        row.valueType === "BOOLEAN"
          ? row.booleanValue
          : row.valueType === "INTEGER"
            ? row.integerValue
            : row.stringValue,
      ]),
    );
    return tx.vendorEntitlementSnapshot.create({
      data: {
        vendorOrganizationId,
        subscriptionId: subscription.id,
        planId: subscription.planId,
        entitlements: entitlements as Prisma.InputJsonValue,
      },
    });
  }

  private tenantContext<T>(
    userId: string,
    tenant: { workspaceId?: string; organizationId?: string },
    operation: (tx: Transaction) => Promise<T>,
  ) {
    if (tenant.workspaceId)
      return this.database.withContext(
        { userId, workspaceId: tenant.workspaceId },
        operation,
      );
    if (tenant.organizationId)
      return this.database.withContext(
        { userId, vendorOrganizationId: tenant.organizationId },
        operation,
      );
    throw new Error("Commercial tenant context missing");
  }

  private async replay(
    tx: Transaction,
    userId: string,
    operation: string,
    key: string,
    request: unknown,
  ) {
    const existing = await tx.idempotencyRecord.findUnique({
      where: {
        actorUserId_operation_key: { actorUserId: userId, operation, key },
      },
    });
    if (!existing) return null;
    if (existing.requestHash !== stableHash(request))
      problem(
        "IDEMPOTENCY_CONFLICT",
        HttpStatus.CONFLICT,
        "Idempotency key conflict",
        "Cheia a fost deja folosită pentru o altă cerere.",
      );
    return existing.responseBody as Prisma.JsonObject;
  }

  private async saveReplay(
    tx: Transaction,
    workspaceId: string | null,
    userId: string,
    operation: string,
    key: string,
    request: unknown,
    response: unknown,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        workspaceId,
        actorUserId: userId,
        operation,
        key,
        requestHash: stableHash(request),
        responseStatus: 200,
        responseBody: jsonInput(moneySafe(response)),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  private async event(
    tx: Transaction,
    input: {
      name: string;
      aggregate: string;
      id: string;
      version?: number;
      workspaceId?: string;
      vendorOrganizationId?: string;
      actorUserId?: string;
      correlationId?: string;
      activity?: JsonObject;
      notification?: JsonObject;
      offerProjection?: JsonObject;
      bookingProjection?: JsonObject;
      contractProjection?: JsonObject;
      budgetProjection?: JsonObject;
      paymentProjection?: JsonObject;
      vendorNotificationProjection?: JsonObject;
    },
  ) {
    await this.asyncEvents.record(tx, {
      eventName: input.name,
      aggregateType: input.aggregate,
      aggregateId: input.id,
      aggregateVersion: input.version,
      workspaceId: input.workspaceId,
      vendorOrganizationId: input.vendorOrganizationId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      deduplicationKey: `${input.name}:${input.id}:${input.version ?? 1}`,
      payload: {
        subject: { [`${lowerCamel(input.aggregate)}Id`]: input.id },
        ...(input.activity ? { activity: input.activity } : {}),
        ...(input.notification ? { notification: input.notification } : {}),
        ...(input.offerProjection
          ? { offerProjection: input.offerProjection }
          : {}),
        ...(input.bookingProjection
          ? { bookingProjection: input.bookingProjection }
          : {}),
        ...(input.contractProjection
          ? { contractProjection: input.contractProjection }
          : {}),
        ...(input.budgetProjection
          ? { budgetProjection: input.budgetProjection }
          : {}),
        ...(input.paymentProjection
          ? { paymentProjection: input.paymentProjection }
          : {}),
        ...(input.vendorNotificationProjection
          ? { vendorNotificationProjection: input.vendorNotificationProjection }
          : {}),
      },
    });
  }

  private async protectLastVendorOwner(
    tx: Transaction,
    organizationId: string,
    memberId: string,
  ) {
    const ownerRole = await tx.vendorRoleTemplate.findUniqueOrThrow({
      where: { key: "vendor_owner" },
    });
    const current = await tx.vendorOrganizationMembership.findUnique({
      where: { id: memberId },
    });
    if (current?.roleTemplateId !== ownerRole.id) return;
    const owners = await tx.vendorOrganizationMembership.count({
      where: {
        vendorOrganizationId: organizationId,
        roleTemplateId: ownerRole.id,
        status: "ACTIVE",
      },
    });
    if (owners <= 1)
      problem(
        "LAST_OWNER_PROTECTED",
        HttpStatus.CONFLICT,
        "Ultimul proprietar este protejat",
      );
  }

  private async replaceRfqChildren(
    tx: Transaction,
    workspaceId: string,
    rfqId: string,
    input: JsonObject,
  ) {
    if (input.requirements !== undefined) {
      await tx.rfqRequirement.deleteMany({ where: { rfqId } });
      const requirements = input.requirements as JsonObject[];
      if (requirements.length)
        await tx.rfqRequirement.createMany({
          data: requirements.map((requirement) => ({
            workspaceId,
            rfqId,
            type: text(requirement.type),
            label: text(requirement.label),
            description: nullableText(requirement.description),
            required: Boolean(requirement.required),
            value:
              requirement.value === undefined
                ? undefined
                : jsonInput(requirement.value),
            position: number(requirement.position),
          })),
        });
    }
    if (input.questions !== undefined) {
      await tx.rfqQuestion.deleteMany({ where: { rfqId } });
      const questions = input.questions as JsonObject[];
      if (questions.length)
        await tx.rfqQuestion.createMany({
          data: questions.map((question) => ({
            workspaceId,
            rfqId,
            question: text(question.question),
            responseType: text(
              question.responseType,
            ) as Prisma.RfqQuestionCreateManyInput["responseType"],
            options: jsonInput(question.options ?? []),
            required: Boolean(question.required),
            position: number(question.position),
          })),
        });
    }
  }

  private async requireRfq(
    tx: Transaction,
    workspaceId: string,
    rfqId: string,
  ) {
    const row = await tx.requestForQuote.findFirst({
      where: { id: rfqId, workspaceId, deletedAt: null },
    });
    if (!row) notFound("Solicitarea nu există.");
    return row;
  }

  private async mapRfq(
    tx: Transaction,
    row: Prisma.RequestForQuoteGetPayload<object>,
  ) {
    const [requirements, questions, recipients, offers] = await Promise.all([
      tx.rfqRequirement.findMany({
        where: { rfqId: row.id },
        orderBy: { position: "asc" },
      }),
      tx.rfqQuestion.findMany({
        where: { rfqId: row.id },
        orderBy: { position: "asc" },
      }),
      tx.rfqRecipient.findMany({
        where: { rfqId: row.id },
        orderBy: { createdAt: "asc" },
      }),
      tx.vendorOffer.count({ where: { rfqId: row.id } }),
    ]);
    return moneySafe({
      ...row,
      requirements,
      questions,
      recipients,
      offerCount: offers,
      progress: {
        total: recipients.length,
        pending: recipients.filter((item) => item.status === "PENDING").length,
        queued: recipients.filter((item) => item.status === "QUEUED").length,
        sent: recipients.filter((item) => item.status === "SENT").length,
        opened: recipients.filter((item) => item.status === "OPENED").length,
        responded: recipients.filter((item) => item.status === "RESPONDED")
          .length,
        declined: recipients.filter((item) => item.status === "DECLINED")
          .length,
        failed: recipients.filter((item) => item.status === "FAILED").length,
        expired: recipients.filter((item) => item.status === "EXPIRED").length,
        cancelled: recipients.filter((item) => item.status === "CANCELLED")
          .length,
        deliveryState: recipients.some((item) => item.status === "FAILED")
          ? "PARTIAL_FAILURE"
          : recipients.some((item) =>
                ["PENDING", "QUEUED"].includes(item.status),
              )
            ? "QUEUED"
            : "PROCESSED",
        awardPolicy: row.awardPolicy,
        awardedOfferId: row.awardedOfferId,
      },
    });
  }

  private async mapVendorRfq(
    tx: Transaction,
    row: Prisma.RequestForQuoteGetPayload<object>,
    organizationId: string,
  ) {
    const [requirements, questions] = await Promise.all([
      tx.rfqRequirement.findMany({
        where: { rfqId: row.id },
        orderBy: { position: "asc" },
      }),
      tx.rfqQuestion.findMany({
        where: { rfqId: row.id },
        orderBy: { position: "asc" },
      }),
    ]);
    const existingOffer = await tx.vendorOffer.findFirst({
      where: { rfqId: row.id, vendorOrganizationId: organizationId },
    });
    return moneySafe({
      id: row.id,
      title: row.title,
      category: row.category,
      description: row.description,
      eventDate: row.eventDate,
      guestCount: row.guestCount,
      locationSnapshot: row.locationSnapshot,
      budgetRangeMinMinor: row.budgetRangeMinMinor,
      budgetRangeMaxMinor: row.budgetRangeMaxMinor,
      currency: row.currency,
      responseDeadline: row.responseDeadline,
      status: row.status,
      requirements,
      questions,
      existingOfferId: existingOffer?.id ?? null,
    });
  }

  private async createOfferVersion(
    tx: Transaction,
    offer: Prisma.VendorOfferGetPayload<object>,
    versionNumber: number,
    input: JsonObject,
    userId: string,
    totals: ReturnType<typeof calculateOfferTotals>,
  ) {
    const content = moneySafe({ ...input, totals, versionNumber });
    const version = await tx.vendorOfferVersion.create({
      data: {
        workspaceId: offer.workspaceId,
        vendorOrganizationId: offer.vendorOrganizationId,
        offerId: offer.id,
        versionNumber,
        currency: text(input.currency),
        subtotalMinor: BigInt(totals.subtotalMinor),
        discountMinor: BigInt(totals.discountMinor),
        taxableBaseMinor: BigInt(totals.taxableBaseMinor),
        taxRateBasisPoints: number(input.taxRateBasisPoints ?? 0),
        taxMinor: BigInt(totals.taxMinor),
        totalMinor: BigInt(totals.totalMinor),
        depositMinor: toNullableBigInt(input.depositMinor),
        pricingNotes: nullableText(input.pricingNotes),
        terms: jsonInput(input.terms ?? {}),
        availabilityConfirmation: text(input.availabilityConfirmation),
        deliveryTimeline: text(input.deliveryTimeline),
        cancellationTerms: text(input.cancellationTerms),
        validUntil: input.validUntil ? date(input.validUntil) : null,
        contentHash: stableHash(content),
        createdById: userId,
      },
    });
    const lines = input.lineItems as JsonObject[];
    await tx.vendorOfferLineItem.createMany({
      data: lines.map((line) => ({
        workspaceId: offer.workspaceId,
        vendorOrganizationId: offer.vendorOrganizationId,
        offerVersionId: version.id,
        type: text(line.type),
        name: text(line.name),
        description: text(line.description),
        quantity: number(line.quantity),
        unit: text(line.unit),
        unitPriceMinor: BigInt(number(line.unitPriceMinor)),
        lineTotalMinor: BigInt(
          number(line.quantity) * number(line.unitPriceMinor),
        ),
        optional: Boolean(line.optional),
        selected: Boolean(line.selected),
        position: number(line.position),
      })),
    });
    const answers = (input.answers ?? []) as JsonObject[];
    if (answers.length)
      await tx.vendorOfferAnswer.createMany({
        data: answers.map((answer) => ({
          workspaceId: offer.workspaceId,
          vendorOrganizationId: offer.vendorOrganizationId,
          offerVersionId: version.id,
          questionId: text(answer.questionId),
          value: jsonInput(answer.value),
        })),
      });
    return version;
  }

  private async offerVersion(
    tx: Transaction,
    offer: Prisma.VendorOfferGetPayload<object>,
  ) {
    return tx.vendorOfferVersion.findUniqueOrThrow({
      where: {
        offerId_versionNumber: {
          offerId: offer.id,
          versionNumber: offer.currentVersionNumber,
        },
      },
    });
  }

  private async mergeOfferInput(
    tx: Transaction,
    versionId: string,
    input: JsonObject,
  ): Promise<JsonObject> {
    const [version, lines, answers] = await Promise.all([
      tx.vendorOfferVersion.findUniqueOrThrow({ where: { id: versionId } }),
      tx.vendorOfferLineItem.findMany({
        where: { offerVersionId: versionId },
        orderBy: { position: "asc" },
      }),
      tx.vendorOfferAnswer.findMany({ where: { offerVersionId: versionId } }),
    ]);
    return {
      currency: input.currency ?? version.currency,
      lineItems:
        input.lineItems ??
        lines.map((line) =>
          moneySafe({
            type: line.type,
            name: line.name,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unitPriceMinor: line.unitPriceMinor,
            optional: line.optional,
            selected: line.selected,
            position: line.position,
          }),
        ),
      answers:
        input.answers ??
        answers.map((answer) => ({
          questionId: answer.questionId,
          value: answer.value,
        })),
      discountMinor: input.discountMinor ?? moneyNumber(version.discountMinor),
      taxRateBasisPoints:
        input.taxRateBasisPoints ?? version.taxRateBasisPoints,
      depositMinor: input.depositMinor ?? moneyNumber(version.depositMinor),
      pricingNotes: input.pricingNotes ?? version.pricingNotes,
      terms: input.terms ?? version.terms,
      availabilityConfirmation:
        input.availabilityConfirmation ?? version.availabilityConfirmation,
      deliveryTimeline: input.deliveryTimeline ?? version.deliveryTimeline,
      cancellationTerms: input.cancellationTerms ?? version.cancellationTerms,
      validUntil: input.validUntil ?? version.validUntil?.toISOString() ?? null,
    };
  }

  private async mapOffer(
    tx: Transaction,
    offer: Prisma.VendorOfferGetPayload<object>,
  ) {
    const version = await this.offerVersion(tx, offer);
    const [lineItems, answers, profile, thread] = await Promise.all([
      tx.vendorOfferLineItem.findMany({
        where: { offerVersionId: version.id },
        orderBy: { position: "asc" },
      }),
      tx.vendorOfferAnswer.findMany({ where: { offerVersionId: version.id } }),
      tx.vendorProfile.findUnique({
        where: { vendorOrganizationId: offer.vendorOrganizationId },
      }),
      tx.negotiationThread.findUnique({ where: { offerId: offer.id } }),
    ]);
    return moneySafe({
      ...offer,
      currentVersion: version,
      lineItems,
      answers,
      vendor: profile ? publicVendorSnapshot(profile) : null,
      negotiationThreadId: thread?.id ?? null,
    });
  }

  private async refreshRfqResponseStatus(tx: Transaction, rfqId: string) {
    await tx.$executeRaw`
      SELECT public.weddingos_refresh_rfq_response_status(${rfqId}::uuid)
    `;
  }

  private async projectAcceptedOfferToBudget(
    tx: Transaction,
    userId: string,
    workspaceId: string,
    offer: Prisma.VendorOfferGetPayload<object>,
    bookingId: string,
    contractId: string,
    contractVersionId: string,
    category: string,
  ) {
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    const plan = await tx.budgetPlan.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        name: "Bugetul nunții",
        currency: workspace.currency,
        targetTotalMinor: offer.totalMinor,
        createdById: userId,
      },
      update: {},
    });
    let budgetCategory = await tx.budgetCategory.findFirst({
      where: {
        workspaceId,
        budgetPlanId: plan.id,
        canonicalType: category,
        deletedAt: null,
      },
    });
    if (!budgetCategory)
      budgetCategory = await tx.budgetCategory.create({
        data: {
          workspaceId,
          budgetPlanId: plan.id,
          name: categoryLabel(category),
          canonicalType: category,
          allocatedMinor: offer.totalMinor,
          position: await tx.budgetCategory.count({
            where: { budgetPlanId: plan.id },
          }),
          createdById: userId,
        },
      });
    const budgetItem = await tx.budgetItem.upsert({
      where: {
        workspaceId_sourceChainKey: {
          workspaceId,
          sourceChainKey: `offer:${offer.id}`,
        },
      },
      create: {
        workspaceId,
        budgetPlanId: plan.id,
        categoryId: budgetCategory.id,
        name: `Rezervare ${categoryLabel(category)}`,
        status: "COMMITTED",
        sourceType: "ACCEPTED_OFFER",
        sourceId: offer.id,
        sourceChainKey: `offer:${offer.id}`,
        vendorOrganizationId: offer.vendorOrganizationId,
        estimatedMinor: offer.totalMinor,
        quotedMinor: offer.totalMinor,
        committedMinor: offer.totalMinor,
        createdById: userId,
      },
      update: {
        sourceType: "CONTRACT",
        sourceId: contractId,
        vendorOrganizationId: offer.vendorOrganizationId,
        quotedMinor: offer.totalMinor,
        committedMinor: offer.totalMinor,
        status: "COMMITTED",
        version: { increment: 1 },
      },
    });
    const currentVersion = await this.offerVersion(tx, offer);
    const paymentTerms = currentVersion.terms as JsonObject;
    const milestones = Array.isArray(paymentTerms.paymentSchedule)
      ? (paymentTerms.paymentSchedule as JsonObject[])
      : [];
    if (milestones.length) {
      await tx.paymentScheduleEntry.createMany({
        data: milestones.map((item, index) => ({
          workspaceId,
          budgetItemId: budgetItem.id,
          bookingId,
          contractId,
          sourceContractVersionId: contractVersionId,
          vendorOrganizationId: offer.vendorOrganizationId,
          name: text(item.name ?? `Tranșa ${index + 1}`),
          amountMinor: BigInt(number(item.amountMinor)),
          currency: workspace.currency,
          dueAt: date(item.dueAt),
          sequence: index + 1,
          createdById: userId,
        })),
      });
    }
    return budgetItem;
  }

  private async applyEffectiveContractToBudget(
    tx: Transaction,
    userId: string,
    contract: Prisma.VendorContractGetPayload<object>,
    contractVersion: Prisma.VendorContractVersionGetPayload<object>,
  ) {
    const [booking, workspace] = await Promise.all([
      tx.vendorBooking.findUniqueOrThrow({ where: { id: contract.bookingId } }),
      tx.workspace.findUniqueOrThrow({ where: { id: contract.workspaceId } }),
    ]);
    assertCurrency(booking.currency, workspace.currency);
    const budgetItem = await tx.budgetItem.findUnique({
      where: {
        workspaceId_sourceChainKey: {
          workspaceId: contract.workspaceId,
          sourceChainKey: `offer:${booking.offerId}`,
        },
      },
    });
    if (!budgetItem)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.CONFLICT,
        "Lanțul bugetar al contractului lipsește",
      );
    const paymentTerms = contractVersion.paymentTerms as JsonObject;
    const document = contractVersion.document as JsonObject;
    const documentTotal = document.total as JsonObject | undefined;
    const currencyValue = text(
      documentTotal?.currency ?? paymentTerms.currency ?? booking.currency,
    );
    assertCurrency(currencyValue, workspace.currency);
    const contractTotal = number(
      paymentTerms.totalMinor ??
        documentTotal?.amountMinor ??
        moneyNumber(booking.totalMinor),
    );
    await tx.budgetItem.update({
      where: { id: budgetItem.id },
      data: {
        sourceType: "CONTRACT",
        sourceId: contract.id,
        committedMinor: budgetItem.manualOverrideMinor ?? BigInt(contractTotal),
        status: budgetItem.paidMinor > 0 ? "PARTIALLY_PAID" : "COMMITTED",
        version: { increment: 1 },
      },
    });

    await tx.paymentScheduleEntry.updateMany({
      where: {
        contractId: contract.id,
        sourceContractVersionId: { not: contractVersion.id },
        paidMinor: 0,
        dueAt: { gt: new Date() },
        deletedAt: null,
      },
      data: {
        status: "CANCELLED",
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    const scheduleValue = Array.isArray(paymentTerms.paymentSchedule)
      ? paymentTerms.paymentSchedule
      : Array.isArray(document.paymentSchedule)
        ? document.paymentSchedule
        : [];
    for (const [index, raw] of scheduleValue.entries()) {
      const item = raw as JsonObject;
      const dueAt = date(item.dueAt);
      const amountMinor = BigInt(number(item.amountMinor));
      await tx.paymentScheduleEntry.upsert({
        where: {
          sourceContractVersionId_sequence: {
            sourceContractVersionId: contractVersion.id,
            sequence: index + 1,
          },
        },
        create: {
          workspaceId: contract.workspaceId,
          budgetItemId: budgetItem.id,
          bookingId: booking.id,
          contractId: contract.id,
          sourceContractVersionId: contractVersion.id,
          vendorOrganizationId: contract.vendorOrganizationId,
          name: text(item.name ?? `Tranșa ${index + 1}`),
          amountMinor,
          currency: workspace.currency,
          dueAt,
          sequence: index + 1,
          createdById: userId,
        },
        update: {
          name: text(item.name ?? `Tranșa ${index + 1}`),
          amountMinor,
          currency: workspace.currency,
          dueAt,
          status: "UPCOMING",
          deletedAt: null,
          version: { increment: 1 },
        },
      });
    }
  }

  private async mapBooking(
    tx: Transaction,
    row: Prisma.VendorBookingGetPayload<object>,
  ) {
    const [items, milestones, contract, payments] = await Promise.all([
      tx.bookingServiceItem.findMany({ where: { bookingId: row.id } }),
      tx.bookingMilestone.findMany({
        where: { bookingId: row.id },
        orderBy: { position: "asc" },
      }),
      tx.vendorContract.findUnique({ where: { bookingId: row.id } }),
      tx.paymentRecord.findMany({
        where: { bookingId: row.id, status: "CONFIRMED" },
      }),
    ]);
    const paidTotalMinor = payments.reduce(
      (sum, payment) =>
        sum +
        (payment.entryType === "PAYMENT"
          ? payment.amountMinor
          : -payment.amountMinor),
      0n,
    );
    return moneySafe({
      ...row,
      items,
      milestones,
      contract,
      paidTotalMinor,
      outstandingTotalMinor:
        row.totalMinor > paidTotalMinor ? row.totalMinor - paidTotalMinor : 0n,
    });
  }

  private async mapContract(
    tx: Transaction,
    row: Prisma.VendorContractGetPayload<object>,
  ) {
    const versions = await tx.vendorContractVersion.findMany({
      where: { contractId: row.id },
      orderBy: { versionNumber: "desc" },
    });
    const currentVersion =
      versions.find(
        (version) => version.versionNumber === row.currentVersionNumber,
      ) ?? null;
    const acknowledgements = await tx.contractPartyAcknowledgement.findMany({
      where: { contractId: row.id },
      orderBy: { acknowledgedAt: "asc" },
    });
    return moneySafe({
      ...row,
      currentVersion,
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        contentHash: version.contentHash,
        kind: version.kind,
        baseVersionId: version.baseVersionId,
        effectiveAt: version.effectiveAt,
        supersededAt: version.supersededAt,
        acknowledgements: acknowledgements.filter(
          (acknowledgement) => acknowledgement.contractVersionId === version.id,
        ),
        createdAt: version.createdAt,
      })),
      acknowledgements: currentVersion
        ? acknowledgements.filter(
            (acknowledgement) =>
              acknowledgement.contractVersionId === currentVersion.id,
          )
        : [],
      disclaimer:
        "Document operațional generat pe baza datelor introduse. Pentru validitate juridică și conformitate locală, documentul trebuie verificat de un profesionist autorizat.",
      acknowledgementLabel: "Confirmare în WeddingOS",
    });
  }

  private async requireBudget(tx: Transaction, workspaceId: string) {
    const plan = await tx.budgetPlan.findUnique({ where: { workspaceId } });
    if (!plan) notFound("Planul de buget nu există.");
    return plan;
  }

  private async recalculatePaymentProjection(
    tx: Transaction,
    workspaceId: string,
    budgetItemId: string,
    scheduleId: string | null,
  ) {
    const validPayments = await tx.paymentRecord.findMany({
      where: {
        workspaceId,
        budgetItemId,
        status: "CONFIRMED",
      },
    });
    const paidMinor = validPayments.reduce(
      (sum, payment) =>
        sum +
        (payment.entryType === "PAYMENT"
          ? payment.amountMinor
          : -payment.amountMinor),
      0n,
    );
    const item = await tx.budgetItem.findUniqueOrThrow({
      where: { id: budgetItemId },
    });
    const committed =
      item.committedMinor ?? item.quotedMinor ?? item.estimatedMinor;
    await tx.budgetItem.update({
      where: { id: item.id },
      data: {
        paidMinor,
        status:
          paidMinor >= committed && committed > 0
            ? "PAID"
            : paidMinor > 0
              ? "PARTIALLY_PAID"
              : item.sourceType === "MANUAL"
                ? "PLANNED"
                : "COMMITTED",
        version: { increment: 1 },
      },
    });
    if (scheduleId) {
      const schedulePayments = validPayments.filter(
        (payment) => payment.paymentScheduleEntryId === scheduleId,
      );
      const schedulePaid = schedulePayments.reduce(
        (sum, payment) =>
          sum +
          (payment.entryType === "PAYMENT"
            ? payment.amountMinor
            : -payment.amountMinor),
        0n,
      );
      const schedule = await tx.paymentScheduleEntry.findUnique({
        where: { id: scheduleId },
      });
      if (schedule)
        await tx.paymentScheduleEntry.update({
          where: { id: schedule.id },
          data: {
            paidMinor: schedulePaid,
            status:
              schedulePaid >= schedule.amountMinor
                ? "PAID"
                : schedulePaid > 0
                  ? "PARTIALLY_PAID"
                  : schedule.dueAt < new Date()
                    ? "OVERDUE"
                    : "UPCOMING",
            version: { increment: 1 },
          },
        });
    }
  }

  private async workspaceNotification(
    tx: Transaction,
    workspaceId: string,
    kind: string,
    title: string,
    body: string,
    actionUrl: string,
  ) {
    const owner = await tx.workspaceMembership.findFirst({
      where: {
        workspaceId,
        status: "ACTIVE",
        roleTemplate: { key: "couple_owner" },
      },
      orderBy: { joinedAt: "asc" },
    });
    return owner
      ? {
          recipientUserId: owner.userId,
          module: "commercial",
          kind,
          priority: "normal",
          title,
          body,
          actionUrl,
        }
      : undefined;
  }
}

function vendorOrganizationResponse(
  organization: Prisma.VendorOrganizationGetPayload<object>,
  role?: string,
  profile?: Prisma.VendorProfileGetPayload<object> | null,
  capabilities: CapabilityKey[] = [],
) {
  return {
    id: organization.id,
    legalName: organization.legalName,
    displayName: organization.displayName,
    country: organization.country,
    contactEmail: organization.contactEmail,
    websiteUrl: organization.websiteUrl,
    status: organization.status,
    version: organization.version,
    role,
    capabilities,
    profile: profile ? vendorProfileResponse(profile) : null,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

function effectiveVendorCapabilities(
  roleCapabilities: Prisma.JsonValue | undefined,
  overrides: Array<{ capability: string; effect: string }>,
): CapabilityKey[] {
  const effective = new Set<CapabilityKey>();
  if (Array.isArray(roleCapabilities)) {
    for (const value of roleCapabilities) {
      const parsed = capabilityKeySchema.safeParse(value);
      if (parsed.success) effective.add(parsed.data);
    }
  }
  for (const override of overrides) {
    const parsed = capabilityKeySchema.safeParse(override.capability);
    if (!parsed.success) continue;
    if (override.effect === "ALLOW") effective.add(parsed.data);
    else effective.delete(parsed.data);
  }
  return [...effective].sort();
}

function vendorProfileResponse(
  profile: Prisma.VendorProfileGetPayload<object>,
) {
  return moneySafe({
    id: profile.id,
    vendorOrganizationId: profile.vendorOrganizationId,
    slug: profile.slug,
    headline: profile.headline,
    description: profile.description,
    shortDescription: profile.shortDescription,
    logoUrl: profile.logoUrl,
    coverImageUrl: profile.coverImageUrl,
    categories: profile.categories,
    customCategoryLabel: profile.customCategoryLabel,
    languages: profile.languages,
    yearsExperience: profile.yearsExperience,
    pricingVisibility: profile.pricingVisibility,
    startingPriceMinor: profile.startingPriceMinor,
    currency: profile.currency,
    responseTimeLabel: profile.responseTimeLabel,
    publicEmail: profile.publicEmail,
    publicPhone: profile.publicPhone,
    publicationStatus: profile.publicationStatus,
    verificationStatus: profile.verificationStatus,
    verificationLabel:
      profile.verificationStatus === "VERIFIED" ? "Verificat" : "Neverificat",
    publicationWarnings: profile.publicationWarnings,
    publishedAt: profile.publishedAt,
    version: profile.version,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
}

function publicVendorSnapshot(profile: Prisma.VendorProfileGetPayload<object>) {
  return {
    vendorOrganizationId: profile.vendorOrganizationId,
    slug: profile.slug,
    headline: profile.headline,
    shortDescription: profile.shortDescription,
    categories: profile.categories,
    logoUrl: profile.logoUrl,
    coverImageUrl: profile.coverImageUrl,
    startingPriceMinor: moneyNumber(profile.startingPriceMinor),
    currency: profile.currency,
    pricingVisibility: profile.pricingVisibility,
    verificationStatus: profile.verificationStatus,
    responseTimeLabel: profile.responseTimeLabel,
  };
}

function marketplaceOrder(
  sort: string | undefined,
): Prisma.VendorProfileOrderByWithRelationInput[] {
  if (sort === "STARTING_PRICE_ASC")
    return [{ startingPriceMinor: "asc" }, { id: "asc" }];
  if (sort === "STARTING_PRICE_DESC")
    return [{ startingPriceMinor: "desc" }, { id: "asc" }];
  if (sort === "RESPONSE_TIME")
    return [{ responseTimeLabel: "asc" }, { id: "asc" }];
  return [{ publishedAt: "desc" }, { id: "asc" }];
}

function readEntitlement(value: Prisma.JsonValue, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function packageUpdate(input: JsonObject): Prisma.VendorPackageUpdateInput {
  return {
    ...(input.name !== undefined ? { name: text(input.name) } : {}),
    ...(input.description !== undefined
      ? { description: text(input.description) }
      : {}),
    ...(input.basePriceMinor !== undefined
      ? { basePriceMinor: toNullableBigInt(input.basePriceMinor) }
      : {}),
    ...(input.currency !== undefined ? { currency: text(input.currency) } : {}),
    ...(input.includedItems !== undefined
      ? { includedItems: jsonInput(input.includedItems) }
      : {}),
    ...(input.excludedItems !== undefined
      ? { excludedItems: jsonInput(input.excludedItems) }
      : {}),
    ...(input.guestLimit !== undefined
      ? { guestLimit: nullableNumber(input.guestLimit) }
      : {}),
    ...(input.durationMinutes !== undefined
      ? { durationMinutes: nullableNumber(input.durationMinutes) }
      : {}),
    ...(input.active !== undefined ? { active: Boolean(input.active) } : {}),
    ...(input.position !== undefined
      ? { position: number(input.position) }
      : {}),
    version: { increment: 1 },
  };
}

function rfqUpdate(input: JsonObject): Prisma.RequestForQuoteUpdateInput {
  return {
    ...(input.title !== undefined ? { title: text(input.title) } : {}),
    ...(input.category !== undefined
      ? {
          category: text(
            input.category,
          ) as Prisma.RequestForQuoteUpdateInput["category"],
        }
      : {}),
    ...(input.description !== undefined
      ? { description: text(input.description) }
      : {}),
    ...(input.weddingEventId !== undefined
      ? { weddingEventId: nullableText(input.weddingEventId) }
      : {}),
    ...(input.eventDate !== undefined
      ? { eventDate: input.eventDate ? date(input.eventDate) : null }
      : {}),
    ...(input.guestCount !== undefined
      ? { guestCount: nullableNumber(input.guestCount) }
      : {}),
    ...(input.locationSnapshot !== undefined
      ? { locationSnapshot: jsonInput(input.locationSnapshot) }
      : {}),
    ...(input.budgetRangeMinMinor !== undefined
      ? { budgetRangeMinMinor: toNullableBigInt(input.budgetRangeMinMinor) }
      : {}),
    ...(input.budgetRangeMaxMinor !== undefined
      ? { budgetRangeMaxMinor: toNullableBigInt(input.budgetRangeMaxMinor) }
      : {}),
    ...(input.currency !== undefined ? { currency: text(input.currency) } : {}),
    ...(input.responseDeadline !== undefined
      ? { responseDeadline: date(input.responseDeadline) }
      : {}),
    version: { increment: 1 },
  };
}

function budgetItemUpdate(input: JsonObject): Prisma.BudgetItemUpdateInput {
  return {
    ...(input.categoryId !== undefined
      ? { categoryId: text(input.categoryId) }
      : {}),
    ...(input.name !== undefined ? { name: text(input.name) } : {}),
    ...(input.description !== undefined
      ? { description: nullableText(input.description) }
      : {}),
    ...(input.estimatedMinor !== undefined
      ? { estimatedMinor: BigInt(number(input.estimatedMinor)) }
      : {}),
    ...(input.quotedMinor !== undefined
      ? { quotedMinor: toNullableBigInt(input.quotedMinor) }
      : {}),
    ...(input.committedMinor !== undefined
      ? { committedMinor: toNullableBigInt(input.committedMinor) }
      : {}),
    ...(input.dueAt !== undefined
      ? { dueAt: input.dueAt ? date(input.dueAt) : null }
      : {}),
    ...(input.vendorOrganizationId !== undefined
      ? { vendorOrganizationId: nullableText(input.vendorOrganizationId) }
      : {}),
    version: { increment: 1 },
  };
}

function expenseUpdate(input: JsonObject): Prisma.ExpenseRecordUpdateInput {
  return {
    ...(input.description !== undefined
      ? { description: text(input.description) }
      : {}),
    ...(input.amountMinor !== undefined
      ? { amountMinor: BigInt(number(input.amountMinor)) }
      : {}),
    ...(input.expenseDate !== undefined
      ? { expenseDate: date(input.expenseDate) }
      : {}),
    ...(input.status !== undefined
      ? {
          status: text(
            input.status,
          ) as Prisma.ExpenseRecordUpdateInput["status"],
        }
      : {}),
    ...(input.paymentMethodLabel !== undefined
      ? { paymentMethodLabel: nullableText(input.paymentMethodLabel) }
      : {}),
    ...(input.reference !== undefined
      ? { reference: nullableText(input.reference) }
      : {}),
    ...(input.notesPrivate !== undefined
      ? { notesPrivate: nullableText(input.notesPrivate) }
      : {}),
    version: { increment: 1 },
  };
}

function scheduleUpdate(
  input: JsonObject,
): Prisma.PaymentScheduleEntryUpdateInput {
  return {
    ...(input.name !== undefined ? { name: text(input.name) } : {}),
    ...(input.amountMinor !== undefined
      ? { amountMinor: BigInt(number(input.amountMinor)) }
      : {}),
    ...(input.currency !== undefined ? { currency: text(input.currency) } : {}),
    ...(input.dueAt !== undefined ? { dueAt: date(input.dueAt) } : {}),
    ...(input.sequence !== undefined
      ? { sequence: number(input.sequence) }
      : {}),
    ...(input.notes !== undefined ? { notes: nullableText(input.notes) } : {}),
    version: { increment: 1 },
  };
}

function paymentUpdate(input: JsonObject): Prisma.PaymentRecordUpdateInput {
  return {
    ...(input.paymentScheduleEntryId !== undefined
      ? { paymentScheduleEntryId: nullableText(input.paymentScheduleEntryId) }
      : {}),
    ...(input.amountMinor !== undefined
      ? { amountMinor: BigInt(number(input.amountMinor)) }
      : {}),
    ...(input.currency !== undefined ? { currency: text(input.currency) } : {}),
    ...(input.paidAt !== undefined ? { paidAt: date(input.paidAt) } : {}),
    ...(input.method !== undefined
      ? {
          method: text(
            input.method,
          ) as Prisma.PaymentRecordUpdateInput["method"],
        }
      : {}),
    ...(input.reference !== undefined
      ? { reference: nullableText(input.reference) }
      : {}),
    ...(input.notesPrivate !== undefined
      ? { notesPrivate: nullableText(input.notesPrivate) }
      : {}),
    version: { increment: 1 },
  };
}

function offerTotals(input: JsonObject) {
  return calculateOfferTotals({
    lineItems: (input.lineItems as JsonObject[]).map((line) => ({
      type: text(line.type),
      name: text(line.name),
      description: text(line.description),
      quantity: number(line.quantity),
      unit: text(line.unit) as
        "FIXED" | "GUEST" | "HOUR" | "DAY" | "ITEM" | "PERCENT" | "CUSTOM",
      unitPriceMinor: number(line.unitPriceMinor),
      optional: Boolean(line.optional),
      selected: Boolean(line.selected),
      position: number(line.position),
    })),
    discountMinor: number(input.discountMinor ?? 0),
    taxRateBasisPoints: number(input.taxRateBasisPoints ?? 0),
  });
}

function budgetSummary(
  plan: Prisma.BudgetPlanGetPayload<object>,
  categories: Prisma.BudgetCategoryGetPayload<object>[],
  items: Prisma.BudgetItemGetPayload<object>[],
) {
  return calculateBudgetSummary({
    targetTotalMinor: moneyNumber(plan.targetTotalMinor) ?? 0,
    categories: categories.map((category) => ({
      allocatedMinor: moneyNumber(category.allocatedMinor) ?? 0,
      deleted: Boolean(category.deletedAt),
    })),
    items: items.map((item) => ({
      status: item.status,
      estimatedMinor: moneyNumber(item.estimatedMinor) ?? 0,
      quotedMinor: moneyNumber(item.quotedMinor),
      committedMinor: moneyNumber(item.committedMinor),
      paidMinor: moneyNumber(item.paidMinor) ?? 0,
      deleted: Boolean(item.deletedAt),
    })),
  });
}

function initialContractDocument(
  rfq: Prisma.RequestForQuoteGetPayload<object>,
  offer: Prisma.VendorOfferGetPayload<object>,
  lines: Prisma.VendorOfferLineItemGetPayload<object>[],
) {
  return {
    parties: {
      weddingWorkspaceId: rfq.workspaceId,
      vendorOrganizationId: offer.vendorOrganizationId,
    },
    event: { rfqId: rfq.id, title: rfq.title, eventDate: rfq.eventDate },
    services: lines.map((line) =>
      moneySafe({
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        totalMinor: line.lineTotalMinor,
      }),
    ),
    scope: lines.map((line) => line.name),
    exclusions: [],
    dates: { serviceDate: rfq.eventDate },
    location: rfq.locationSnapshot,
    total: {
      amountMinor: moneyNumber(offer.totalMinor),
      currency: offer.currency,
    },
    deposit:
      offer.depositMinor === null
        ? null
        : {
            amountMinor: moneyNumber(offer.depositMinor),
            currency: offer.currency,
          },
    paymentSchedule: [],
    cancellation: "Condițiile de anulare trebuie revizuite de ambele părți.",
    rescheduling: "Reprogramarea necesită acordul ambelor părți.",
    responsibilities: [],
    forceMajeure:
      "Clauza de forță majoră trebuie verificată pentru jurisdicția aplicabilă.",
    dataPrivacy:
      "Părțile vor prelucra datele numai pentru executarea serviciilor convenite.",
    customClauses: [],
  };
}

function contractContentHash(input: {
  document: unknown;
  partySnapshots: unknown;
  summary: string;
  serviceScope: unknown;
  paymentTerms: unknown;
  cancellationTerms: string;
}) {
  return stableHash({
    document: input.document,
    partySnapshots: input.partySnapshots,
    summary: input.summary,
    serviceScope: input.serviceScope,
    paymentTerms: input.paymentTerms,
    cancellationTerms: input.cancellationTerms,
  });
}

function rfqTransition(current: string, transition: string) {
  const allowed: Record<string, Record<string, string>> = {
    DRAFT: { MARK_READY: "READY", CANCEL: "CANCELLED" },
    READY: { SEND: "SENT", CANCEL: "CANCELLED", REOPEN: "DRAFT" },
    SENT: { CLOSE: "CLOSED", CANCEL: "CANCELLED" },
    PARTIALLY_RESPONDED: { CLOSE: "CLOSED", CANCEL: "CANCELLED" },
    RESPONDED: { CLOSE: "CLOSED", ARCHIVE: "ARCHIVED" },
    CLOSED: { REOPEN: "SENT", ARCHIVE: "ARCHIVED" },
    CANCELLED: { REOPEN: "DRAFT", ARCHIVE: "ARCHIVED" },
    ARCHIVED: {},
  };
  const next = allowed[current]?.[transition];
  if (!next)
    problem("VALIDATION_FAILED", HttpStatus.CONFLICT, "Tranziție RFQ invalidă");
  return next as Prisma.RequestForQuoteUpdateInput["status"];
}

function offerTransition(current: string, transition: string) {
  const allowed: Record<string, Record<string, string>> = {
    SUBMITTED: {
      START_REVIEW: "UNDER_REVIEW",
      REQUEST_REVISION: "REVISION_REQUESTED",
      ACCEPT: "ACCEPTED",
      REJECT: "REJECTED",
    },
    UNDER_REVIEW: {
      REQUEST_REVISION: "REVISION_REQUESTED",
      ACCEPT: "ACCEPTED",
      REJECT: "REJECTED",
    },
    REVISED: {
      START_REVIEW: "UNDER_REVIEW",
      REQUEST_REVISION: "REVISION_REQUESTED",
      ACCEPT: "ACCEPTED",
      REJECT: "REJECTED",
    },
    REJECTED: { ARCHIVE: "SUPERSEDED" },
  };
  const next = allowed[current]?.[transition];
  if (!next)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.CONFLICT,
      "Tranziție ofertă invalidă",
    );
  return next as Prisma.VendorOfferUpdateInput["status"];
}

function bookingTransition(current: string, transition: string) {
  const map: Record<string, Record<string, string>> = {
    PENDING_CONTRACT: { CANCEL: "CANCELLED", DISPUTE: "DISPUTED" },
    CONFIRMED: {
      START: "IN_PROGRESS",
      CANCEL: "CANCELLED",
      DISPUTE: "DISPUTED",
    },
    IN_PROGRESS: { COMPLETE: "COMPLETED", DISPUTE: "DISPUTED" },
    COMPLETED: { ARCHIVE: "ARCHIVED", DISPUTE: "DISPUTED" },
    DISPUTED: { CANCEL: "CANCELLED", START: "IN_PROGRESS" },
    CANCELLED: { ARCHIVE: "ARCHIVED" },
  };
  const next = map[current]?.[transition];
  if (!next)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.CONFLICT,
      "Tranziție rezervare invalidă",
    );
  return next as Prisma.VendorBookingUpdateInput["status"];
}

function contractTransition(current: string, transition: string) {
  const map: Record<string, Record<string, string>> = {
    DRAFT: {
      SUBMIT_FOR_REVIEW: "IN_REVIEW",
      MARK_READY: "READY_FOR_ACKNOWLEDGEMENT",
      CANCEL: "CANCELLED",
    },
    IN_REVIEW: {
      REQUEST_CHANGES: "CHANGES_REQUESTED",
      MARK_READY: "READY_FOR_ACKNOWLEDGEMENT",
      CANCEL: "CANCELLED",
    },
    CHANGES_REQUESTED: {
      SUBMIT_FOR_REVIEW: "IN_REVIEW",
      MARK_READY: "READY_FOR_ACKNOWLEDGEMENT",
      CANCEL: "CANCELLED",
    },
    READY_FOR_ACKNOWLEDGEMENT: {
      REQUEST_CHANGES: "CHANGES_REQUESTED",
      CANCEL: "CANCELLED",
    },
  };
  const next = map[current]?.[transition];
  if (!next)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.CONFLICT,
      "Tranziție contract invalidă",
    );
  return next as Prisma.VendorContractUpdateInput["status"];
}

function paymentTransition(current: string, transition: string) {
  const map: Record<string, Record<string, string>> = {
    RECORDED: {
      CONFIRM: "CONFIRMED",
      REVERSE: "REVERSED",
      REFUND: "REFUNDED",
      DISPUTE: "DISPUTED",
    },
    CONFIRMED: { REVERSE: "REVERSED", REFUND: "REFUNDED", DISPUTE: "DISPUTED" },
    DISPUTED: { RESOLVE: "CONFIRMED", REVERSE: "REVERSED", REFUND: "REFUNDED" },
  };
  const next = map[current]?.[transition];
  if (!next)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.CONFLICT,
      "Tranziție plată invalidă",
    );
  return next as Prisma.PaymentRecordUpdateInput["status"];
}

function derivedScheduleStatus(
  row: Prisma.PaymentScheduleEntryGetPayload<object>,
) {
  if (["PAID", "CANCELLED", "PARTIALLY_PAID"].includes(row.status))
    return row.status;
  return row.dueAt < new Date()
    ? "OVERDUE"
    : row.dueAt.getTime() - Date.now() < 24 * 60 * 60 * 1000
      ? "DUE"
      : "UPCOMING";
}

function categoryLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function assertCurrency(actual: string, expected: string): void {
  if (actual !== expected)
    problem(
      "CURRENCY_MISMATCH",
      HttpStatus.BAD_REQUEST,
      "Moneda nu corespunde workspace-ului",
      `Moneda operațională este ${expected}; valoarea primită este ${actual}.`,
    );
}

function moneySafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, child: unknown) =>
      typeof child === "bigint" ? Number(child) : child,
    ),
  ) as T;
}

function moneyNumber(value: bigint | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError("MONEY_OVERFLOW");
  return result;
}

function toNullableBigInt(value: unknown): bigint | null {
  return value === null || value === undefined ? null : BigInt(number(value));
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return moneySafe(value) as Prisma.InputJsonValue;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected string");
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined || value === ""
    ? null
    : text(value);
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new TypeError("Expected safe integer");
  return value;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value);
}

function date(value: unknown): Date {
  if (typeof value !== "string" && !(value instanceof Date))
    throw new TypeError("Expected date");
  const result = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(result.getTime())) throw new TypeError("Invalid date");
  return result;
}

function assertVersion(current: number, expected: number) {
  if (current !== expected)
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Versiune depășită",
      "Resursa a fost modificată. Reîncarcă datele curente.",
      undefined,
      { latestVersion: current },
    );
}

function notFound(title: string): never {
  problem("NOT_FOUND", HttpStatus.NOT_FOUND, title);
}

function lowerCamel(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

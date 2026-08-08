import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  bookingTransitionSchema,
  contractAcknowledgementSchema,
  contractTransitionSchema,
  createOfferSchema,
  createVendorAvailabilitySchema,
  createVendorOrganizationSchema,
  createVendorPackageSchema,
  createVendorServiceSchema,
  negotiationMessageSchema,
  updateContractDraftSchema,
  updateOfferDraftSchema,
  updateVendorAvailabilitySchema,
  updateVendorMemberSchema,
  updateVendorOrganizationSchema,
  updateVendorPackageSchema,
  updateVendorServiceSchema,
  upsertVendorProfileSchema,
  vendorInvitationSchema,
  vendorInvitationTokenSchema,
} from "@weddingos/contracts";
import { z } from "zod";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { problem } from "../common/problem";
import { parseUuid, parseWithSchema } from "../common/validation";
import { CommercialService } from "./commercial.service";
import { RequireVendorCapability } from "./vendor-capability.decorator";
import { VendorCapabilityGuard } from "./vendor-capability.guard";

const declineSchema = z.object({
  reason: z.string().trim().min(2).max(2000).optional(),
});

@ApiTags("vendor-organizations")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/vendor-organizations")
export class VendorController {
  constructor(
    @Inject(CommercialService) private readonly commercial: CommercialService,
  ) {}

  @Get()
  async organizations(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.vendorOrganizations(auth.userId),
    );
  }

  @Post()
  async createOrganization(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createVendorOrganization(
        auth.userId,
        idempotencyKey(key),
        parseWithSchema(createVendorOrganizationSchema, body),
        request.correlationId,
      ),
    );
  }
}

@ApiTags("vendor-invitations")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/vendor-invitations")
export class VendorInvitationController {
  constructor(
    @Inject(CommercialService) private readonly commercial: CommercialService,
  ) {}

  @Post("preview")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async preview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const { token } = parseWithSchema(vendorInvitationTokenSchema, body);
    return apiResponse(
      request,
      await this.commercial.vendorInvitationPreview(auth.userId, token),
    );
  }

  @Post("accept")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async accept(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const { token } = parseWithSchema(vendorInvitationTokenSchema, body);
    return apiResponse(
      request,
      await this.commercial.acceptVendorInvitation(
        auth.userId,
        token,
        request.correlationId,
      ),
    );
  }

  @Post("decline")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async decline(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const { token } = parseWithSchema(vendorInvitationTokenSchema, body);
    return apiResponse(
      request,
      await this.commercial.declineVendorInvitation(
        auth.userId,
        token,
        request.correlationId,
      ),
    );
  }
}

@ApiTags("vendor-os")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, VendorCapabilityGuard)
@RequireVendorCapability("vendor.organization.read")
@Controller("api/v1/vendor-organizations/:organizationId")
export class VendorScopedController {
  constructor(
    @Inject(CommercialService) private readonly commercial: CommercialService,
  ) {}

  @Get()
  async organization(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.vendorOrganization(
      auth.userId,
      uuid(organizationId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch()
  @RequireVendorCapability("vendor.organization.write")
  async updateOrganization(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.updateVendorOrganization(
      auth.userId,
      uuid(organizationId),
      version(match),
      parseWithSchema(updateVendorOrganizationSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete()
  @RequireVendorCapability("vendor.organization.write")
  async archiveOrganization(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.archiveVendorOrganization(
        auth.userId,
        uuid(organizationId),
        version(match),
      ),
    );
  }

  @Get("members")
  @RequireVendorCapability("vendor.members.read")
  async members(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.vendorMembers(auth.userId, uuid(organizationId)),
    );
  }

  @Post("invitations")
  @RequireVendorCapability("vendor.members.write")
  async invite(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.inviteVendorMember(
        auth.userId,
        uuid(organizationId),
        idempotencyKey(key),
        parseWithSchema(vendorInvitationSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("invitations/:invitationId/resend")
  @RequireVendorCapability("vendor.members.write")
  async resendInvitation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("invitationId") invitationId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.resendVendorInvitation(
        auth.userId,
        uuid(organizationId),
        uuid(invitationId),
        version(match),
        request.correlationId,
      ),
    );
  }

  @Delete("invitations/:invitationId")
  @RequireVendorCapability("vendor.members.write")
  async revokeInvitation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("invitationId") invitationId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.revokeVendorInvitation(
        auth.userId,
        uuid(organizationId),
        uuid(invitationId),
        version(match),
        request.correlationId,
      ),
    );
  }

  @Patch("members/:memberId")
  @RequireVendorCapability("vendor.members.write")
  async updateMember(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("memberId") memberId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.updateVendorMember(
      auth.userId,
      uuid(organizationId),
      uuid(memberId),
      version(match),
      parseWithSchema(updateVendorMemberSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("members/:memberId")
  @RequireVendorCapability("vendor.members.write")
  async removeMember(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("memberId") memberId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.removeVendorMember(
        auth.userId,
        uuid(organizationId),
        uuid(memberId),
        version(match),
      ),
    );
  }

  @Get("profile")
  @RequireVendorCapability("vendor.profile.read")
  async profile(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.vendorProfile(
      auth.userId,
      uuid(organizationId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Put("profile")
  @RequireVendorCapability("vendor.profile.write")
  async upsertProfile(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.upsertVendorProfile(
      auth.userId,
      uuid(organizationId),
      optionalVersion(match),
      parseWithSchema(upsertVendorProfileSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("profile/publish")
  @RequireVendorCapability("vendor.profile.publish")
  async publishProfile(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.publishVendorProfile(
      auth.userId,
      uuid(organizationId),
      version(match),
      true,
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("profile/unpublish")
  @RequireVendorCapability("vendor.profile.publish")
  async unpublishProfile(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.publishVendorProfile(
      auth.userId,
      uuid(organizationId),
      version(match),
      false,
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("services")
  @RequireVendorCapability("vendor.services.read")
  async services(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.vendorServices(auth.userId, uuid(organizationId)),
    );
  }

  @Post("services")
  @RequireVendorCapability("vendor.services.write")
  async createService(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createVendorService(
        auth.userId,
        uuid(organizationId),
        idempotencyKey(key),
        parseWithSchema(createVendorServiceSchema, body),
        request.correlationId,
      ),
    );
  }

  @Patch("services/:serviceId")
  @RequireVendorCapability("vendor.services.write")
  async updateService(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("serviceId") serviceId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.updateVendorService(
      auth.userId,
      uuid(organizationId),
      uuid(serviceId),
      version(match),
      parseWithSchema(updateVendorServiceSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("services/:serviceId")
  @RequireVendorCapability("vendor.services.write")
  async deleteService(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("serviceId") serviceId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deleteVendorService(
        auth.userId,
        uuid(organizationId),
        uuid(serviceId),
        version(match),
      ),
    );
  }

  @Post("services/:serviceId/packages")
  @RequireVendorCapability("vendor.services.write")
  async createPackage(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("serviceId") serviceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createVendorPackage(
        auth.userId,
        uuid(organizationId),
        uuid(serviceId),
        idempotencyKey(key),
        parseWithSchema(createVendorPackageSchema, body),
      ),
    );
  }

  @Patch("packages/:packageId")
  @RequireVendorCapability("vendor.services.write")
  async updatePackage(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("packageId") packageId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.updateVendorPackage(
      auth.userId,
      uuid(organizationId),
      uuid(packageId),
      version(match),
      parseWithSchema(updateVendorPackageSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("packages/:packageId")
  @RequireVendorCapability("vendor.services.write")
  async deletePackage(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("packageId") packageId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deleteVendorPackage(
        auth.userId,
        uuid(organizationId),
        uuid(packageId),
        version(match),
      ),
    );
  }

  @Get("availability")
  @RequireVendorCapability("vendor.availability.read")
  async availability(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.vendorAvailability(
        auth.userId,
        uuid(organizationId),
      ),
    );
  }

  @Post("availability")
  @RequireVendorCapability("vendor.availability.write")
  async createAvailability(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createAvailability(
        auth.userId,
        uuid(organizationId),
        idempotencyKey(key),
        parseWithSchema(createVendorAvailabilitySchema, body),
      ),
    );
  }

  @Patch("availability/:blockId")
  @RequireVendorCapability("vendor.availability.write")
  async updateAvailability(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("blockId") blockId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.updateAvailability(
      auth.userId,
      uuid(organizationId),
      uuid(blockId),
      version(match),
      parseWithSchema(updateVendorAvailabilitySchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("availability/:blockId")
  @RequireVendorCapability("vendor.availability.write")
  async deleteAvailability(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("blockId") blockId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deleteAvailability(
        auth.userId,
        uuid(organizationId),
        uuid(blockId),
        version(match),
      ),
    );
  }

  @Get("rfqs")
  @RequireVendorCapability("vendor.rfq.read")
  async rfqs(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.vendorRfqs(auth.userId, uuid(organizationId)),
    );
  }

  @Get("rfqs/:rfqId")
  @RequireVendorCapability("vendor.rfq.read")
  async rfq(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("rfqId") rfqId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.vendorRfq(
        auth.userId,
        uuid(organizationId),
        uuid(rfqId),
      ),
    );
  }

  @Post("rfqs/:rfqId/open")
  @RequireVendorCapability("vendor.rfq.read")
  async openRfq(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("rfqId") rfqId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.vendorRfqAction(
        auth.userId,
        uuid(organizationId),
        uuid(rfqId),
        "open",
        request.correlationId,
      ),
    );
  }

  @Post("rfqs/:rfqId/decline")
  @RequireVendorCapability("vendor.rfq.decline")
  async declineRfq(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("rfqId") rfqId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    parseWithSchema(declineSchema, body);
    return apiResponse(
      request,
      await this.commercial.vendorRfqAction(
        auth.userId,
        uuid(organizationId),
        uuid(rfqId),
        "decline",
        request.correlationId,
      ),
    );
  }

  @Post("rfqs/:rfqId/offers")
  @RequireVendorCapability("vendor.offer.write")
  async createOffer(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("rfqId") rfqId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createOffer(
        auth.userId,
        uuid(organizationId),
        uuid(rfqId),
        idempotencyKey(key),
        parseWithSchema(createOfferSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("offers/:offerId")
  @RequireVendorCapability("vendor.offer.read")
  async offer(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("offerId") offerId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.vendorOffer(
      auth.userId,
      uuid(organizationId),
      uuid(offerId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("offers/:offerId/draft")
  @RequireVendorCapability("vendor.offer.write")
  async updateOffer(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("offerId") offerId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.updateOfferDraft(
      auth.userId,
      uuid(organizationId),
      uuid(offerId),
      version(match),
      parseWithSchema(updateOfferDraftSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("offers/:offerId/submit")
  @RequireVendorCapability("vendor.offer.submit")
  async submitOffer(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("offerId") offerId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.submitOffer(
      auth.userId,
      uuid(organizationId),
      uuid(offerId),
      version(match),
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("offers/:offerId/withdraw")
  @RequireVendorCapability("vendor.offer.write")
  async withdrawOffer(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("offerId") offerId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.withdrawOffer(
      auth.userId,
      uuid(organizationId),
      uuid(offerId),
      version(match),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("offers/:offerId/negotiation/messages")
  @RequireVendorCapability("vendor.offer.read")
  async messages(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("offerId") offerId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.negotiationMessages(
        auth.userId,
        { organizationId: uuid(organizationId) },
        uuid(offerId),
      ),
    );
  }

  @Post("offers/:offerId/negotiation/messages")
  @RequireVendorCapability("vendor.offer.write")
  async addMessage(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.addNegotiationMessage(
        auth.userId,
        { organizationId: uuid(organizationId) },
        uuid(offerId),
        parseWithSchema(negotiationMessageSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("bookings")
  @RequireVendorCapability("vendor.booking.read")
  async bookings(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.bookings(auth.userId, {
        organizationId: uuid(organizationId),
      }),
    );
  }

  @Get("bookings/:bookingId")
  @RequireVendorCapability("vendor.booking.read")
  async booking(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("bookingId") bookingId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.booking(
        auth.userId,
        { organizationId: uuid(organizationId) },
        uuid(bookingId),
      ),
    );
  }

  @Post("bookings/:bookingId/transitions")
  @RequireVendorCapability("vendor.booking.transition")
  async transitionBooking(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("bookingId") bookingId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(bookingTransitionSchema, body);
    return apiResponse(
      request,
      await this.commercial.transitionBooking(
        auth.userId,
        { organizationId: uuid(organizationId) },
        uuid(bookingId),
        version(match),
        input.transition,
        input.reason ?? null,
        request.correlationId,
      ),
    );
  }

  @Get("contracts")
  @RequireVendorCapability("vendor.contract.read")
  async contracts(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.contracts(auth.userId, {
        organizationId: uuid(organizationId),
      }),
    );
  }

  @Get("contracts/:contractId")
  @RequireVendorCapability("vendor.contract.read")
  async contract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("contractId") contractId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.contract(
        auth.userId,
        { organizationId: uuid(organizationId) },
        uuid(contractId),
      ),
    );
  }

  @Put("contracts/:contractId/draft")
  @RequireVendorCapability("vendor.contract.write")
  async updateContract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("contractId") contractId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.updateContractDraft(
        auth.userId,
        { organizationId: uuid(organizationId) },
        uuid(contractId),
        version(match),
        parseWithSchema(updateContractDraftSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("contracts/:contractId/transitions")
  @RequireVendorCapability("vendor.contract.write")
  async transitionContract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("contractId") contractId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(contractTransitionSchema, body);
    return apiResponse(
      request,
      await this.commercial.transitionContract(
        auth.userId,
        { organizationId: uuid(organizationId) },
        uuid(contractId),
        version(match),
        input.transition,
        input.reason ?? null,
        request.correlationId,
      ),
    );
  }

  @Post("contracts/:contractId/acknowledgements")
  @RequireVendorCapability("vendor.contract.acknowledge")
  async acknowledgeContract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("contractId") contractId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.acknowledgeContract(
        auth.userId,
        { organizationId: uuid(organizationId) },
        uuid(contractId),
        version(match),
        idempotencyKey(key),
        parseWithSchema(contractAcknowledgementSchema, body),
        request.correlationId,
      ),
    );
  }
}

function uuid(value: string) {
  return parseUuid(value, "id");
}
function idempotencyKey(value: string | undefined) {
  if (!value || value.length > 200)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key required",
    );
  return value;
}
function optionalVersion(value: string | undefined) {
  return value ? version(value) : null;
}
function version(value: string | undefined) {
  if (!value)
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match required",
    );
  const parsed = Number(value.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(parsed) || parsed < 1)
    problem("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "If-Match invalid");
  return parsed;
}
function versionOf(value: unknown) {
  return value &&
    typeof value === "object" &&
    "version" in value &&
    typeof (value as { version?: unknown }).version === "number"
    ? (value as { version: number }).version
    : undefined;
}

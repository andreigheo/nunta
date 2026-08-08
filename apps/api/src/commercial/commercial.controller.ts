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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  bookingTransitionSchema,
  commercialExportSchema,
  contractAcknowledgementSchema,
  contractExportSchema,
  contractTransitionSchema,
  createBudgetCategorySchema,
  createBudgetItemSchema,
  createExpenseSchema,
  createPaymentScheduleSchema,
  createPaymentSchema,
  createRfqSchema,
  createShortlistSchema,
  negotiationMessageSchema,
  offerReviewTransitionSchema,
  paymentTransitionSchema,
  replaceRfqRecipientsSchema,
  rfqTransitionSchema,
  updateBookingSchema,
  updateBudgetCategorySchema,
  updateBudgetItemSchema,
  updateBudgetPlanSchema,
  updateContractDraftSchema,
  updateExpenseSchema,
  updatePaymentScheduleSchema,
  updatePaymentSchema,
  updateRfqSchema,
  updateShortlistSchema,
} from "@weddingos/contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { problem } from "../common/problem";
import { parseUuid, parseWithSchema } from "../common/validation";
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { CommercialService } from "./commercial.service";

@ApiTags("commercial")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("marketplace.read")
@Controller("api/v1/workspaces/:workspaceId")
export class CommercialController {
  constructor(
    @Inject(CommercialService) private readonly commercial: CommercialService,
  ) {}

  @Get("vendor-favorites")
  async favorites(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.favorites(auth.userId, uuid(workspaceId)),
    );
  }

  @Put("vendor-favorites/:vendorOrganizationId")
  @RequireCapability("marketplace.favorite")
  async favorite(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("vendorOrganizationId") vendorId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.setFavorite(
        auth.userId,
        uuid(workspaceId),
        uuid(vendorId),
        true,
      ),
    );
  }

  @Delete("vendor-favorites/:vendorOrganizationId")
  @RequireCapability("marketplace.favorite")
  async unfavorite(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("vendorOrganizationId") vendorId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.setFavorite(
        auth.userId,
        uuid(workspaceId),
        uuid(vendorId),
        false,
      ),
    );
  }

  @Get("vendor-shortlists")
  async shortlists(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.shortlists(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("vendor-shortlists")
  @RequireCapability("marketplace.shortlist")
  async createShortlist(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createShortlist(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(createShortlistSchema, body),
      ),
    );
  }

  @Patch("vendor-shortlists/:shortlistId")
  @RequireCapability("marketplace.shortlist")
  async updateShortlist(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("shortlistId") shortlistId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.updateShortlist(
      auth.userId,
      uuid(workspaceId),
      uuid(shortlistId),
      version(match),
      parseWithSchema(updateShortlistSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("vendor-shortlists/:shortlistId")
  @RequireCapability("marketplace.shortlist")
  async deleteShortlist(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("shortlistId") shortlistId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deleteShortlist(
        auth.userId,
        uuid(workspaceId),
        uuid(shortlistId),
        version(match),
      ),
    );
  }

  @Put("vendor-shortlists/:shortlistId/vendors/:vendorOrganizationId")
  @RequireCapability("marketplace.shortlist")
  async addShortlistVendor(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("shortlistId") shortlistId: string,
    @Param("vendorOrganizationId") vendorId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.setShortlistVendor(
        auth.userId,
        uuid(workspaceId),
        uuid(shortlistId),
        uuid(vendorId),
        true,
      ),
    );
  }

  @Delete("vendor-shortlists/:shortlistId/vendors/:vendorOrganizationId")
  @RequireCapability("marketplace.shortlist")
  async removeShortlistVendor(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("shortlistId") shortlistId: string,
    @Param("vendorOrganizationId") vendorId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.setShortlistVendor(
        auth.userId,
        uuid(workspaceId),
        uuid(shortlistId),
        uuid(vendorId),
        false,
      ),
    );
  }

  @Get("rfqs")
  @RequireCapability("rfq.read")
  async rfqs(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.commercial.rfqs(
      auth.userId,
      uuid(workspaceId),
      query,
    );
    return apiResponse(request, result, {
      nextCursor: result.nextCursor ?? undefined,
    });
  }

  @Post("rfqs")
  @RequireCapability("rfq.write")
  async createRfq(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.createRfq(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createRfqSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("rfqs/:rfqId")
  @RequireCapability("rfq.read")
  async rfq(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("rfqId") rfqId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.rfq(
      auth.userId,
      uuid(workspaceId),
      uuid(rfqId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("rfqs/:rfqId")
  @RequireCapability("rfq.write")
  async updateRfq(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("rfqId") rfqId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.updateRfq(
      auth.userId,
      uuid(workspaceId),
      uuid(rfqId),
      version(match),
      parseWithSchema(updateRfqSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("rfqs/:rfqId")
  @RequireCapability("rfq.write")
  async deleteRfq(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("rfqId") rfqId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deleteRfq(
        auth.userId,
        uuid(workspaceId),
        uuid(rfqId),
        version(match),
      ),
    );
  }

  @Get("rfqs/:rfqId/recipients")
  @RequireCapability("rfq.read")
  async recipients(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("rfqId") rfqId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.rfqRecipients(
        auth.userId,
        uuid(workspaceId),
        uuid(rfqId),
      ),
    );
  }

  @Put("rfqs/:rfqId/recipients")
  @RequireCapability("rfq.write")
  async replaceRecipients(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("rfqId") rfqId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.replaceRfqRecipients(
        auth.userId,
        uuid(workspaceId),
        uuid(rfqId),
        version(match),
        parseWithSchema(replaceRfqRecipientsSchema, body),
      ),
    );
  }

  @Get("rfqs/:rfqId/recipient-preview")
  @RequireCapability("rfq.read")
  async recipientPreview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("rfqId") rfqId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.recipientPreview(
        auth.userId,
        uuid(workspaceId),
        uuid(rfqId),
      ),
    );
  }

  @Post("rfqs/:rfqId/transitions")
  @RequireCapability("rfq.send")
  async transitionRfq(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("rfqId") rfqId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(rfqTransitionSchema, body);
    return apiResponse(
      request,
      await this.commercial.transitionRfq(
        auth.userId,
        uuid(workspaceId),
        uuid(rfqId),
        version(match),
        key ?? null,
        input.transition,
        input.reason ?? null,
        request.correlationId,
      ),
    );
  }

  @Get("offers")
  @RequireCapability("offer.read")
  async offers(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.offers(auth.userId, uuid(workspaceId), query),
    );
  }

  @Get("offers/:offerId")
  @RequireCapability("offer.read")
  async offer(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("offerId") offerId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.offer(
      auth.userId,
      uuid(workspaceId),
      uuid(offerId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("rfqs/:rfqId/offer-comparison")
  @RequireCapability("offer.read")
  async comparison(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("rfqId") rfqId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.offerComparison(
        auth.userId,
        uuid(workspaceId),
        uuid(rfqId),
      ),
    );
  }

  @Post("offers/:offerId/transitions")
  @RequireCapability("offer.review")
  async transitionOffer(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("offerId") offerId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(offerReviewTransitionSchema, body);
    return apiResponse(
      request,
      await this.commercial.transitionOffer(
        auth.userId,
        uuid(workspaceId),
        uuid(offerId),
        version(match),
        key ?? null,
        input.transition,
        input.reason ?? null,
        request.correlationId,
      ),
    );
  }

  @Get("offers/:offerId/negotiation/messages")
  @RequireCapability("offer.read")
  async messages(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("offerId") offerId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.negotiationMessages(
        auth.userId,
        { workspaceId: uuid(workspaceId) },
        uuid(offerId),
      ),
    );
  }

  @Post("offers/:offerId/negotiation/messages")
  @RequireCapability("offer.request_revision")
  async addMessage(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.addNegotiationMessage(
        auth.userId,
        { workspaceId: uuid(workspaceId) },
        uuid(offerId),
        parseWithSchema(negotiationMessageSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("bookings")
  @RequireCapability("booking.read")
  async bookings(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.bookings(auth.userId, {
        workspaceId: uuid(workspaceId),
      }),
    );
  }

  @Get("bookings/:bookingId")
  @RequireCapability("booking.read")
  async booking(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("bookingId") bookingId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.booking(
        auth.userId,
        { workspaceId: uuid(workspaceId) },
        uuid(bookingId),
      ),
    );
  }

  @Patch("bookings/:bookingId")
  @RequireCapability("booking.write")
  async updateBooking(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("bookingId") bookingId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.updateBooking(
        auth.userId,
        uuid(workspaceId),
        uuid(bookingId),
        version(match),
        parseWithSchema(updateBookingSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("bookings/:bookingId/transitions")
  @RequireCapability("booking.transition")
  async transitionBooking(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
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
        { workspaceId: uuid(workspaceId) },
        uuid(bookingId),
        version(match),
        input.transition,
        input.reason ?? null,
        request.correlationId,
      ),
    );
  }

  @Get("contracts")
  @RequireCapability("contract.read")
  async contracts(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.contracts(auth.userId, {
        workspaceId: uuid(workspaceId),
      }),
    );
  }

  @Get("contracts/:contractId")
  @RequireCapability("contract.read")
  async contract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contractId") contractId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.contract(
        auth.userId,
        { workspaceId: uuid(workspaceId) },
        uuid(contractId),
      ),
    );
  }

  @Put("contracts/:contractId/draft")
  @RequireCapability("contract.write")
  async updateContract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contractId") contractId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.updateContractDraft(
        auth.userId,
        { workspaceId: uuid(workspaceId) },
        uuid(contractId),
        version(match),
        parseWithSchema(updateContractDraftSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("contracts/:contractId/transitions")
  @RequireCapability("contract.review")
  async transitionContract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
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
        { workspaceId: uuid(workspaceId) },
        uuid(contractId),
        version(match),
        input.transition,
        input.reason ?? null,
        request.correlationId,
      ),
    );
  }

  @Post("contracts/:contractId/acknowledgements")
  @RequireCapability("contract.acknowledge")
  async acknowledgeContract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
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
        { workspaceId: uuid(workspaceId) },
        uuid(contractId),
        version(match),
        idempotencyKey(key),
        parseWithSchema(contractAcknowledgementSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("contracts/:contractId/exports")
  @RequireCapability("contract.export")
  async exportContract(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contractId") contractId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.exportContract(
        auth.userId,
        uuid(workspaceId),
        uuid(contractId),
        idempotencyKey(key),
        parseWithSchema(contractExportSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("budget")
  @RequireCapability("budget.read")
  async budget(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.budget(auth.userId, uuid(workspaceId)),
    );
  }

  @Put("budget")
  @RequireCapability("budget.write")
  async upsertBudget(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.commercial.upsertBudget(
      auth.userId,
      uuid(workspaceId),
      optionalVersion(match),
      idempotencyKey(key),
      parseWithSchema(updateBudgetPlanSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("budget/categories")
  @RequireCapability("budget.write")
  async createCategory(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createBudgetCategory(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(createBudgetCategorySchema, body),
        request.correlationId,
      ),
    );
  }

  @Patch("budget/categories/:categoryId")
  @RequireCapability("budget.write")
  async updateCategory(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("categoryId") categoryId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.updateBudgetCategory(
        auth.userId,
        uuid(workspaceId),
        uuid(categoryId),
        version(match),
        parseWithSchema(updateBudgetCategorySchema, body),
        request.correlationId,
      ),
    );
  }

  @Delete("budget/categories/:categoryId")
  @RequireCapability("budget.write")
  async deleteCategory(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("categoryId") categoryId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deleteBudgetCategory(
        auth.userId,
        uuid(workspaceId),
        uuid(categoryId),
        version(match),
      ),
    );
  }

  @Get("budget/items")
  @RequireCapability("budget.read")
  async budgetItems(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.budgetItems(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("budget/items")
  @RequireCapability("budget.write")
  async createBudgetItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createBudgetItem(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(createBudgetItemSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("budget/items/:itemId")
  @RequireCapability("budget.read")
  async budgetItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.budgetItem(
        auth.userId,
        uuid(workspaceId),
        uuid(itemId),
      ),
    );
  }

  @Patch("budget/items/:itemId")
  @RequireCapability("budget.write")
  async updateBudgetItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.updateBudgetItem(
        auth.userId,
        uuid(workspaceId),
        uuid(itemId),
        version(match),
        parseWithSchema(updateBudgetItemSchema, body),
        request.correlationId,
      ),
    );
  }

  @Delete("budget/items/:itemId")
  @RequireCapability("budget.write")
  async deleteBudgetItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deleteBudgetItem(
        auth.userId,
        uuid(workspaceId),
        uuid(itemId),
        version(match),
      ),
    );
  }

  @Get("budget/summary")
  @RequireCapability("budget.read")
  async budgetSummary(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.budgetSummary(auth.userId, uuid(workspaceId)),
    );
  }

  @Get("expenses")
  @RequireCapability("expense.read")
  async expenses(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.expenses(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("expenses")
  @RequireCapability("expense.write")
  async createExpense(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createExpense(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(createExpenseSchema, body),
        request.correlationId,
      ),
    );
  }

  @Patch("expenses/:expenseId")
  @RequireCapability("expense.write")
  async updateExpense(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.updateExpense(
        auth.userId,
        uuid(workspaceId),
        uuid(expenseId),
        version(match),
        parseWithSchema(updateExpenseSchema, body),
        request.correlationId,
      ),
    );
  }

  @Delete("expenses/:expenseId")
  @RequireCapability("expense.write")
  async deleteExpense(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deleteExpense(
        auth.userId,
        uuid(workspaceId),
        uuid(expenseId),
        version(match),
      ),
    );
  }

  @Get("payment-schedules")
  @RequireCapability("payment.read")
  async schedules(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.paymentSchedules(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("payment-schedules")
  @RequireCapability("payment.write")
  async createSchedule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createPaymentSchedule(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(createPaymentScheduleSchema, body),
        request.correlationId,
      ),
    );
  }

  @Patch("payment-schedules/:scheduleId")
  @RequireCapability("payment.write")
  async updateSchedule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("scheduleId") scheduleId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.updatePaymentSchedule(
        auth.userId,
        uuid(workspaceId),
        uuid(scheduleId),
        version(match),
        parseWithSchema(updatePaymentScheduleSchema, body),
        request.correlationId,
      ),
    );
  }

  @Delete("payment-schedules/:scheduleId")
  @RequireCapability("payment.write")
  async deleteSchedule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("scheduleId") scheduleId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.deletePaymentSchedule(
        auth.userId,
        uuid(workspaceId),
        uuid(scheduleId),
        version(match),
      ),
    );
  }

  @Get("payments")
  @RequireCapability("payment.read")
  async payments(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.payments(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("payments")
  @RequireCapability("payment.write")
  async createPayment(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.createPayment(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(createPaymentSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("payments/:paymentId")
  @RequireCapability("payment.read")
  async payment(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("paymentId") paymentId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.payment(
        auth.userId,
        uuid(workspaceId),
        uuid(paymentId),
      ),
    );
  }

  @Patch("payments/:paymentId")
  @RequireCapability("payment.write")
  async updatePayment(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("paymentId") paymentId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.updatePayment(
        auth.userId,
        uuid(workspaceId),
        uuid(paymentId),
        version(match),
        parseWithSchema(updatePaymentSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("payments/:paymentId/transitions")
  @RequireCapability("payment.confirm")
  async transitionPayment(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("paymentId") paymentId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(paymentTransitionSchema, body);
    return apiResponse(
      request,
      await this.commercial.transitionPayment(
        auth.userId,
        uuid(workspaceId),
        uuid(paymentId),
        version(match),
        input.transition,
        input.reason,
        input.amountMinor ?? null,
        request.correlationId,
      ),
    );
  }

  @Post("commercial-exports")
  @RequireCapability("budget.export")
  async exportCommercial(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.commercialExport(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(commercialExportSchema, body),
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

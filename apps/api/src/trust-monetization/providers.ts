import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import { API_ENVIRONMENT } from "../common/environment.module";
import { SafeOutboundHttpClient } from "../common/safe-outbound-http.client";
import { problem } from "../common/problem";

export type VerifiedCommercialEvent = {
  id: string;
  type: string;
  occurredAt: Date;
  data: Record<string, unknown>;
  payloadHash: string;
};

export interface SubscriptionBillingProvider {
  createCustomer(input: {
    organizationId: string;
    email: string;
  }): Promise<{ providerCustomerId: string }>;
  createCheckout(input: {
    checkoutId: string;
    customerId: string;
    priceId: string;
    expiresAt: Date;
  }): Promise<{ providerCheckoutId: string; url: string }>;
  createPortalSession(input: {
    customerId: string;
    returnPath: string;
    idempotencyKey: string;
  }): Promise<{ url: string; expiresAt: string }>;
  getSubscription(
    providerSubscriptionId: string,
  ): Promise<{ status: string; periodEnd?: string }>;
  cancelSubscription(input: {
    providerSubscriptionId: string;
    atPeriodEnd: boolean;
  }): Promise<void>;
  resumeSubscription(providerSubscriptionId: string): Promise<void>;
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): VerifiedCommercialEvent;
}

export interface PayoutAccountProvider {
  createAccount(input: {
    organizationId: string;
    country: string;
    currency: string;
  }): Promise<{ providerAccountId: string }>;
  createOnboardingLink(input: {
    accountId: string;
    sessionId: string;
  }): Promise<{ providerLinkId: string; url: string; expiresAt: string }>;
  getAccount(providerAccountId: string): Promise<{
    status: "PENDING" | "ACTIVE" | "RESTRICTED" | "DISABLED";
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string[];
  }>;
  createPayout(input: {
    payoutId: string;
    accountId: string;
    amountMinor: number;
    currency: string;
  }): Promise<{
    providerPayoutId: string;
    status: "PROCESSING" | "PAID" | "FAILED";
  }>;
  getPayout(
    providerPayoutId: string,
  ): Promise<{ status: "PROCESSING" | "PAID" | "FAILED" | "RETURNED" }>;
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): VerifiedCommercialEvent;
}

abstract class SignedProvider {
  constructor(
    protected readonly environment: ApiEnvironment,
    private readonly secret: string,
    private readonly invalidCode:
      "SUBSCRIPTION_EVENT_INVALID" | "PAYOUT_EVENT_INVALID",
  ) {}

  protected verify(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): VerifiedCommercialEvent {
    const seconds = Number(timestamp);
    if (
      !Number.isInteger(seconds) ||
      Math.abs(Date.now() - seconds * 1000) >
        this.environment.PROVIDER_WEBHOOK_TOLERANCE_SECONDS * 1000
    )
      problem(
        this.invalidCode,
        HttpStatus.UNAUTHORIZED,
        "Provider webhook timestamp is invalid",
      );
    const expected = createHmac("sha256", this.secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest("hex");
    const received = signature?.replace(/^sha256=/, "") ?? "";
    if (
      received.length !== expected.length ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    )
      problem(
        this.invalidCode,
        HttpStatus.UNAUTHORIZED,
        "Provider webhook signature is invalid",
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      problem(
        this.invalidCode,
        HttpStatus.BAD_REQUEST,
        "Provider webhook JSON is invalid",
      );
    }
    const value = parsed as {
      id?: unknown;
      type?: unknown;
      occurredAt?: unknown;
      data?: unknown;
    };
    if (
      typeof value.id !== "string" ||
      typeof value.type !== "string" ||
      typeof value.occurredAt !== "string" ||
      !value.data ||
      typeof value.data !== "object" ||
      Array.isArray(value.data)
    )
      problem(
        this.invalidCode,
        HttpStatus.BAD_REQUEST,
        "Provider webhook contract is invalid",
      );
    const occurredAt = new Date(value.occurredAt);
    if (Number.isNaN(occurredAt.getTime()))
      problem(
        this.invalidCode,
        HttpStatus.BAD_REQUEST,
        "Provider event time is invalid",
      );
    return {
      id: value.id,
      type: value.type,
      occurredAt,
      data: value.data as Record<string, unknown>,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    };
  }
}

@Injectable()
export class FakeSubscriptionBillingProvider
  extends SignedProvider
  implements SubscriptionBillingProvider
{
  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super(
      environment,
      environment.SUBSCRIPTION_PROVIDER_SECRET,
      "SUBSCRIPTION_EVENT_INVALID",
    );
  }
  async createCustomer(input: { organizationId: string }) {
    return { providerCustomerId: `fake-customer-${input.organizationId}` };
  }
  async createCheckout(input: { checkoutId: string }) {
    return {
      providerCheckoutId: `fake-sub-checkout-${input.checkoutId}`,
      url: `/vendor/billing?checkout=${input.checkoutId}`,
    };
  }
  async createPortalSession(input: {
    customerId: string;
    idempotencyKey: string;
  }) {
    return {
      url: `/vendor/billing?portal=${encodeURIComponent(input.customerId)}&request=${encodeURIComponent(input.idempotencyKey)}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }
  async getSubscription() {
    return {
      status: "ACTIVE",
      periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
  }
  async cancelSubscription() {}
  async resumeSubscription() {}
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    return this.verify(rawBody, signature, timestamp);
  }
}

@Injectable()
export class FakePayoutAccountProvider
  extends SignedProvider
  implements PayoutAccountProvider
{
  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super(
      environment,
      environment.PAYOUT_PROVIDER_SECRET,
      "PAYOUT_EVENT_INVALID",
    );
  }
  async createAccount(input: { organizationId: string }) {
    return { providerAccountId: `fake-account-${input.organizationId}` };
  }
  async createOnboardingLink(input: { sessionId: string }) {
    return {
      providerLinkId: `fake-onboarding-${input.sessionId}`,
      url: `/vendor/payouts?onboarding=${input.sessionId}`,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
  }
  async getAccount() {
    return {
      status: "ACTIVE" as const,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: [],
    };
  }
  async createPayout(input: { payoutId: string }) {
    return {
      providerPayoutId: `fake-payout-${input.payoutId}`,
      status: "PAID" as const,
    };
  }
  async getPayout() {
    return { status: "PAID" as const };
  }
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    return this.verify(rawBody, signature, timestamp);
  }
}

async function providerRequest(
  url: string,
  secret: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await new SafeOutboundHttpClient({
      allowedHostnames: [new URL(url).hostname],
      maxResponseBytes: 2_000_000,
    }).fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Configured provider returned ${response.status}`);
    const value = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Configured provider response is invalid");
    return value as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

@Injectable()
export class ConfiguredSubscriptionBillingProvider
  extends SignedProvider
  implements SubscriptionBillingProvider
{
  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super(
      environment,
      environment.SUBSCRIPTION_PROVIDER_SECRET,
      "SUBSCRIPTION_EVENT_INVALID",
    );
  }
  private async request(path: string, body: Record<string, unknown>) {
    if (!this.environment.SUBSCRIPTION_PROVIDER_URL)
      problem(
        "FEATURE_DISABLED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Subscription provider is not configured",
      );
    return providerRequest(
      `${this.environment.SUBSCRIPTION_PROVIDER_URL}${path}`,
      this.environment.SUBSCRIPTION_PROVIDER_SECRET,
      body,
    );
  }
  async createCustomer(input: { organizationId: string; email: string }) {
    const value = await this.request("/customers", input);
    return { providerCustomerId: required(value, "providerCustomerId") };
  }
  async createCheckout(input: {
    checkoutId: string;
    customerId: string;
    priceId: string;
    expiresAt: Date;
  }) {
    const value = await this.request("/checkouts", {
      ...input,
      expiresAt: input.expiresAt.toISOString(),
    });
    return {
      providerCheckoutId: required(value, "providerCheckoutId"),
      url: required(value, "url"),
    };
  }
  async createPortalSession(input: { customerId: string; returnPath: string }) {
    const value = await this.request("/portal-sessions", input);
    return {
      url: required(value, "url"),
      expiresAt: required(value, "expiresAt"),
    };
  }
  async getSubscription(providerSubscriptionId: string) {
    const value = await this.request("/subscriptions/get", {
      providerSubscriptionId,
    });
    return {
      status: required(value, "status"),
      periodEnd:
        typeof value.periodEnd === "string" ? value.periodEnd : undefined,
    };
  }
  async cancelSubscription(input: {
    providerSubscriptionId: string;
    atPeriodEnd: boolean;
  }) {
    await this.request("/subscriptions/cancel", input);
  }
  async resumeSubscription(providerSubscriptionId: string) {
    await this.request("/subscriptions/resume", { providerSubscriptionId });
  }
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    return this.verify(rawBody, signature, timestamp);
  }
}

@Injectable()
export class ConfiguredPayoutAccountProvider
  extends SignedProvider
  implements PayoutAccountProvider
{
  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super(
      environment,
      environment.PAYOUT_PROVIDER_SECRET,
      "PAYOUT_EVENT_INVALID",
    );
  }
  private async request(path: string, body: Record<string, unknown>) {
    if (!this.environment.PAYOUT_PROVIDER_URL)
      problem(
        "FEATURE_DISABLED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Payout provider is not configured",
      );
    return providerRequest(
      `${this.environment.PAYOUT_PROVIDER_URL}${path}`,
      this.environment.PAYOUT_PROVIDER_SECRET,
      body,
    );
  }
  async createAccount(input: {
    organizationId: string;
    country: string;
    currency: string;
  }) {
    const value = await this.request("/accounts", input);
    return { providerAccountId: required(value, "providerAccountId") };
  }
  async createOnboardingLink(input: { accountId: string; sessionId: string }) {
    const value = await this.request("/onboarding-links", input);
    return {
      providerLinkId: required(value, "providerLinkId"),
      url: required(value, "url"),
      expiresAt: required(value, "expiresAt"),
    };
  }
  async getAccount(providerAccountId: string) {
    const value = await this.request("/accounts/get", { providerAccountId });
    return {
      status: required(value, "status") as
        "PENDING" | "ACTIVE" | "RESTRICTED" | "DISABLED",
      chargesEnabled: Boolean(value.chargesEnabled),
      payoutsEnabled: Boolean(value.payoutsEnabled),
      detailsSubmitted: Boolean(value.detailsSubmitted),
      requirementsDue: Array.isArray(value.requirementsDue)
        ? value.requirementsDue.map(String)
        : [],
    };
  }
  async createPayout(input: {
    payoutId: string;
    accountId: string;
    amountMinor: number;
    currency: string;
  }) {
    const value = await this.request("/payouts", input);
    return {
      providerPayoutId: required(value, "providerPayoutId"),
      status: required(value, "status") as "PROCESSING" | "PAID" | "FAILED",
    };
  }
  async getPayout(providerPayoutId: string) {
    const value = await this.request("/payouts/get", { providerPayoutId });
    return {
      status: required(value, "status") as
        "PROCESSING" | "PAID" | "FAILED" | "RETURNED",
    };
  }
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    return this.verify(rawBody, signature, timestamp);
  }
}

function required(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== "string" || !value[key])
    throw new Error(`Configured provider field ${key} is invalid`);
  return value[key];
}

export const SUBSCRIPTION_BILLING_PROVIDER = Symbol(
  "SUBSCRIPTION_BILLING_PROVIDER",
);
export const PAYOUT_ACCOUNT_PROVIDER = Symbol("PAYOUT_ACCOUNT_PROVIDER");

export const trustProviderBindings = [
  FakeSubscriptionBillingProvider,
  ConfiguredSubscriptionBillingProvider,
  FakePayoutAccountProvider,
  ConfiguredPayoutAccountProvider,
  {
    provide: SUBSCRIPTION_BILLING_PROVIDER,
    inject: [
      API_ENVIRONMENT,
      FakeSubscriptionBillingProvider,
      ConfiguredSubscriptionBillingProvider,
    ],
    useFactory: (
      environment: ApiEnvironment,
      fake: FakeSubscriptionBillingProvider,
      configured: ConfiguredSubscriptionBillingProvider,
    ) => (environment.SUBSCRIPTION_PROVIDER === "fake" ? fake : configured),
  },
  {
    provide: PAYOUT_ACCOUNT_PROVIDER,
    inject: [
      API_ENVIRONMENT,
      FakePayoutAccountProvider,
      ConfiguredPayoutAccountProvider,
    ],
    useFactory: (
      environment: ApiEnvironment,
      fake: FakePayoutAccountProvider,
      configured: ConfiguredPayoutAccountProvider,
    ) => (environment.PAYOUT_PROVIDER === "fake" ? fake : configured),
  },
];

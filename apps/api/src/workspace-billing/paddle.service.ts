import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { WorkspaceSubscriptionPlanKey } from "@weddingos/contracts";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { workspacePlan } from "./workspace-billing.catalog";

type PaddleEnvelope<T> = { data: T };

export type PaddleWebhook = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown>;
  payloadHash: string;
};

@Injectable()
export class PaddleService {
  private readonly baseUrl: string;
  private readonly verifiedPrices = new Set<string>();

  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {
    this.baseUrl =
      environment.PADDLE_ENVIRONMENT === "production"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com";
  }

  get enabled() {
    return (
      this.environment.WORKSPACE_BILLING_PROVIDER === "paddle" &&
      Boolean(
        this.environment.PADDLE_API_KEY &&
        this.environment.PADDLE_CLIENT_TOKEN &&
        this.environment.PADDLE_WEBHOOK_SECRET &&
        this.environment.PADDLE_PLUS_PRICE_ID &&
        this.environment.PADDLE_PRO_PRICE_ID,
      )
    );
  }

  get clientToken() {
    return this.environment.PADDLE_CLIENT_TOKEN ?? null;
  }

  get paddleEnvironment() {
    return this.environment.PADDLE_ENVIRONMENT;
  }

  publicConfiguration() {
    return {
      enabled: this.enabled,
      clientToken: this.enabled ? this.clientToken : null,
      environment: this.paddleEnvironment,
    } as const;
  }

  priceId(plan: Exclude<WorkspaceSubscriptionPlanKey, "FREE">): string {
    const value =
      plan === "PLUS"
        ? this.environment.PADDLE_PLUS_PRICE_ID
        : this.environment.PADDLE_PRO_PRICE_ID;
    if (!value)
      problem(
        "BILLING_NOT_CONFIGURED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Billing indisponibil",
        "Prețul Paddle pentru acest plan nu este configurat.",
      );
    return value;
  }

  async createTransaction(input: {
    plan: Exclude<WorkspaceSubscriptionPlanKey, "FREE">;
    workspaceId: string;
    userId: string;
    checkoutId: string;
    assignmentToken: string;
  }) {
    this.requireEnabled();
    const priceId = this.priceId(input.plan);
    await this.verifyPrice(priceId, input.plan);
    const response = await this.call<
      PaddleEnvelope<{ id: string; checkout: { url: string | null } }>
    >("/transactions", {
      method: "POST",
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        collection_mode: "automatic",
        custom_data: {
          workspace_id: input.workspaceId,
          purchaser_user_id: input.userId,
          plan_key: input.plan,
          checkout_id: input.checkoutId,
          assignment_token: input.assignmentToken,
          purpose: "sarbato_workspace_subscription",
        },
        checkout: {
          url:
            this.environment.PADDLE_CHECKOUT_URL ??
            `${this.environment.WEB_URL}/checkout`,
        },
      }),
    });
    if (!response.data.checkout.url)
      problem(
        "PADDLE_CHECKOUT_UNAVAILABLE",
        HttpStatus.BAD_GATEWAY,
        "Checkout Paddle indisponibil",
      );
    return {
      transactionId: response.data.id,
      checkoutUrl: response.data.checkout.url,
      priceId,
    };
  }

  createAssignmentToken(input: {
    plan: Exclude<WorkspaceSubscriptionPlanKey, "FREE">;
    workspaceId: string;
    userId: string;
    checkoutId: string;
  }) {
    const rawToken = createHmac("sha256", this.environment.SESSION_SECRET)
      .update("sarbato-paddle-assignment:v1\0")
      .update(input.checkoutId)
      .update("\0")
      .update(input.workspaceId)
      .update("\0")
      .update(input.userId)
      .update("\0")
      .update(input.plan)
      .digest("base64url");
    return {
      rawToken,
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
    };
  }

  checkoutUrl(transactionId: string) {
    return `${this.environment.WEB_URL}/checkout?transaction_id=${encodeURIComponent(transactionId)}`;
  }

  planFromProviderData(data: Record<string, unknown>): {
    planKey: Exclude<WorkspaceSubscriptionPlanKey, "FREE">;
    priceId: string;
  } | null {
    const matches = new Map<
      Exclude<WorkspaceSubscriptionPlanKey, "FREE">,
      string
    >();
    for (const priceId of providerPriceIds(data)) {
      if (priceId === this.environment.PADDLE_PLUS_PRICE_ID)
        matches.set("PLUS", priceId);
      if (priceId === this.environment.PADDLE_PRO_PRICE_ID)
        matches.set("PRO", priceId);
    }
    if (matches.size > 1)
      problem(
        "PADDLE_PLAN_AMBIGUOUS",
        HttpStatus.BAD_REQUEST,
        "Evenimentul Paddle conține mai multe planuri Sarbato",
      );
    const match = [...matches.entries()][0];
    return match ? { planKey: match[0], priceId: match[1] } : null;
  }

  async getSubscription(subscriptionId: string) {
    this.requireEnabled();
    const response = await this.call<PaddleEnvelope<Record<string, unknown>>>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "GET" },
    );
    return response.data;
  }

  async createPortalSession(
    customerId: string,
    subscriptionId: string,
  ): Promise<string> {
    this.requireEnabled();
    const response = await this.call<
      PaddleEnvelope<{ urls: { general: { overview: string } } }>
    >(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
      method: "POST",
      body: JSON.stringify({ subscription_ids: [subscriptionId] }),
    });
    return response.data.urls.general.overview;
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
    this.requireEnabled();
    const secret = this.environment.PADDLE_WEBHOOK_SECRET;
    if (!secret || !signatureHeader)
      problem(
        "PADDLE_SIGNATURE_INVALID",
        HttpStatus.UNAUTHORIZED,
        "Semnătură Paddle lipsă",
      );
    const parts = signatureHeader.split(";").map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith("ts="))?.slice(3);
    const signatures = parts
      .filter((part) => part.startsWith("h1="))
      .map((part) => part.slice(3));
    const seconds = Number(timestamp);
    if (
      !timestamp ||
      !Number.isInteger(seconds) ||
      Math.abs(Date.now() / 1000 - seconds) >
        this.environment.PADDLE_WEBHOOK_TOLERANCE_SECONDS
    ) {
      problem(
        "PADDLE_SIGNATURE_INVALID",
        HttpStatus.UNAUTHORIZED,
        "Semnătură Paddle expirată",
      );
    }
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}:${rawBody.toString("utf8")}`)
      .digest("hex");
    const valid = signatures.some((candidate) => {
      if (
        candidate.length !== expected.length ||
        !/^[a-f0-9]{64}$/i.test(candidate)
      )
        return false;
      return timingSafeEqual(
        Buffer.from(candidate, "hex"),
        Buffer.from(expected, "hex"),
      );
    });
    if (!valid)
      problem(
        "PADDLE_SIGNATURE_INVALID",
        HttpStatus.UNAUTHORIZED,
        "Semnătură Paddle invalidă",
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      problem(
        "SUBSCRIPTION_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Webhook Paddle invalid",
      );
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).event_id !== "string" ||
      typeof (parsed as Record<string, unknown>).event_type !== "string" ||
      typeof (parsed as Record<string, unknown>).occurred_at !== "string" ||
      typeof (parsed as Record<string, unknown>).data !== "object"
    ) {
      problem(
        "SUBSCRIPTION_EVENT_INVALID",
        HttpStatus.BAD_REQUEST,
        "Contract webhook Paddle invalid",
      );
    }
    return {
      ...(parsed as Omit<PaddleWebhook, "payloadHash">),
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    };
  }

  private requireEnabled() {
    if (!this.enabled)
      problem(
        "BILLING_NOT_CONFIGURED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Billing indisponibil",
        "Integrarea Paddle nu este încă activată pentru acest mediu.",
      );
    if (!this.environment.PADDLE_API_KEY)
      problem(
        "BILLING_NOT_CONFIGURED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Billing indisponibil",
      );
  }

  private async verifyPrice(
    priceId: string,
    planKey: Exclude<WorkspaceSubscriptionPlanKey, "FREE">,
  ) {
    if (this.verifiedPrices.has(priceId)) return;
    const response = await this.call<
      PaddleEnvelope<{
        unit_price: { amount: string; currency_code: string };
        billing_cycle: { interval: string; frequency: number } | null;
        status: string;
      }>
    >(`/prices/${encodeURIComponent(priceId)}`, { method: "GET" });
    const plan = workspacePlan(planKey);
    const matches =
      response.data.status === "active" &&
      response.data.unit_price.amount === String(plan.amountMinor) &&
      response.data.unit_price.currency_code === plan.currency &&
      response.data.billing_cycle?.interval === "month" &&
      response.data.billing_cycle.frequency === 1;
    if (!matches)
      problem(
        "PADDLE_PRICE_MISMATCH",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Preț Paddle configurat greșit",
        `Planul ${plan.name} trebuie să fie exact €${(plan.amountMinor / 100).toFixed(2)}/lună.`,
      );
    this.verifiedPrices.add(priceId);
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.environment.PADDLE_API_KEY}`,
        "Paddle-Version": "1",
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || !payload)
      problem(
        "PADDLE_REQUEST_FAILED",
        HttpStatus.BAD_GATEWAY,
        "Paddle nu a acceptat cererea",
        `Răspuns provider: HTTP ${response.status}.`,
      );
    return payload;
  }
}

function providerPriceIds(data: Record<string, unknown>): string[] {
  const result = new Set<string>();
  for (const collection of [
    data.items,
    objectValue(data.details)?.line_items,
  ]) {
    if (!Array.isArray(collection)) continue;
    for (const candidate of collection) {
      const item = objectValue(candidate);
      if (!item) continue;
      const direct = stringValue(item.price_id);
      const nested = stringValue(objectValue(item.price)?.id);
      if (direct) result.add(direct);
      if (nested) result.add(nested);
    }
  }
  return [...result];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

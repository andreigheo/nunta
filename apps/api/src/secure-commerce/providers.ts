import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
} from "@nestjs/common";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ApiEnvironment } from "@weddingos/config";
import { API_ENVIRONMENT } from "../common/environment.module";
import { SafeOutboundHttpClient } from "../common/safe-outbound-http.client";
import { problem } from "../common/problem";

export type UploadTarget = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export type StoredObjectMetadata = {
  sizeBytes: number;
  etag: string | null;
  contentType: string | null;
};

export interface ObjectStorageProvider {
  createUpload(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<UploadTarget>;
  headObject(key: string): Promise<StoredObjectMetadata>;
  createDownload(input: {
    key: string;
    fileName: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }>;
  downloadBuffer(key: string, maximumBytes: number): Promise<Buffer>;
  putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

@Injectable()
export class S3ObjectStorageProvider
  implements ObjectStorageProvider, OnModuleInit
{
  private readonly client: S3Client;
  private readonly publicClient: S3Client;

  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {
    const config = {
      region: environment.OBJECT_STORAGE_REGION,
      endpoint: environment.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY,
      },
    };
    this.client = new S3Client(config);
    this.publicClient = new S3Client({
      ...config,
      endpoint: environment.OBJECT_STORAGE_PUBLIC_ENDPOINT,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.environment.OBJECT_STORAGE_BUCKET,
        }),
      );
    } catch {
      if (this.environment.OBJECT_STORAGE_PROVIDER !== "minio")
        throw new Error("Configured private object bucket is unavailable");
      await this.client.send(
        new CreateBucketCommand({
          Bucket: this.environment.OBJECT_STORAGE_BUCKET,
        }),
      );
    }
  }

  async createUpload(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<UploadTarget> {
    const url = await getSignedUrl(
      this.publicClient,
      new PutObjectCommand({
        Bucket: this.environment.OBJECT_STORAGE_BUCKET,
        Key: input.key,
        ContentType: input.contentType,
        ServerSideEncryption:
          this.environment.OBJECT_STORAGE_PROVIDER === "s3"
            ? "AES256"
            : undefined,
      }),
      { expiresIn: input.expiresInSeconds },
    );
    return {
      method: "PUT",
      url,
      headers: { "Content-Type": input.contentType },
      expiresAt: new Date(
        Date.now() + input.expiresInSeconds * 1000,
      ).toISOString(),
    };
  }

  async headObject(key: string): Promise<StoredObjectMetadata> {
    const result = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.environment.OBJECT_STORAGE_BUCKET,
        Key: key,
      }),
    );
    return {
      sizeBytes: Number(result.ContentLength ?? 0),
      etag: result.ETag?.replaceAll('"', "") ?? null,
      contentType: result.ContentType ?? null,
    };
  }

  async createDownload(input: {
    key: string;
    fileName: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }> {
    const safeName = input.fileName.replace(/["\r\n]/g, "-");
    return {
      url: await getSignedUrl(
        this.publicClient,
        new GetObjectCommand({
          Bucket: this.environment.OBJECT_STORAGE_BUCKET,
          Key: input.key,
          ResponseContentType: input.contentType,
          ResponseContentDisposition: `attachment; filename="${safeName}"`,
        }),
        { expiresIn: input.expiresInSeconds },
      ),
      expiresAt: new Date(
        Date.now() + input.expiresInSeconds * 1000,
      ).toISOString(),
    };
  }

  async downloadBuffer(key: string, maximumBytes: number): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.environment.OBJECT_STORAGE_BUCKET,
        Key: key,
      }),
    );
    if (!result.Body) throw new Error("Stored object has no body");
    const bytes = await result.Body.transformToByteArray();
    if (bytes.byteLength > maximumBytes)
      problem(
        "UPLOAD_MISMATCH",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Stored object exceeds the authorized size",
      );
    return Buffer.from(bytes);
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.environment.OBJECT_STORAGE_BUCKET,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ServerSideEncryption:
          this.environment.OBJECT_STORAGE_PROVIDER === "s3"
            ? "AES256"
            : undefined,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.environment.OBJECT_STORAGE_BUCKET,
        Key: key,
      }),
    );
  }
}

export type VerifiedProviderEvent = {
  id: string;
  type: string;
  occurredAt: Date;
  data: Record<string, unknown>;
  payloadHash: string;
};

export interface ElectronicSignatureProvider {
  createEnvelope(input: {
    envelopeId: string;
    documentHash: string;
    signerIds: string[];
    expiresAt: Date | null;
  }): Promise<{
    providerEnvelopeId: string;
    signatureLevel: "TEST" | "STANDARD" | "ADVANCED" | "QUALIFIED";
  }>;
  createSigningLink(input: {
    envelopeId: string;
    signerId: string;
  }): Promise<{ url: string; expiresAt: string }>;
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): VerifiedProviderEvent;
}

export interface OnlinePaymentProvider {
  createCheckout(input: {
    checkoutId: string;
    amountMinor: number;
    currency: string;
    expiresAt: Date;
  }): Promise<{ providerCheckoutId: string; url: string }>;
  expireCheckout(input: { providerCheckoutId: string }): Promise<void>;
  refundPayment(input: {
    transactionId: string;
    refundId: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ providerRefundId: string; status: "PROCESSING" | "SUCCEEDED" }>;
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): VerifiedProviderEvent;
}

abstract class HmacProvider {
  constructor(
    protected readonly environment: ApiEnvironment,
    private readonly secret: string,
    private readonly invalidCode:
      "PAYMENT_EVENT_INVALID" | "SIGNATURE_EVENT_INVALID",
  ) {}

  protected verify(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): VerifiedProviderEvent {
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
    const parsed = JSON.parse(rawBody.toString("utf8")) as {
      id?: unknown;
      type?: unknown;
      occurredAt?: unknown;
      data?: unknown;
    };
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.occurredAt !== "string" ||
      !parsed.data ||
      typeof parsed.data !== "object" ||
      Array.isArray(parsed.data)
    )
      problem(
        this.invalidCode,
        HttpStatus.BAD_REQUEST,
        "Provider webhook contract is invalid",
      );
    const occurredAt = new Date(parsed.occurredAt);
    if (Number.isNaN(occurredAt.getTime()))
      problem(
        this.invalidCode,
        HttpStatus.BAD_REQUEST,
        "Provider event time is invalid",
      );
    return {
      id: parsed.id,
      type: parsed.type,
      occurredAt,
      data: parsed.data as Record<string, unknown>,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    };
  }
}

@Injectable()
export class FakeElectronicSignatureProvider
  extends HmacProvider
  implements ElectronicSignatureProvider
{
  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super(
      environment,
      environment.SIGNATURE_PROVIDER_SECRET,
      "SIGNATURE_EVENT_INVALID",
    );
  }

  async createEnvelope(input: {
    envelopeId: string;
  }): Promise<{ providerEnvelopeId: string; signatureLevel: "TEST" }> {
    return {
      providerEnvelopeId: `fake-sign-${input.envelopeId}`,
      signatureLevel: "TEST",
    };
  }

  async createSigningLink(input: {
    envelopeId: string;
    signerId: string;
  }): Promise<{ url: string; expiresAt: string }> {
    return {
      url: `/provider/signature/${input.envelopeId}?signer=${input.signerId}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }

  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): VerifiedProviderEvent {
    return this.verify(rawBody, signature, timestamp);
  }
}

@Injectable()
export class FakeOnlinePaymentProvider
  extends HmacProvider
  implements OnlinePaymentProvider
{
  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super(
      environment,
      environment.PAYMENT_PROVIDER_SECRET,
      "PAYMENT_EVENT_INVALID",
    );
  }

  async createCheckout(input: {
    checkoutId: string;
  }): Promise<{ providerCheckoutId: string; url: string }> {
    return {
      providerCheckoutId: `fake-checkout-${input.checkoutId}`,
      url: `/provider/checkout/${input.checkoutId}`,
    };
  }

  async refundPayment(input: {
    refundId: string;
  }): Promise<{ providerRefundId: string; status: "SUCCEEDED" }> {
    return {
      providerRefundId: `fake-refund-${input.refundId}`,
      status: "SUCCEEDED",
    };
  }

  async expireCheckout(): Promise<void> {}

  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): VerifiedProviderEvent {
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
    const result = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error("Configured provider response is invalid");
    return result as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

@Injectable()
export class ConfiguredElectronicSignatureProvider
  extends HmacProvider
  implements ElectronicSignatureProvider
{
  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super(
      environment,
      environment.SIGNATURE_PROVIDER_SECRET,
      "SIGNATURE_EVENT_INVALID",
    );
  }
  async createEnvelope(input: {
    envelopeId: string;
    documentHash: string;
    signerIds: string[];
    expiresAt: Date | null;
  }) {
    if (!this.environment.SIGNATURE_PROVIDER_URL)
      problem(
        "FEATURE_DISABLED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Signature provider is not configured",
      );
    const result = await providerRequest(
      `${this.environment.SIGNATURE_PROVIDER_URL}/envelopes`,
      this.environment.SIGNATURE_PROVIDER_SECRET,
      { ...input, expiresAt: input.expiresAt?.toISOString() ?? null },
    );
    if (
      typeof result.providerEnvelopeId !== "string" ||
      !["STANDARD", "ADVANCED", "QUALIFIED"].includes(
        String(result.signatureLevel),
      )
    )
      throw new Error("Configured signature provider response is invalid");
    return {
      providerEnvelopeId: result.providerEnvelopeId,
      signatureLevel: result.signatureLevel as
        "STANDARD" | "ADVANCED" | "QUALIFIED",
    };
  }
  async createSigningLink(input: { envelopeId: string; signerId: string }) {
    if (!this.environment.SIGNATURE_PROVIDER_URL)
      problem(
        "FEATURE_DISABLED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Signature provider is not configured",
      );
    const result = await providerRequest(
      `${this.environment.SIGNATURE_PROVIDER_URL}/signing-links`,
      this.environment.SIGNATURE_PROVIDER_SECRET,
      input,
    );
    if (typeof result.url !== "string" || typeof result.expiresAt !== "string")
      throw new Error("Configured signature link is invalid");
    return { url: result.url, expiresAt: result.expiresAt };
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
export class ConfiguredOnlinePaymentProvider
  extends HmacProvider
  implements OnlinePaymentProvider
{
  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super(
      environment,
      environment.PAYMENT_PROVIDER_SECRET,
      "PAYMENT_EVENT_INVALID",
    );
  }
  async createCheckout(input: {
    checkoutId: string;
    amountMinor: number;
    currency: string;
    expiresAt: Date;
  }) {
    if (!this.environment.PAYMENT_PROVIDER_URL)
      problem(
        "PAYMENT_PROVIDER_NOT_CONFIGURED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Payment provider is not configured",
      );
    const result = await providerRequest(
      `${this.environment.PAYMENT_PROVIDER_URL}/checkouts`,
      this.environment.PAYMENT_PROVIDER_SECRET,
      { ...input, expiresAt: input.expiresAt.toISOString() },
    );
    if (
      typeof result.providerCheckoutId !== "string" ||
      typeof result.url !== "string"
    )
      throw new Error("Configured checkout response is invalid");
    return { providerCheckoutId: result.providerCheckoutId, url: result.url };
  }
  async refundPayment(input: {
    transactionId: string;
    refundId: string;
    amountMinor: number;
    currency: string;
  }) {
    if (!this.environment.PAYMENT_PROVIDER_URL)
      problem(
        "PAYMENT_PROVIDER_NOT_CONFIGURED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Payment provider is not configured",
      );
    const result = await providerRequest(
      `${this.environment.PAYMENT_PROVIDER_URL}/refunds`,
      this.environment.PAYMENT_PROVIDER_SECRET,
      input,
    );
    if (
      typeof result.providerRefundId !== "string" ||
      !["PROCESSING", "SUCCEEDED"].includes(String(result.status))
    )
      throw new Error("Configured refund response is invalid");
    return {
      providerRefundId: result.providerRefundId,
      status: result.status as "PROCESSING" | "SUCCEEDED",
    };
  }
  async expireCheckout(input: { providerCheckoutId: string }) {
    if (!this.environment.PAYMENT_PROVIDER_URL)
      problem(
        "PAYMENT_PROVIDER_NOT_CONFIGURED",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Payment provider is not configured",
      );
    await providerRequest(
      `${this.environment.PAYMENT_PROVIDER_URL}/checkouts/expire`,
      this.environment.PAYMENT_PROVIDER_SECRET,
      input,
    );
  }
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    return this.verify(rawBody, signature, timestamp);
  }
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
export const SIGNATURE_PROVIDER = Symbol("SIGNATURE_PROVIDER");
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export const secureCommerceProviderBindings = [
  S3ObjectStorageProvider,
  FakeElectronicSignatureProvider,
  ConfiguredElectronicSignatureProvider,
  FakeOnlinePaymentProvider,
  ConfiguredOnlinePaymentProvider,
  { provide: OBJECT_STORAGE, useExisting: S3ObjectStorageProvider },
  {
    provide: SIGNATURE_PROVIDER,
    inject: [
      API_ENVIRONMENT,
      FakeElectronicSignatureProvider,
      ConfiguredElectronicSignatureProvider,
    ],
    useFactory: (
      environment: ApiEnvironment,
      fake: FakeElectronicSignatureProvider,
      configured: ConfiguredElectronicSignatureProvider,
    ) => (environment.SIGNATURE_PROVIDER === "fake" ? fake : configured),
  },
  {
    provide: PAYMENT_PROVIDER,
    inject: [
      API_ENVIRONMENT,
      FakeOnlinePaymentProvider,
      ConfiguredOnlinePaymentProvider,
    ],
    useFactory: (
      environment: ApiEnvironment,
      fake: FakeOnlinePaymentProvider,
      configured: ConfiguredOnlinePaymentProvider,
    ) => (environment.PAYMENT_PROVIDER === "fake" ? fake : configured),
  },
];

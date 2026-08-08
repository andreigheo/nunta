import { z } from "zod";

const uuid = z.string().uuid();
const localPath = z
  .string()
  .trim()
  .max(500)
  .regex(/^\/(?!\/)/);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const moneyMinor = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const uploadPurposes = [
  "CONTRACT_ATTACHMENT",
  "BOOKING_DOCUMENT",
  "EXPENSE_RECEIPT",
  "PAYMENT_EVIDENCE",
  "VENDOR_PORTFOLIO_IMAGE",
  "VENDOR_LEGAL_DOCUMENT",
  "GENERAL_COMMERCIAL_DOCUMENT",
  "INVITATION_MEDIA",
  "PROFILE_IMAGE",
] as const;
export const uploadPurposeSchema = z.enum(uploadPurposes);

export const createUploadSessionSchema = z
  .object({
    workspaceId: uuid.optional(),
    vendorOrganizationId: uuid.optional(),
    purpose: uploadPurposeSchema,
    originalFileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(3).max(180),
    sizeBytes: z.number().int().positive().max(104_857_600),
    checksumSha256: checksum,
  })
  .refine(
    (value) =>
      Boolean(value.workspaceId) !== Boolean(value.vendorOrganizationId),
    "Exactly one tenant owner is required",
  );
export type CreateUploadSession = z.infer<typeof createUploadSessionSchema>;

export const completeUploadSessionSchema = z.object({
  etag: z.string().trim().min(1).max(180).optional(),
  checksumSha256: checksum,
});

export const documentClassifications = [
  "GENERAL",
  "COMMERCIAL",
  "FINANCIAL",
  "CONTRACTUAL",
  "SENSITIVE",
  "VENDOR_PRIVATE",
  "WEDDING_PRIVATE",
  "SHARED_PARTIES",
] as const;
export const documentClassificationSchema = z.enum(documentClassifications);

export const documentTypes = [
  "CONTRACT",
  "CONTRACT_ATTACHMENT",
  "BOOKING_DOCUMENT",
  "PAYMENT_EVIDENCE",
  "EXPENSE_RECEIPT",
  "VENDOR_LEGAL_DOCUMENT",
  "VENDOR_PORTFOLIO_ASSET",
  "OTHER",
] as const;
export const documentTypeSchema = z.enum(documentTypes);

export const createDocumentFolderSchema = z.object({
  name: z.string().trim().min(1).max(180),
  parentFolderId: uuid.nullable().optional(),
  classification: documentClassificationSchema.default("GENERAL"),
});
export const updateDocumentFolderSchema = createDocumentFolderSchema.partial();

export const updateDocumentRetentionSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650),
  legalHold: z.boolean().default(false),
  reviewAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const createDocumentSchema = z.object({
  uploadSessionId: uuid,
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).nullable().optional(),
  folderId: uuid.nullable().optional(),
  documentType: documentTypeSchema,
  classification: documentClassificationSchema,
  resourceType: z
    .enum([
      "BOOKING",
      "CONTRACT",
      "CONTRACT_VERSION",
      "EXPENSE",
      "PAYMENT",
      "VENDOR_PROFILE",
      "VENDOR_ORGANIZATION",
    ])
    .optional(),
  resourceId: uuid.optional(),
});
export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  folderId: uuid.nullable().optional(),
  classification: documentClassificationSchema.optional(),
  status: z.enum(["ARCHIVED", "AVAILABLE"]).optional(),
});
export const createDocumentVersionSchema = z.object({
  uploadSessionId: uuid,
});

export const createDocumentGrantSchema = z.object({
  granteeType: z.enum([
    "USER",
    "WORKSPACE",
    "VENDOR_ORGANIZATION",
    "CONTRACT_PARTY",
    "BOOKING_PARTY",
  ]),
  granteeId: uuid,
  permission: z.enum(["READ", "DOWNLOAD", "MANAGE", "SHARE"]),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const createSignatureEnvelopeSchema = z.object({
  contractVersionId: uuid,
  weddingSignerMembershipId: uuid,
  vendorSignerMembershipId: uuid,
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const fakeSignatureActionSchema = z.object({
  signerId: uuid,
  action: z.enum(["VIEW", "SIGN", "DECLINE"]),
  reason: z.string().trim().max(1000).optional(),
});

export const cancelSignatureEnvelopeSchema = z.object({
  reason: z.string().trim().min(2).max(1000),
});

export const createPaymentCheckoutSchema = z.object({
  paymentScheduleEntryId: uuid,
  amountMode: z
    .enum(["FULL_OUTSTANDING", "CUSTOM"])
    .default("FULL_OUTSTANDING"),
  customAmountMinor: moneyMinor.optional(),
  successReturnPath: localPath.default("/payments?checkout=success"),
  cancelReturnPath: localPath.default("/payments?checkout=cancelled"),
});

export const createOnlinePaymentRefundSchema = z.object({
  amountMinor: moneyMinor,
  reason: z.string().trim().min(2).max(1000),
});

export const fakePaymentActionSchema = z.object({
  action: z.enum(["CAPTURE", "FAIL", "DISPUTE"]),
});

export const paymentReconciliationSchema = z.object({
  workspaceId: uuid,
});

export const providerWebhookEnvelopeSchema = z.object({
  id: z.string().trim().min(3).max(180),
  type: z.string().trim().min(3).max(100),
  occurredAt: z.string().datetime({ offset: true }),
  data: z.record(z.unknown()),
});

export const signatureStatusPrecedence = {
  DRAFT: 0,
  CREATING: 1,
  READY: 2,
  SENT: 3,
  VIEWED: 4,
  PARTIALLY_SIGNED: 5,
  COMPLETED: 10,
  DECLINED: 10,
  EXPIRED: 10,
  CANCELLED: 10,
  FAILED: 10,
} as const;

export const paymentStatusPrecedence = {
  PENDING: 0,
  REQUIRES_ACTION: 1,
  AUTHORIZED: 2,
  CAPTURED: 3,
  FAILED: 10,
  CANCELLED: 10,
  PARTIALLY_REFUNDED: 4,
  REFUNDED: 5,
  DISPUTED: 6,
} as const;

export function isMonotoneTransition<T extends string>(
  current: T,
  next: T,
  precedence: Record<T, number>,
): boolean {
  return precedence[next] >= precedence[current];
}

export function normalizeUploadFileName(value: string): string {
  return [...value.normalize("NFKC")]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return character === "\\" ||
        character === "/" ||
        codePoint <= 31 ||
        codePoint === 127
        ? "-"
        : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

export function detectMediaType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 5 &&
    Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-"
  )
    return "application/pdf";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
  )
    return "image/webp";
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp"
  ) {
    const brand = Buffer.from(bytes.subarray(8, 12)).toString("ascii");
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "video/webm";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b)
    return "application/zip";
  const sample = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096)));
  if (
    !sample.includes(0) &&
    sample.toString("utf8").replace(/[\t\r\n\x20-\x7e\u0080-\uffff]/g, "")
      .length === 0
  )
    return "text/plain";
  return null;
}

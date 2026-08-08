import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

type Envelope = {
  version: 1;
  keyId: string;
  algorithm: "AES-256-GCM";
  nonce: string;
  tag: string;
  ciphertext: string;
};

function key(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSensitive(
  value: string | null | undefined,
  config: { keyId: string; secret: string },
): string | null {
  if (!value?.trim()) return null;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(config.secret), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(value.trim(), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    keyId: config.keyId,
    algorithm: "AES-256-GCM",
    nonce: nonce.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  } satisfies Envelope);
}

export function decryptSensitive(
  value: string | null | undefined,
  config: { keyId: string; secret: string },
): string | null {
  if (!value) return null;
  const envelope = JSON.parse(value) as Envelope;
  if (
    envelope.version !== 1 ||
    envelope.keyId !== config.keyId ||
    envelope.algorithm !== "AES-256-GCM"
  )
    return null;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(config.secret),
    Buffer.from(envelope.nonce, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function stableHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => `${JSON.stringify(name)}:${stableJson(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

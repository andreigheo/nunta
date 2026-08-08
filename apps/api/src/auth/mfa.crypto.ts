import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(input: Buffer) {
  let bits = "";
  for (const value of input) bits += value.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    output +=
      BASE32[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

export function base32Decode(input: string) {
  let bits = "";
  for (const character of input.replaceAll("=", "").toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function createTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, counter: bigint, digits = 6) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    10 ** digits;
  return value.toString().padStart(digits, "0");
}

export function verifyTotp(
  secret: string,
  code: string,
  now = Date.now(),
  lastCounter?: bigint | null,
) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = BigInt(Math.floor(now / 30_000));
  const supplied = Buffer.from(code);
  for (const delta of [-1n, 0n, 1n]) {
    const counter = current + delta;
    if (lastCounter != null && counter <= lastCounter) continue;
    const expected = Buffer.from(totpAt(secret, counter));
    if (
      expected.length === supplied.length &&
      timingSafeEqual(expected, supplied)
    )
      return counter;
  }
  return null;
}

export function encryptMfaSecret(
  secret: string,
  encryptionKey: string,
  keyId: string,
) {
  const key = createHash("sha256").update(encryptionKey).digest();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${keyId}.${nonce.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptMfaSecret(
  envelope: string,
  encryptionKey: string,
  expectedKeyId: string,
) {
  const [keyId, nonce, tag, ciphertext] = envelope.split(".");
  if (!keyId || keyId !== expectedKeyId || !nonce || !tag || !ciphertext)
    throw new Error("MFA_SECRET_KEY_UNAVAILABLE");
  const key = createHash("sha256").update(encryptionKey).digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(nonce, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashMfaValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
  });
}

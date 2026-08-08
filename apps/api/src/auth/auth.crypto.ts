import { createHash, randomBytes, randomInt } from "node:crypto";

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createSixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashVerificationCode(email: string, code: string): string {
  return hashSecret(`${email.trim().toLowerCase()}:${code}`);
}

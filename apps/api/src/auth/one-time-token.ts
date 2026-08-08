import { HttpStatus } from "@nestjs/common";
import { problem } from "../common/problem";

export type OneTimeTokenState = {
  purpose: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
};

export function assertUsableOneTimeToken<T extends OneTimeTokenState>(
  record: T | null,
  expectedPurpose: string,
  now = new Date(),
): asserts record is T {
  if (
    !record ||
    record.purpose !== expectedPurpose ||
    record.consumedAt ||
    record.revokedAt
  ) {
    problem("TOKEN_INVALID", HttpStatus.BAD_REQUEST, "Invalid token");
  }
  if (record.expiresAt <= now) {
    problem("TOKEN_EXPIRED", HttpStatus.GONE, "Token expired");
  }
}

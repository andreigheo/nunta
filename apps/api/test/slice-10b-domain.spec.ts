import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import {
  base32Decode,
  base32Encode,
  createRecoveryCodes,
  decryptMfaSecret,
  encryptMfaSecret,
  hashMfaValue,
  totpAt,
  verifyTotp,
} from "../src/auth/mfa.crypto";
import { CsrfService } from "../src/auth/csrf.service";
import {
  isForbiddenAddress,
  SafeOutboundHttpClient,
} from "../src/common/safe-outbound-http.client";
import { assertDestructiveDatabasePurpose } from "./database-identity";

describe("Slice 10B closure security primitives", () => {
  it("round-trips RFC 4648 base32", () => {
    const input = Buffer.from("Sarbato MFA");
    expect(base32Decode(base32Encode(input))).toEqual(input);
  });

  it("matches the RFC 6238 SHA1 vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpAt(secret, 1n, 8)).toBe("94287082");
  });

  it("accepts only a bounded TOTP clock window", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1_700_000_000_000;
    const counter = BigInt(Math.floor(now / 30_000));
    expect(verifyTotp(secret, totpAt(secret, counter), now)).toBe(counter);
    expect(verifyTotp(secret, totpAt(secret, counter + 2n), now)).toBeNull();
  });

  it("rejects TOTP replay counters", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1_700_000_000_000;
    const counter = BigInt(Math.floor(now / 30_000));
    expect(
      verifyTotp(secret, totpAt(secret, counter), now, counter),
    ).toBeNull();
  });

  it("encrypts MFA secrets with authenticated encryption and key identity", () => {
    const envelope = encryptMfaSecret(
      "secret",
      "a long local encryption key",
      "key-v1",
    );
    expect(envelope).not.toContain("secret");
    expect(
      decryptMfaSecret(envelope, "a long local encryption key", "key-v1"),
    ).toBe("secret");
    expect(() =>
      decryptMfaSecret(envelope, "a long local encryption key", "key-v2"),
    ).toThrow();
  });

  it("generates unique human-readable recovery codes", () => {
    const codes = createRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(
      codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/.test(code)),
    ).toBe(true);
    expect(hashMfaValue(codes[0])).not.toContain(codes[0]);
  });

  it("binds CSRF tokens to a session", () => {
    const csrf = new CsrfService({
      SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
      CSRF_TOKEN_TTL_SECONDS: 300,
    } as never);
    const token = csrf.issue("session-a").token;
    expect(csrf.verify("session-a", token)).toBe(true);
    expect(csrf.verify("session-b", token)).toBe(false);
    expect(csrf.verify("session-a", `${token}tampered`)).toBe(false);
  });

  it("rejects expired CSRF tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T10:00:00Z"));
    const csrf = new CsrfService({
      SESSION_SECRET: "x".repeat(40),
      CSRF_TOKEN_TTL_SECONDS: 1,
    } as never);
    const token = csrf.issue("session").token;
    vi.advanceTimersByTime(1_001);
    expect(csrf.verify("session", token)).toBe(false);
    vi.useRealTimers();
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fd00:ec2::254",
    "::ffff:127.0.0.1",
    "224.0.0.1",
  ])("blocks forbidden outbound address %s", (address) => {
    expect(isForbiddenAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public outbound address %s",
    (address) => expect(isForbiddenAddress(address)).toBe(false),
  );

  it("pins the validated DNS address into the actual socket lookup", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ pinned: true }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("NO_PORT");
      const resolve = vi
        .fn()
        .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }])
        .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
      const client = new SafeOutboundHttpClient(
        {
          allowHttp: true,
          allowedHostnames: ["rebind.test"],
          allowPrivateDevelopmentHosts: ["rebind.test"],
        },
        { resolve },
      );

      await expect(
        client.json(`http://rebind.test:${address.port}/health`),
      ).resolves.toEqual({ pinned: true });
      expect(resolve).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("revalidates every redirect target and blocks a private hop", async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 302;
      response.setHeader("location", "http://private.test/internal");
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("NO_PORT");
      const resolve = vi.fn(async () => [
        { address: "127.0.0.1", family: 4 as const },
      ]);
      const client = new SafeOutboundHttpClient(
        {
          allowHttp: true,
          allowedHostnames: ["public.test", "private.test"],
          allowPrivateDevelopmentHosts: ["public.test"],
        },
        { resolve },
      );

      await expect(
        client.fetch(`http://public.test:${address.port}/redirect`),
      ).rejects.toThrow("OUTBOUND_PRIVATE_ADDRESS_DENIED");
      expect(resolve).toHaveBeenCalledTimes(2);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("permits destructive cleanup only for the persisted expected identity", async () => {
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          environment: "test",
          databasePurpose: "e2e",
          databaseInstanceId: "id",
        },
      ]),
    };
    await expect(
      assertDestructiveDatabasePurpose(database as never, "e2e"),
    ).resolves.toMatchObject({ databasePurpose: "e2e" });
    await expect(
      assertDestructiveDatabasePurpose(database as never, "integration"),
    ).rejects.toThrow("DESTRUCTIVE_DATABASE_IDENTITY_REFUSED");
  });
});

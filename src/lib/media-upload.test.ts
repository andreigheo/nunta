import { describe, expect, it } from "vitest";
import {
  fileChecksum,
  mediaFileError,
  mediaTypes,
  opaqueUploadToken,
} from "./media-upload";

describe("Participant media validation", () => {
  it.each(mediaTypes)("accepts supported format %s", (type) => {
    expect(mediaFileError({ type, size: 1024 })).toBeNull();
  });
  it("rejects empty files, executables and SVG", () => {
    expect(mediaFileError({ type: "image/png", size: 0 })).not.toBeNull();
    for (const type of [
      "image/svg+xml",
      "text/html",
      "application/octet-stream",
      "",
    ]) {
      expect(mediaFileError({ type, size: 100 })).not.toBeNull();
    }
  });
  it.each([
    ["image/jpeg", 20],
    ["video/mp4", 100],
  ])("checks the exact %s boundary", (type, mib) => {
    const size = Number(mib) * 1024 ** 2;
    expect(mediaFileError({ type: String(type), size })).toBeNull();
    expect(
      mediaFileError({ type: String(type), size: size + 1 }),
    ).not.toBeNull();
  });
  it("creates unpredictable URL-safe per-file tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, opaqueUploadToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("hashes actual file bytes, not the filename", async () => {
    expect(await fileChecksum(new File(["abc"], "one.png"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await fileChecksum(new File(["abc"], "two.png"))).toBe(
      await fileChecksum(new File(["abc"], "one.png")),
    );
  });
});

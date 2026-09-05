import { describe, expect, it } from "vitest";
import { campaignGuestAccessToken } from "../src/guest-access-token";

describe("campaign guest access tokens", () => {
  it("is stable for one delivery generation and rotates for a new recipient row", () => {
    const secret = "worker-test-secret-with-enough-characters";
    const first = campaignGuestAccessToken(secret, "campaign-recipient-1");
    expect(campaignGuestAccessToken(secret, "campaign-recipient-1")).toBe(
      first,
    );
    expect(campaignGuestAccessToken(secret, "campaign-recipient-2")).not.toBe(
      first,
    );
  });
});

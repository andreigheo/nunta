import { describe, expect, it } from "vitest";
import {
  destinationForRegistration,
  inferredRegistrationIntent,
  safeInternalPath,
} from "./account-routing";
import { requiredCapabilityForPath } from "./navigation";

describe("account routing", () => {
  it("routes each registration path to its own onboarding", () => {
    expect(destinationForRegistration("EVENT_ORGANIZER")).toBe("/onboarding");
    expect(destinationForRegistration("SERVICE_PROVIDER")).toBe(
      "/vendor?setup=1",
    );
    expect(destinationForRegistration("INVITED_MEMBER")).toBe("/start");
  });

  it("preserves a safe invitation return path", () => {
    const path = "/invitation?token=abc";
    expect(inferredRegistrationIntent(path)).toBe("INVITED_MEMBER");
    expect(destinationForRegistration("INVITED_MEMBER", path)).toBe(path);
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(safeInternalPath("https://evil.example")).toBeNull();
    expect(safeInternalPath("//evil.example/path")).toBeNull();
  });
});

describe("route capability boundaries", () => {
  it("requires write access for editor and hosted payment operations", () => {
    expect(requiredCapabilityForPath("/invitations/editor")).toBe(
      "invitation.write",
    );
    expect(requiredCapabilityForPath("/provider/checkout/test-id")).toBe(
      "payment.write",
    );
  });

  it("keeps ordinary nested routes on their module read capability", () => {
    expect(requiredCapabilityForPath("/marketplace/vendor-id")).toBe(
      "marketplace.read",
    );
  });
});

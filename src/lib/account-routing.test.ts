import { describe, expect, it } from "vitest";
import {
  destinationAfterAuthentication,
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

  it("sends a verified organizer without a workspace to onboarding", () => {
    expect(
      destinationAfterAuthentication({
        registrationIntent: "EVENT_ORGANIZER",
        workspaceCount: 0,
        hasVendorOrganizations: false,
        hasPlatformAccess: false,
      }),
    ).toBe("/onboarding");
  });

  it("routes authenticated contexts without losing safe return paths", () => {
    expect(
      destinationAfterAuthentication({
        returnTo: "/invitations/editor",
        registrationIntent: "EVENT_ORGANIZER",
        workspaceCount: 1,
        hasVendorOrganizations: false,
        hasPlatformAccess: false,
      }),
    ).toBe("/invitations/editor");
    expect(
      destinationAfterAuthentication({
        registrationIntent: "SERVICE_PROVIDER",
        workspaceCount: 0,
        hasVendorOrganizations: true,
        hasPlatformAccess: false,
      }),
    ).toBe("/vendor");
    expect(
      destinationAfterAuthentication({
        registrationIntent: "EVENT_ORGANIZER",
        workspaceCount: 1,
        hasVendorOrganizations: true,
        hasPlatformAccess: false,
      }),
    ).toBe("/start");
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

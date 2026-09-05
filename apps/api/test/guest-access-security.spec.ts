import { describe, expect, it, vi } from "vitest";
import { InvitationCampaignService } from "../src/guests/invitation-campaign.service";

describe("guest access grant lifecycle", () => {
  it("rotates the bearer token and leaves the previous generation revoked", async () => {
    const grants: Array<{
      id: string;
      invitationRecipientId: string;
      channel: string;
      tokenHash: string;
      revokedAt: Date | null;
    }> = [];
    const tx = {
      guestAccessGrant: {
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          for (const grant of grants) {
            if (
              grant.invitationRecipientId === where.invitationRecipientId &&
              grant.channel === where.channel &&
              grant.revokedAt === null
            ) {
              grant.revokedAt = data.revokedAt;
              count += 1;
            }
          }
          return { count };
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          grants.push({
            id: `grant-${grants.length + 1}`,
            ...data,
            revokedAt: null,
          });
        }),
      },
    };
    const issue = (
      InvitationCampaignService.prototype as unknown as {
        ensureChannelGrant: (
          tx: unknown,
          workspaceId: string,
          recipientId: string,
          householdId: string,
          channel: "EMAIL",
        ) => Promise<{ token: string; reused: boolean }>;
      }
    ).ensureChannelGrant;
    const first = await issue.call(
      {},
      tx,
      "workspace",
      "recipient",
      "household",
      "EMAIL",
    );
    const second = await issue.call(
      {},
      tx,
      "workspace",
      "recipient",
      "household",
      "EMAIL",
    );

    expect(second.token).not.toBe(first.token);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(false);
    expect(grants).toHaveLength(2);
    expect(grants[0].revokedAt).toBeInstanceOf(Date);
    expect(grants[1].revokedAt).toBeNull();
    expect(grants[1].tokenHash).not.toBe(grants[0].tokenHash);
  });
});

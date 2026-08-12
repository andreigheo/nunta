import { describe, expect, it } from "vitest";
import {
  campaignInvitationPresentation,
  renderCampaignInvitationEmail,
} from "../src/campaign-invitation-email";

describe("campaign invitation email", () => {
  it("extracts the published couple and envelope experience", () => {
    expect(
      campaignInvitationPresentation(
        {
          sections: [
            {
              type: "hero",
              visible: true,
              content: { names: "Andrei & Andreea" },
            },
          ],
        },
        {
          experience: {
            style: "envelope",
            monogram: "A & A",
            frontMessage: "O invitație pentru tine",
            panelColor: "#3b183f",
            accentColor: "#f06449",
          },
        },
      ),
    ).toEqual({
      coupleNames: "Andrei & Andreea",
      monogram: "A & A",
      frontMessage: "O invitație pentru tine",
      panelColor: "#3B183F",
      accentColor: "#F06449",
      style: "envelope",
    });
  });

  it("renders a branded envelope email with escaped copy and personal CTA", () => {
    const result = renderCampaignInvitationEmail({
      body: "Vino cu noi <script>alert(1)</script>",
      url: "https://sarbato.space/guest?token=safe-token",
      presentation: {
        coupleNames: "Andrei & Andreea",
        monogram: "A & A",
        frontMessage: "O invitație pentru tine",
        panelColor: "#3B183F",
        accentColor: "#F06449",
        style: "envelope",
      },
    });

    expect(result.html).toContain("Un plic pentru tine");
    expect(result.html).toContain("Deschide plicul în browser");
    expect(result.html).toContain("Andrei &amp; Andreea");
    expect(result.html).toContain("A &amp; A");
    expect(result.html).not.toContain("<script>");
    expect(result.text).toContain(
      "https://sarbato.space/guest?token=safe-token",
    );
  });
});

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
            enabled: true,
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

  it("keeps custom light panels and dark accents readable in email clients", () => {
    const result = renderCampaignInvitationEmail({
      body: "Vă așteptăm cu drag.",
      url: "https://sarbato.space/guest?token=contrast-token",
      presentation: {
        coupleNames: "Mara & Luca",
        monogram: "M & L",
        frontMessage: "O invitație pentru voi",
        panelColor: "#FFFFFF",
        accentColor: "#19151D",
        style: "split_panels",
      },
    });

    expect(result.html).toContain("background:#FFFFFF;color:#19151D");
    expect(result.html).toContain("background:#19151D;border-radius:8px");
    expect(result.html).toContain("color:#FFF9FF;font-size:15px");
    expect(result.html).toContain("Două panouri pentru tine");
    expect(result.html).not.toContain("Un plic pentru tine");
  });

  it("does not promise an opening animation when the invitation opens directly", () => {
    const presentation = campaignInvitationPresentation(
      {
        sections: [
          {
            type: "hero",
            visible: true,
            content: { names: "Mara & Luca" },
          },
        ],
      },
      { experience: { enabled: false, style: "envelope" } },
    );
    const result = renderCampaignInvitationEmail({
      body: "Vă așteptăm cu drag.",
      url: "https://sarbato.space/guest?token=direct-token",
      presentation,
    });

    expect(presentation.style).toBe("direct");
    expect(result.html).toContain("Invitație personală");
    expect(result.html).not.toContain("Un plic pentru tine");
    expect(result.html).not.toContain("Două panouri pentru tine");
  });
});

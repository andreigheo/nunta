export type CampaignInvitationPresentation = {
  coupleNames: string;
  monogram: string;
  frontMessage: string;
  panelColor: string;
  accentColor: string;
  style: "split_panels" | "envelope";
};

export function campaignInvitationPresentation(
  documentValue: unknown,
  settingsValue: unknown,
): CampaignInvitationPresentation {
  const document = record(documentValue);
  const sections = Array.isArray(document.sections) ? document.sections : [];
  const hero = sections
    .map(record)
    .find((section) => section.type === "hero" && section.visible !== false);
  const heroContent = record(hero?.content);
  const settings = record(settingsValue);
  const experience = record(
    Object.keys(record(settings.experience)).length
      ? settings.experience
      : settings.invitationExperience,
  );
  const coupleNames = text(heroContent.names) || "O invitație pentru voi";
  return {
    coupleNames,
    monogram: text(experience.monogram) || initials(coupleNames),
    frontMessage:
      text(experience.frontMessage) || "Avem ceva frumos să vă spunem",
    panelColor: safeColor(experience.panelColor, "#3B183F"),
    accentColor: safeColor(experience.accentColor, "#F06449"),
    style: experience.style === "envelope" ? "envelope" : "split_panels",
  };
}

export function renderCampaignInvitationEmail({
  body,
  url,
  presentation,
}: {
  body: string;
  url: string;
  presentation: CampaignInvitationPresentation;
}) {
  const safeUrl = escapeHtml(url);
  const names = escapeHtml(presentation.coupleNames);
  const monogram = escapeHtml(presentation.monogram);
  const frontMessage = escapeHtml(presentation.frontMessage);
  const safeBody = escapeHtml(body).replaceAll("\n", "<br>");
  const panel = safeColor(presentation.panelColor, "#3B183F");
  const accent = safeColor(presentation.accentColor, "#F06449");
  const openingLabel =
    presentation.style === "envelope"
      ? "Deschide plicul în browser"
      : "Deschide invitația în browser";

  return {
    text: `${body}\n\n${openingLabel}: ${url}`,
    html: `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${names}</title>
  </head>
  <body style="margin:0;padding:0;background:#F3F0F4;color:#19151D;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${frontMessage} — deschide invitația personală.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F3F0F4;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;">
            <tr>
              <td style="padding:18px 28px;border-bottom:3px solid ${accent};font-size:18px;font-weight:700;color:${panel};">Sarbato</td>
            </tr>
            <tr>
              <td align="center" bgcolor="${panel}" style="padding:42px 20px 0;background:${panel};color:#FFF9FF;">
                <div style="font-size:12px;line-height:18px;letter-spacing:2px;text-transform:uppercase;opacity:.76;">O invitație personală</div>
                <div style="padding:12px 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:38px;font-weight:700;">${names}</div>

                <table role="presentation" width="360" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:360px;">
                  <tr>
                    <td align="center" style="padding:0 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFF9F1;color:#29182C;box-shadow:0 10px 26px rgba(0,0,0,.18);">
                        <tr>
                          <td align="center" style="padding:24px 18px 30px;">
                            <div style="font-size:10px;line-height:14px;letter-spacing:2px;text-transform:uppercase;color:#6D6670;">Sarbato · invitație</div>
                            <div style="margin:16px auto 13px;width:72px;height:72px;border:1px solid ${accent};border-radius:50%;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:72px;font-weight:700;">${monogram}</div>
                            <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:25px;font-weight:700;">${frontMessage}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" bgcolor="#6C4C70" style="padding:24px 18px 26px;background:#6C4C70;border-radius:0 0 8px 8px;">
                      <div style="margin:-43px auto 10px;width:54px;height:54px;border:5px solid ${panel};border-radius:50%;background:${accent};color:#19151D;font-size:18px;line-height:54px;font-weight:700;">✦</div>
                      <div style="font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#FFF9FF;">Un plic pentru tine</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:36px 32px 40px;background:#FFFFFF;">
                <div style="max-width:460px;font-size:16px;line-height:25px;color:#3F3942;">${safeBody}</div>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                  <tr>
                    <td bgcolor="${accent}" style="background:${accent};border-radius:8px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:15px 24px;color:#19151D;font-size:15px;line-height:18px;font-weight:700;text-decoration:none;">${openingLabel}</a>
                    </td>
                  </tr>
                </table>
                <div style="padding-top:18px;font-size:12px;line-height:18px;color:#6D6670;">Link personal. Nu îl distribui altor persoane.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function initials(names: string) {
  const parts = names
    .split(/\s*(?:&|și|si|\+)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const result = parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase("ro") ?? "")
    .join(" & ");
  return result || "S";
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : fallback;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type CampaignInvitationPresentation = {
  coupleNames: string;
  monogram: string;
  frontMessage: string;
  panelColor: string;
  accentColor: string;
  style: "direct" | "split_panels" | "envelope";
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
    style:
      experience.enabled === true ||
      experience.mode === "cinematic" ||
      experience.mode === "aperture"
        ? experience.style === "envelope"
          ? "envelope"
          : "split_panels"
        : "direct",
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
  const monogramLength = Array.from(presentation.monogram.trim()).length;
  const monogramFontSize =
    monogramLength > 5 ? 14 : monogramLength > 3 ? 18 : 23;
  const monogramLineHeight = monogramLength > 3 ? 18 : 72;
  const frontMessage = escapeHtml(presentation.frontMessage);
  const safeBody = escapeHtml(body).replaceAll("\n", "<br>");
  const panel = safeColor(presentation.panelColor, "#3B183F");
  const accent = safeColor(presentation.accentColor, "#F06449");
  const panelText = readableEmailTextColor(panel);
  const accentText = readableEmailTextColor(accent);
  const brandText = contrastRatio(panel, "#FFFFFF") >= 4.5 ? panel : "#3B183F";
  const openingLabel =
    presentation.style === "envelope"
      ? "Deschide plicul în browser"
      : "Deschide invitația în browser";
  const openingArtwork =
    presentation.style === "envelope"
      ? `<table role="presentation" width="360" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:360px;">
                  <tr>
                    <td align="center" style="padding:0 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFF9F1;color:#29182C;box-shadow:0 10px 26px rgba(0,0,0,.18);">
                        <tr>
                          <td align="center" style="padding:24px 18px 30px;">
                            <div style="font-size:10px;line-height:14px;letter-spacing:2px;text-transform:uppercase;color:#6D6670;">Sarbato · invitație</div>
                            <table role="presentation" width="72" height="72" cellspacing="0" cellpadding="0" border="0" style="width:72px;height:72px;margin:16px auto 13px;border:1px solid ${accent};border-radius:50%;">
                              <tr><td align="center" valign="middle" style="padding:6px;font-family:Georgia,'Times New Roman',serif;font-size:${monogramFontSize}px;line-height:${monogramLineHeight}px;font-weight:700;overflow-wrap:anywhere;word-break:break-word;">${monogram}</td></tr>
                            </table>
                            <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:25px;font-weight:700;">${frontMessage}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" bgcolor="#6C4C70" style="padding:24px 18px 26px;background:#6C4C70;border-radius:0 0 8px 8px;">
                      <div style="margin:-43px auto 10px;width:54px;height:54px;border:5px solid ${panel};border-radius:50%;background:${accent};color:${accentText};font-size:18px;line-height:54px;font-weight:700;">✦</div>
                      <div style="font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#FFF9FF;">Un plic pentru tine</div>
                    </td>
                  </tr>
                </table>`
      : presentation.style === "split_panels"
        ? `<table role="presentation" width="360" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:360px;box-shadow:0 10px 26px rgba(0,0,0,.18);">
                  <tr>
                    <td width="50%" bgcolor="${panel}" style="width:50%;height:190px;background:${panel};border-right:1px solid rgba(255,255,255,.18);">&nbsp;</td>
                    <td width="50%" bgcolor="${panel}" style="width:50%;height:190px;background:${panel};border-left:1px solid rgba(0,0,0,.12);">&nbsp;</td>
                  </tr>
                  <tr>
                    <td colspan="2" align="center" bgcolor="#FFF9F1" style="padding:20px 18px 24px;background:#FFF9F1;color:#29182C;">
                      <div style="margin-top:-132px;margin-bottom:54px;">
                        <table role="presentation" width="72" height="72" cellspacing="0" cellpadding="0" border="0" bgcolor="${panel}" style="width:72px;height:72px;margin:0 auto 14px;border:1px solid ${accent};border-radius:50%;background:${panel};color:${panelText};">
                          <tr><td align="center" valign="middle" style="padding:6px;font-family:Georgia,'Times New Roman',serif;font-size:${monogramFontSize}px;line-height:${monogramLineHeight}px;font-weight:700;overflow-wrap:anywhere;word-break:break-word;">${monogram}</td></tr>
                        </table>
                        <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:25px;font-weight:700;color:${panelText};">${frontMessage}</div>
                      </div>
                      <div style="font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#6D6670;">Două panouri pentru tine</div>
                    </td>
                  </tr>
                </table>`
        : `<table role="presentation" width="360" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:360px;background:#FFF9F1;color:#29182C;box-shadow:0 10px 26px rgba(0,0,0,.18);">
                  <tr>
                    <td align="center" style="padding:28px 22px 30px;">
                      <div style="font-size:10px;line-height:14px;letter-spacing:2px;text-transform:uppercase;color:#6D6670;">Invitație personală</div>
                      <table role="presentation" width="72" height="72" cellspacing="0" cellpadding="0" border="0" style="width:72px;height:72px;margin:16px auto 13px;border:1px solid ${accent};border-radius:50%;">
                        <tr><td align="center" valign="middle" style="padding:6px;font-family:Georgia,'Times New Roman',serif;font-size:${monogramFontSize}px;line-height:${monogramLineHeight}px;font-weight:700;overflow-wrap:anywhere;word-break:break-word;">${monogram}</td></tr>
                      </table>
                      <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:25px;font-weight:700;">${frontMessage}</div>
                    </td>
                  </tr>
                </table>`;

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
              <td style="padding:18px 28px;border-bottom:3px solid ${accent};font-size:18px;font-weight:700;color:${brandText};">Sarbato</td>
            </tr>
            <tr>
              <td align="center" bgcolor="${panel}" style="padding:42px 20px 0;background:${panel};color:${panelText};">
                <div style="font-size:12px;line-height:18px;letter-spacing:2px;text-transform:uppercase;opacity:.76;">O invitație personală</div>
                <div style="padding:12px 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:38px;font-weight:700;">${names}</div>

                ${openingArtwork}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:36px 32px 40px;background:#FFFFFF;">
                <div style="max-width:460px;font-size:16px;line-height:25px;color:#3F3942;">${safeBody}</div>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                  <tr>
                    <td bgcolor="${accent}" style="background:${accent};border-radius:8px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:15px 24px;color:${accentText};font-size:15px;line-height:18px;font-weight:700;text-decoration:none;">${openingLabel}</a>
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

function readableEmailTextColor(background: string) {
  return contrastRatio("#19151D", background) >=
    contrastRatio("#FFF9FF", background)
    ? "#19151D"
    : "#FFF9FF";
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string) {
  return [1, 3, 5]
    .map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (total, channel, index) =>
        total + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
      0,
    );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

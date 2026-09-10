import type { EmailCommand } from "@weddingos/jobs";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

function emailContent(subject: string, text: string): RenderedEmail {
  return { subject, text, html: `<p>${escapeHtml(text)}</p>` };
}

function absoluteUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function renderPlusWelcome(
  values: Record<string, string>,
  baseUrl: string,
): RenderedEmail {
  const firstName = (values.firstName ?? "").trim();
  const greeting = firstName ? `Salut, ${firstName}!` : "Salut!";
  const dashboardUrl = absoluteUrl(baseUrl, "/overview");
  const assetUrl = (name: string) =>
    absoluteUrl(baseUrl, `/email-assets/${name}`);
  const heroUrl = assetUrl("welcome-plus-hero-v2.jpg");
  const introUrl = assetUrl("welcome-plus-intro-v2.png");
  const ctaUrl = assetUrl("welcome-plus-cta-strip-v2.png");
  const featuresUrl = assetUrl("welcome-plus-features-v2.png");
  const storyUrl = assetUrl("welcome-plus-story-v2.jpg");
  const footerUrl = assetUrl("welcome-plus-footer-v2.jpg");
  const subject = "Bun venit în Sarbato Plus — evenimentul tău începe aici";
  const text = `${greeting}\n\nPlanul Plus este activ. Ai acum un singur loc pentru plan, oameni, furnizori și ziua evenimentului.\n\nPlanul tău include până la 200 de invitați, 5 colaboratori și 50 de credite de mesagerie în fiecare lună.\n\nÎncepe organizarea: ${dashboardUrl}\n\nSarbato — Plan · Oameni · Furnizori · Ziua evenimentului`;
  const safeDashboardUrl = escapeHtml(dashboardUrl);

  return {
    subject,
    text,
    html: `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(subject)}</title>
    <style>
      html, body { color-scheme: light only; }
      body { margin: 0 !important; padding: 0 !important; }
      img { border: 0; display: block; height: auto; line-height: 0; margin: 0; max-width: 100%; outline: none; padding: 0; text-decoration: none; vertical-align: top; }
      table { border-collapse: collapse !important; border-spacing: 0 !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      a, a img { border: 0; outline: none; text-decoration: none; }
      .slice-cell { font-size: 0 !important; line-height: 0 !important; mso-line-height-rule: exactly; padding: 0 !important; vertical-align: top; }
      @media only screen and (max-width: 800px) {
        .email-shell { width: 100% !important; }
        .outer-pad { padding: 0 !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f9f8fb;color:#19151d;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      ${escapeHtml(greeting)} Planul Plus este activ. Organizarea evenimentului tău poate începe.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:0;background:#f9f8fb;border-collapse:collapse;border-spacing:0;">
      <tr>
        <td class="outer-pad" align="center" style="padding:16px 20px 24px;">
          <table role="presentation" class="email-shell" width="760" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:760px;margin:0 auto;padding:0;background:#fffaff;border-collapse:collapse;border-spacing:0;">
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <img src="${escapeHtml(heroUrl)}" width="760" border="0" alt="Sarbato — planifici mai multe momente frumoase" style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
              </td>
            </tr>
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <img src="${escapeHtml(introUrl)}" width="760" border="0" alt="Bun venit în Sarbato. Evenimentul tău începe aici. Plan Plus — tot ce ai nevoie pentru evenimente reușite, într-un singur loc." style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
              </td>
            </tr>
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <a href="${safeDashboardUrl}" target="_blank" aria-label="Începe organizarea în Sarbato" style="display:block;margin:0;padding:0;border:0;outline:none;text-decoration:none;">
                  <img src="${escapeHtml(ctaUrl)}" width="760" border="0" alt="Începe organizarea" style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
                </a>
              </td>
            </tr>
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <img src="${escapeHtml(featuresUrl)}" width="760" border="0" alt="Plan, oameni, furnizori și ziua evenimentului — toate într-un singur loc" style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
              </td>
            </tr>
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <img src="${escapeHtml(storyUrl)}" width="760" border="0" alt="Momente mai frumoase împreună. Orice eveniment are o poveste frumoasă. Noi te ajutăm să o scrii." style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
              </td>
            </tr>
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <img src="${escapeHtml(footerUrl)}" width="760" border="0" alt="Sarbato — Plan, Oameni, Furnizori, Ziua evenimentului. Mai multe momente care contează." style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
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

function renderProWelcome(
  values: Record<string, string>,
  baseUrl: string,
): RenderedEmail {
  const firstName = (values.firstName ?? "").trim();
  const greeting = firstName ? `Salut, ${firstName}!` : "Salut!";
  const dashboardUrl = absoluteUrl(baseUrl, "/overview");
  const assetUrl = (name: string) =>
    absoluteUrl(baseUrl, `/email-assets/${name}`);
  const heroUrl = assetUrl("welcome-pro-v1-hero.jpg");
  const ctaUrl = assetUrl("welcome-pro-v1-cta.png");
  const journeyUrl = assetUrl("welcome-pro-v1-journey.jpg");
  const footerUrl = assetUrl("welcome-pro-v1-footer.jpg");
  const subject = "Bun venit în Sarbato Pro — totul se leagă";
  const text = `${greeting}\n\nPlanul Pro este activ. De la prima decizie până la ultimul invitat, fiecare detaliu rămâne în același fir.\n\nPlanul tău include până la 500 de invitați, 15 colaboratori, 150 de acțiuni AI, 10 GB de stocare și 100 de credite de mesagerie în fiecare lună. Ai acces la riscuri și planuri de rezervă, check-in, operațiuni în ziua evenimentului și suport prioritar.\n\nPornește organizarea Pro: ${dashboardUrl}\n\nSarbato — Plan · Oameni · Furnizori · Ziua evenimentului`;
  const safeDashboardUrl = escapeHtml(dashboardUrl);

  return {
    subject,
    text,
    html: `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(subject)}</title>
    <style>
      html, body { color-scheme: light only; }
      body { margin: 0 !important; padding: 0 !important; }
      img { border: 0; display: block; height: auto; line-height: 0; margin: 0; max-width: 100%; outline: none; padding: 0; text-decoration: none; vertical-align: top; }
      table { border-collapse: collapse !important; border-spacing: 0 !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      a, a img { border: 0; outline: none; text-decoration: none; }
      .slice-cell { font-size: 0 !important; line-height: 0 !important; mso-line-height-rule: exactly; padding: 0 !important; vertical-align: top; }
      @media only screen and (max-width: 800px) {
        .email-shell { width: 100% !important; }
        .outer-pad { padding: 0 !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f9f8fb;color:#19151d;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      ${escapeHtml(greeting)} Planul Pro este activ. Totul se leagă, iar tu păstrezi controlul.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:0;background:#f9f8fb;border-collapse:collapse;border-spacing:0;">
      <tr>
        <td class="outer-pad" align="center" style="padding:16px 20px 24px;">
          <table role="presentation" class="email-shell" width="760" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:760px;margin:0 auto;padding:0;background:#fffaff;border-collapse:collapse;border-spacing:0;">
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <img src="${escapeHtml(heroUrl)}" width="760" border="0" alt="Sarbato. Bun venit în Sarbato Pro. Totul se leagă, iar tu păstrezi controlul." style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
              </td>
            </tr>
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <a href="${safeDashboardUrl}" target="_blank" aria-label="Pornește organizarea Pro în Sarbato" style="display:block;margin:0;padding:0;border:0;outline:none;text-decoration:none;">
                  <img src="${escapeHtml(ctaUrl)}" width="760" border="0" alt="Pornește organizarea Pro" style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
                </a>
              </td>
            </tr>
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <img src="${escapeHtml(journeyUrl)}" width="760" border="0" alt="500 de invitați, 15 colaboratori, 150 de acțiuni AI, riscuri și planuri de rezervă, check-in și operațiuni live, 100 de credite de mesagerie și suport prioritar." style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
              </td>
            </tr>
            <tr>
              <td class="slice-cell" style="font-size:0;line-height:0;mso-line-height-rule:exactly;padding:0;vertical-align:top;">
                <img src="${escapeHtml(footerUrl)}" width="760" border="0" alt="Sarbato — Plan, Oameni, Furnizori, Ziua evenimentului. Mai multe momente care contează." style="display:block;width:100%;max-width:760px;height:auto;margin:0;padding:0;border:0;outline:none;vertical-align:top;">
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

export function renderSystemEmail(
  command: EmailCommand,
  baseUrl: string,
): RenderedEmail {
  const v = command.values;
  const firstName = v.firstName ?? "";
  if (command.kind === "workspace-plus-welcome")
    return renderPlusWelcome(v, baseUrl);
  if (command.kind === "workspace-pro-welcome")
    return renderProWelcome(v, baseUrl);
  if (command.kind === "email-verification") {
    const url = `${baseUrl}/verify-email?token=${encodeURIComponent(v.token ?? "")}&email=${encodeURIComponent(command.recipient)}`;
    return emailContent(
      "Confirmă adresa de email Sarbato",
      `Salut, ${firstName}. Codul tău este ${v.code ?? ""}. Confirmă contul: ${url}`,
    );
  }
  if (command.kind === "password-reset") {
    const provisioned = v.provisioned === "1" ? "&provisioned=1" : "";
    const url = `${baseUrl}/reset-password?token=${encodeURIComponent(v.token ?? "")}${provisioned}`;
    if (v.provisioned === "1") {
      return emailContent(
        "Activează contul Sarbato",
        `Salut, ${firstName}. Un administrator ți-a creat un cont Sarbato. Alege parola și acceptă termenii folosind linkul: ${url}`,
      );
    }
    return emailContent(
      "Resetează parola Sarbato",
      `Salut, ${firstName}. Resetează parola folosind linkul: ${url}`,
    );
  }
  if (command.kind === "password-changed")
    return emailContent(
      "Parola Sarbato a fost schimbată",
      `Salut, ${firstName}. Parola contului tău a fost schimbată.`,
    );
  if (command.kind === "magic-link") {
    const url = `${baseUrl}/magic-link?token=${encodeURIComponent(v.token ?? "")}`;
    return emailContent(
      "Linkul tău magic Sarbato",
      `Salut, ${firstName}. Conectează-te folosind linkul: ${url}`,
    );
  }
  if (command.kind === "vendor-invitation") {
    const url = `${baseUrl}/vendor-invitation?token=${encodeURIComponent(v.token ?? "")}`;
    return emailContent(
      `Invitație în ${v.organizationName ?? "Vendor OS"}`,
      `Ai fost invitat în organizația ${v.organizationName ?? "Vendor OS"} cu rolul ${v.roleName ?? "colaborator"}. Acceptă invitația: ${url}`,
    );
  }
  if (command.kind === "weekly-digest") {
    const metrics = (() => {
      try {
        return JSON.parse(v.metrics ?? "{}") as {
          planning?: {
            progressPercent?: number;
            overdueTasks?: number;
            nextDeadlines?: number;
          };
          risks?: { high?: number; critical?: number };
        };
      } catch {
        return {};
      }
    })();
    return emailContent(
      `Rezumat săptămânal — ${v.workspaceTitle ?? "Sarbato"}`,
      `Salut, ${firstName}. Progres: ${metrics.planning?.progressPercent ?? 0}%. Taskuri întârziate: ${metrics.planning?.overdueTasks ?? 0}. Deadline-uri în următoarele 7 zile: ${metrics.planning?.nextDeadlines ?? 0}. Riscuri high/critical: ${metrics.risks?.high ?? 0}/${metrics.risks?.critical ?? 0}.`,
    );
  }
  const url = `${baseUrl}/invitation?token=${encodeURIComponent(v.token ?? "")}`;
  return emailContent(
    `Invitație în ${v.workspaceTitle ?? "Sarbato"}`,
    `${v.inviterName ?? "Un colaborator"} te-a invitat în ${v.workspaceTitle ?? "Sarbato"} cu rolul ${v.roleName ?? "colaborator"}. ${url}`,
  );
}

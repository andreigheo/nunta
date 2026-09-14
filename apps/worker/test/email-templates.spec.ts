import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderSystemEmail } from "../src/email-templates";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("Sarbato system email templates", () => {
  it("renders the Plus welcome as an accessible, responsive transactional email", () => {
    const rendered = renderSystemEmail(
      {
        kind: "workspace-plus-welcome",
        recipient: "ana@example.test",
        values: { firstName: "Ana", workspaceTitle: "Conferința anuală" },
      },
      "https://sarbato.space/",
    );

    expect(rendered.subject).toBe(
      "Bun venit în Sarbato Plus — evenimentul tău începe aici",
    );
    expect(rendered.text).toContain("Salut, Ana!");
    expect(rendered.text).toContain("50 de credite de mesagerie");
    expect(rendered.text).toContain("https://sarbato.space/overview");
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-plus-hero-v2.jpg",
    );
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-plus-intro-v2.png",
    );
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-plus-cta-strip-v2.png",
    );
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-plus-features-v2.png",
    );
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-plus-story-v2.jpg",
    );
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-plus-footer-v2.jpg",
    );
    expect(rendered.html).toContain('href="https://sarbato.space/overview"');
    expect(rendered.html).toContain('width="760"');
    expect(rendered.html).toContain("mso-line-height-rule:exactly");
    expect(rendered.html).toContain(".outer-pad { padding: 0 !important; }");
    expect(rendered.html).toContain("vertical-align:top");
    expect(rendered.html).not.toContain("cid:");
    expect(rendered.html).toContain('lang="ro"');
    expect(rendered.html).toContain('name="viewport"');
  });

  it("ships every public image referenced by the Plus welcome", () => {
    const rendered = renderSystemEmail(
      {
        kind: "workspace-plus-welcome",
        recipient: "ana@example.test",
        values: { firstName: "Ana" },
      },
      "https://sarbato.space",
    );
    const assetNames = Array.from(
      rendered.html.matchAll(/\/email-assets\/([^"?]+)/g),
      (match) => match[1],
    );

    expect(assetNames).toHaveLength(6);
    let totalAssetBytes = 0;
    for (const assetName of assetNames) {
      const asset = statSync(
        resolve(repositoryRoot, "public", "email-assets", assetName ?? ""),
      );
      expect(asset.isFile()).toBe(true);
      expect(asset.size).toBeGreaterThan(10_000);
      totalAssetBytes += asset.size;
    }
    expect(totalAssetBytes).toBeLessThan(600_000);
  });

  it("renders the approved Pro welcome concept with a working CTA", () => {
    const rendered = renderSystemEmail(
      {
        kind: "workspace-pro-welcome",
        recipient: "ana@example.test",
        values: { firstName: "Ana", workspaceTitle: "Conferința anuală" },
      },
      "https://sarbato.space/",
    );

    expect(rendered.subject).toBe("Bun venit în Sarbato Pro — totul se leagă");
    expect(rendered.text).toContain("Salut, Ana!");
    expect(rendered.text).toContain("invitați fără limită");
    expect(rendered.text).toContain("acțiuni AI fără limită");
    expect(rendered.text).toContain("100 de credite de mesagerie");
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-pro-v1-hero.jpg",
    );
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-pro-v1-cta.png",
    );
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-pro-v2-journey.jpg",
    );
    expect(rendered.html).toContain(
      "https://sarbato.space/email-assets/welcome-pro-v1-footer.jpg",
    );
    expect(rendered.html).toContain('href="https://sarbato.space/overview"');
    expect(rendered.html).toContain('width="760"');
    expect(rendered.html).not.toContain("cid:");
  });

  it("ships a lightweight asset set for the Pro welcome", () => {
    const rendered = renderSystemEmail(
      {
        kind: "workspace-pro-welcome",
        recipient: "ana@example.test",
        values: { firstName: "Ana" },
      },
      "https://sarbato.space",
    );
    const assetNames = Array.from(
      rendered.html.matchAll(/\/email-assets\/([^"?]+)/g),
      (match) => match[1],
    );

    expect(assetNames).toHaveLength(4);
    let totalAssetBytes = 0;
    for (const assetName of assetNames) {
      const asset = statSync(
        resolve(repositoryRoot, "public", "email-assets", assetName ?? ""),
      );
      expect(asset.isFile()).toBe(true);
      expect(asset.size).toBeGreaterThan(10_000);
      totalAssetBytes += asset.size;
    }
    expect(totalAssetBytes).toBeLessThan(400_000);
  });

  it("escapes personalized content and does not duplicate URL separators", () => {
    const rendered = renderSystemEmail(
      {
        kind: "workspace-plus-welcome",
        recipient: "ana@example.test",
        values: { firstName: '<Ana & "Mihai">' },
      },
      "https://sarbato.space/",
    );

    expect(rendered.html).toContain("&lt;Ana &amp; &quot;Mihai&quot;&gt;");
    expect(rendered.html).not.toContain('<Ana & "Mihai">');
    expect(rendered.html).not.toContain("sarbato.space//");
  });

  it("preserves the existing verification email contract", () => {
    const rendered = renderSystemEmail(
      {
        kind: "email-verification",
        recipient: "ana@example.test",
        values: { firstName: "Ana", token: "token", code: "123456" },
      },
      "https://sarbato.space",
    );

    expect(rendered.subject).toBe("Confirmă adresa de email Sarbato");
    expect(rendered.text).toContain("Codul tău este 123456");
    expect(rendered.text).toContain(
      "https://sarbato.space/verify-email?token=token&email=ana%40example.test",
    );
  });
});

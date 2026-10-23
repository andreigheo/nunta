import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetupGuide } from "./setup-guide";

describe("first-run dashboard guidance", () => {
  it("places the next action before the collapsed checklist instead of below five cards", () => {
    const steps = [
      {
        label: "Detaliile evenimentului",
        description: "Tip, dată și locație",
        complete: false,
        href: "/onboarding",
        action: "Completează detaliile",
      },
      {
        label: "Bugetul",
        description: "Țintă și costuri",
        complete: true,
        href: "/budget",
        action: "Configurează bugetul",
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(SetupGuide, {
        steps,
        nextStep: steps[0]!,
        onNavigate: () => undefined,
      }),
    );
    expect(html.indexOf("Completează detaliile")).toBeLessThan(
      html.indexOf("<details"),
    );
    expect(html).not.toContain("<details open");
    expect(html).toContain("1 din 2 repere pregătite");
    expect(html).not.toContain("Publică invitația");
  });
});

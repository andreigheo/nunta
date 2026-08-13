import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublishedInvitation } from "./published-invitation";

describe("PublishedInvitation", () => {
  it("never replaces an empty published document with demonstrative content", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PublishedInvitation, {
        invitation: { document: { sections: [] }, settings: {} },
        token: "guest-token",
        onAddCalendar: () => undefined,
      }),
    );

    expect(markup).toContain("Invitația nu are încă secțiuni vizibile");
    expect(markup).not.toContain("Ana &amp; Mihai");
  });
});

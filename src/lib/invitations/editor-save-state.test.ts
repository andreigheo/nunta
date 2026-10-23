import { describe, expect, it } from "vitest";
import { invitationSaveState } from "./editor-save-state";

describe("invitation persistence status", () => {
  it("does not claim server persistence just because a new draft is untouched", () => {
    expect(
      invitationSaveState({ saving: false, dirty: false, persisted: false })
        .label,
    ).toBe("Ciornă nouă");
    expect(
      invitationSaveState({ saving: false, dirty: false, persisted: true })
        .label,
    ).toBe("Salvat pe server");
  });
  it("keeps local edits and failed saves distinct from the last persisted version", () => {
    expect(
      invitationSaveState({ saving: false, dirty: true, persisted: true })
        .label,
    ).toBe("Nesalvat");
    expect(
      invitationSaveState({ saving: true, dirty: true, persisted: false })
        .label,
    ).toBe("Se salvează");
    expect(
      invitationSaveState({
        saving: false,
        dirty: true,
        persisted: true,
        failure: { kind: "offline", message: "Conexiune pierdută" },
      }).label,
    ).toBe("Offline");
  });
});

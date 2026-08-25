import { describe, expect, it } from "vitest";
import {
  commitInvitationHistory,
  createInvitationHistory,
  invitationContentCoalesceKey,
  invitationHistoryCoalesceWindowMs,
  invitationHistoryLimit,
  invitationRecordCoalesceKey,
  redoInvitationHistory,
  undoInvitationHistory,
} from "./editor-history";
import type { InvitationEditorSnapshot } from "./editor-model";

function snapshotWithNames(names: string): InvitationEditorSnapshot {
  return { sections: [], design: {}, experience: { names } } as unknown as
    InvitationEditorSnapshot;
}

describe("invitation editor history", () => {
  it("collapses continuous typing in one field into a single undo step", () => {
    const key = invitationContentCoalesceKey("hero", "names");
    const start = snapshotWithNames("");
    let state = commitInvitationHistory(
      createInvitationHistory(),
      start,
      key,
      1_000,
    );
    state = commitInvitationHistory(state, snapshotWithNames("A"), key, 1_090);
    state = commitInvitationHistory(state, snapshotWithNames("An"), key, 1_180);
    state = commitInvitationHistory(state, snapshotWithNames("Ana"), key, 1_270);

    expect(state.past).toHaveLength(1);

    const undone = undoInvitationHistory(state, snapshotWithNames("Ana &"));
    expect(undone?.snapshot).toBe(start);
    expect(undone?.state.past).toHaveLength(0);
  });

  it("opens a new undo step after a pause or when the field changes", () => {
    const names = invitationContentCoalesceKey("hero", "names");
    const date = invitationContentCoalesceKey("hero", "date");
    let state = commitInvitationHistory(
      createInvitationHistory(),
      snapshotWithNames("a"),
      names,
      1_000,
    );

    state = commitInvitationHistory(
      state,
      snapshotWithNames("ab"),
      names,
      1_000 + invitationHistoryCoalesceWindowMs,
    );
    expect(state.past).toHaveLength(2);

    state = commitInvitationHistory(state, snapshotWithNames("abc"), date, 1_700);
    expect(state.past).toHaveLength(3);

    state = commitInvitationHistory(state, snapshotWithNames("abcd"), null, 1_750);
    expect(state.past).toHaveLength(4);
    expect(state.openGroup).toBeNull();
  });

  it("never coalesces structural edits that pass no key", () => {
    let state = createInvitationHistory();
    for (let index = 0; index < 4; index += 1)
      state = commitInvitationHistory(
        state,
        snapshotWithNames(String(index)),
        null,
        2_000,
      );
    expect(state.past).toHaveLength(4);
  });

  it("moves snapshots between past and future and closes the open group", () => {
    const key = invitationContentCoalesceKey("story", "body");
    const first = snapshotWithNames("first");
    const second = snapshotWithNames("second");
    const current = snapshotWithNames("current");
    let state = commitInvitationHistory(createInvitationHistory(), first, key, 10);
    state = commitInvitationHistory(state, second, key, 5_000);

    const undone = undoInvitationHistory(state, current);
    expect(undone?.snapshot).toBe(second);
    expect(undone?.state.future).toEqual([current]);
    expect(undone?.state.openGroup).toBeNull();

    const redone = redoInvitationHistory(undone!.state, second);
    expect(redone?.snapshot).toBe(current);
    expect(redone?.state.future).toHaveLength(0);
    expect(redone?.state.past).toEqual([first, second]);
  });

  it("reports nothing to undo or redo on an untouched history", () => {
    const state = createInvitationHistory();
    expect(undoInvitationHistory(state, snapshotWithNames("x"))).toBeNull();
    expect(redoInvitationHistory(state, snapshotWithNames("x"))).toBeNull();
  });

  it("drops the oldest steps once the limit is reached", () => {
    let state = createInvitationHistory();
    for (let index = 0; index < invitationHistoryLimit + 10; index += 1)
      state = commitInvitationHistory(
        state,
        snapshotWithNames(String(index)),
        null,
        index,
      );
    expect(state.past).toHaveLength(invitationHistoryLimit);
    expect(state.past[0]).toEqual(snapshotWithNames("10"));
  });

  it("discards the redo stack when a new edit is committed", () => {
    const key = invitationContentCoalesceKey("hero", "names");
    let state = commitInvitationHistory(
      createInvitationHistory(),
      snapshotWithNames("a"),
      key,
      100,
    );
    const undone = undoInvitationHistory(state, snapshotWithNames("ab"));
    expect(undone?.state.future).toHaveLength(1);

    state = commitInvitationHistory(
      undone!.state,
      snapshotWithNames("c"),
      key,
      9_000,
    );
    expect(state.future).toHaveLength(0);
  });

  it("keys record updates by their changed fields regardless of order", () => {
    expect(
      invitationRecordCoalesceKey("design", { accent: "#000", text: "#fff" }),
    ).toBe(invitationRecordCoalesceKey("design", { text: "#fff", accent: "#000" }));
    expect(invitationRecordCoalesceKey("design", { accent: "#000" })).not.toBe(
      invitationRecordCoalesceKey("experience", { accent: "#000" }),
    );
  });
});

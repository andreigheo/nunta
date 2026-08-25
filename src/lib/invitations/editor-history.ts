import type { InvitationEditorSnapshot } from "./editor-model";

export const invitationHistoryLimit = 100;

/**
 * Consecutive edits to the same field collapse into one undo step while the
 * user keeps typing or dragging. A pause longer than this closes the group.
 */
export const invitationHistoryCoalesceWindowMs = 600;

export type InvitationHistoryState = {
  past: InvitationEditorSnapshot[];
  future: InvitationEditorSnapshot[];
  openGroup: { key: string; at: number } | null;
};

export function createInvitationHistory(): InvitationHistoryState {
  return { past: [], future: [], openGroup: null };
}

export function commitInvitationHistory(
  state: InvitationHistoryState,
  previous: InvitationEditorSnapshot,
  coalesceKey: string | null,
  now: number,
): InvitationHistoryState {
  const continuesGroup =
    coalesceKey !== null &&
    state.openGroup !== null &&
    state.openGroup.key === coalesceKey &&
    now - state.openGroup.at < invitationHistoryCoalesceWindowMs;
  return {
    past: continuesGroup
      ? state.past
      : [...state.past, previous].slice(-invitationHistoryLimit),
    future: [],
    openGroup: coalesceKey === null ? null : { key: coalesceKey, at: now },
  };
}

export function undoInvitationHistory(
  state: InvitationHistoryState,
  current: InvitationEditorSnapshot,
): { state: InvitationHistoryState; snapshot: InvitationEditorSnapshot } | null {
  const previous = state.past.at(-1);
  if (!previous) return null;
  return {
    state: {
      past: state.past.slice(0, -1),
      future: [current, ...state.future].slice(0, invitationHistoryLimit),
      openGroup: null,
    },
    snapshot: previous,
  };
}

export function redoInvitationHistory(
  state: InvitationHistoryState,
  current: InvitationEditorSnapshot,
): { state: InvitationHistoryState; snapshot: InvitationEditorSnapshot } | null {
  const next = state.future[0];
  if (!next) return null;
  return {
    state: {
      past: [...state.past, current].slice(-invitationHistoryLimit),
      future: state.future.slice(1),
      openGroup: null,
    },
    snapshot: next,
  };
}

export function invitationContentCoalesceKey(sectionId: string, key: string) {
  return `content:${sectionId}:${key}`;
}

export function invitationRecordCoalesceKey(
  scope: string,
  values: Record<string, unknown>,
) {
  return `${scope}:${Object.keys(values).sort().join(",")}`;
}

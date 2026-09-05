import {
  serializeSnapshot,
  snapshotFromPersisted,
  type InvitationEditorProfile,
  type InvitationEditorSnapshot,
} from "./editor-model";
import { invitationRecoveryStoragePrefix } from "./editor-recovery-key";

export { invitationRecoveryStoragePrefix } from "./editor-recovery-key";
export const invitationRecoveryTtlMs = 7 * 24 * 60 * 60 * 1000;

type InvitationRecoveryEnvelope = {
  version: 1;
  savedAt: number;
  expiresAt: number;
  document: ReturnType<typeof serializeSnapshot>["document"];
  settings: ReturnType<typeof serializeSnapshot>["settings"];
};

export function invitationRecoveryKey(userId: string, workspaceId: string) {
  return `${invitationRecoveryStoragePrefix}${userId}.${workspaceId}`;
}

export function writeInvitationRecovery(
  storage: Pick<Storage, "setItem">,
  key: string,
  snapshot: InvitationEditorSnapshot,
  now = Date.now(),
) {
  const serialized = serializeSnapshot(snapshot);
  const envelope: InvitationRecoveryEnvelope = {
    version: 1,
    savedAt: now,
    expiresAt: now + invitationRecoveryTtlMs,
    ...serialized,
  };
  storage.setItem(key, JSON.stringify(envelope));
}

export function readInvitationRecovery(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  fallbackProfile: InvitationEditorProfile,
  now = Date.now(),
): { snapshot: InvitationEditorSnapshot; savedAt: number } | null {
  const raw = storage.getItem(key);
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const value = JSON.parse(raw) as Partial<InvitationRecoveryEnvelope>;
    if (
      value.version !== 1 ||
      typeof value.savedAt !== "number" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= now ||
      !value.document ||
      !Array.isArray(value.document.sections) ||
      value.document.sections.length === 0 ||
      value.document.sections.length > 50 ||
      !value.settings ||
      typeof value.settings !== "object"
    ) {
      storage.removeItem(key);
      return null;
    }
    return {
      savedAt: value.savedAt,
      snapshot: snapshotFromPersisted(
        value.document.sections,
        value.settings,
        fallbackProfile,
      ),
    };
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function clearInvitationRecovery(
  storage: Pick<Storage, "removeItem">,
  key: string,
) {
  storage.removeItem(key);
}

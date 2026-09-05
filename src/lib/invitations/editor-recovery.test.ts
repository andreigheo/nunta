import { describe, expect, it } from "vitest";
import { createInitialSnapshot } from "./editor-model";
import {
  invitationRecoveryKey,
  invitationRecoveryTtlMs,
  readInvitationRecovery,
  writeInvitationRecovery,
} from "./editor-recovery";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("invitation editor recovery", () => {
  it("stores only the serialized invitation and restores it for the same scope", () => {
    const storage = memoryStorage();
    const key = invitationRecoveryKey("user-1", "workspace-1");
    const snapshot = createInitialSnapshot({
      eventType: "conference",
      title: "Sarbato Summit",
    });
    snapshot.sections[0].content.names = "Titlu recuperat";

    writeInvitationRecovery(storage, key, snapshot, 1_000);
    const recovered = readInvitationRecovery(
      storage,
      key,
      snapshot.profile,
      2_000,
    );

    expect(recovered?.snapshot.sections[0].content.names).toBe(
      "Titlu recuperat",
    );
    expect(recovered?.snapshot.profile.eventType).toBe("conference");
  });

  it("deletes expired recovery data", () => {
    const storage = memoryStorage();
    const key = invitationRecoveryKey("user-1", "workspace-1");
    const snapshot = createInitialSnapshot();
    writeInvitationRecovery(storage, key, snapshot, 1_000);

    expect(
      readInvitationRecovery(
        storage,
        key,
        snapshot.profile,
        1_000 + invitationRecoveryTtlMs + 1,
      ),
    ).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });
});

-- A guest reference must belong to the same workspace as its message data.
-- The primary key alone cannot express that tenant invariant.
CREATE UNIQUE INDEX IF NOT EXISTS guests_id_workspace_id_key
ON guests(id, workspace_id);

ALTER TABLE guest_message_consents
  DROP CONSTRAINT guest_message_consents_guest_id_fkey,
  ADD CONSTRAINT guest_message_consents_guest_workspace_fkey
    FOREIGN KEY (guest_id, workspace_id)
    REFERENCES guests(id, workspace_id)
    ON DELETE CASCADE;

ALTER TABLE guest_messages
  DROP CONSTRAINT guest_messages_guest_id_fkey,
  ADD CONSTRAINT guest_messages_guest_workspace_fkey
    FOREIGN KEY (guest_id, workspace_id)
    REFERENCES guests(id, workspace_id)
    ON DELETE CASCADE;

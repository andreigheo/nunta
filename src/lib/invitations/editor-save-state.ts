export function invitationSaveState(input: {
  saving: boolean;
  dirty: boolean;
  persisted: boolean;
  failure?: { kind: string; message: string } | null;
}) {
  if (input.saving)
    return {
      label: "Se salvează",
      message: "Se salvează invitația",
      tone: "info" as const,
    };
  if (input.failure)
    return {
      label:
        input.failure.kind === "offline"
          ? "Offline"
          : input.failure.kind === "conflict"
            ? "Conflict"
            : "Eroare salvare",
      message: `Invitația are o problemă de salvare: ${input.failure.message}`,
      tone: "danger" as const,
    };
  if (input.dirty)
    return {
      label: "Nesalvat",
      message: "Invitația are modificări nesalvate",
      tone: "warning" as const,
    };
  if (!input.persisted)
    return {
      label: "Ciornă nouă",
      message: "Ciorna nouă nu este încă salvată pe server",
      tone: "neutral" as const,
    };
  return {
    label: "Salvat pe server",
    message: "Invitația este salvată pe server",
    tone: "success" as const,
  };
}

const internalStatusLabels: Record<string, string> = {
  not_started: "neînceput",
  in_progress: "în desfășurare",
  partially_responded: "răspuns parțial",
  completed: "finalizat",
  cancelled: "anulat",
  archived: "arhivat",
  pending: "în așteptare",
  queued: "în așteptare",
  ready_for_review: "pregătit pentru verificare",
};

export function formatCopilotAnswerForDisplay(value: string) {
  const withoutBoilerplate = value
    .split("\n")
    .filter((line) => !/^\s*(?:atenție|atentie|ipoteze)\s*:/iu.test(line))
    .join("\n");
  return Object.entries(internalStatusLabels)
    .reduce(
      (text, [status, label]) =>
        text.replace(
          new RegExp(`(?<![\\p{L}\\p{N}_])${status}(?![\\p{L}\\p{N}_])`, "giu"),
          label,
        ),
      withoutBoilerplate,
    )
    .trim();
}

export function isCopilotAutoExecutable(
  proposals: Array<{ riskLevel: string }>,
  hasPlan: boolean,
) {
  return (
    !hasPlan &&
    proposals.length === 1 &&
    ["low", "medium"].includes(proposals[0]!.riskLevel)
  );
}

export function formatCopilotMachineValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase("ro-RO");
  const labels: Record<string, string> = {
    active: "Activ",
    inactive: "Inactiv",
    draft: "Ciornă",
    published: "Publicat",
    not_started: "Neînceput",
    in_progress: "În desfășurare",
    completed: "Finalizat",
    cancelled: "Anulat",
    archived: "Arhivat",
    pending: "În așteptare",
    queued: "În așteptare",
    low: "Scăzut",
    medium: "Mediu",
    high: "Ridicat",
    critical: "Critic",
  };
  return labels[normalized] ?? value;
}

export function copilotResourceLabel(value: string) {
  const labels: Record<string, string> = {
    BudgetSummary: "Buget",
    BudgetCategory: "Categorie de buget",
    BudgetItem: "Element de buget",
    ExpenseRecord: "Cheltuială",
    PlanningPhase: "Fază de planificare",
    TimelineMilestone: "Reper",
    CalendarEvent: "Eveniment din calendar",
    Task: "Sarcină",
    Risk: "Risc",
    GuestSummary: "Invitați",
    Household: "Gospodărie",
    Guest: "Invitat",
    InvitationSite: "Invitație",
    CampaignSummary: "Campanie",
  };
  return labels[value] ?? value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

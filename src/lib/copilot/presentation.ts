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
  // A generated proposal is never proof that the user intended to mutate data.
  // Keep the fast review action in the UI, but require explicit approval.
  void proposals;
  void hasPlan;
  return false;
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
    Household: "Grup de invitați",
    Guest: "Invitat",
    InvitationSite: "Invitație",
    CampaignSummary: "Campanie",
  };
  return labels[value] ?? value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function copilotResourceHref(resourceType: string, resourceId: string) {
  const routes: Record<string, string> = {
    BudgetSummary: "/budget",
    BudgetCategory: "/budget",
    BudgetItem: "/budget",
    ExpenseRecord: "/expenses",
    PlanningPhase: "/timeline",
    TimelineMilestone: "/timeline",
    CalendarEvent: "/calendar",
    Task: `/plan?task=${encodeURIComponent(resourceId)}`,
    Risk: "/risks",
    GuestSummary: "/guests",
    Household: "/guests",
    Guest: `/guests?guest=${encodeURIComponent(resourceId)}`,
    InvitationSite: "/invitations",
    CampaignSummary: "/invitations",
  };
  return routes[resourceType] ?? null;
}

import { describe, expect, it } from "vitest";
import {
  formatCopilotAnswerForDisplay,
  formatCopilotMachineValue,
  isCopilotAutoExecutable,
} from "./presentation";

describe("Copilot presentation", () => {
  it("translates internal statuses and removes generic metadata blocks", () => {
    expect(
      formatCopilotAnswerForDisplay(
        'Toate fazele sunt "not_started", iar campania este completed.\n\nAtenție: datele private au fost excluse.\nIpoteze: context autorizat.',
      ),
    ).toBe(
      'Toate fazele sunt "neînceput", iar campania este finalizat.',
    );
  });

  it("auto-applies only one safe atomic proposal", () => {
    expect(isCopilotAutoExecutable([{ riskLevel: "medium" }], false)).toBe(
      true,
    );
    expect(isCopilotAutoExecutable([{ riskLevel: "high" }], false)).toBe(
      false,
    );
    expect(
      isCopilotAutoExecutable(
        [{ riskLevel: "low" }, { riskLevel: "low" }],
        true,
      ),
    ).toBe(false);
  });

  it("humanizes structured values without changing normal copy", () => {
    expect(formatCopilotMachineValue("NOT_STARTED")).toBe("Neînceput");
    expect(formatCopilotMachineValue("ACTIVE")).toBe("Activ");
    expect(formatCopilotMachineValue("Flori albe")).toBe("Flori albe");
  });

  it("keeps normal event-planning text intact", () => {
    expect(
      formatCopilotAnswerForDisplay(
        "Bugetul este 181.000 RON și următorul termen este mâine.",
      ),
    ).toBe("Bugetul este 181.000 RON și următorul termen este mâine.");
  });
});

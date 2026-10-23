import { describe, expect, it } from "vitest";
import { guestSideLabels, initialRsvpQuestions } from "./event-copy";

describe("occasion-specific guest and RSVP copy", () => {
  it("preserves wedding side values while giving corporate events neutral labels", () => {
    expect(guestSideLabels("wedding").PARTNER_ONE).toBe("Partener 1");
    expect(guestSideLabels("corporate")).toMatchObject({PARTNER_ONE:"Organizator",PARTNER_TWO:"Coorganizator"});
    expect(Object.keys(guestSideLabels("corporate"))).toEqual(Object.keys(guestSideLabels("wedding")));
  });
  it("starts corporate forms without family or optional logistics questions", () => {
    expect(initialRsvpQuestions("corporate")).toMatchObject({plusOneQuestion:false,childrenConfirmation:false,menuSelection:false,transportQuestion:false,accommodationQuestion:false,accessibilityCollection:true});
    expect(initialRsvpQuestions("wedding").childrenConfirmation).toBe(true);
  });
});

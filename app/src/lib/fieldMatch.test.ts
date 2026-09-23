import { describe, expect, it } from "vitest";
import {
  containsValue,
  containsValueNearLabel,
  matchesCgpa,
  matchesName,
  matchesPan,
  normalizeForMatch,
} from "./fieldMatch";

describe("normalizeForMatch", () => {
  it("keeps dots, which carry meaning in a CGPA", () => {
    expect(normalizeForMatch("CGPA: 9.1")).toBe("cgpa 9.1");
  });

  it("collapses punctuation and whitespace to single spaces", () => {
    expect(normalizeForMatch("Name :   ABHISHEK   K.")).toBe("name abhishek k.");
  });
});

describe("containsValue", () => {
  it("matches a whole value", () => {
    expect(containsValue(["Name: Abhishek K"], "Abhishek K")).toBe(true);
  });

  it("tolerates irregular spacing from PDF extraction", () => {
    expect(containsValue(["Name:  Abhishek    K"], "Abhishek K")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(containsValue(["NAME: ABHISHEK"], "abhishek")).toBe(true);
  });

  it("does not match a value embedded in a longer number", () => {
    // The bug this replaces: "9.1".includes-style matching hit "19.15".
    expect(containsValue(["Marks: 19.15"], "9.1")).toBe(false);
  });

  it("does not match a name embedded in a longer word", () => {
    expect(containsValue(["Course: Abhisheka Studies"], "Abhishek")).toBe(false);
  });

  it("searches every page", () => {
    expect(containsValue(["cover page", "Name: Abhishek"], "Abhishek")).toBe(true);
  });

  it("rejects an empty value rather than matching everything", () => {
    expect(containsValue(["anything"], "")).toBe(false);
    expect(containsValue(["anything"], "   ")).toBe(false);
  });
});

describe("containsValueNearLabel", () => {
  const page = ["Permanent Account Number: ABCDE1234F   Issued by Income Tax"];

  it("matches a value next to its label", () => {
    expect(containsValueNearLabel(page, "ABCDE1234F", ["permanent account number"])).toBe(true);
  });

  it("ignores the value when it is far from the label", () => {
    const far = ["PAN: " + "x".repeat(200) + " ABCDE1234F"];
    expect(containsValueNearLabel(far, "ABCDE1234F", ["pan"])).toBe(false);
  });

  it("tries every occurrence of the label", () => {
    const repeated = ["PAN: WRONG0000X and later PAN: ABCDE1234F"];
    expect(containsValueNearLabel(repeated, "ABCDE1234F", ["pan"])).toBe(true);
  });
});

describe("matchesPan", () => {
  it("accepts a PAN beside its label", () => {
    expect(matchesPan(["PAN: ABCDE1234F"], "ABCDE1234F")).toBe(true);
  });

  it("rejects a PAN-shaped token with no PAN label", () => {
    expect(matchesPan(["Reference code ABCDE1234F"], "ABCDE1234F")).toBe(false);
  });
});

describe("matchesCgpa", () => {
  it("accepts a CGPA beside its label", () => {
    expect(matchesCgpa(["CGPA: 9.1"], "9.1")).toBe(true);
  });

  it("accepts the GPA spelling", () => {
    expect(matchesCgpa(["Grade Point Average 8.75"], "8.75")).toBe(true);
  });

  it("rejects a bare number elsewhere in the document", () => {
    expect(matchesCgpa(["Total marks 9.1 out of 10"], "9.1")).toBe(false);
  });

  it("rejects a CGPA that is a prefix of the printed value", () => {
    expect(matchesCgpa(["CGPA: 9.15"], "9.1")).toBe(false);
  });
});

describe("matchesName", () => {
  it("rejects a name that only appears as part of another word", () => {
    expect(matchesName(["Examiner: Abhishekan"], "Abhishek")).toBe(false);
  });
});

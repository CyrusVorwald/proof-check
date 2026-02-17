import { describe, expect, it } from "vitest";
import {
  checkGovernmentWarningCompliance,
  compareFields,
  normalizeAddress,
  parseAlcoholContent,
} from "./comparison.server";
import { STANDARD_GOV_WARNING } from "./constants";
import type { ApplicationData, ExtractedLabel } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExtractedLabel(overrides: Partial<ExtractedLabel> = {}): ExtractedLabel {
  return {
    brandName: null,
    classType: null,
    alcoholContent: null,
    netContents: null,
    producerName: null,
    producerAddress: null,
    countryOfOrigin: null,
    governmentWarning: null,
    governmentWarningAllCaps: null,
    governmentWarningBold: null,
    beverageType: "beer",
    isAlcoholLabel: true,
    imageQuality: "good",
    confidence: 0.95,
    notes: [],
    ...overrides,
  };
}

function makeApplicationData(overrides: Partial<ApplicationData> = {}): ApplicationData {
  return {
    brandName: "",
    classType: "",
    alcoholContent: "",
    netContents: "",
    producerName: "",
    producerAddress: "",
    countryOfOrigin: "",
    governmentWarning: "",
    beverageType: "" as ApplicationData["beverageType"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseAlcoholContent
// ---------------------------------------------------------------------------

describe("parseAlcoholContent", () => {
  it("parses combined ABV + Proof format", () => {
    const result = parseAlcoholContent("40% Alc./Vol. (80 Proof)");
    expect(result.abv).toBe(40);
    expect(result.proof).toBe(80);
    expect(result.inferredFromBareNumber).toBe(false);
  });

  it("parses proof-only format and derives ABV", () => {
    const result = parseAlcoholContent("80 Proof");
    expect(result.abv).toBe(40);
    expect(result.proof).toBe(80);
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.notes[0].level).toBe("info");
  });

  it("parses percent ABV format", () => {
    const result = parseAlcoholContent("5.5% ABV");
    expect(result.abv).toBe(5.5);
    expect(result.proof).toBeNull();
  });

  it("parses bare number", () => {
    const result = parseAlcoholContent("40");
    expect(result.abv).toBe(40);
    expect(result.inferredFromBareNumber).toBe(true);
    expect(result.notes[0].level).toBe("caution");
  });

  it("returns null ABV for unparseable text", () => {
    const result = parseAlcoholContent("unknown format xyz");
    expect(result.abv).toBeNull();
    expect(result.proof).toBeNull();
  });

  it("flags mismatched proof / ABV", () => {
    const result = parseAlcoholContent("40% Alc./Vol. (90 Proof)");
    expect(result.abv).toBe(40);
    expect(result.proof).toBe(90);
    expect(result.notes.some((n) => n.level === "caution")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (parseNetContents removed — net contents uses text comparison only)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// normalizeAddress
// ---------------------------------------------------------------------------

describe("normalizeAddress", () => {
  it("expands common abbreviations", () => {
    expect(normalizeAddress("123 Main St")).toBe("123 main street");
    expect(normalizeAddress("456 Oak Ave")).toBe("456 oak avenue");
    expect(normalizeAddress("789 Sunset Blvd")).toBe("789 sunset boulevard");
  });

  it("strips punctuation and normalizes whitespace", () => {
    expect(normalizeAddress("123 Main St., Suite 100")).toBe("123 main street suite 100");
  });

  it("handles directional abbreviations", () => {
    expect(normalizeAddress("100 N Main St")).toBe("100 north main street");
  });
});

// ---------------------------------------------------------------------------
// checkGovernmentWarningCompliance
// ---------------------------------------------------------------------------

describe("checkGovernmentWarningCompliance", () => {
  it("returns match for standard text with correct formatting", () => {
    const extracted = makeExtractedLabel({
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: true,
      governmentWarningBold: true,
    });
    const result = checkGovernmentWarningCompliance(extracted);
    expect(result.textMatch).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns issues when warning is missing", () => {
    const extracted = makeExtractedLabel({ governmentWarning: null });
    const result = checkGovernmentWarningCompliance(extracted);
    expect(result.textMatch).toBe(false);
    expect(result.issues).toContain("Government warning not found on label");
  });

  it("flags ALL CAPS issues", () => {
    const extracted = makeExtractedLabel({
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: false,
      governmentWarningBold: true,
    });
    const result = checkGovernmentWarningCompliance(extracted);
    expect(result.issues.some((i) => i.includes("ALL CAPS"))).toBe(true);
  });

  it("flags bold issues with manual verification caveat", () => {
    const extracted = makeExtractedLabel({
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: true,
      governmentWarningBold: false,
    });
    const result = checkGovernmentWarningCompliance(extracted);
    expect(result.issues.some((i) => i.includes("bold"))).toBe(true);
    expect(result.issues.some((i) => i.includes("verify manually"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compareFields — brand name
// ---------------------------------------------------------------------------

describe("compareFields — brand name", () => {
  it("matches exact brand name", () => {
    const app = makeApplicationData({ brandName: "OLD TOM DISTILLERY" });
    const label = makeExtractedLabel({ brandName: "OLD TOM DISTILLERY" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "brandName");
    expect(field?.status).toBe("match");
  });

  it("warns on case difference", () => {
    const app = makeApplicationData({ brandName: "Stone's Throw" });
    const label = makeExtractedLabel({ brandName: "STONE'S THROW" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "brandName");
    expect(field?.status).toBe("warning");
  });

  it("warns on partial match", () => {
    const app = makeApplicationData({ brandName: "Old Tom" });
    const label = makeExtractedLabel({ brandName: "Old Tom Distillery" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "brandName");
    expect(field?.status).toBe("warning");
  });

  it("mismatches completely different names", () => {
    const app = makeApplicationData({ brandName: "Sunrise Wines" });
    const label = makeExtractedLabel({ brandName: "Moonlight Spirits" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "brandName");
    expect(field?.status).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// compareFields — alcohol content (cross-format)
// ---------------------------------------------------------------------------

describe("compareFields — alcohol content", () => {
  it("matches ABV to Proof cross-format", () => {
    const app = makeApplicationData({ alcoholContent: "80 Proof" });
    const label = makeExtractedLabel({
      alcoholContent: "40% Alc./Vol. (80 Proof)",
    });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "alcoholContent");
    expect(field?.status).toBe("match");
  });

  it("mismatches different ABV values", () => {
    const app = makeApplicationData({ alcoholContent: "5% ABV" });
    const label = makeExtractedLabel({ alcoholContent: "12% ABV" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "alcoholContent");
    expect(field?.status).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// compareFields — net contents (text comparison)
// ---------------------------------------------------------------------------

describe("compareFields — net contents", () => {
  it("matches identical net contents", () => {
    const app = makeApplicationData({ netContents: "750 mL" });
    const label = makeExtractedLabel({ netContents: "750 mL" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "netContents");
    expect(field?.status).toBe("match");
  });

  it("matches case-insensitively", () => {
    const app = makeApplicationData({ netContents: "12 FL OZ" });
    const label = makeExtractedLabel({ netContents: "12 fl oz" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "netContents");
    expect(field?.status).toBe("match");
  });

  it("mismatches different volumes", () => {
    const app = makeApplicationData({ netContents: "375 mL" });
    const label = makeExtractedLabel({ netContents: "750 mL" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "netContents");
    expect(field?.status).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// compareFields — country of origin
// ---------------------------------------------------------------------------

describe("compareFields — country of origin", () => {
  it('extracts country from "Product of France"', () => {
    const app = makeApplicationData({ countryOfOrigin: "France" });
    const label = makeExtractedLabel({
      countryOfOrigin: "Product of France",
    });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "countryOfOrigin");
    expect(field?.status).toBe("match");
  });

  it("mismatches different countries", () => {
    const app = makeApplicationData({ countryOfOrigin: "USA" });
    const label = makeExtractedLabel({ countryOfOrigin: "Scotland" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "countryOfOrigin");
    expect(field?.status).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// compareFields — government warning
// ---------------------------------------------------------------------------

describe("compareFields — government warning", () => {
  it("matches exact text with correct formatting", () => {
    const app = makeApplicationData({
      governmentWarning: STANDARD_GOV_WARNING,
    });
    const label = makeExtractedLabel({
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: true,
      governmentWarningBold: true,
    });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "governmentWarning");
    expect(field?.status).toBe("match");
  });

  it("warns on correct text with bold formatting issue", () => {
    const app = makeApplicationData({
      governmentWarning: STANDARD_GOV_WARNING,
    });
    const label = makeExtractedLabel({
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: true,
      governmentWarningBold: false,
    });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "governmentWarning");
    expect(field?.status).toBe("warning");
  });

  it("mismatches different warning text", () => {
    const app = makeApplicationData({
      governmentWarning: STANDARD_GOV_WARNING,
    });
    const label = makeExtractedLabel({
      governmentWarning: "Some other warning text",
      governmentWarningAllCaps: null,
      governmentWarningBold: null,
    });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "governmentWarning");
    expect(field?.status).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// compareFields — overall status
// ---------------------------------------------------------------------------

describe("compareFields — overall status", () => {
  it("returns approved when all fields match", () => {
    const app = makeApplicationData({
      brandName: "Test Brand",
      alcoholContent: "5% ABV",
    });
    const label = makeExtractedLabel({
      brandName: "Test Brand",
      alcoholContent: "5% ABV",
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: true,
      governmentWarningBold: true,
    });
    const result = compareFields(app, label, 0);
    expect(result.overallStatus).toBe("approved");
  });

  it("returns rejected when any field mismatches", () => {
    const app = makeApplicationData({
      brandName: "Brand A",
      alcoholContent: "5% ABV",
    });
    const label = makeExtractedLabel({
      brandName: "Brand B",
      alcoholContent: "5% ABV",
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: true,
      governmentWarningBold: true,
    });
    const result = compareFields(app, label, 0);
    expect(result.overallStatus).toBe("rejected");
  });

  it("returns needs_review when fields have warnings", () => {
    const app = makeApplicationData({ brandName: "Stone's Throw" });
    const label = makeExtractedLabel({
      brandName: "STONE'S THROW",
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: true,
      governmentWarningBold: true,
    });
    const result = compareFields(app, label, 0);
    expect(result.overallStatus).toBe("needs_review");
  });

  it("returns rejected for non-alcohol label", () => {
    const app = makeApplicationData({ brandName: "Test" });
    const label = makeExtractedLabel({
      isAlcoholLabel: false,
      brandName: "Test",
    });
    const result = compareFields(app, label, 0);
    expect(result.overallStatus).toBe("rejected");
  });

  it("returns needs_review when no expected data is provided", () => {
    const app = makeApplicationData();
    const label = makeExtractedLabel({
      governmentWarning: STANDARD_GOV_WARNING,
      governmentWarningAllCaps: true,
      governmentWarningBold: true,
    });
    const result = compareFields(app, label, 0);
    expect(result.overallStatus).toBe("needs_review");
  });
});

// ---------------------------------------------------------------------------
// compareFields — beverage type
// ---------------------------------------------------------------------------

describe("compareFields — beverage type", () => {
  it("matches same beverage type", () => {
    const app = makeApplicationData({ beverageType: "wine" });
    const label = makeExtractedLabel({ beverageType: "wine" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "beverageType");
    expect(field?.status).toBe("match");
  });

  it("mismatches different beverage type", () => {
    const app = makeApplicationData({ beverageType: "beer" });
    const label = makeExtractedLabel({ beverageType: "wine" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "beverageType");
    expect(field?.status).toBe("mismatch");
  });

  it("returns not_found when AI cannot determine type", () => {
    const app = makeApplicationData({ beverageType: "beer" });
    const label = makeExtractedLabel({ beverageType: null });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "beverageType");
    expect(field?.status).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// compareFields — government warning case variations
// ---------------------------------------------------------------------------

describe("compareFields — government warning case variations", () => {
  it("detects case differences in warning text", () => {
    const app = makeApplicationData({
      governmentWarning: STANDARD_GOV_WARNING,
    });
    const label = makeExtractedLabel({
      governmentWarning: STANDARD_GOV_WARNING.toLowerCase(),
      governmentWarningAllCaps: null,
      governmentWarningBold: null,
    });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "governmentWarning");
    expect(field?.status).toBe("mismatch");
    expect(field?.explanation).toContain("case differences");
  });
});

// ---------------------------------------------------------------------------
// compareFields — alcohol content exact matching
// ---------------------------------------------------------------------------

describe("compareFields — alcohol content exact matching", () => {
  it("matches ABV to Proof cross-conversion exactly", () => {
    const app = makeApplicationData({ alcoholContent: "80 Proof" });
    const label = makeExtractedLabel({ alcoholContent: "40% ABV" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "alcoholContent");
    expect(field?.status).toBe("match");
  });

  it("mismatches on real ABV difference", () => {
    const app = makeApplicationData({ alcoholContent: "5% ABV" });
    const label = makeExtractedLabel({ alcoholContent: "5.1% ABV" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "alcoholContent");
    expect(field?.status).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// (net contents cross-unit tests removed — text comparison only)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// compareFields — bare number inference escalation
// ---------------------------------------------------------------------------

describe("compareFields — bare number inference", () => {
  it("escalates matching ABV bare number to warning", () => {
    const app = makeApplicationData({ alcoholContent: "40" });
    const label = makeExtractedLabel({ alcoholContent: "40% ABV" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "alcoholContent");
    expect(field?.status).toBe("warning");
    expect(field?.explanation).toContain("bare number");
  });

  it("mismatches net contents bare number vs with unit", () => {
    const app = makeApplicationData({ netContents: "750" });
    const label = makeExtractedLabel({ netContents: "750 mL" });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "netContents");
    expect(field?.status).toBe("mismatch");
  });
});

// ---------------------------------------------------------------------------
// compareFields — address word boundary matching
// ---------------------------------------------------------------------------

describe("compareFields — address word boundary matching", () => {
  it("does not false-positive substring matches", () => {
    const app = makeApplicationData({
      producerAddress: "123 Main Street, Springfield, IL",
    });
    const label = makeExtractedLabel({
      producerAddress: "456 Mainstream Blvd, Springfield, IL",
    });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "producerAddress");
    expect(field?.status).toBe("mismatch");
  });

  it("matches address with reordered words", () => {
    const app = makeApplicationData({
      producerAddress: "123 Main St, Springfield, IL 62701",
    });
    const label = makeExtractedLabel({
      producerAddress: "Springfield, IL 62701, 123 Main Street",
    });
    const result = compareFields(app, label, 0);
    const field = result.fields.find((f) => f.key === "producerAddress");
    expect(field?.status).toBe("match");
  });
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { compareFields } from "../app/lib/comparison.server";
import { STANDARD_GOV_WARNING } from "../app/lib/constants";
import { parseCSV } from "../app/lib/csv";
import type { ApplicationData, BeverageType, ExtractedLabel } from "../app/lib/types";

const CSV_DIR = join(import.meta.dirname, "fixtures", "csv");

// Column indices matching batch CSV headers
const COL = {
  fileName: 0,
  brandName: 1,
  classType: 2,
  alcoholContent: 3,
  netContents: 4,
  producerName: 5,
  producerAddress: 6,
  countryOfOrigin: 7,
  beverageType: 8,
} as const;

let validRows: string[][];
let errorRows: string[][];

function makeApplicationData(
  row: string[],
  overrides: Partial<ApplicationData> = {},
): ApplicationData {
  return {
    brandName: row[COL.brandName] || "",
    classType: row[COL.classType] || "",
    alcoholContent: row[COL.alcoholContent] || "",
    netContents: row[COL.netContents] || "",
    producerName: row[COL.producerName] || "",
    producerAddress: row[COL.producerAddress] || "",
    countryOfOrigin: row[COL.countryOfOrigin] || "",
    governmentWarning: "",
    beverageType: (row[COL.beverageType] || "wine") as BeverageType,
    ...overrides,
  };
}

function makeExtractedLabel(overrides: Partial<ExtractedLabel> = {}): ExtractedLabel {
  return {
    brandName: null,
    classType: null,
    alcoholContent: null,
    netContents: null,
    producerName: null,
    producerAddress: null,
    countryOfOrigin: null,
    governmentWarning: STANDARD_GOV_WARNING,
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

function extractedFromRow(row: string[], overrides: Partial<ExtractedLabel> = {}): ExtractedLabel {
  return makeExtractedLabel({
    brandName: row[COL.brandName] || null,
    classType: row[COL.classType] || null,
    alcoholContent: row[COL.alcoholContent] || null,
    netContents: row[COL.netContents] || null,
    producerName: row[COL.producerName] || null,
    producerAddress: row[COL.producerAddress] || null,
    countryOfOrigin: row[COL.countryOfOrigin] || null,
    beverageType: (row[COL.beverageType] as BeverageType) || null,
    ...overrides,
  });
}

function fieldStatus(result: ReturnType<typeof compareFields>, key: string) {
  return result.fields.find((f) => f.key === key)?.status;
}

describe("comparison with fixture data", () => {
  beforeAll(async () => {
    const validText = await readFile(join(CSV_DIR, "batch-valid.csv"), "utf-8");
    const errorText = await readFile(join(CSV_DIR, "batch-with-errors.csv"), "utf-8");
    validRows = parseCSV(validText);
    errorRows = parseCSV(errorText);
  });

  // -----------------------------------------------------------------------
  // 1. Valid CSV — all fields match (approved)
  // -----------------------------------------------------------------------
  describe("valid CSV — all fields match (approved)", () => {
    it("every row self-compares as approved", () => {
      for (let i = 1; i < validRows.length; i++) {
        const expected = makeApplicationData(validRows[i]);
        const extracted = extractedFromRow(validRows[i]);
        const result = compareFields(expected, extracted, 100);

        for (const field of result.fields) {
          expect(
            field.status,
            `Row ${i} (${validRows[i][COL.brandName]}) field "${field.key}": ${field.explanation}`,
          ).toBe("match");
        }
        expect(result.overallStatus, `Row ${i} (${validRows[i][COL.brandName]}) overall`).toBe(
          "approved",
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Error CSV — intentional mismatches detected (rejected)
  // -----------------------------------------------------------------------
  describe("error CSV — intentional mismatches detected", () => {
    it("row 1 (Aloria): ABV 14.2% vs 12.2% → alcoholContent mismatch, rejected", () => {
      const expected = makeApplicationData(errorRows[1]);
      const extracted = extractedFromRow(validRows[1]);
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "alcoholContent")).toBe("mismatch");
      expect(result.overallStatus).toBe("rejected");
    });

    it("row 2 (Les Champs Libres): brand case diff → warning, needs_review", () => {
      const expected = makeApplicationData(errorRows[2]);
      const extracted = extractedFromRow(validRows[2]);
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "brandName")).toBe("warning");
      expect(result.overallStatus).toBe("needs_review");
    });

    it("row 3 (Cantina Canaio): classType mismatch → rejected", () => {
      const expected = makeApplicationData(errorRows[3]);
      const extracted = extractedFromRow(validRows[3]);
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "classType")).toBe("mismatch");
      expect(result.overallStatus).toBe("rejected");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Net contents: text comparison (no unit conversion)
  // -----------------------------------------------------------------------
  describe("net contents text comparison", () => {
    it('"1.5 L" expected vs "1500 mL" extracted → mismatch (no cross-unit conversion)', () => {
      // Net contents uses text comparison only — different formats are a mismatch
      const expected = makeApplicationData(validRows[2]);
      const extracted = extractedFromRow(validRows[2], {
        netContents: "1500 mL",
      });
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "netContents")).toBe("mismatch");
    });
  });

  // -----------------------------------------------------------------------
  // 4. Net contents unparseable unit: "12 FL. OZ." and "15.5 U.S. Gallons"
  // -----------------------------------------------------------------------
  describe("net contents unparseable unit (text fallback)", () => {
    it("same text on both sides → match via text fallback", () => {
      // Chattabrewchee: "12 FL. OZ."
      const expected = makeApplicationData(validRows[4]);
      const extracted = extractedFromRow(validRows[4]);
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "netContents")).toBe("match");
    });

    it("different unparseable text → mismatch via text fallback", () => {
      // Frontyard: "15.5 U.S. Gallons" vs different text
      const expected = makeApplicationData(validRows[9]);
      const extracted = extractedFromRow(validRows[9], {
        netContents: "20 U.S. Gallons",
      });
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "netContents")).toBe("mismatch");
    });
  });

  // -----------------------------------------------------------------------
  // 5. Country of origin: "Product of France" ↔ "France"
  // -----------------------------------------------------------------------
  describe("country of origin prefix stripping", () => {
    it('"France" expected vs "Product of France" extracted → match', () => {
      // Chateau Rayas: countryOfOrigin = "France"
      const expected = makeApplicationData(validRows[11]);
      const extracted = extractedFromRow(validRows[11], {
        countryOfOrigin: "Product of France",
      });
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "countryOfOrigin")).toBe("match");
    });

    it('"Product of France" expected vs "France" extracted → match', () => {
      const expected = makeApplicationData(validRows[2], {
        countryOfOrigin: "Product of France",
      });
      const extracted = extractedFromRow(validRows[2]);
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "countryOfOrigin")).toBe("match");
    });
  });

  // -----------------------------------------------------------------------
  // 6. Address normalization with real addresses
  // -----------------------------------------------------------------------
  describe("address normalization with real addresses", () => {
    it("abbreviated vs full form → match", () => {
      // Chattabrewchee: "1301 6th Ave Ste C, Columbus, GA"
      const expected = makeApplicationData(validRows[4]);
      const extracted = extractedFromRow(validRows[4], {
        producerAddress: "1301 6th Avenue Suite C Columbus GA",
      });
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "producerAddress")).toBe("match");
    });

    it("address with suite and zip normalizes correctly", () => {
      // SM Wine Imports: "7307 Edgewater Dr Ste J, Oakland, CA 94621"
      const expected = makeApplicationData(validRows[11]);
      const extracted = extractedFromRow(validRows[11], {
        producerAddress: "7307 Edgewater Drive Suite J, Oakland, CA 94621",
      });
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "producerAddress")).toBe("match");
    });
  });

  // -----------------------------------------------------------------------
  // 7. Missing extracted fields → not_found
  // -----------------------------------------------------------------------
  describe("missing extracted fields → not_found", () => {
    it("null extracted brandName → not_found, overall needs_review", () => {
      const expected = makeApplicationData(validRows[1]);
      const extracted = extractedFromRow(validRows[1], { brandName: null });
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "brandName")).toBe("not_found");
      expect(result.overallStatus).toBe("needs_review");
    });

    it("null extracted alcoholContent → not_found, overall needs_review", () => {
      const expected = makeApplicationData(validRows[5]);
      const extracted = extractedFromRow(validRows[5], {
        alcoholContent: null,
      });
      const result = compareFields(expected, extracted, 100);

      expect(fieldStatus(result, "alcoholContent")).toBe("not_found");
      expect(result.overallStatus).toBe("needs_review");
    });
  });

  // -----------------------------------------------------------------------
  // 8. Domestic labels with empty countryOfOrigin
  // -----------------------------------------------------------------------
  describe("domestic labels with empty countryOfOrigin", () => {
    it("empty expected countryOfOrigin is not compared", () => {
      // Aloria (row 1) has empty countryOfOrigin — domestic label
      const expected = makeApplicationData(validRows[1]);
      expect(expected.countryOfOrigin).toBe("");

      const extracted = extractedFromRow(validRows[1]);
      const result = compareFields(expected, extracted, 100);

      const countryField = result.fields.find((f) => f.key === "countryOfOrigin");
      expect(countryField).toBeUndefined();
    });

    it("does not erroneously reject when extracted has a country but expected is empty", () => {
      // Domestic label with empty expected, but AI extracts a country
      const expected = makeApplicationData(validRows[1]);
      const extracted = extractedFromRow(validRows[1], {
        countryOfOrigin: "United States",
      });
      const result = compareFields(expected, extracted, 100);

      const countryField = result.fields.find((f) => f.key === "countryOfOrigin");
      expect(countryField).toBeUndefined();
      expect(result.overallStatus).toBe("approved");
    });
  });
});

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapCSVToApplicationData, parseCSV } from "../app/lib/csv";

const LABELS_DIR = join(import.meta.dirname, "fixtures", "labels");
const CSV_DIR = join(import.meta.dirname, "fixtures", "csv");

async function readCSV(name: string) {
  const text = await readFile(join(CSV_DIR, name), "utf-8");
  return parseCSV(text);
}

async function getLabelFiles() {
  const entries = await readdir(LABELS_DIR);
  return entries.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
}

// ---------------------------------------------------------------------------
// Fixture file integrity
// ---------------------------------------------------------------------------

describe("test fixtures", () => {
  it("labels directory contains at least 10 images", async () => {
    const files = await getLabelFiles();
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("batch-valid.csv has correct headers", async () => {
    const rows = await readCSV("batch-valid.csv");
    expect(rows[0]).toEqual([
      "fileName",
      "brandName",
      "classType",
      "alcoholContent",
      "netContents",
      "producerName",
      "producerAddress",
      "countryOfOrigin",
      "beverageType",
    ]);
  });

  it("batch-valid.csv references only existing label files", async () => {
    const rows = await readCSV("batch-valid.csv");
    const labelFiles = await getLabelFiles();
    const labelSet = new Set(labelFiles.map((f) => f.toLowerCase()));

    for (let i = 1; i < rows.length; i++) {
      const fileName = rows[i][0];
      expect(
        labelSet.has(fileName.toLowerCase()),
        `Row ${i + 1}: "${fileName}" not found in labels directory`,
      ).toBe(true);
    }
  });

  it("batch-valid.csv has data rows with all required fields populated", async () => {
    const rows = await readCSV("batch-valid.csv");
    // At minimum: fileName, brandName, classType, alcoholContent, beverageType
    const requiredIndices = [0, 1, 2, 3, 8]; // fileName, brandName, classType, alcoholContent, beverageType

    for (let i = 1; i < rows.length; i++) {
      for (const idx of requiredIndices) {
        expect(
          rows[i][idx]?.trim().length,
          `Row ${i + 1}, column "${rows[0][idx]}": should not be empty`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("batch-valid.csv beverageType values are valid", async () => {
    const rows = await readCSV("batch-valid.csv");
    const validTypes = new Set(["beer", "wine", "distilled_spirits"]);
    for (let i = 1; i < rows.length; i++) {
      const beverageType = rows[i][8];
      expect(
        validTypes.has(beverageType),
        `Row ${i + 1}: invalid beverageType "${beverageType}"`,
      ).toBe(true);
    }
  });

  it("batch-valid.csv maps cleanly to files with no warnings", async () => {
    const rows = await readCSV("batch-valid.csv");
    const labelFiles = await getLabelFiles();
    const files = labelFiles.map((name, i) => ({
      id: `f${i}`,
      file: { name },
    }));
    const result = mapCSVToApplicationData(rows, files);
    // Only warnings should be about files that don't have CSV rows (extra images)
    const errorWarnings = result.warnings.filter((w) => !w.startsWith("No CSV data for file"));
    expect(errorWarnings).toEqual([]);
  });

  it("batch-with-errors.csv has the same structure as batch-valid.csv", async () => {
    const validRows = await readCSV("batch-valid.csv");
    const errorRows = await readCSV("batch-with-errors.csv");
    expect(errorRows[0]).toEqual(validRows[0]);
    expect(errorRows.length).toBe(validRows.length);
  });

  it("batch-with-errors.csv contains intentional mismatches", async () => {
    const validRows = await readCSV("batch-valid.csv");
    const errorRows = await readCSV("batch-with-errors.csv");

    let differences = 0;
    for (let i = 1; i < validRows.length; i++) {
      for (let j = 0; j < validRows[i].length; j++) {
        if (validRows[i][j] !== errorRows[i][j]) {
          differences++;
        }
      }
    }
    expect(differences).toBeGreaterThanOrEqual(2);
  });

  it("batch-partial-match.csv includes a nonexistent file reference", async () => {
    const rows = await readCSV("batch-partial-match.csv");
    const labelFiles = await getLabelFiles();
    const labelSet = new Set(labelFiles.map((f) => f.toLowerCase()));

    const fileNames = rows.slice(1).map((r) => r[0]);
    const hasNonexistent = fileNames.some((name) => !labelSet.has(name.toLowerCase()));
    expect(hasNonexistent).toBe(true);
  });

  it("batch-missing-filename.csv does not have a fileName column", async () => {
    const rows = await readCSV("batch-missing-filename.csv");
    const headers = rows[0].map((h) => h.toLowerCase());
    expect(headers).not.toContain("filename");
    expect(headers).not.toContain("file");
    expect(headers).not.toContain("image");
  });
});

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { compareFields } from "../app/lib/comparison.server";
import { parseCSV } from "../app/lib/csv";
import { extractLabelData, type ModelChoice } from "../app/lib/extraction.server";
import type { ApplicationData, BeverageType, ExtractedLabel } from "../app/lib/types";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const CSV_PATH = join(FIXTURES_DIR, "csv", "batch-valid.csv");
const LABELS_DIR = join(FIXTURES_DIR, "labels");
const DEV_VARS_PATH = join(import.meta.dirname, "..", ".dev.vars");

// Load env from .dev.vars, falling back to process.env
function loadEnv(): {
  ANTHROPIC_API_KEY?: string;
  AI_GATEWAY_URL?: string;
  AI_GATEWAY_TOKEN?: string;
} {
  const env: Record<string, string> = {};
  if (existsSync(DEV_VARS_PATH)) {
    const content = readFileSync(DEV_VARS_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^(\w+)=(.+)$/);
      if (match) env[match[1]] = match[2].trim();
    }
  }
  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY,
    AI_GATEWAY_URL: process.env.AI_GATEWAY_URL || env.AI_GATEWAY_URL,
    AI_GATEWAY_TOKEN: process.env.AI_GATEWAY_TOKEN || env.AI_GATEWAY_TOKEN,
  };
}

const ENV = loadEnv();

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

function getMediaType(fileName: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "image/webp";
}

function makeApplicationData(row: string[]): ApplicationData {
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
  };
}

interface ExtractionEntry {
  fileName: string;
  row: string[];
  applicationData: ApplicationData;
  extracted: ExtractedLabel | null;
  error?: string;
  timeMs: number;
}

const FIELD_KEYS = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "producerAddress",
  "countryOfOrigin",
] as const;

// Shared image data loaded once, reused across model suites
let imageData: {
  fileName: string;
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  row: string[];
  applicationData: ApplicationData;
}[];

async function loadFixtures() {
  if (imageData) return;
  const csvText = await readFile(CSV_PATH, "utf-8");
  const rows = parseCSV(csvText);
  imageData = await Promise.all(
    rows.slice(1).map(async (row) => {
      const fileName = row[COL.fileName];
      const imageBuffer = await readFile(join(LABELS_DIR, fileName));
      return {
        fileName,
        base64: imageBuffer.toString("base64"),
        mediaType: getMediaType(fileName),
        row,
        applicationData: makeApplicationData(row),
      };
    }),
  );
}

function reportResults(results: ExtractionEntry[]) {
  const fieldTotals: Record<
    string,
    { match: number; warning: number; mismatch: number; not_found: number; total: number }
  > = {};
  for (const key of FIELD_KEYS) {
    fieldTotals[key] = { match: 0, warning: 0, mismatch: 0, not_found: 0, total: 0 };
  }

  const tableRows: Record<string, string>[] = [];

  for (const entry of results) {
    if (!entry.extracted) {
      const tableRow: Record<string, string> = { image: entry.fileName };
      for (const key of FIELD_KEYS) tableRow[key] = "ERROR";
      tableRow.time = `${(entry.timeMs / 1000).toFixed(1)}s`;
      tableRows.push(tableRow);
      continue;
    }

    const verification = compareFields(entry.applicationData, entry.extracted);

    const tableRow: Record<string, string> = { image: entry.fileName };
    for (const key of FIELD_KEYS) {
      const field = verification.fields.find((f) => f.key === key);
      if (field) {
        fieldTotals[key].total++;
        fieldTotals[key][field.status]++;
        tableRow[key] = field.status;
      } else {
        tableRow[key] = "—";
      }
    }
    tableRow.time = `${(entry.timeMs / 1000).toFixed(1)}s`;
    tableRows.push(tableRow);
  }

  console.log("\n--- Per-field accuracy report ---");
  console.table(tableRows);

  const accuracyRow: Record<string, string> = { image: "Accuracy" };
  for (const key of FIELD_KEYS) {
    const t = fieldTotals[key];
    if (t.total === 0) {
      accuracyRow[key] = "—";
    } else {
      accuracyRow[key] = `${(((t.match + t.warning) / t.total) * 100).toFixed(0)}%`;
    }
  }
  console.log("\n--- Accuracy summary ---");
  console.table([accuracyRow]);
}

function fieldAccuracy(
  results: ExtractionEntry[],
  key: string,
): { acceptable: number; total: number; pct: number } {
  let acceptable = 0;
  let total = 0;
  for (const entry of results) {
    if (!entry.extracted) continue;
    const verification = compareFields(entry.applicationData, entry.extracted);
    const field = verification.fields.find((f) => f.key === key);
    if (field) {
      total++;
      if (field.status === "match" || field.status === "warning") {
        acceptable++;
      }
    }
  }
  return { acceptable, total, pct: total > 0 ? acceptable / total : 0 };
}

// ── Model-specific suite factory ───────────────────────────────────────────

const MODEL_THRESHOLDS: Record<
  ModelChoice,
  { accuracy: number; avgTimeMs: number; perImageMs: number }
> = {
  sonnet: { accuracy: 0.5, avgTimeMs: 15_000, perImageMs: 20_000 },
  haiku: { accuracy: 0.5, avgTimeMs: 10_000, perImageMs: 15_000 },
};

function modelSuite(model: ModelChoice, apiKeyPresent: boolean) {
  const thresholds = MODEL_THRESHOLDS[model];
  const results: ExtractionEntry[] = [];

  describe.skipIf(!apiKeyPresent)(`E2E extraction — ${model}`, () => {
    beforeAll(async () => {
      await loadFixtures();

      for (let i = 0; i < imageData.length; i++) {
        const img = imageData[i];

        const start = performance.now();
        try {
          const extracted = await extractLabelData(
            img.base64,
            img.mediaType,
            ENV as Parameters<typeof extractLabelData>[2],
            model,
          );
          const timeMs = performance.now() - start;
          results.push({
            fileName: img.fileName,
            row: img.row,
            applicationData: img.applicationData,
            extracted,
            timeMs,
          });
        } catch (err) {
          const timeMs = performance.now() - start;
          const message = err instanceof Error ? err.message : String(err);
          console.error(`  ${img.fileName}: extraction failed — ${message}`);
          results.push({
            fileName: img.fileName,
            row: img.row,
            applicationData: img.applicationData,
            extracted: null,
            error: message,
            timeMs,
          });
        }
      }
    }, 360_000);

    it("extraction succeeds for every fixture image", () => {
      expect(results.length).toBe(imageData.length);
      const failed = results.filter((e) => e.extracted === null);
      if (failed.length > 0) {
        console.log(`  ${failed.length} extraction(s) failed:`);
        for (const f of failed) {
          console.log(`    ${f.fileName}: ${f.error}`);
        }
      }
      for (const entry of results) {
        expect(
          entry.extracted,
          `${entry.fileName} extraction failed: ${entry.error ?? "unknown"}`,
        ).not.toBeNull();
        expect(
          entry.extracted!.isAlcoholLabel,
          `${entry.fileName} should be detected as an alcohol label`,
        ).toBe(true);
      }
    });

    it(`each extraction completes within ${thresholds.perImageMs / 1000}s`, () => {
      for (const entry of results) {
        console.log(`  ${entry.fileName}: ${(entry.timeMs / 1000).toFixed(2)}s`);
        expect(
          entry.timeMs,
          `${entry.fileName} took ${(entry.timeMs / 1000).toFixed(1)}s (limit: ${thresholds.perImageMs / 1000}s)`,
        ).toBeLessThan(thresholds.perImageMs);
      }
    });

    it("per-field accuracy report", () => {
      reportResults(results);
      // Informational — always passes
      expect(true).toBe(true);
    });

    it(`aggregate accuracy: key fields >= ${thresholds.accuracy * 100}% match or warning`, () => {
      const keyFields = ["brandName", "classType", "alcoholContent"] as const;
      for (const key of keyFields) {
        const { acceptable, total, pct } = fieldAccuracy(results, key);
        console.log(`  ${key}: ${acceptable}/${total} (${(pct * 100).toFixed(0)}%)`);
        expect(
          pct,
          `${key} accuracy ${(pct * 100).toFixed(0)}% should be >= ${thresholds.accuracy * 100}%`,
        ).toBeGreaterThanOrEqual(thresholds.accuracy);
      }
    });

    it(`average response time under ${thresholds.avgTimeMs / 1000}s`, () => {
      const totalMs = results.reduce((sum, e) => sum + e.timeMs, 0);
      const avgMs = totalMs / results.length;
      console.log(`  Average: ${(avgMs / 1000).toFixed(2)}s`);
      expect(
        avgMs,
        `Average response time ${(avgMs / 1000).toFixed(1)}s should be under ${thresholds.avgTimeMs / 1000}s`,
      ).toBeLessThan(thresholds.avgTimeMs);
    });
  });
}

// ── Run both model suites ──────────────────────────────────────────────────

modelSuite("sonnet", !!ENV.ANTHROPIC_API_KEY);
modelSuite("haiku", !!ENV.ANTHROPIC_API_KEY);

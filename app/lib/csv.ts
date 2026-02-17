import type { ApplicationData, BatchItemResult } from "./types";

interface FileEntry {
  id: string;
  file: { name: string };
}

/**
 * Parse CSV text into a 2D array of strings.
 * Handles quoted fields (including commas and quotes inside quotes).
 */
export function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows: string[][] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;
    const fields: string[] = [];
    let i = 0;

    while (i <= line.length) {
      if (i === line.length) {
        fields.push("");
        break;
      }

      if (line[i] === '"') {
        // Quoted field
        let value = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            value += line[i];
            i++;
          }
        }
        fields.push(value.trim());
        // Skip comma after quoted field, or break if end of line
        if (i < line.length && line[i] === ",") {
          i++;
        } else {
          break;
        }
      } else {
        // Unquoted field
        const commaIdx = line.indexOf(",", i);
        if (commaIdx === -1) {
          fields.push(line.slice(i).trim());
          break;
        } else {
          fields.push(line.slice(i, commaIdx).trim());
          i = commaIdx + 1;
        }
      }
    }

    rows.push(fields);
  }

  return rows;
}

const COLUMN_ALIASES: Record<string, keyof ApplicationData> = {
  brandname: "brandName",
  "brand name": "brandName",
  brand: "brandName",
  classtype: "classType",
  "class type": "classType",
  "class/type": "classType",
  type: "classType",
  alcoholcontent: "alcoholContent",
  "alcohol content": "alcoholContent",
  abv: "alcoholContent",
  alcohol: "alcoholContent",
  alc: "alcoholContent",
  netcontents: "netContents",
  "net contents": "netContents",
  volume: "netContents",
  size: "netContents",
  producername: "producerName",
  "producer name": "producerName",
  producer: "producerName",
  bottler: "producerName",
  produceraddress: "producerAddress",
  "producer address": "producerAddress",
  address: "producerAddress",
  countryoforigin: "countryOfOrigin",
  "country of origin": "countryOfOrigin",
  country: "countryOfOrigin",
  origin: "countryOfOrigin",
  governmentwarning: "governmentWarning",
  "government warning": "governmentWarning",
  warning: "governmentWarning",
  beveragetype: "beverageType",
  "beverage type": "beverageType",
  beverage: "beverageType",
};

const FILENAME_ALIASES = new Set(["filename", "file name", "file", "image"]);

/**
 * Resolve a column header to an ApplicationData field key, or "fileName", or null.
 */
function resolveHeader(header: string): keyof ApplicationData | "fileName" | null {
  const normalized = header.toLowerCase().trim();
  if (FILENAME_ALIASES.has(normalized)) return "fileName";
  return COLUMN_ALIASES[normalized] ?? null;
}

/**
 * Strip file extension from a filename.
 */
function stripExtension(name: string): string {
  const dotIdx = name.lastIndexOf(".");
  return dotIdx > 0 ? name.slice(0, dotIdx) : name;
}

/**
 * Match a CSV fileName value to a FileEntry.
 * Tries exact match (case-insensitive), then with/without extension.
 */
function matchFile(csvFileName: string, files: FileEntry[]): FileEntry | undefined {
  const csvLower = csvFileName.toLowerCase().trim();
  const csvNoExt = stripExtension(csvLower);

  return files.find((f) => {
    const fileLower = f.file.name.toLowerCase();
    const fileNoExt = stripExtension(fileLower);
    return (
      fileLower === csvLower ||
      fileNoExt === csvLower ||
      fileLower === csvNoExt ||
      fileNoExt === csvNoExt
    );
  });
}

export interface CSVImportResult {
  data: Record<string, Partial<ApplicationData>>;
  warnings: string[];
}

/**
 * Map parsed CSV rows to ApplicationData keyed by file ID.
 */
export function mapCSVToApplicationData(rows: string[][], files: FileEntry[]): CSVImportResult {
  if (rows.length < 2) {
    return { data: {}, warnings: ["CSV file is empty or has no data rows."] };
  }

  const headers = rows[0];
  const columnMap: (keyof ApplicationData | "fileName" | null)[] = headers.map(resolveHeader);

  const fileNameIdx = columnMap.indexOf("fileName");
  if (fileNameIdx === -1) {
    return {
      data: {},
      warnings: [
        'CSV must have a "fileName" column (accepted headers: fileName, file name, file, image).',
      ],
    };
  }

  const data: Record<string, Partial<ApplicationData>> = {};
  const warnings: string[] = [];
  const matchedFileIds = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const csvFileName = row[fileNameIdx]?.trim();
    if (!csvFileName) {
      warnings.push(`Row ${r + 1}: missing fileName, skipped.`);
      continue;
    }

    const matched = matchFile(csvFileName, files);
    if (!matched) {
      warnings.push(`Row ${r + 1}: no matching file for "${csvFileName}".`);
      continue;
    }

    matchedFileIds.add(matched.id);
    const entry: Partial<ApplicationData> = {};

    for (let c = 0; c < row.length && c < columnMap.length; c++) {
      const field = columnMap[c];
      if (field && field !== "fileName" && row[c]?.trim()) {
        (entry as Record<string, string>)[field] = row[c].trim();
      }
    }

    data[matched.id] = entry;
  }

  // Warn about files without CSV data
  for (const file of files) {
    if (!matchedFileIds.has(file.id)) {
      warnings.push(`No CSV data for file "${file.file.name}".`);
    }
  }

  return { data, warnings };
}

const RESULT_FIELD_KEYS = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "producerAddress",
  "countryOfOrigin",
  "governmentWarning",
] as const;

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate a CSV string from batch comparison results.
 */
export function generateResultsCSV(results: BatchItemResult[]): string {
  const headers = [
    "fileName",
    "overallStatus",
    ...RESULT_FIELD_KEYS.flatMap((key) => [`${key}_status`, `${key}_extracted`, `${key}_expected`]),
    "confidence",
    "imageQuality",
    "processingTimeMs",
    "error",
  ];

  const rows = [headers.map(escapeCSV).join(",")];

  for (const item of results) {
    const row: string[] = [
      escapeCSV(item.fileName),
      escapeCSV(item.result?.overallStatus ?? "error"),
    ];

    for (const key of RESULT_FIELD_KEYS) {
      const field = item.result?.fields.find((f) => f.key === key);
      row.push(escapeCSV(field?.status ?? ""));
      row.push(escapeCSV(field?.extracted ?? ""));
      row.push(escapeCSV(field?.expected ?? ""));
    }

    row.push(escapeCSV(String(item.result?.confidence ?? "")));
    row.push(escapeCSV(item.result?.imageQuality ?? ""));
    row.push(escapeCSV(String(item.result?.processingTimeMs ?? "")));
    row.push(escapeCSV(item.error ?? ""));

    rows.push(row.join(","));
  }

  return rows.join("\n");
}

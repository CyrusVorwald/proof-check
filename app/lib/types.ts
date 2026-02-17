import { z } from "zod";

export type BeverageType = "beer" | "wine" | "distilled_spirits";

export type FieldStatus = "match" | "warning" | "mismatch" | "not_found";

export interface NormalizationNote {
  text: string;
  level: "info" | "caution";
}

export interface ParsedAlcoholContent {
  rawText: string;
  abv: number | null;
  proof: number | null;
  inferredFromBareNumber: boolean;
  notes: NormalizationNote[];
}

export interface ApplicationData {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  producerName: string;
  producerAddress: string;
  countryOfOrigin: string;
  governmentWarning: string;
  beverageType: BeverageType | "";
}

export const ExtractedLabelSchema = z.object({
  brandName: z.string().nullable(),
  classType: z.string().nullable(),
  alcoholContent: z.string().nullable(),
  netContents: z.string().nullable(),
  producerName: z.string().nullable(),
  producerAddress: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),
  governmentWarning: z.string().nullable(),
  governmentWarningAllCaps: z.boolean().nullable(),
  governmentWarningBold: z.boolean().nullable(),
  beverageType: z.enum(["beer", "wine", "distilled_spirits"]).nullable(),
  isAlcoholLabel: z.boolean(),
  imageQuality: z.enum(["good", "fair", "poor"]),
  confidence: z.number(),
  notes: z.array(z.string()),
});

export type ExtractedLabel = z.infer<typeof ExtractedLabelSchema>;

export interface FieldResult {
  name: string;
  key: string;
  extracted: string | null;
  expected: string;
  status: FieldStatus;
  explanation: string;
  normalization?: {
    expectedParsed?: ParsedAlcoholContent;
    extractedParsed?: ParsedAlcoholContent;
    numericDiff?: number;
    diffUnit?: string;
  };
}

export interface GovernmentWarningCheck {
  textMatch: boolean;
  allCapsCorrect: boolean | null;
  boldCorrect: boolean | null;
  extractedText: string | null;
  issues: string[];
}

export interface VerificationResult {
  overallStatus: "approved" | "needs_review" | "rejected";
  isAlcoholLabel: boolean;
  fields: FieldResult[];
  governmentWarningCheck: GovernmentWarningCheck | null;
  imageQuality: "good" | "fair" | "poor";
  confidence: number;
  notes: string[];
  processingTimeMs: number;
}

export interface ExtractActionResult {
  extractedLabel: ExtractedLabel;
  governmentWarningCheck: GovernmentWarningCheck | null;
  processingTimeMs: number;
}

export type VerifyActionResponse =
  | { success: true; intent: "extract"; result: ExtractActionResult }
  | { success: true; intent: "compare"; result: VerificationResult }
  | { success: false; error: string };

export interface BatchItemResult {
  fileName: string;
  result: VerificationResult | null;
  error?: string;
}

export interface BatchExtractItemResult {
  fileName: string;
  fileId: string;
  extractedLabel: ExtractedLabel | null;
  governmentWarningCheck: GovernmentWarningCheck | null;
  processingTimeMs: number;
  error?: string;
}

export type BatchVerifyResponse =
  | { success: true; intent: "extract"; results: BatchExtractItemResult[] }
  | { success: true; intent: "compare"; results: BatchItemResult[] }
  | { success: false; error: string };

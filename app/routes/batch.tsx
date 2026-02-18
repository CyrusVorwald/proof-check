import { useCallback, useReducer, useRef } from "react";
import { useActionData, useNavigation, useSubmit } from "react-router";
import { z } from "zod";
import { ApplicationForm } from "~/components/application-form";
import { BatchExtractionSummary } from "~/components/batch-extraction-summary";
import { BatchFileItem } from "~/components/batch-file-item";
import { BatchResults } from "~/components/batch-results";
import { BatchUpload, type FileEntry } from "~/components/batch-upload";
import { HelpTip } from "~/components/help-tip";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { compareFields } from "~/lib/comparison.server";
import { SAMPLE_LABELS } from "~/lib/constants";
import { mapCSVToApplicationData, parseCSV } from "~/lib/csv";
import type {
  ApplicationData,
  BatchExtractItemResult,
  BatchItemResult,
  BatchVerifyResponse,
  ExtractActionResult,
  ExtractedLabel,
} from "~/lib/types";
import { ExtractedLabelSchema } from "~/lib/types";
import { processWithConcurrency } from "~/lib/utils";
import type { Route } from "./+types/batch";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Batch Verification - ProofCheck" },
    {
      name: "description",
      content: "Verify multiple alcohol beverage labels at once",
    },
  ];
}

const CONCURRENCY_LIMIT = 5;

// Server action — only handles compare (extraction is client-side progressive)
export async function action({ request }: Route.ActionArgs) {
  try {
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "compare") {
      return handleBatchCompare(formData);
    }

    return {
      success: false,
      error: "Invalid intent.",
    } satisfies BatchVerifyResponse;
  } catch (err) {
    console.error("Batch verification error:", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during batch verification.",
    } satisfies BatchVerifyResponse;
  }
}

async function handleBatchCompare(formData: FormData): Promise<BatchVerifyResponse> {
  const extractedLabelsJson = formData.get("extractedLabels") as string;
  if (!extractedLabelsJson) {
    return {
      success: false,
      error: "No extraction data found. Please extract labels first.",
    };
  }

  let extractedLabels: Record<string, ExtractedLabel>;
  try {
    extractedLabels = z
      .record(z.string(), ExtractedLabelSchema)
      .parse(JSON.parse(extractedLabelsJson));
  } catch {
    return { success: false, error: "Invalid extraction data." };
  }

  const fileIds = Object.keys(extractedLabels);
  if (fileIds.length === 0) {
    return { success: false, error: "No extracted labels found." };
  }

  // Read fileNames from hidden fields
  const results: BatchItemResult[] = fileIds.map((fileId) => {
    const fileName = (formData.get(`files[${fileId}].fileName`) as string) || fileId;
    const extracted = extractedLabels[fileId];

    const applicationData: ApplicationData = {
      brandName: (formData.get(`files[${fileId}].brandName`) as string) || "",
      classType: (formData.get(`files[${fileId}].classType`) as string) || "",
      alcoholContent: (formData.get(`files[${fileId}].alcoholContent`) as string) || "",
      netContents: (formData.get(`files[${fileId}].netContents`) as string) || "",
      producerName: (formData.get(`files[${fileId}].producerName`) as string) || "",
      producerAddress: (formData.get(`files[${fileId}].producerAddress`) as string) || "",
      countryOfOrigin: (formData.get(`files[${fileId}].countryOfOrigin`) as string) || "",
      governmentWarning: (formData.get(`files[${fileId}].governmentWarning`) as string) || "",
      beverageType: ((formData.get(`files[${fileId}].beverageType`) as string) ||
        "") as ApplicationData["beverageType"],
    };

    const result = compareFields(applicationData, extracted);
    return { fileName, result };
  });

  return { success: true, intent: "compare", results };
}

const MAX_RETRIES = 3;

async function fetchExtract(
  file: File,
  model: string,
  onRateLimited?: (waiting: boolean) => void,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("model", model);

    const response = await fetch("/api/extract", { method: "POST", body: fd });

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get("Retry-After");
      const parsed = retryAfter ? Number(retryAfter) * 1000 : NaN;
      const waitMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
      onRateLimited?.(true);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      onRateLimited?.(false);
      continue;
    }

    return response;
  }
}

const APPLICATION_FIELDS: (keyof ApplicationData)[] = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "producerAddress",
  "countryOfOrigin",
  "governmentWarning",
  "beverageType",
];

interface BatchState {
  files: FileEntry[];
  templateValues: Partial<ApplicationData>;
  perFileDefaults: Record<string, Partial<ApplicationData>>;
  perFileEdits: Record<string, Partial<ApplicationData>>;
  csvWarnings: string[];
  isExtracting: boolean;
  rateLimitWaitCount: number;
  extractionProgress: { completed: number; total: number } | null;
  extractResults: BatchExtractItemResult[];
  extractedLabels: Record<string, ExtractedLabel>;
}

type BatchAction =
  | { type: "SET_FILES"; files: FileEntry[] }
  | { type: "REMOVE_FILE"; fileId: string }
  | { type: "APPLY_TEMPLATE"; values: Partial<ApplicationData> }
  | { type: "IMPORT_CSV"; data: Record<string, Partial<ApplicationData>>; warnings: string[] }
  | { type: "UPDATE_FILE_FIELD"; fileId: string; field: keyof ApplicationData; value: string }
  | { type: "START_EXTRACTION"; total: number }
  | { type: "START_RETRY"; total: number }
  | { type: "RATE_LIMIT_WAIT" }
  | { type: "RATE_LIMIT_RESUME" }
  | {
      type: "EXTRACTION_PROGRESS";
      completed: number;
      results: BatchExtractItemResult[];
      labels: Record<string, ExtractedLabel>;
    }
  | { type: "EXTRACTION_COMPLETE" };

const initialState: BatchState = {
  files: [],
  templateValues: {},
  perFileDefaults: {},
  perFileEdits: {},
  csvWarnings: [],
  isExtracting: false,
  rateLimitWaitCount: 0,
  extractionProgress: null,
  extractResults: [],
  extractedLabels: {},
};

function batchReducer(state: BatchState, action: BatchAction): BatchState {
  switch (action.type) {
    case "SET_FILES":
      return { ...state, files: action.files };
    case "REMOVE_FILE": {
      const { [action.fileId]: _d, ...perFileDefaults } = state.perFileDefaults;
      const { [action.fileId]: _e, ...perFileEdits } = state.perFileEdits;
      const { [action.fileId]: _l, ...extractedLabels } = state.extractedLabels;
      return {
        ...state,
        files: state.files.filter((f) => f.id !== action.fileId),
        perFileDefaults,
        perFileEdits,
        extractedLabels,
        extractResults: state.extractResults.filter((r) => r.fileId !== action.fileId),
      };
    }
    case "APPLY_TEMPLATE":
      return { ...state, templateValues: action.values };
    case "IMPORT_CSV":
      return {
        ...state,
        perFileDefaults: action.data,
        csvWarnings: action.warnings,
      };
    case "UPDATE_FILE_FIELD":
      return {
        ...state,
        perFileEdits: {
          ...state.perFileEdits,
          [action.fileId]: {
            ...state.perFileEdits[action.fileId],
            [action.field]: action.value,
          },
        },
      };
    case "START_EXTRACTION":
      return {
        ...state,
        isExtracting: true,
        rateLimitWaitCount: 0,
        extractionProgress: { completed: 0, total: action.total },
        extractResults: [],
        extractedLabels: {},
      };
    case "START_RETRY":
      return {
        ...state,
        isExtracting: true,
        rateLimitWaitCount: 0,
        extractionProgress: {
          completed: state.extractResults.filter((r) => !r.error).length,
          total: action.total,
        },
      };
    case "RATE_LIMIT_WAIT":
      return { ...state, rateLimitWaitCount: state.rateLimitWaitCount + 1 };
    case "RATE_LIMIT_RESUME":
      return { ...state, rateLimitWaitCount: Math.max(0, state.rateLimitWaitCount - 1) };
    case "EXTRACTION_PROGRESS":
      return {
        ...state,
        extractionProgress: {
          completed: action.completed,
          total: state.extractionProgress?.total ?? action.completed,
        },
        extractResults: action.results,
        extractedLabels: action.labels,
      };
    case "EXTRACTION_COMPLETE":
      return { ...state, isExtracting: false, rateLimitWaitCount: 0 };
  }
}

function getEffectiveValues(fileId: string, state: BatchState): Partial<ApplicationData> {
  return {
    ...state.perFileDefaults[fileId],
    ...state.templateValues,
    ...state.perFileEdits[fileId],
  };
}

export default function Batch() {
  const actionData = useActionData<BatchVerifyResponse>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const templateRef = useRef<HTMLDivElement>(null);
  const isSubmitting = navigation.state === "submitting";

  const [state, dispatch] = useReducer(batchReducer, initialState);
  const {
    files,
    csvWarnings,
    perFileDefaults,
    isExtracting,
    rateLimitWaitCount,
    extractionProgress,
    extractResults,
    extractedLabels,
  } = state;

  // Track the last-used model for retries
  const lastModelRef = useRef("haiku");

  function applyTemplate() {
    if (!templateRef.current) return;

    const values: Partial<ApplicationData> = {};
    const inputs = templateRef.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    );

    for (const input of inputs) {
      const field = input.name.replace("__template.", "");
      if (field && input.value) {
        (values as Record<string, string>)[field] = input.value;
      }
    }

    dispatch({ type: "APPLY_TEMPLATE", values });
  }

  function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseCSV(text);
      const { data, warnings } = mapCSVToApplicationData(rows, files);
      dispatch({ type: "IMPORT_CSV", data, warnings });
    };
    reader.readAsText(file);

    // Reset input so re-uploading the same file triggers onChange
    e.target.value = "";
  }

  async function handleExtractSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Read model synchronously before any async work
    const formData = new FormData(e.currentTarget);
    const model = (formData.get("model") as string) || "haiku";
    lastModelRef.current = model;

    dispatch({ type: "START_EXTRACTION", total: files.length });

    const results: BatchExtractItemResult[] = new Array(files.length);
    let completed = 0;

    await processWithConcurrency(
      files.map((entry, i) => ({ entry, index: i })),
      CONCURRENCY_LIMIT,
      async ({ entry, index }) => {
        const startTime = Date.now();

        try {
          const response = await fetchExtract(entry.file, model, (waiting) =>
            dispatch({ type: waiting ? "RATE_LIMIT_WAIT" : "RATE_LIMIT_RESUME" }),
          );

          if (!response.ok) {
            const errorData = (await response.json()) as { error?: string };
            results[index] = {
              fileName: entry.file.name,
              fileId: entry.id,
              extractedLabel: null,
              governmentWarningCheck: null,
              processingTimeMs: Date.now() - startTime,
              error: errorData.error || "Extraction failed",
            };
          } else {
            const data = (await response.json()) as ExtractActionResult;
            results[index] = {
              fileName: entry.file.name,
              fileId: entry.id,
              extractedLabel: data.extractedLabel,
              governmentWarningCheck: data.governmentWarningCheck,
              processingTimeMs: data.processingTimeMs,
            };
          }
        } catch (err) {
          results[index] = {
            fileName: entry.file.name,
            fileId: entry.id,
            extractedLabel: null,
            governmentWarningCheck: null,
            processingTimeMs: Date.now() - startTime,
            error: err instanceof Error ? err.message : "Failed to process image",
          };
        }

        completed++;

        // Update state progressively — results appear as they arrive
        const currentResults = results.filter(Boolean);
        const labels: Record<string, ExtractedLabel> = {};
        for (const r of currentResults) {
          if (r.extractedLabel) {
            labels[r.fileId] = r.extractedLabel;
          }
        }
        dispatch({
          type: "EXTRACTION_PROGRESS",
          completed,
          results: [...currentResults],
          labels,
        });

        return results[index];
      },
    );

    dispatch({ type: "EXTRACTION_COMPLETE" });
  }

  async function handleRetryFailed() {
    const failedItems = extractResults
      .map((r) => ({ result: r, fileEntry: files.find((f) => f.id === r.fileId) }))
      .filter(
        (item): item is { result: BatchExtractItemResult; fileEntry: FileEntry } =>
          !!item.result.error && !!item.fileEntry,
      );

    if (failedItems.length === 0) return;

    const model = lastModelRef.current;
    const updatedResults = [...extractResults];
    let completed = extractResults.filter((r) => !r.error).length;
    const total = extractResults.length;

    dispatch({ type: "START_RETRY", total });

    await processWithConcurrency(
      failedItems,
      CONCURRENCY_LIMIT,
      async ({ result: failed, fileEntry }) => {
        const startTime = Date.now();
        const index = updatedResults.findIndex((r) => r.fileId === failed.fileId);

        try {
          const response = await fetchExtract(fileEntry.file, model, (waiting) =>
            dispatch({ type: waiting ? "RATE_LIMIT_WAIT" : "RATE_LIMIT_RESUME" }),
          );

          if (!response.ok) {
            const errorData = (await response.json()) as { error?: string };
            updatedResults[index] = {
              ...failed,
              processingTimeMs: Date.now() - startTime,
              error: errorData.error || "Extraction failed",
            };
          } else {
            const data = (await response.json()) as ExtractActionResult;
            updatedResults[index] = {
              fileName: failed.fileName,
              fileId: failed.fileId,
              extractedLabel: data.extractedLabel,
              governmentWarningCheck: data.governmentWarningCheck,
              processingTimeMs: data.processingTimeMs,
            };
          }
        } catch (err) {
          updatedResults[index] = {
            ...failed,
            processingTimeMs: Date.now() - startTime,
            error: err instanceof Error ? err.message : "Failed to process image",
          };
        }

        completed++;
        const labels: Record<string, ExtractedLabel> = {};
        for (const r of updatedResults) {
          if (r.extractedLabel) {
            labels[r.fileId] = r.extractedLabel;
          }
        }
        dispatch({
          type: "EXTRACTION_PROGRESS",
          completed,
          results: [...updatedResults],
          labels,
        });
      },
    );

    dispatch({ type: "EXTRACTION_COMPLETE" });
  }

  function handleCompareSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData();
    formData.set("intent", "compare");
    formData.set("extractedLabels", JSON.stringify(extractedLabels));

    for (const entry of files) {
      if (!extractedLabels[entry.id]) continue;
      formData.set(`files[${entry.id}].fileName`, entry.file.name);
      const values = getEffectiveValues(entry.id, state);
      for (const field of APPLICATION_FIELDS) {
        formData.set(`files[${entry.id}].${field}`, (values[field] as string) ?? "");
      }
    }

    submit(formData, { method: "post" });
  }

  const handleFileFieldChange = useCallback(
    (fileId: string, field: keyof ApplicationData, value: string) => {
      dispatch({ type: "UPDATE_FILE_FIELD", fileId, field, value });
    },
    [],
  );

  const hasExtractResults = extractResults.length > 0;
  const hasExtractedLabels = Object.keys(extractedLabels).length > 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Batch Label Verification</h1>
        <p className="text-muted-foreground">
          Upload multiple label images to extract data, then optionally compare against expected
          label data.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Forms */}
        <div className="space-y-6">
          {/* Form 1: Extract */}
          <form onSubmit={handleExtractSubmit}>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Step 1: Extract Label Data</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload label images and AI will read the text from them.
                  </p>
                </div>
                <BatchUpload
                  files={files}
                  onFilesChange={(f) => dispatch({ type: "SET_FILES", files: f })}
                  sampleLabels={SAMPLE_LABELS}
                />
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Model
                    <HelpTip text="Haiku is fast and recommended for most labels. Sonnet is more accurate for hard-to-read or complex labels." />
                  </label>
                  <Select name="model" defaultValue="haiku">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sonnet">Claude Sonnet 4.6</SelectItem>
                      <SelectItem value="haiku">Claude Haiku 4.5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isExtracting || files.length === 0}
                >
                  {isExtracting
                    ? rateLimitWaitCount > 0
                      ? "Waiting for rate limit..."
                      : `Extracting ${extractionProgress?.completed ?? 0} of ${files.length} Label${files.length !== 1 ? "s" : ""}...`
                    : `Extract ${files.length} Label${files.length !== 1 ? "s" : ""}`}
                </Button>
              </CardContent>
            </Card>
          </form>

          {/* Form 2: Compare (visible after extraction completes) */}
          {!isExtracting && hasExtractedLabels && (
            <form onSubmit={handleCompareSubmit}>
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      Step 2: Compare with Expected Data
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Optionally enter expected label data to compare against the extraction. You
                      can populate the forms below in any combination of three ways: import a CSV,
                      use the template to set shared fields, or edit each file individually.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-base font-semibold mb-1">Import from CSV</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Upload a CSV with a <code className="bg-muted px-1 rounded">fileName</code>{" "}
                      column matching your image file names, plus any of:{" "}
                      <code className="bg-muted px-1 rounded">brandName</code>,{" "}
                      <code className="bg-muted px-1 rounded">alcoholContent</code>,{" "}
                      <code className="bg-muted px-1 rounded">netContents</code>,{" "}
                      <code className="bg-muted px-1 rounded">classType</code>,{" "}
                      <code className="bg-muted px-1 rounded">producerName</code>,{" "}
                      <code className="bg-muted px-1 rounded">producerAddress</code>,{" "}
                      <code className="bg-muted px-1 rounded">countryOfOrigin</code>.
                    </p>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVImport}
                      className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
                    />
                    {csvWarnings.length > 0 && (
                      <Alert variant="default" className="mt-3">
                        <AlertDescription>
                          <p className="font-medium mb-1">
                            Imported data for {Object.keys(perFileDefaults).length} of{" "}
                            {files.filter((f) => extractedLabels[f.id]).length} files
                          </p>
                          <ul className="list-disc list-inside text-sm space-y-0.5">
                            {csvWarnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}
                    {Object.keys(perFileDefaults).length > 0 && csvWarnings.length === 0 && (
                      <p className="text-sm text-green-600 mt-2">
                        Imported data for all {Object.keys(perFileDefaults).length} files.
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <h4 className="text-base font-semibold mb-1">Template Data</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Fill in shared fields (e.g. producer name), then apply. This overwrites
                      per-file data, so apply the template first and make per-file edits after.
                    </p>
                    <div ref={templateRef}>
                      <ApplicationForm optional namePrefix="__template" heading={false} />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full mt-4"
                      onClick={applyTemplate}
                    >
                      Apply to All Files
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="text-base font-semibold">Per-File Label Data</h4>
                    <p className="text-sm text-muted-foreground">
                      Expand each file to view or override its label data.
                    </p>
                    {files
                      .filter((entry) => extractedLabels[entry.id])
                      .map((entry) => (
                        <BatchFileItem
                          key={entry.id}
                          id={entry.id}
                          fileName={entry.file.name}
                          preview={entry.preview}
                          values={getEffectiveValues(entry.id, state)}
                          onChange={handleFileFieldChange}
                          onRemove={() => dispatch({ type: "REMOVE_FILE", fileId: entry.id })}
                        />
                      ))}
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? "Comparing..." : "Compare with Expected Data"}
                  </Button>
                </CardContent>
              </Card>
            </form>
          )}
        </div>

        {/* Right: Results */}
        <div className="space-y-6">
          {/* Progress bar during extraction */}
          {isExtracting && extractionProgress && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <p className="font-medium text-sm">
                    Extracting {extractionProgress.completed} of {extractionProgress.total} label
                    {extractionProgress.total !== 1 ? "s" : ""}...
                  </p>
                  {rateLimitWaitCount > 0 && (
                    <p className="text-sm text-muted-foreground animate-pulse">
                      Waiting for rate limit, resuming shortly...
                    </p>
                  )}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${rateLimitWaitCount > 0 ? "bg-primary/50 animate-pulse" : "bg-primary"}`}
                      style={{
                        width: `${(extractionProgress.completed / extractionProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Compare submitting skeleton */}
          {isSubmitting && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-muted rounded w-48" />
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-16 bg-muted rounded" />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {Array.from({ length: files.length || 3 }).map((_, i) => (
                      <div key={i} className="h-14 bg-muted rounded" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Compare error */}
          {!isSubmitting && actionData && !actionData.success && (
            <Alert variant="destructive">
              <AlertDescription>{actionData.error}</AlertDescription>
            </Alert>
          )}

          {/* Extraction summary (shown progressively during and after extraction) */}
          {hasExtractResults && (
            <BatchExtractionSummary
              results={extractResults}
              onRetryFailed={
                extractResults.some((r) => r.error) && !isExtracting ? handleRetryFailed : undefined
              }
            />
          )}

          {/* Comparison results */}
          {!isSubmitting && actionData?.success && actionData.intent === "compare" && (
            <>
              <Separator />
              <BatchResults results={actionData.results} />
            </>
          )}

          {/* Empty state */}
          {!isExtracting && !isSubmitting && !hasExtractResults && !actionData && (
            <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
              <div className="text-center space-y-2">
                <p className="text-lg">No results yet</p>
                <p className="text-sm">
                  Upload label images and click "Extract" to start batch processing.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

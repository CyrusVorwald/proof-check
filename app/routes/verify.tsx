import { useEffect, useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { ApplicationForm } from "~/components/application-form";
import { ExtractionSummary } from "~/components/extraction-summary";
import { HelpTip } from "~/components/help-tip";
import type { SampleLabel } from "~/components/label-upload";
import { LabelUpload } from "~/components/label-upload";
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
import { VerificationResults } from "~/components/verification-results";
import { checkGovernmentWarningCompliance, compareFields } from "~/lib/comparison.server";
import type { ModelChoice } from "~/lib/extraction.server";
import { extractLabelData } from "~/lib/extraction.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import type {
  ApplicationData,
  ExtractActionResult,
  ExtractedLabel,
  VerifyActionResponse,
} from "~/lib/types";
import { ExtractedLabelSchema } from "~/lib/types";
import { arrayBufferToBase64 } from "~/lib/utils";
import type { Route } from "./+types/verify";

const SAMPLE_LABELS: SampleLabel[] = [
  { label: "Beer", url: "/samples/beer.jpg", fileName: "beer.jpg" },
  { label: "Bourbon", url: "/samples/bourbon.jpg", fileName: "bourbon.jpg" },
  { label: "Wine", url: "/samples/wine.jpg", fileName: "wine.jpg" },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Verify Label - ProofCheck" },
    { name: "description", content: "Verify alcohol beverage label compliance" },
  ];
}

export async function action({ request, context }: Route.ActionArgs) {
  try {
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "extract") {
      const { allowed, retryAfterMs } = checkRateLimit(request);
      if (!allowed) {
        return {
          success: false,
          error: `Too many requests. Please try again in ${Math.ceil((retryAfterMs ?? 60_000) / 1000)} seconds.`,
        } satisfies VerifyActionResponse;
      }
      return handleExtract(formData, context);
    } else if (intent === "compare") {
      return handleCompare(formData);
    }

    return {
      success: false,
      error: "Invalid intent.",
    } satisfies VerifyActionResponse;
  } catch (err) {
    console.error("Verification error:", err);
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred during verification.",
    } satisfies VerifyActionResponse;
  }
}

async function handleExtract(
  formData: FormData,
  context: Route.ActionArgs["context"],
): Promise<VerifyActionResponse> {
  const startTime = Date.now();
  const file = formData.get("labelImage") as File | null;

  if (!file || file.size === 0) {
    return { success: false, error: "Please upload a label image." };
  }

  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    return {
      success: false,
      error: "Invalid file type. Please upload a JPG, PNG, or WebP image.",
    };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "File too large. Maximum size is 5MB." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const imageBase64 = arrayBufferToBase64(arrayBuffer);
  const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp";

  const model = (formData.get("model") as ModelChoice) || "haiku";
  const extractedLabel = await extractLabelData(
    imageBase64,
    mediaType,
    context.cloudflare.env,
    model,
  );
  const processingTimeMs = Date.now() - startTime;

  const governmentWarningCheck = extractedLabel.isAlcoholLabel
    ? checkGovernmentWarningCompliance(extractedLabel)
    : null;

  return {
    success: true,
    intent: "extract",
    result: { extractedLabel, governmentWarningCheck, processingTimeMs },
  };
}

async function handleCompare(formData: FormData): Promise<VerifyActionResponse> {
  const extractedLabelJson = formData.get("extractedLabel") as string;
  if (!extractedLabelJson) {
    return {
      success: false,
      error: "No extraction data found. Please extract label data first.",
    };
  }

  let extractedLabel: ExtractedLabel;
  try {
    extractedLabel = ExtractedLabelSchema.parse(JSON.parse(extractedLabelJson));
  } catch {
    return { success: false, error: "Invalid extraction data." };
  }

  const applicationData: ApplicationData = {
    brandName: (formData.get("brandName") as string) || "",
    classType: (formData.get("classType") as string) || "",
    alcoholContent: (formData.get("alcoholContent") as string) || "",
    netContents: (formData.get("netContents") as string) || "",
    producerName: (formData.get("producerName") as string) || "",
    producerAddress: (formData.get("producerAddress") as string) || "",
    countryOfOrigin: (formData.get("countryOfOrigin") as string) || "",
    governmentWarning: (formData.get("governmentWarning") as string) || "",
    beverageType: ((formData.get("beverageType") as string) ||
      "") as ApplicationData["beverageType"],
  };

  const result = compareFields(applicationData, extractedLabel, 0);

  return { success: true, intent: "compare", result };
}

export default function Verify() {
  const actionData = useActionData<VerifyActionResponse>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const submittingIntent =
    isSubmitting && navigation.formData ? (navigation.formData.get("intent") as string) : null;

  const [hasFile, setHasFile] = useState(false);

  // Client state: persists extraction across the compare step
  const [extractResult, setExtractResult] = useState<ExtractActionResult | null>(null);

  // Sync extraction result from actionData into state
  useEffect(() => {
    if (actionData?.success && actionData.intent === "extract") {
      setExtractResult(actionData.result);
    }
  }, [actionData]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Label Verification</h1>
        <p className="text-muted-foreground">
          Upload a label image to extract data, then optionally compare against expected label data.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Forms */}
        <div className="space-y-6">
          {/* Form 1: Extract */}
          <Form
            method="post"
            encType="multipart/form-data"
            onSubmit={() => {
              // Reset state when re-extracting
              setExtractResult(null);
            }}
          >
            <input type="hidden" name="intent" value="extract" />
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Step 1: Extract Label Data</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload a label image and AI will read the text from it.
                  </p>
                </div>
                <LabelUpload onFileChange={setHasFile} sampleLabels={SAMPLE_LABELS} />
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
                  disabled={isSubmitting || !hasFile}
                >
                  {submittingIntent === "extract"
                    ? "Extracting Label Data..."
                    : "Extract Label Data"}
                </Button>
              </CardContent>
            </Card>
          </Form>

          {/* Form 2: Compare (visible after extraction) */}
          {extractResult && (
            <Form method="post">
              <input type="hidden" name="intent" value="compare" />
              <input
                type="hidden"
                name="extractedLabel"
                value={JSON.stringify(extractResult.extractedLabel)}
              />
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      Step 2: Compare with Expected Data
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Optionally enter expected label data (from COLA) to compare against the
                      extraction.
                    </p>
                  </div>
                  <ApplicationForm optional />
                  <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                    {submittingIntent === "compare" ? "Comparing..." : "Compare with Expected Data"}
                  </Button>
                </CardContent>
              </Card>
            </Form>
          )}
        </div>

        {/* Right: Results */}
        <div className="space-y-6">
          {isSubmitting && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-muted rounded w-48" />
                  <div className="h-16 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-64" />
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!isSubmitting && actionData && !actionData.success && (
            <Alert variant="destructive">
              <AlertDescription>{actionData.error}</AlertDescription>
            </Alert>
          )}

          {/* Extraction summary (persisted in state) */}
          {!isSubmitting && extractResult && (
            <ExtractionSummary
              extractedLabel={extractResult.extractedLabel}
              governmentWarningCheck={extractResult.governmentWarningCheck}
              processingTimeMs={extractResult.processingTimeMs}
            />
          )}

          {/* Comparison results */}
          {!isSubmitting && actionData?.success && actionData.intent === "compare" && (
            <>
              <Separator />
              <VerificationResults result={actionData.result} />
            </>
          )}

          {!isSubmitting && !extractResult && !actionData && (
            <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
              <div className="text-center space-y-2">
                <p className="text-lg">No results yet</p>
                <p className="text-sm">
                  Upload a label image and click "Extract Label Data" to start.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

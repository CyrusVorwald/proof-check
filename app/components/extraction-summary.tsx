import { AlertTriangle } from "lucide-react";
import { HelpTip } from "~/components/help-tip";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { GovernmentWarningSection } from "~/components/verification-results";
import type { ExtractedLabel, GovernmentWarningCheck } from "~/lib/types";

const FIELD_LABELS: { key: keyof ExtractedLabel; label: string }[] = [
  { key: "brandName", label: "Brand Name" },
  { key: "classType", label: "Class/Type" },
  { key: "alcoholContent", label: "Alcohol Content" },
  { key: "netContents", label: "Net Contents" },
  { key: "producerName", label: "Producer Name" },
  { key: "producerAddress", label: "Producer Address" },
  { key: "countryOfOrigin", label: "Country of Origin" },
  { key: "governmentWarning", label: "Government Warning" },
];

export function ExtractionSummary({
  extractedLabel,
  governmentWarningCheck,
  processingTimeMs,
}: {
  extractedLabel: ExtractedLabel;
  governmentWarningCheck: GovernmentWarningCheck | null;
  processingTimeMs: number;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Extraction Results</h3>

      {!extractedLabel.isAlcoholLabel && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Not an Alcohol Label</AlertTitle>
          <AlertDescription>
            The uploaded image does not appear to be an alcohol beverage label.
          </AlertDescription>
        </Alert>
      )}

      {/* Processing metadata */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>Processed in {(processingTimeMs / 1000).toFixed(1)}s</span>
        <span>
          Confidence: {Math.round(extractedLabel.confidence * 100)}%
          <HelpTip text="How confident the AI model is in its extraction. Higher is better." />
        </span>
        <span>
          Image quality: {extractedLabel.imageQuality}
          <HelpTip text="AI assessment of the uploaded image clarity." />
        </span>
      </div>

      {/* Extracted fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extracted Fields</CardTitle>
          <CardDescription>
            {FIELD_LABELS.filter((f) => extractedLabel[f.key] != null).length} of{" "}
            {FIELD_LABELS.length} fields found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {FIELD_LABELS.map(({ key, label }) => {
              const value = extractedLabel[key];
              return (
                <div key={key} className="flex items-start gap-3 py-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <span className="font-medium text-sm">{label}</span>
                    <p
                      className={`text-sm ${
                        value != null ? "font-mono break-all" : "text-muted-foreground italic"
                      }`}
                    >
                      {value != null ? String(value) : "Not found"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Government Warning Compliance */}
      {governmentWarningCheck && <GovernmentWarningSection check={governmentWarningCheck} />}

      {/* Notes */}
      {extractedLabel.notes.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2">Extraction Notes</h4>
            <ul className="space-y-1">
              {extractedLabel.notes.map((note, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="shrink-0">-</span>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

import { AlertTriangle, CheckCircle, Shield, XCircle } from "lucide-react";
import { FieldResultRow } from "~/components/field-result";
import { HelpTip } from "~/components/help-tip";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import type { GovernmentWarningCheck, VerificationResult } from "~/lib/types";

const overallStatusConfig = {
  approved: {
    icon: CheckCircle,
    title: "Approved",
    description: "All fields match the expected label data.",
    className:
      "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200",
    iconClass: "text-green-600",
  },
  needs_review: {
    icon: AlertTriangle,
    title: "Needs Review",
    description: "Some fields require manual review.",
    className:
      "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200",
    iconClass: "text-yellow-600",
  },
  rejected: {
    icon: XCircle,
    title: "Rejected",
    description: "One or more fields do not match.",
    className:
      "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200",
    iconClass: "text-red-600",
  },
};

export function VerificationResults({ result }: { result: VerificationResult }) {
  const statusConfig = overallStatusConfig[result.overallStatus];
  const StatusIcon = statusConfig.icon;
  const noFieldsCompared = result.fields.length === 0 && result.isAlcoholLabel;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Verification Results</h3>

      {/* Not a label alert */}
      {!result.isAlcoholLabel && (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertTitle>Not an Alcohol Label</AlertTitle>
          <AlertDescription>
            The uploaded image does not appear to be an alcohol beverage label. Please upload a
            valid label image.
          </AlertDescription>
        </Alert>
      )}

      {/* Overall status banner */}
      <div className={`flex items-center gap-3 rounded-lg border p-4 ${statusConfig.className}`}>
        <StatusIcon className={`size-6 shrink-0 ${statusConfig.iconClass}`} />
        <div>
          <p className="font-semibold">{statusConfig.title}</p>
          <p className="text-sm opacity-80">
            {noFieldsCompared
              ? "No expected data provided — only compliance checks were run."
              : statusConfig.description}
          </p>
        </div>
      </div>

      {/* Processing info */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>Processed in {(result.processingTimeMs / 1000).toFixed(1)}s</span>
        <span>
          Confidence: {Math.round(result.confidence * 100)}%
          <HelpTip text="How confident the AI model is in its extraction. Higher is better." />
        </span>
        <span>
          Image quality: {result.imageQuality}
          <HelpTip text="AI assessment of the uploaded image clarity." />
        </span>
      </div>

      {/* Government Warning Compliance */}
      {result.governmentWarningCheck && (
        <GovernmentWarningSection check={result.governmentWarningCheck} />
      )}

      {/* Field results */}
      {result.fields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Field Comparison</CardTitle>
            <CardDescription>
              {result.fields.filter((f) => f.status === "match").length} of {result.fields.length}{" "}
              fields match
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {result.fields.map((field) => (
                <FieldResultRow key={field.key} field={field} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {result.notes.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2">Extraction Notes</h4>
            <ul className="space-y-1">
              {result.notes.map((note, i) => (
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

export function GovernmentWarningSection({ check }: { check: GovernmentWarningCheck }) {
  // Advisory issues contain "verify manually" — separate from hard failures
  const hardIssues = check.issues.filter((i) => !i.includes("verify manually"));
  const advisories = check.issues.filter((i) => i.includes("verify manually"));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="size-4" />
          TTB Government Warning Compliance
        </CardTitle>
        <CardDescription>
          Checked against 27 CFR &sect; 16.21 / &sect; 16.22 standard text
          <HelpTip text="The standard government health warning required on all alcohol beverages sold in the US under 27 CFR § 16." />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Text match status */}
        <div
          className={`flex items-center gap-3 rounded-lg border p-3 ${
            check.textMatch
              ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
              : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
          }`}
        >
          {check.textMatch ? (
            <CheckCircle className="size-5 shrink-0 text-green-600" />
          ) : (
            <XCircle className="size-5 shrink-0 text-red-600" />
          )}
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {check.textMatch ? "Standard text matches" : "Text does not match standard"}
            </p>
            {hardIssues.length > 0 && (
              <ul className="text-sm space-y-0.5">
                {hardIssues.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Formatting advisories (bold/caps detection from image) */}
        {advisories.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200">
            <AlertTriangle className="size-5 shrink-0 text-yellow-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-sm">Formatting Advisory</p>
              <ul className="text-sm space-y-0.5">
                {advisories.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

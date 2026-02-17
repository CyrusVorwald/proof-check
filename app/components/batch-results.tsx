import { AlertTriangle, CheckCircle, ChevronDown, Download, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { VerificationResults } from "~/components/verification-results";
import { generateResultsCSV } from "~/lib/csv";
import type { BatchItemResult } from "~/lib/types";

export function BatchResults({ results }: { results: BatchItemResult[] }) {
  const approved = results.filter((r) => r.result?.overallStatus === "approved").length;
  const needsReview = results.filter((r) => r.result?.overallStatus === "needs_review").length;
  const rejected = results.filter((r) => r.result?.overallStatus === "rejected" || r.error).length;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Batch Results</h3>

      {/* Summary bar */}
      <div className="flex gap-3">
        {approved > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-green-50 border-green-200 p-3 dark:bg-green-950 dark:border-green-800">
            <CheckCircle className="size-5 text-green-600 shrink-0" />
            <div>
              <p className="text-xl font-bold text-green-800 dark:text-green-200">{approved}</p>
              <p className="text-xs text-green-700 dark:text-green-300">Approved</p>
            </div>
          </div>
        )}
        {needsReview > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-yellow-50 border-yellow-200 p-3 dark:bg-yellow-950 dark:border-yellow-800">
            <AlertTriangle className="size-5 text-yellow-600 shrink-0" />
            <div>
              <p className="text-xl font-bold text-yellow-800 dark:text-yellow-200">
                {needsReview}
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">Needs Review</p>
            </div>
          </div>
        )}
        {rejected > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-red-50 border-red-200 p-3 dark:bg-red-950 dark:border-red-800">
            <XCircle className="size-5 text-red-600 shrink-0" />
            <div>
              <p className="text-xl font-bold text-red-800 dark:text-red-200">{rejected}</p>
              <p className="text-xs text-red-700 dark:text-red-300">Rejected</p>
            </div>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const csv = generateResultsCSV(results);
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `proofcheck-results-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <Download className="size-4" />
        Download Results CSV
      </Button>

      {/* Individual results */}
      <div className="space-y-2">
        {results.map((item, i) => (
          <BatchResultRow key={`${item.fileName}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}

const statusConfig = {
  approved: {
    icon: CheckCircle,
    label: "Approved",
    className: "text-green-600",
  },
  needs_review: {
    icon: AlertTriangle,
    label: "Needs Review",
    className: "text-yellow-600",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    className: "text-red-600",
  },
};

function BatchResultRow({ item }: { item: BatchItemResult }) {
  const [expanded, setExpanded] = useState(false);

  if (item.error) {
    return (
      <Card>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
          className="w-full justify-start text-left h-auto p-0 hover:bg-transparent"
        >
          <CardHeader className="py-3 px-4 w-full">
            <div className="flex items-center gap-3">
              <XCircle className="size-5 text-red-600 shrink-0" />
              <span className="font-medium text-sm flex-1 truncate">{item.fileName}</span>
              <span className="text-sm text-red-600">Error</span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </div>
          </CardHeader>
        </Button>
        {expanded && (
          <CardContent className="pt-0 pb-3 px-4">
            <p className="text-sm text-destructive">{item.error}</p>
          </CardContent>
        )}
      </Card>
    );
  }

  if (!item.result) return null;

  const config = statusConfig[item.result.overallStatus];
  const StatusIcon = config.icon;

  return (
    <Card>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="w-full justify-start text-left h-auto p-0 hover:bg-transparent"
      >
        <CardHeader className="py-3 px-4 w-full">
          <div className="flex items-center gap-3">
            <StatusIcon className={`size-5 shrink-0 ${config.className}`} />
            <span className="font-medium text-sm flex-1 truncate">{item.fileName}</span>
            <span className={`text-sm ${config.className}`}>{config.label}</span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </CardHeader>
      </Button>
      {expanded && (
        <CardContent className="pt-0 pb-4 px-4">
          <VerificationResults result={item.result} />
        </CardContent>
      )}
    </Card>
  );
}

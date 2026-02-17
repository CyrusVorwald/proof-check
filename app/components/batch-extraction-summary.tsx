import { CheckCircle, ChevronDown, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import { ExtractionSummary } from "~/components/extraction-summary";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import type { BatchExtractItemResult } from "~/lib/types";

export function BatchExtractionSummary({
  results,
  onRetryFailed,
}: {
  results: BatchExtractItemResult[];
  onRetryFailed?: () => void;
}) {
  const successful = results.filter((r) => r.extractedLabel != null).length;
  const errors = results.filter((r) => r.error).length;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Extraction Results</h3>

      {/* Summary bar */}
      <div className="flex gap-3">
        {successful > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-green-50 border-green-200 p-3 dark:bg-green-950 dark:border-green-800">
            <CheckCircle className="size-5 text-green-600 shrink-0" />
            <div>
              <p className="text-xl font-bold text-green-800 dark:text-green-200">{successful}</p>
              <p className="text-xs text-green-700 dark:text-green-300">Extracted</p>
            </div>
          </div>
        )}
        {errors > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-red-50 border-red-200 p-3 dark:bg-red-950 dark:border-red-800">
            <XCircle className="size-5 text-red-600 shrink-0" />
            <div>
              <p className="text-xl font-bold text-red-800 dark:text-red-200">{errors}</p>
              <p className="text-xs text-red-700 dark:text-red-300">Errors</p>
            </div>
          </div>
        )}
      </div>

      {onRetryFailed && errors > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={onRetryFailed}>
          <RefreshCw className="size-4" />
          Retry {errors} Failed
        </Button>
      )}

      {/* Individual results */}
      <div className="space-y-2">
        {results.map((item) => (
          <BatchExtractRow key={item.fileId} item={item} />
        ))}
      </div>
    </div>
  );
}

function BatchExtractRow({ item }: { item: BatchExtractItemResult }) {
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

  if (!item.extractedLabel) return null;

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
            <CheckCircle className="size-5 text-green-600 shrink-0" />
            <span className="font-medium text-sm flex-1 truncate">{item.fileName}</span>
            <span className="text-sm text-muted-foreground">
              {(item.processingTimeMs / 1000).toFixed(1)}s
            </span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </CardHeader>
      </Button>
      {expanded && (
        <CardContent className="pt-0 pb-4 px-4">
          <ExtractionSummary
            extractedLabel={item.extractedLabel}
            governmentWarningCheck={item.governmentWarningCheck}
            processingTimeMs={item.processingTimeMs}
          />
        </CardContent>
      )}
    </Card>
  );
}

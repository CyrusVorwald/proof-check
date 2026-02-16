import { AlertTriangle, CheckCircle, HelpCircle, XCircle } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { FieldResult as FieldResultType } from "~/lib/types";

const statusConfig = {
  match: {
    icon: CheckCircle,
    color: "text-green-600",
    badgeVariant: "outline" as const,
    badgeClass: "border-green-600 text-green-600",
    label: "Match",
    tooltip: "The extracted value matches the expected value.",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-600",
    badgeVariant: "outline" as const,
    badgeClass: "border-yellow-600 text-yellow-600",
    label: "Warning",
    tooltip: "Minor difference detected (e.g. case variation). May still be acceptable.",
  },
  mismatch: {
    icon: XCircle,
    color: "text-red-600",
    badgeVariant: "outline" as const,
    badgeClass: "border-red-600 text-red-600",
    label: "Mismatch",
    tooltip: "The extracted value does not match the expected value.",
  },
  not_found: {
    icon: HelpCircle,
    color: "text-muted-foreground",
    badgeVariant: "outline" as const,
    badgeClass: "border-muted-foreground text-muted-foreground",
    label: "Not Found",
    tooltip: "This field was not detected on the label.",
  },
};

export function FieldResultRow({ field }: { field: FieldResultType }) {
  const config = statusConfig[field.status];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className={`size-5 mt-0.5 shrink-0 ${config.color}`} />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{field.name}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant={config.badgeVariant} className={`${config.badgeClass} cursor-help`}>
                {config.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {config.tooltip}
            </TooltipContent>
          </Tooltip>
        </div>

        {field.explanation && <p className="text-sm text-muted-foreground">{field.explanation}</p>}

        <div className="grid grid-cols-2 gap-2 text-xs mt-1">
          <div>
            <span className="text-muted-foreground">Expected:</span>
            <p className="font-mono break-all">{field.expected}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Found:</span>
            <p className="font-mono break-all">{field.extracted ?? "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

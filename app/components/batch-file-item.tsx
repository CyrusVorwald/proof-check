import { ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { ApplicationForm } from "~/components/application-form";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import type { ApplicationData } from "~/lib/types";

interface BatchFileItemProps {
  id: string;
  fileName: string;
  preview: string;
  values: Partial<ApplicationData>;
  onChange: (fileId: string, field: keyof ApplicationData, value: string) => void;
  onRemove: () => void;
}

export function BatchFileItem({
  id,
  fileName,
  preview,
  values,
  onChange,
  onRemove,
}: BatchFileItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 p-2">
          <img src={preview} alt={fileName} className="size-10 rounded object-cover shrink-0" />
          <p className="text-sm truncate flex-1 min-w-0">{fileName}</p>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="shrink-0">
              <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
              <span className="ml-1 text-xs">{open ? "Hide fields" : "Edit fields"}</span>
            </Button>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onRemove}
          >
            <X className="size-4" />
          </Button>
        </div>
        <CollapsibleContent>
          <div className="border-t px-4 py-4">
            <ApplicationForm
              optional
              values={values}
              onChange={(field, value) => onChange(id, field, value)}
              heading={false}
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

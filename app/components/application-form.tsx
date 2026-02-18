import { useState } from "react";
import { HelpTip } from "~/components/help-tip";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import type { ApplicationData, BeverageType } from "~/lib/types";

interface ApplicationFormProps {
  optional?: boolean;
  namePrefix?: string;
  defaultValues?: Partial<ApplicationData>;
  heading?: string | false;
}

export function ApplicationForm({
  optional = false,
  namePrefix,
  defaultValues,
  heading,
}: ApplicationFormProps) {
  const [beverageType, setBeverageType] = useState<BeverageType | "">(
    defaultValues?.beverageType ?? "",
  );

  const name = (field: string) => (namePrefix ? `${namePrefix}.${field}` : field);
  const fieldId = (field: string) => (namePrefix ? `${namePrefix}-${field}` : field);

  return (
    <div className="space-y-4">
      {heading !== false && (
        <h3 className="text-lg font-semibold">
          {typeof heading === "string" ? heading : "Expected Label Data"}
        </h3>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={fieldId("brandName")}>
            Brand Name {!optional && <span className="text-destructive">*</span>}
            <HelpTip text="Must match the label exactly. Case differences produce a warning, not a rejection." />
          </Label>
          <Input
            id={fieldId("brandName")}
            name={name("brandName")}
            placeholder="e.g., Tito's Handmade"
            required={!optional}
            defaultValue={defaultValues?.brandName}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("beverageType")}>
            Beverage Type
            <HelpTip text="Select the product category. TTB requirements vary by type." />
          </Label>
          <Select
            value={beverageType || undefined}
            onValueChange={(v) => setBeverageType(v as BeverageType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beer">Beer</SelectItem>
              <SelectItem value="wine">Wine</SelectItem>
              <SelectItem value="distilled_spirits">Distilled Spirits</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name={name("beverageType")} value={beverageType} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("classType")}>
            Class/Type
            <HelpTip text="The specific designation, e.g. Kentucky Straight Bourbon Whiskey, Cabernet Sauvignon." />
          </Label>
          <Input
            id={fieldId("classType")}
            name={name("classType")}
            placeholder="e.g., Vodka, Cabernet Sauvignon"
            defaultValue={defaultValues?.classType}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("alcoholContent")}>
            Alcohol Content {!optional && <span className="text-destructive">*</span>}
            <HelpTip text="Accepts multiple formats: 40% ABV, 80 Proof, 40% Alc./Vol. (80 Proof). Values are automatically cross-converted." />
          </Label>
          <Input
            id={fieldId("alcoholContent")}
            name={name("alcoholContent")}
            placeholder="e.g., 40% ALC./VOL., 80 Proof, or 40"
            required={!optional}
            defaultValue={defaultValues?.alcoholContent}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("netContents")}>
            Net Contents
            <HelpTip text="Enter the value as shown on the label. Spacing is normalized (e.g., '750ml' matches '750 mL')." />
          </Label>
          <Input
            id={fieldId("netContents")}
            name={name("netContents")}
            placeholder="e.g., 750 mL, 12 FL OZ, or 750"
            defaultValue={defaultValues?.netContents}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("countryOfOrigin")}>
            Country of Origin
            <HelpTip text="Required for imported products per TTB regulations." />
          </Label>
          <Input
            id={fieldId("countryOfOrigin")}
            name={name("countryOfOrigin")}
            placeholder="e.g., United States"
            defaultValue={defaultValues?.countryOfOrigin}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("producerName")}>
            Producer Name
            <HelpTip text="The bottler, importer, or producer name as shown on the label." />
          </Label>
          <Input
            id={fieldId("producerName")}
            name={name("producerName")}
            placeholder="e.g., Fifth Generation Inc."
            defaultValue={defaultValues?.producerName}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={fieldId("producerAddress")}>
            Producer Address
            <HelpTip text="Address abbreviations (St, Ave, Blvd) are expanded automatically for comparison." />
          </Label>
          <Input
            id={fieldId("producerAddress")}
            name={name("producerAddress")}
            placeholder="e.g., Austin, Texas"
            defaultValue={defaultValues?.producerAddress}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId("governmentWarning")}>
          Government Warning <span className="text-muted-foreground font-normal">(optional)</span>
          <HelpTip text="Leave blank to just check the label against standard TTB text. Enter text here for an additional comparison against your expected wording." />
        </Label>
        <Textarea
          id={fieldId("governmentWarning")}
          name={name("governmentWarning")}
          rows={4}
          placeholder="GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
          defaultValue={defaultValues?.governmentWarning}
        />
        <p className="text-xs text-muted-foreground">
          The label is automatically checked against the standard TTB government warning text (27
          CFR &sect; 16). Enter text here only if you want an additional comparison against your
          expected label data.
        </p>
      </div>
    </div>
  );
}

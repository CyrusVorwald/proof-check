import { Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface LabelUploadProps {
  onFileChange?: (hasFile: boolean) => void;
}

export function LabelUpload({ onFileChange }: LabelUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validateAndSetFile = useCallback(
    (file: File | null) => {
      setError(null);
      if (!file) {
        setPreview(null);
        setFileName(null);
        onFileChange?.(false);
        return;
      }

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Please upload a JPG, PNG, or WebP image.");
        return;
      }

      if (file.size > MAX_SIZE_BYTES) {
        setError(`File must be smaller than ${MAX_SIZE_MB}MB.`);
        return;
      }

      setFileName(file.name);
      onFileChange?.(true);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    },
    [onFileChange],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndSetFile(e.target.files?.[0] ?? null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.current.files = dt.files;
      validateAndSetFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClear = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setPreview(null);
    setFileName(null);
    setError(null);
    onFileChange?.(false);
  };

  return (
    <div className="space-y-2">
      <Label>
        Label Image <span className="text-destructive">*</span>
      </Label>
      <div
        role="button"
        tabIndex={0}
        className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : error
              ? "border-destructive"
              : preview
                ? "border-muted"
                : "border-muted-foreground/25 hover:border-primary/50"
        }`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          name="labelImage"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleChange}
          className="hidden"
          required
        />

        {preview ? (
          <div className="space-y-3">
            <img
              src={preview}
              alt="Label preview"
              className="mx-auto max-h-48 rounded-md object-contain"
            />
            <p className="text-sm text-muted-foreground truncate">{fileName}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            >
              <X className="size-3" />
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="mx-auto size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, or WebP (max {MAX_SIZE_MB}MB)
              </p>
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

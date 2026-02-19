import { Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import type { SampleLabel } from "~/lib/types";
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from "~/lib/utils";

const MAX_FILES = 300;

export interface FileEntry {
  id: string;
  file: File;
  preview: string;
}

export function BatchUpload({
  files,
  onFilesChange,
  sampleLabels,
}: {
  files: FileEntry[];
  onFilesChange: (files: FileEntry[]) => void;
  sampleLabels?: SampleLabel[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sampleAbortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingSamples, setLoadingSamples] = useState(false);

  useEffect(() => {
    return () => {
      sampleAbortRef.current?.abort();
    };
  }, []);

  const addFiles = useCallback(
    (fileList: FileList) => {
      setError(null);
      const newEntries: FileEntry[] = [];
      const errors: string[] = [];

      for (const file of Array.from(fileList)) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          errors.push(`${file.name}: invalid file type`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: exceeds ${MAX_FILE_SIZE_MB}MB limit`);
          continue;
        }
        newEntries.push({
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
        });
      }

      const combined = [...files, ...newEntries];
      if (combined.length > MAX_FILES) {
        const discarded = combined.slice(MAX_FILES);
        for (const entry of discarded) {
          URL.revokeObjectURL(entry.preview);
        }
        setError(
          `Maximum ${MAX_FILES} files allowed. ${combined.length - MAX_FILES} file(s) were not added.`,
        );
        onFilesChange(combined.slice(0, MAX_FILES));
      } else {
        if (errors.length > 0) {
          setError(errors.join("; "));
        }
        onFilesChange(combined);
      }
    },
    [files, onFilesChange],
  );

  const removeFile = useCallback(
    (id: string) => {
      const entry = files.find((f) => f.id === id);
      if (entry) URL.revokeObjectURL(entry.preview);
      onFilesChange(files.filter((f) => f.id !== id));
    },
    [files, onFilesChange],
  );

  const clearAll = useCallback(() => {
    for (const entry of files) {
      URL.revokeObjectURL(entry.preview);
    }
    onFilesChange([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [files, onFilesChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const loadSamples = useCallback(
    async (samples: SampleLabel[]) => {
      sampleAbortRef.current?.abort();
      const controller = new AbortController();
      sampleAbortRef.current = controller;

      setLoadingSamples(true);
      setError(null);
      try {
        const entries: FileEntry[] = await Promise.all(
          samples.map(async (sample) => {
            const response = await fetch(sample.url, { signal: controller.signal });
            const blob = await response.blob();
            const file = new File([blob], sample.fileName, { type: blob.type });
            return {
              id: crypto.randomUUID(),
              file,
              preview: URL.createObjectURL(blob),
            };
          }),
        );
        onFilesChange([...files, ...entries]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load sample images. Please try again.");
      } finally {
        setLoadingSamples(false);
      }
    },
    [files, onFilesChange],
  );

  const totalSizeBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const totalSizeLabel =
    totalSizeBytes >= 1024 * 1024
      ? `${(totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(totalSizeBytes / 1024).toFixed(0)} KB`;

  return (
    <div className="space-y-3">
      <Label>
        Label Images <span className="text-destructive">*</span>
      </Label>

      <div
        role="button"
        tabIndex={0}
        className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : error
              ? "border-destructive"
              : "border-muted-foreground/25 hover:border-primary/50"
        }`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          multiple
          onChange={handleChange}
          className="hidden"
        />
        <div className="space-y-2">
          <Upload className="mx-auto size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Click to upload or drag and drop multiple files</p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, or WebP (max {MAX_FILE_SIZE_MB}MB each, up to {MAX_FILES} files)
            </p>
          </div>
          {files.length === 0 && sampleLabels && sampleLabels.length > 0 && (
            <div className="pt-3 mt-3 border-t border-muted-foreground/15">
              <p className="text-xs text-muted-foreground mb-2">Or try sample labels:</p>
              <div className="flex justify-center gap-3">
                {sampleLabels.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    disabled={loadingSamples}
                    onClick={() => loadSamples([sample])}
                    className="group relative rounded-md overflow-hidden border border-muted-foreground/20 hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-muted/30"
                  >
                    <img src={sample.url} alt={sample.label} className="h-28 w-20 object-contain" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] py-0.5 leading-tight">
                      {sample.label}
                    </span>
                    {loadingSamples && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="size-4 text-white animate-spin" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingSamples}
                onClick={() => sampleLabels && loadSamples(sampleLabels)}
                className="mt-3"
              >
                {loadingSamples ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load all samples"
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {files.length} file{files.length !== 1 ? "s" : ""} selected ({totalSizeLabel} total)
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {files.map((entry) => (
              <div key={entry.id} className="relative group border rounded-md overflow-hidden">
                <img
                  src={entry.preview}
                  alt={entry.file.name}
                  className="w-full h-24 object-cover"
                />
                <p className="text-xs truncate px-1 py-0.5 bg-background">{entry.file.name}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(entry.id)}
                  className="absolute top-1 right-1 size-6 bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

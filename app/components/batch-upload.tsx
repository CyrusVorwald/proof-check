import { Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_FILES = 300;

export interface FileEntry {
  id: string;
  file: File;
  preview: string;
}

let nextId = 0;

export function BatchUpload({
  files,
  onFilesChange,
}: {
  files: FileEntry[];
  onFilesChange: (files: FileEntry[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback(
    (fileList: FileList) => {
      setError(null);
      const newEntries: FileEntry[] = [];
      const errors: string[] = [];

      for (const file of Array.from(fileList)) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          errors.push(`${file.name}: invalid file type`);
          continue;
        }
        if (file.size > MAX_SIZE_BYTES) {
          errors.push(`${file.name}: exceeds ${MAX_SIZE_MB}MB limit`);
          continue;
        }
        newEntries.push({
          id: String(nextId++),
          file,
          preview: URL.createObjectURL(file),
        });
      }

      const combined = [...files, ...newEntries];
      if (combined.length > MAX_FILES) {
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

  const totalSizeMB = files.reduce((sum, f) => sum + f.file.size, 0) / (1024 * 1024);

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
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
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
              JPG, PNG, or WebP (max {MAX_SIZE_MB}MB each, up to {MAX_FILES} files)
            </p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {files.length} file{files.length !== 1 ? "s" : ""} selected ({totalSizeMB.toFixed(1)}{" "}
              MB total)
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

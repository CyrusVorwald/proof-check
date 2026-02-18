import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export async function processWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

export function validateUploadedFile(file: File | null): string | null {
  if (!file || file.size === 0) return "Please upload a label image.";
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type))
    return "Invalid file type. Please upload a JPG, PNG, or WebP image.";
  if (file.size > MAX_FILE_SIZE) return "File too large. Maximum size is 5MB.";
  return null;
}

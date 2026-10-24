import { useState } from "react";
import { useRequestUploadUrl, useCompleteUpload, UploadInputContentType } from "@workspace/api-client-react";
import { errMessage } from "@/lib/format";

export const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = Object.values(UploadInputContentType) as string[];

export function validateImage(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Only JPEG, PNG or WebP images are allowed.";
  if (file.size > MAX_BYTES) return "Images must be 5 MB or smaller.";
  if (file.size < 1) return "That file is empty.";
  return null;
}

/** Request ticket -> PUT bytes -> finalize. Resolves only with a finalized objectPath. */
export function useImageUpload() {
  const requestUrl = useRequestUploadUrl();
  const complete = useCompleteUpload();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    setError(null);
    const invalid = validateImage(file);
    if (invalid) { setError(invalid); return null; }
    setBusy(true);
    try {
      const ticket = await requestUrl.mutateAsync({ data: { name: file.name.slice(0, 200), size: file.size, contentType: file.type as UploadInputContentType } });
      const put = await fetch(ticket.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error(`Upload failed (${put.status}). Please try again.`);
      const done = await complete.mutateAsync({ data: { objectPath: ticket.objectPath } });
      return done.objectPath;
    } catch (e) {
      setError(errMessage(e, "Upload failed. Please try again."));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { upload, busy, error, setError };
}

import { useRef } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImageUpload } from "@/hooks/use-image-upload";
import { storageUrl } from "@/lib/format";

/** Multi-image picker. Only finalized object paths are added to value. */
export function ImagePicker({ value, onChange, max = 6 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy, error } = useImageUpload();

  async function onFiles(files: FileList | null) {
    if (!files) return;
    let next = [...value];
    for (const file of Array.from(files)) {
      if (next.length >= max) break;
      const path = await upload(file);
      if (path) { next = [...next, path]; onChange(next); }
      else break;
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {value.map((p, i) => (
          <div key={p} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
            <img src={storageUrl(p)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 text-[10px] font-semibold">Cover</span>}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== p))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/90" aria-label="Remove photo" data-testid={`button-remove-image-${i}`}><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed text-muted-foreground hover:border-primary hover:text-primary" data-testid="button-add-image">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="sr-only">Add photo</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} data-testid="input-images" />
      <p className="mt-2 text-xs text-muted-foreground">{busy ? "Uploading. Your photo appears once it is fully stored." : `Up to ${max} photos. JPEG, PNG or WebP, 5 MB each. First photo is the cover.`}</p>
      {error && <p className="mt-1 text-sm text-destructive" data-testid="text-upload-error">{error}</p>}
    </div>
  );
}

export function AvatarPicker({ value, onChange, fallback }: { value: string | null; onChange: (v: string | null) => void; fallback: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy, error } = useImageUpload();
  async function onFile(file?: File) {
    if (!file) return;
    const p = await upload(file);
    if (p) onChange(p);
    if (input.current) input.current.value = "";
  }
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border bg-accent font-display text-xl font-semibold text-accent-foreground">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : value ? <img src={storageUrl(value)} alt="Your avatar" className="h-full w-full object-cover" /> : fallback}
      </div>
      <div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy} data-testid="button-upload-avatar">{value ? "Change photo" : "Upload photo"}</Button>
          {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={busy} data-testid="button-remove-avatar">Remove</Button>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB. Changes apply when you save.</p>
        {error && <p className="mt-1 text-sm text-destructive" data-testid="text-avatar-error">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-avatar" />
    </div>
  );
}

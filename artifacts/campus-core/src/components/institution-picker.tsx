import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetDirectory, getGetDirectoryQueryKey, useRequestInstitution, type DirectoryEntryKind } from "@workspace/api-client-react";
import { DirectorySelect } from "@/components/directory-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";

export interface Institution { countryId: number | null; universityId: number | null; facultyId: number | null; departmentId: number | null }

const LABEL: Record<DirectoryEntryKind, string> = { country: "Country", university: "University", faculty: "Faculty or college", department: "Department" };

function Level({ kind, parentId, value, onChange, disabled, required, onRequest }: {
  kind: DirectoryEntryKind; parentId: number | null; value: number | null; onChange: (v: number | null) => void; disabled?: boolean; required?: boolean; onRequest: () => void;
}) {
  const params = kind === "country" ? { kind } : { kind, parentId: parentId ?? undefined };
  const enabled = kind === "country" || parentId !== null;
  const { data, isLoading, error } = useGetDirectory(params, { query: { enabled, queryKey: getGetDirectoryQueryKey(params), staleTime: 5 * 60_000 } });
  const list = (data ?? []).filter((d) => d.active || d.id === value);
  const none = enabled && !isLoading && !error && list.length === 0;
  return (
    <div>
      <Label className="mb-1.5 block">{LABEL[kind]}{required ? " *" : " (optional)"}</Label>
      <DirectorySelect entries={list} value={value} onChange={onChange} label={LABEL[kind]} testId={`select-${kind}`}
        allowEmpty={!required} disabled={disabled || !enabled || isLoading}
        placeholder={!enabled ? "Choose the level above first" : isLoading ? "Loading" : none ? "Not listed yet" : `Select ${LABEL[kind].toLowerCase()}`} />
      {error ? <p className="mt-1 text-xs text-destructive">Could not load this list. {errMessage(error)}</p> : enabled && !isLoading && (
        <p className="mt-1 text-xs text-muted-foreground">
          {none ? "Our directory does not cover this yet. " : "Missing yours? "}
          <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onRequest} data-testid={`button-request-${kind}`}>Request it</button>
        </p>
      )}
    </div>
  );
}

export function InstitutionPicker({ value, onChange }: { value: Institution; onChange: (v: Institution) => void }) {
  const [req, setReq] = useState<{ kind: DirectoryEntryKind; parentId: number | null } | null>(null);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Level kind="country" parentId={null} value={value.countryId} required
        onChange={(v) => onChange({ countryId: v, universityId: null, facultyId: null, departmentId: null })}
        onRequest={() => setReq({ kind: "country", parentId: null })} />
      <Level kind="university" parentId={value.countryId} value={value.universityId} required
        onChange={(v) => onChange({ ...value, universityId: v, facultyId: null, departmentId: null })}
        onRequest={() => setReq({ kind: "university", parentId: value.countryId })} />
      <Level kind="faculty" parentId={value.universityId} value={value.facultyId}
        onChange={(v) => onChange({ ...value, facultyId: v, departmentId: null })}
        onRequest={() => setReq({ kind: "faculty", parentId: value.universityId })} />
      <Level kind="department" parentId={value.facultyId} value={value.departmentId}
        onChange={(v) => onChange({ ...value, departmentId: v })}
        onRequest={() => setReq({ kind: "department", parentId: value.facultyId })} />
      <RequestDialog request={req} onClose={() => setReq(null)} />
    </div>
  );
}

function RequestDialog({ request, onClose }: { request: { kind: DirectoryEntryKind; parentId: number | null } | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const mut = useRequestInstitution();
  const qc = useQueryClient();
  const { toast } = useToast();

  function submit() {
    if (!request) return;
    if (name.trim().length < 2) { setErr("Please enter the full official name."); return; }
    setErr(null);
    mut.mutate({ data: { kind: request.kind, name: name.trim(), parentId: request.parentId, sourceUrl: sourceUrl.trim() || undefined, notes: notes.trim() || undefined } }, {
      onSuccess: (r) => {
        toast({ title: "Request sent", description: r.message || "A moderator will review it against an official source." });
        qc.invalidateQueries({ queryKey: ["/api/admin/overview"] });
        setName(""); setSourceUrl(""); setNotes(""); onClose();
      },
      onError: (e) => setErr(errMessage(e)),
    });
  }

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Request a {request ? LABEL[request.kind].toLowerCase() : ""}</DialogTitle>
          <DialogDescription>We only add institutions we can confirm from an official source. A link helps us move faster.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="req-name">Official name</Label><Input id="req-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} data-testid="input-request-name" /></div>
          <div><Label htmlFor="req-url">Official website or source (optional)</Label><Input id="req-url" value={sourceUrl} maxLength={500} placeholder="https://" onChange={(e) => setSourceUrl(e.target.value)} data-testid="input-request-url" /></div>
          <div><Label htmlFor="req-notes">Notes (optional)</Label><Textarea id="req-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} data-testid="input-request-notes" /></div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending} data-testid="button-submit-request">{mut.isPending ? "Sending" : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

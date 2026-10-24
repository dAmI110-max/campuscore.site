import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Pencil, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useGetAdminOverview, getGetAdminOverviewQueryKey, useModerate, useManageDirectory, getGetDirectoryQueryKey, getListListingsQueryKey, getGetSummaryQueryKey, type AdminRecord, type DirectoryEntry, type DirectoryInputKind, type ModerationInputAction } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/states";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { ago, errMessage } from "@/lib/format";

const ACTION_LABEL: Record<ModerationInputAction, string> = {
  "resolve-report": "Resolve report", "dismiss-request": "Dismiss request", "hide-listing": "Hide listing",
  "verify-listing": "Verify listing", "suspend-user": "Suspend user", "restore-user": "Restore user",
};

export default function Admin() {
  const me = useMe();
  const isAdmin = me.profile?.role === "admin";
  const { data, isLoading, error, refetch } = useGetAdminOverview({ query: { enabled: isAdmin, queryKey: getGetAdminOverviewQueryKey() } });
  const [mod, setMod] = useState<{ action: ModerationInputAction; targetId: string; title: string } | null>(null);

  if (me.loading) return <PageSkeleton />;
  if (!isAdmin) return <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Moderators only" action={<Button asChild variant="outline"><Link href="/explore">Back to Explore</Link></Button>}>This area is for Campus Core administrators.</EmptyState>;
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const open = (action: ModerationInputAction, targetId: string, title: string) => setMod({ action, targetId, title });

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Moderation desk">Every action needs a reason and is recorded in the audit log.</PageHeader>
      <Tabs defaultValue="reports">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="reports" data-testid="tab-reports">Reports ({data.reports.length})</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">Requests ({data.requests.length})</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users ({data.users.length})</TabsTrigger>
          <TabsTrigger value="listings" data-testid="tab-listings">Listings</TabsTrigger>
          <TabsTrigger value="directory" data-testid="tab-directory">Directory ({data.directory.length})</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="reports">
          <Records items={data.reports} empty="No reports. Nothing needs attention." actions={(r) => (
            <>
              <Button size="sm" variant="outline" asChild><Link href={`/listing/${r.targetId}`}>View</Link></Button>
              <Button size="sm" variant="outline" onClick={() => open("hide-listing", r.targetId, r.title)} data-testid={`button-hide-${r.id}`}>Hide listing</Button>
              <Button size="sm" onClick={() => open("resolve-report", r.id, r.title)} data-testid={`button-resolve-${r.id}`}>Resolve</Button>
            </>
          )} />
        </TabsContent>
        <TabsContent value="requests">
          <Records items={data.requests} empty="No institution requests waiting." actions={(r) => (
            <Button size="sm" variant="outline" onClick={() => open("dismiss-request", r.id, r.title)} data-testid={`button-dismiss-${r.id}`}>Dismiss</Button>
          )} note="To approve a request, add the entry in the Directory tab after confirming the official source, then dismiss the request." />
        </TabsContent>
        <TabsContent value="users">
          <Records items={data.users} empty="No users yet." actions={(r) => r.status === "suspended" ? (
            <Button size="sm" onClick={() => open("restore-user", r.targetId, r.title)} data-testid={`button-restore-${r.id}`}>Restore</Button>
          ) : (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => open("suspend-user", r.targetId, r.title)} data-testid={`button-suspend-${r.id}`}>Suspend</Button>
          )} />
        </TabsContent>
        <TabsContent value="listings"><ListingTools onAct={open} /></TabsContent>
        <TabsContent value="directory"><DirectoryManager entries={data.directory} /></TabsContent>
        <TabsContent value="audit"><Records items={data.audit} empty="No moderation actions recorded yet." /></TabsContent>
      </Tabs>
      <ModerateDialog target={mod} onClose={() => setMod(null)} />
    </div>
  );
}

function Records({ items, empty, actions, note }: { items: AdminRecord[]; empty: string; actions?: (r: AdminRecord) => React.ReactNode; note?: string }) {
  return (
    <div>
      {note && <p className="mb-3 text-sm text-muted-foreground">{note}</p>}
      {!items.length ? <EmptyState title={empty} /> : (
        <ul className="divide-y rounded-2xl border bg-card">
          {items.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-record-${r.id}`}>
              <div className="min-w-0">
                <p className="font-medium">{r.title}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{r.detail}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{r.status} · {ago(r.createdAt)}</p>
              </div>
              {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions(r)}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListingTools({ onAct }: { onAct: (a: ModerationInputAction, id: string, title: string) => void }) {
  const [id, setId] = useState("");
  const ok = /^\d+$/.test(id.trim());
  return (
    <div className="max-w-xl rounded-2xl border bg-card p-5">
      <h3 className="font-display text-lg font-semibold">Act on a listing</h3>
      <p className="text-sm text-muted-foreground">Enter the listing number from its URL (/listing/123).</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="Listing ID" inputMode="numeric" data-testid="input-admin-listing-id" />
        <Button variant="outline" disabled={!ok} onClick={() => onAct("verify-listing", id.trim(), `Listing #${id.trim()}`)} data-testid="button-admin-verify">Verify</Button>
        <Button variant="outline" className="text-destructive" disabled={!ok} onClick={() => onAct("hide-listing", id.trim(), `Listing #${id.trim()}`)} data-testid="button-admin-hide">Hide</Button>
      </div>
    </div>
  );
}

function ModerateDialog({ target, onClose }: { target: { action: ModerationInputAction; targetId: string; title: string } | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const mut = useModerate();
  const qc = useQueryClient();
  const { toast } = useToast();
  function go() {
    if (!target) return;
    if (reason.trim().length < 5) { setErr("Give a reason of at least 5 characters."); return; }
    mut.mutate({ data: { action: target.action, targetId: target.targetId, reason: reason.trim() } }, {
      onSuccess: (r) => {
        qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
        qc.invalidateQueries({ queryKey: getListListingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/listings/") });
        toast({ title: ACTION_LABEL[target.action], description: r.message });
        setReason(""); setErr(null); onClose();
      },
      onError: (e) => setErr(errMessage(e)),
    });
  }
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{target ? ACTION_LABEL[target.action] : ""}</DialogTitle>
          <DialogDescription>{target?.title}</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Reason, recorded in the audit log" data-testid="input-moderation-reason" />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={mut.isPending} data-testid="button-confirm-moderation">{mut.isPending ? "Working" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const KIND_ORDER: DirectoryInputKind[] = ["country", "university", "faculty", "department"];
const PARENT: Record<DirectoryInputKind, DirectoryInputKind | null> = { country: null, university: "country", faculty: "university", department: "faculty" };

function DirectoryManager({ entries }: { entries: DirectoryEntry[] }) {
  const [filter, setFilter] = useState<DirectoryInputKind>("university");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<DirectoryEntry> & { kind: DirectoryInputKind } | null>(null);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const list = entries.filter((e) => e.kind === filter && e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Select value={filter} onValueChange={(v) => setFilter(v as DirectoryInputKind)}>
          <SelectTrigger className="sm:w-44" data-testid="select-directory-kind"><SelectValue /></SelectTrigger>
          <SelectContent>{KIND_ORDER.map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" data-testid="input-directory-filter" />
        <Button onClick={() => setEdit({ kind: filter, active: true, sourceUrl: "", name: "", parentId: null })} data-testid="button-add-directory"><Plus className="mr-2 h-4 w-4" />Add {filter}</Button>
      </div>
      {!list.length ? <EmptyState title={`No ${filter} entries`}>Add entries only from official sources such as NUC or the institution's own website.</EmptyState> : (
        <ul className="divide-y rounded-2xl border bg-card">
          {list.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 p-4" data-testid={`row-directory-${e.id}`}>
              <div className="min-w-0">
                <p className="font-medium">{e.name} {!e.active && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">inactive</span>}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.parentId ? `in ${byId.get(e.parentId)?.name ?? "#" + e.parentId} · ` : ""}
                  {e.sourceUrl ? <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary">source <ExternalLink className="h-3 w-3" /></a> : "no source"}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEdit({ ...e, kind: e.kind })} data-testid={`button-edit-directory-${e.id}`}><Pencil className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <DirectoryDialog entry={edit} entries={entries} onClose={() => setEdit(null)} />
    </div>
  );
}

function DirectoryDialog({ entry, entries, onClose }: { entry: (Partial<DirectoryEntry> & { kind: DirectoryInputKind }) | null; entries: DirectoryEntry[]; onClose: () => void }) {
  const mut = useManageDirectory();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [parentId, setParentId] = useState("");
  const [active, setActive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState<unknown>(null);
  if (entry !== key) {
    setKey(entry);
    if (entry) { setName(entry.name ?? ""); setSourceUrl(entry.sourceUrl ?? ""); setParentId(entry.parentId ? String(entry.parentId) : ""); setActive(entry.active ?? true); setErr(null); }
  }
  const parentKind = entry ? PARENT[entry.kind] : null;
  const parents = parentKind ? entries.filter((e) => e.kind === parentKind) : [];

  function submit() {
    if (!entry) return;
    if (name.trim().length < 2) return setErr("Name needs at least 2 characters.");
    if (parentKind && !parentId) return setErr(`Choose the parent ${parentKind}.`);
    if (!/^https?:\/\//.test(sourceUrl.trim())) return setErr("Add the official source URL.");
    mut.mutate({ data: { id: entry.id, kind: entry.kind, name: name.trim(), parentId: parentId ? Number(parentId) : null, sourceUrl: sourceUrl.trim(), active } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDirectoryQueryKey() });
        qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        toast({ title: entry.id ? "Entry updated" : "Entry added" });
        onClose();
      },
      onError: (e) => setErr(errMessage(e)),
    });
  }
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display capitalize">{entry?.id ? "Edit" : "Add"} {entry?.kind}</DialogTitle>
          <DialogDescription>Use the official name exactly as published by the institution or regulator.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} data-testid="input-directory-name" /></div>
          {parentKind && (
            <div><Label className="capitalize">Parent {parentKind}</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger data-testid="select-directory-parent"><SelectValue placeholder={`Choose ${parentKind}`} /></SelectTrigger>
                <SelectContent>{parents.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select></div>
          )}
          <div><Label>Official source URL</Label><Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" data-testid="input-directory-source" /></div>
          <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3"><Label>Active, shown to students</Label><Switch checked={active} onCheckedChange={setActive} data-testid="switch-directory-active" /></div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending} data-testid="button-save-directory">{mut.isPending ? "Saving" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

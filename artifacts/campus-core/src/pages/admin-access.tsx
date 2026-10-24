import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight, Crown, EyeOff, Lock, Search, ShieldCheck, ShieldOff, UserCheck, UserMinus, UserPlus } from "lucide-react";
import {
  useGetStaffAccess, getGetStaffAccessQueryKey, useChangeStaffRole, useRequestStaffChange, useDecideStaffRequest,
  getGetAdminOverviewQueryKey, getGetProfileQueryKey, useGetProfile,
  type StaffUser, type StaffRequest,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/states";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { ago, errMessage } from "@/lib/format";

const PAGE_SIZE = 25;
type Mode = "direct" | "request";
type Pending =
  | { kind: "change"; user: StaffUser; to: "admin" | "student"; mode: Mode }
  | { kind: "decide"; request: StaffRequest; decision: "approve" | "reject" };

function statusOf(e: unknown) { return (e as { status?: number } | null)?.status; }
function forbiddenText(e: unknown) {
  return statusOf(e) === 403
    ? "Your account no longer has permission for this. Your access may have changed while this page was open. Refresh to see what you can still do."
    : errMessage(e);
}

const ROLE_STYLE: Record<StaffUser["role"], string> = {
  owner: "bg-primary text-primary-foreground",
  admin: "bg-accent text-accent-foreground border border-primary/30",
  student: "bg-muted text-muted-foreground",
};
const STATUS_STYLE: Record<StaffRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default function AdminAccess() {
  const me = useMe();
  // Periodic profile refresh so revoked controls disappear while this screen is open.
  useGetProfile({ query: { enabled: me.signedIn, queryKey: getGetProfileQueryKey(), refetchInterval: 30000 } });
  const role = me.profile?.role;
  const isOwner = role === "owner";
  const isStaff = isOwner || role === "admin";

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [qInput]);
  const params = { ...(q ? { q } : {}), page };
  const { data, isLoading, isFetching, error, refetch } = useGetStaffAccess(params, { query: { enabled: isStaff, queryKey: getGetStaffAccessQueryKey(params), refetchInterval: 30000 } });
  const [pending, setPending] = useState<Pending | null>(null);

  if (me.loading) return <PageSkeleton />;
  if (!isStaff) return <EmptyState icon={<Lock className="h-5 w-5" />} title="Staff only" action={<Button asChild variant="outline"><Link href="/explore">Back to Explore</Link></Button>}>Access management is limited to Campus Core staff.</EmptyState>;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const pendingCount = data?.requests.filter((r) => r.status === "pending").length ?? 0;
  const pendingTargets = new Set(data?.requests.filter((r) => r.status === "pending").map((r) => r.targetId) ?? []);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/admin" data-testid="link-back-admin"><ArrowLeft className="mr-1 h-4 w-4" />Moderation desk</Link></Button>
      <PageHeader eyebrow="Administration" title="Staff access">Who can moderate Campus Core. Every change carries a reason and is kept on record.</PageHeader>

      <div className="mb-6 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-primary/30 bg-accent/50 p-5" data-testid="banner-access-role">
          <div className="flex items-center gap-2">
            {isOwner ? <Crown className="h-4 w-4 text-primary" /> : <ShieldCheck className="h-4 w-4 text-primary" />}
            <p className="font-display font-semibold">{isOwner ? "You are signed in as the owner" : "You are signed in as an admin"}</p>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isOwner
              ? "You can promote students to admin, return admins to student, and approve or reject requests from admins. The owner role itself cannot be assigned, removed or suspended here."
              : "You can request that a student be promoted or an admin be returned to student. Nothing changes until the owner approves your request."}
          </p>
        </div>
        <div className="flex gap-3 rounded-2xl border bg-card p-5" data-testid="banner-roles-private">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Roles are private.</span> Ordinary students never see who is owner or admin. Public profiles and listings show no role or badge.</p>
        </div>
      </div>

      <Tabs defaultValue="people">
        <TabsList className="mb-4">
          <TabsTrigger value="people" data-testid="tab-access-people">People{data ? ` (${data.total})` : ""}</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-access-requests">Requests{pendingCount ? ` · ${pendingCount} pending` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={qInput} onChange={(e) => setQInput(e.target.value)} maxLength={120} placeholder="Search by username or name" className="pl-9" data-testid="input-access-search" />
          </div>
          {isLoading ? <ListSkeleton /> : error || !data ? (
            <ErrorState error={statusOf(error) === 403 ? new Error(forbiddenText(error)) : error} title={statusOf(error) === 403 ? "Access withdrawn" : undefined} onRetry={() => { refetch(); me.refetch(); }} />
          ) : !data.users.length ? (
            <EmptyState icon={<Search className="h-5 w-5" />} title={q ? `No accounts match “${q}”` : "No accounts yet"}>{q ? "Try a different username or name." : undefined}</EmptyState>
          ) : (
            <>
              <ul className={`divide-y rounded-2xl border bg-card transition-opacity ${isFetching ? "opacity-70" : ""}`}>
                {data.users.map((u) => (
                  <UserRow key={u.id} u={u} isOwner={isOwner} isSelf={u.id === me.profile?.id} hasPending={pendingTargets.has(u.id)}
                    onAct={(to) => setPending({ kind: "change", user: u, to, mode: isOwner ? "direct" : "request" })} />
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span data-testid="text-access-page">Page {data.page} of {totalPages} · {data.total} accounts</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-access-prev"><ChevronLeft className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="button-access-next"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="requests">
          {isLoading ? <ListSkeleton /> : error || !data ? (
            <ErrorState error={statusOf(error) === 403 ? new Error(forbiddenText(error)) : error} onRetry={() => refetch()} />
          ) : !data.requests.length ? (
            <EmptyState icon={<UserCheck className="h-5 w-5" />} title="No access requests yet">{isOwner ? "Requests from admins will appear here for your decision." : "Requests you or other admins make will appear here."}</EmptyState>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">Most recent {data.requests.length} requests, newest first.</p>
              <ol className="space-y-3">
                {data.requests.map((r) => <RequestRow key={r.id} r={r} isOwner={isOwner} onDecide={(decision) => setPending({ kind: "decide", request: r, decision })} />)}
              </ol>
            </>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}

function ListSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;
}

function RoleChip({ role }: { role: StaffUser["role"] }) {
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${ROLE_STYLE[role]}`} data-testid={`status-role-${role}`}>{role}</span>;
}

function UserRow({ u, isOwner, isSelf, hasPending, onAct }: { u: StaffUser; isOwner: boolean; isSelf: boolean; hasPending: boolean; onAct: (to: "admin" | "student") => void }) {
  let action: React.ReactNode = null;
  if (u.role === "owner") action = <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />Owner role cannot be changed</span>;
  else if (isSelf) action = <span className="text-xs text-muted-foreground">This is you</span>;
  else if (hasPending && !isOwner) action = <span className="text-xs text-muted-foreground">Request pending</span>;
  else if (u.role === "student") action = (
    <Button size="sm" variant="outline" disabled={u.suspended} onClick={() => onAct("admin")} data-testid={`button-promote-${u.id}`}>
      <UserPlus className="mr-1.5 h-4 w-4" />{isOwner ? "Make admin" : "Request promotion"}
    </Button>
  );
  else action = (
    <Button size="sm" variant="outline" className="text-destructive" onClick={() => onAct("student")} data-testid={`button-demote-${u.id}`}>
      <UserMinus className="mr-1.5 h-4 w-4" />{isOwner ? "Return to student" : "Request demotion"}
    </Button>
  );
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-access-user-${u.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium" data-testid={`text-access-name-${u.id}`}>{u.displayName}</p>
          <RoleChip role={u.role} />
          {u.suspended && <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[11px] uppercase text-destructive">suspended</span>}
          {hasPending && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[11px] uppercase text-amber-900">pending request</span>}
        </div>
        <p className="font-mono text-xs text-muted-foreground">{u.username ? `@${u.username}` : "no username yet"} · joined {ago(u.createdAt)}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

function RequestRow({ r, isOwner, onDecide }: { r: StaffRequest; isOwner: boolean; onDecide: (d: "approve" | "reject") => void }) {
  return (
    <li className="rounded-2xl border bg-card p-4" data-testid={`row-access-request-${r.id}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase ${STATUS_STYLE[r.status]}`} data-testid={`status-request-${r.id}`}>{r.status}</span>
            <p className="font-medium">
              {r.action === "promote" ? "Promote" : "Demote"} {r.targetName}
              {r.targetUsername && <span className="font-mono text-xs text-muted-foreground"> @{r.targetUsername}</span>}
              <span className="text-muted-foreground"> {r.action === "promote" ? "to admin" : "to student"}</span>
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Requested by <span className="font-medium text-foreground">{r.requesterName}</span> · {ago(r.createdAt)} · #{r.id}</p>
          <p className="mt-2 text-sm"><span className="text-muted-foreground">Reason: </span>{r.reason}</p>
          {r.status !== "pending" && (r.decisionReason || r.decidedAt) && (
            <p className="mt-2 border-l-2 border-primary/40 pl-3 text-sm">
              <span className="text-muted-foreground">Decision{r.decidedBy ? ` by ${r.decidedBy}` : ""}{r.decidedAt ? ` ${ago(r.decidedAt)}` : ""}: </span>{r.decisionReason ?? "No reason recorded"}
            </p>
          )}
        </div>
        {isOwner && r.status === "pending" && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => onDecide("reject")} data-testid={`button-reject-${r.id}`}><ShieldOff className="mr-1.5 h-4 w-4" />Reject</Button>
            <Button size="sm" onClick={() => onDecide("approve")} data-testid={`button-approve-${r.id}`}><ShieldCheck className="mr-1.5 h-4 w-4" />Approve</Button>
          </div>
        )}
      </div>
    </li>
  );
}

function ConfirmDialog({ pending, onClose }: { pending: Pending | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState<Pending | null>(null);
  if (pending !== key) { setKey(pending); setReason(""); setErr(null); }
  const qc = useQueryClient();
  const { toast } = useToast();
  const change = useChangeStaffRole();
  const request = useRequestStaffChange();
  const decide = useDecideStaffRequest();
  const busy = change.isPending || request.isPending || decide.isPending;

  let title = "", desc = "", confirm = "", danger = false;
  if (pending?.kind === "change") {
    const n = pending.user.displayName;
    const promote = pending.to === "admin";
    danger = !promote;
    if (pending.mode === "direct") {
      title = promote ? `Make ${n} an admin?` : `Return ${n} to student?`;
      desc = promote ? "They will immediately gain moderation powers: hiding listings, suspending students and editing the directory." : "They will immediately lose access to the moderation desk.";
      confirm = promote ? "Make admin" : "Return to student";
    } else {
      title = promote ? `Request admin access for ${n}` : `Request demotion of ${n}`;
      desc = "Nothing changes now. The owner will review your request and decide.";
      confirm = "Send request";
    }
  } else if (pending?.kind === "decide") {
    const r = pending.request;
    const approve = pending.decision === "approve";
    danger = !approve;
    title = approve ? `Approve request #${r.id}?` : `Reject request #${r.id}?`;
    desc = approve
      ? `${r.targetName} will be ${r.action === "promote" ? "promoted to admin" : "returned to student"} immediately. ${r.requesterName} asked because: “${r.reason}”`
      : `${r.targetName}'s role stays as it is. ${r.requesterName} will see your reason.`;
    confirm = approve ? "Approve" : "Reject";
  }

  function done(message: string) {
    qc.invalidateQueries({ queryKey: getGetStaffAccessQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    toast({ title: confirm, description: message });
    onClose();
  }
  const onError = (e: unknown) => {
    setErr(forbiddenText(e));
    if (statusOf(e) === 403) { qc.invalidateQueries({ queryKey: getGetProfileQueryKey() }); qc.invalidateQueries({ queryKey: getGetStaffAccessQueryKey() }); }
  };

  function go() {
    if (!pending) return;
    const r = reason.trim();
    if (r.length < 5) return setErr("Give a reason of at least 5 characters. It is kept on record.");
    if (pending.kind === "change") {
      if (pending.user.role === "owner") return;
      if (pending.mode === "direct") change.mutate({ data: { targetId: pending.user.id, role: pending.to, reason: r } }, { onSuccess: (m) => done(m.message), onError });
      else request.mutate({ data: { targetId: pending.user.id, action: pending.to === "admin" ? "promote" : "demote", reason: r } }, { onSuccess: (m) => done(m.message), onError });
    } else {
      decide.mutate({ id: pending.request.id, data: { decision: pending.decision, reason: r } }, { onSuccess: (m) => done(m.message), onError });
    }
  }

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="access-reason">Reason (kept on record)</Label>
          <Textarea id="access-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Why is this change needed?" data-testid="input-access-reason" />
          <p className="text-right font-mono text-[11px] text-muted-foreground">{reason.trim().length}/1000</p>
        </div>
        {err && <p className="text-sm text-destructive" data-testid="text-access-error">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? "destructive" : "default"} onClick={go} disabled={busy || reason.trim().length < 5} data-testid="button-confirm-access">{busy ? "Working" : confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

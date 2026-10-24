import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck, Gavel, UserX } from "lucide-react";
import {
  useListUserReports, getListUserReportsQueryKey, useReviewUserReport, useModerate, getGetAdminOverviewQueryKey,
  type AdminSafetyReport, type ListUserReportsStatus, type ReviewUserReportInputStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/states";
import { PersonAvatar } from "@/components/person-avatar";
import { Pager } from "@/components/pager";
import { StatusPill } from "@/pages/safety";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { ago, errMessage } from "@/lib/format";
import { invalidateSocial } from "@/lib/social";

export default function AdminSafety() {
  const me = useMe();
  const isStaff = me.profile?.role === "admin" || me.profile?.role === "owner";
  const [status, setStatus] = useState<ListUserReportsStatus>("pending");
  const [page, setPage] = useState(1);
  const params = { status, page };
  const { data, isLoading, error, refetch, isFetching } = useListUserReports(params, {
    query: { queryKey: getListUserReportsQueryKey(params), enabled: isStaff, refetchInterval: 30_000, refetchOnMount: "always", placeholderData: (p) => p },
  });
  const [review, setReview] = useState<AdminSafetyReport | null>(null);
  const [suspend, setSuspend] = useState<AdminSafetyReport | null>(null);

  if (me.loading) return <PageSkeleton />;
  if (!isStaff) return <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Moderators only" action={<Button asChild variant="outline"><Link href="/explore">Back to Explore</Link></Button>}>This area is for Campus Core administrators.</EmptyState>;

  return (
    <div>
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Moderation desk</Link>
      <PageHeader eyebrow="Administration" title="Safety reports"
        actions={
          <Select value={status} onValueChange={(v) => { setStatus(v as ListUserReportsStatus); setPage(1); }}>
            <SelectTrigger className="w-44" aria-label="Filter by status" data-testid="select-report-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem><SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem><SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        }>
        Person-to-person reports. You only see the single message a reporter chose to share, never the rest of a conversation. Your decision reason is sent privately to the reporter.
      </PageHeader>
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      ) : error || !data ? <ErrorState error={error} onRetry={() => refetch()} /> : !data.items.length ? (
        <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title={status === "pending" ? "Queue is clear" : "No reports here"}>
          {status === "pending" ? "No one is waiting on a decision. This page checks for new reports every 30 seconds." : "Try another status."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{data.total} {data.total === 1 ? "report" : "reports"}{isFetching ? " · refreshing" : ""}</p>
          <ul className="space-y-3" data-testid="list-staff-reports">
            {data.items.map((r) => {
              const staffTarget = r.targetRole === "admin" || r.targetRole === "owner";
              return (
                <li key={r.id} className="rounded-2xl border bg-card p-4 sm:p-5" data-testid={`row-staff-report-${r.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{r.id}</span>
                    <StatusPill status={r.status} />
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">{ago(r.createdAt)}</span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <PersonCell label="Reporter" person={r.reporter} />
                    <PersonCell label="Reported" person={r.target} extra={staffTarget ? `Staff (${r.targetRole})` : undefined} />
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm">{r.reason}</p>
                  {r.snapshot ? (
                    <blockquote className="mt-3 rounded-xl border-l-4 border-destructive/60 bg-destructive/5 p-3 text-sm">
                      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-destructive">Shared evidence{r.snapshotAt ? ` · sent ${ago(r.snapshotAt)}` : ""}</span>
                      <span className="whitespace-pre-wrap">{r.snapshot}</span>
                    </blockquote>
                  ) : <p className="mt-3 text-xs italic text-muted-foreground">No message evidence attached.</p>}
                  {r.decisionReason && <p className="mt-3 rounded-xl bg-muted/70 p-3 text-sm"><span className="font-semibold">Decision:</span> {r.decisionReason}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {r.status === "pending" && <Button size="sm" onClick={() => setReview(r)} data-testid={`button-review-${r.id}`}><Gavel className="mr-1.5 h-4 w-4" />Decide</Button>}
                    {staffTarget ? (
                      <span className="self-center font-mono text-xs text-muted-foreground">Staff account: suspension not available here</span>
                    ) : (
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setSuspend(r)} data-testid={`button-suspend-reported-${r.id}`}><UserX className="mr-1.5 h-4 w-4" />Suspend @{r.target.username}</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} label="staff-reports" />
        </>
      )}
      <ReviewDialog report={review} onClose={() => setReview(null)} />
      <SuspendDialog report={suspend} onClose={() => setSuspend(null)} />
    </div>
  );
}

function PersonCell({ label, person, extra }: { label: string; person: AdminSafetyReport["target"]; extra?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-2.5">
      <PersonAvatar person={person} className="h-9 w-9" />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}{extra ? ` · ${extra}` : ""}</p>
        <Link href={`/people/${person.username}`} className="block truncate text-sm font-medium hover:text-primary">{person.displayName} <span className="text-muted-foreground">@{person.username}</span></Link>
      </div>
    </div>
  );
}

function ReviewDialog({ report, onClose }: { report: AdminSafetyReport | null; onClose: () => void }) {
  const [decision, setDecision] = useState<ReviewUserReportInputStatus>("resolved");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<AdminSafetyReport | null>(null);
  const mut = useReviewUserReport();
  const qc = useQueryClient();
  const { toast } = useToast();
  if (report !== last) { setLast(report); setReason(""); setErr(null); setDecision("resolved"); }
  function go() {
    if (!report) return;
    const r = reason.trim();
    if (r.length < 5 || r.length > 1000) { setErr("Write a response of 5 to 1000 characters."); return; }
    mut.mutate({ id: report.id, data: { status: decision, reason: r } }, {
      onSuccess: (res) => { invalidateSocial(qc, { conversations: false, staff: true }); toast({ title: decision === "resolved" ? "Report resolved" : "Report dismissed", description: res.message }); onClose(); },
      onError: (e) => setErr(errMessage(e)),
    });
  }
  return (
    <Dialog open={!!report} onOpenChange={(o) => { if (!o && !mut.isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Decide report #{report?.id}</DialogTitle>
          <DialogDescription>Your reason is shown privately to the reporter and recorded for audit.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={decision} onValueChange={(v) => setDecision(v as ReviewUserReportInputStatus)} className="grid grid-cols-2 gap-2">
          {(["resolved", "dismissed"] as const).map((s) => (
            <Label key={s} htmlFor={`decision-${s}`} className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 capitalize has-[:checked]:border-primary has-[:checked]:bg-accent/50">
              <RadioGroupItem id={`decision-${s}`} value={s} data-testid={`radio-decision-${s}`} />{s === "resolved" ? "Resolve" : "Dismiss"}
            </Label>
          ))}
        </RadioGroup>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={4} placeholder="Response to the reporter" data-testid="input-review-reason" />
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" disabled={mut.isPending} onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={mut.isPending} data-testid="button-confirm-review">{mut.isPending ? "Saving" : "Confirm decision"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuspendDialog({ report, onClose }: { report: AdminSafetyReport | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<AdminSafetyReport | null>(null);
  const mut = useModerate();
  const qc = useQueryClient();
  const { toast } = useToast();
  if (report !== last) { setLast(report); setReason(""); setErr(null); }
  function go() {
    if (!report || report.targetRole !== "student") return;
    const r = reason.trim();
    if (r.length < 5) { setErr("Give a reason of at least 5 characters."); return; }
    mut.mutate({ data: { action: "suspend-user", targetId: report.targetId, reason: r } }, {
      onSuccess: (res) => {
        qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
        invalidateSocial(qc, { conversations: false, staff: true });
        toast({ title: `Suspended @${report.target.username}`, description: res.message });
        onClose();
      },
      onError: (e) => setErr(errMessage(e)),
    });
  }
  return (
    <Dialog open={!!report} onOpenChange={(o) => { if (!o && !mut.isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Suspend @{report?.target.username}?</DialogTitle>
          <DialogDescription>They will be unable to post or send messages until restored from the Users tab. Recorded in the audit log. This does not decide the report.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Reason, recorded in the audit log" data-testid="input-suspend-reason" />
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" disabled={mut.isPending} onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={go} disabled={mut.isPending} data-testid="button-confirm-suspend">{mut.isPending ? "Working" : "Suspend"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

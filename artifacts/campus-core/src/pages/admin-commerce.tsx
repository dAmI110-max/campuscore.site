import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Lock, RotateCw, Search, Users } from "lucide-react";
import {
  useGetCommerceAdmin, getGetCommerceAdminQueryKey, useManageCommerceAccount, useSetCommerceLaunch,
  getGetProfileQueryKey, useGetProfile, getGetCommerceAccountQueryKey,
  type CommerceAdmin, type CommerceUser, type GetCommerceAdminParams, type CommerceLaunch,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/states";
import { UniversitySelect } from "@/components/university-select";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { day, errMessage } from "@/lib/format";
import { csvCell, isoToLagosInput, lagosDateTime, lagosInputToIso, minorMoney, previewEligible } from "@/lib/commerce";

const ADMIN_KEY = ["/api/admin/commerce"];

export default function AdminCommerce() {
  const me = useMe();
  useGetProfile({ query: { enabled: me.signedIn, queryKey: getGetProfileQueryKey(), staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000 } });
  const role = me.profile?.role;
  const isOwner = role === "owner";
  const isStaff = isOwner || role === "admin";

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [accountType, setAccountType] = useState("all");
  const [suspended, setSuspended] = useState("all");
  const [uni, setUni] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [qInput]);

  const params: GetCommerceAdminParams = {
    ...(q ? { q } : {}),
    ...(accountType !== "all" ? { accountType: accountType as "buyer" | "seller" } : {}),
    ...(suspended !== "all" ? { suspended: suspended as "true" | "false" } : {}),
    ...(uni ? { universityId: Number(uni) } : {}),
    ...(from ? { from } : {}), ...(to ? { to } : {}),
    page,
  };
  const { data, isLoading, isFetching, error, refetch } = useGetCommerceAdmin(params, {
    query: { enabled: isStaff, queryKey: getGetCommerceAdminQueryKey(params), staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000, refetchIntervalInBackground: false },
  });
  const [target, setTarget] = useState<CommerceUser | null>(null);

  if (me.loading) return <PageSkeleton />;
  if (!isStaff) return <EmptyState icon={<Lock className="h-5 w-5" />} title="Staff only" action={<Button asChild variant="outline"><Link href="/explore">Back to Explore</Link></Button>}>Commerce administration is limited to Campus Core staff.</EmptyState>;

  const reset = () => { setQInput(""); setQ(""); setAccountType("all"); setSuspended("all"); setUni(""); setFrom(""); setTo(""); setPage(1); };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize))) : 1;

  function exportCsv(d: CommerceAdmin) {
    const head = ["id", "displayName", "username", "accountType", "suspended", "university", "createdAt"];
    const rows = d.users.map((u) => [u.id, u.displayName, u.username ?? "", u.accountType, u.suspended ? "yes" : "no", u.universityName ?? "", u.createdAt]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `campus-core-users-page-${d.page}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/admin" data-testid="link-back-admin"><ArrowLeft className="mr-1 h-4 w-4" />Moderation desk</Link></Button>
      <PageHeader eyebrow="Administration" title="Commerce">Real registrations, account modes, launch settings and recorded money. Nothing here is estimated.</PageHeader>

      {isLoading ? <div className="space-y-4"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
        : error || !data ? <ErrorState error={error} onRetry={() => { refetch(); me.refetch(); }} /> : (
        <div className="space-y-8">
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {([["Users", data.totals.users], ["Buyers", data.totals.buyers], ["Sellers", data.totals.sellers], ["Suspended", data.totals.suspended], ["Joined today", data.totals.today], ["This week", data.totals.week], ["This month", data.totals.month]] as const).map(([l, v]) => (
              <div key={l} className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 font-mono text-2xl font-semibold" data-testid={`stat-${l.toLowerCase().replace(/\s+/g, "-")}`}>{v.toLocaleString()}</p></div>
            ))}
          </section>

          <LaunchPanel launch={data.launch} isOwner={isOwner} />
          <FinancePanel f={data.finance} />

          <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="users-h">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="users-h" className="font-display text-lg font-semibold">Users</h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={reset} data-testid="button-reset-filters">Clear filters</Button>
                <Button size="sm" variant="outline" disabled={!data.users.length} onClick={() => exportCsv(data)} data-testid="button-export-csv"><Download className="mr-2 h-4 w-4" />Export current page (CSV)</Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Label htmlFor="cq" className="sr-only">Search</Label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="cq" value={qInput} onChange={(e) => setQInput(e.target.value)} maxLength={100} placeholder="Name or username" className="pl-9" data-testid="input-commerce-search" />
              </div>
              <Select value={accountType} onValueChange={(v) => { setAccountType(v); setPage(1); }}>
                <SelectTrigger aria-label="Account type" data-testid="select-account-type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Buyers and sellers</SelectItem><SelectItem value="buyer">Buyers</SelectItem><SelectItem value="seller">Sellers</SelectItem></SelectContent>
              </Select>
              <Select value={suspended} onValueChange={(v) => { setSuspended(v); setPage(1); }}>
                <SelectTrigger aria-label="Suspension" data-testid="select-suspended"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="false">Active</SelectItem><SelectItem value="true">Suspended</SelectItem></SelectContent>
              </Select>
              <UniversitySelect value={uni} onChange={(v) => { setUni(v); setPage(1); }} allowAll placeholder="All universities" testId="select-commerce-university" />
              <div><Label htmlFor="cfrom" className="text-xs text-muted-foreground">Joined from</Label><Input id="cfrom" type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} data-testid="input-from" /></div>
              <div><Label htmlFor="cto" className="text-xs text-muted-foreground">Joined to</Label><Input id="cto" type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} data-testid="input-to" /></div>
            </div>

            <div className={`mt-4 transition-opacity ${isFetching ? "opacity-70" : ""}`}>
              {!data.users.length ? (
                <EmptyState icon={<Users className="h-5 w-5" />} title="No users match these filters">Adjust or clear the filters.</EmptyState>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {data.users.map((u) => (
                    <li key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-commerce-user-${u.id}`}>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.displayName}{u.username && <span className="ml-1.5 text-sm font-normal text-muted-foreground">@{u.username}</span>}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.universityName ?? "No university"} · joined {day(u.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium capitalize text-accent-foreground">{u.accountType}</span>
                        {u.suspended && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Suspended</span>}
                        <Button size="sm" variant="outline" onClick={() => setTarget(u)} data-testid={`button-change-type-${u.id}`}>Make {u.accountType === "buyer" ? "seller" : "buyer"}</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <span data-testid="text-commerce-page">Page {data.page} of {totalPages} · {data.total} matching</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-commerce-prev"><ChevronLeft className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="button-commerce-next"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="trend-h">
              <h2 id="trend-h" className="font-display text-lg font-semibold">Registrations, last 30 days</h2>
              {!data.trends.length ? <p className="mt-3 text-sm text-muted-foreground">No registrations in this period.</p> : (
                <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">New users</th></tr></thead>
                  <tbody>{data.trends.map((t) => <tr key={t.date} className="border-t"><td className="py-1.5">{day(t.date)}</td><td className="py-1.5 text-right font-mono">{t.count}</td></tr>)}</tbody></table>
              )}
            </section>
            <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="uni-h">
              <h2 id="uni-h" className="font-display text-lg font-semibold">Users by university</h2>
              {!data.universities.length ? <p className="mt-3 text-sm text-muted-foreground">No university data yet.</p> : (
                <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">University</th><th className="py-1 text-right font-medium">Users</th></tr></thead>
                  <tbody>{data.universities.map((u) => <tr key={u.name} className="border-t"><td className="py-1.5 pr-2">{u.name}</td><td className="py-1.5 text-right font-mono">{u.count}</td></tr>)}</tbody></table>
              )}
            </section>
          </div>
        </div>
      )}
      <ChangeTypeDialog user={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function LaunchPanel({ launch, isOwner }: { launch: CommerceLaunch; isOwner: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const set = useSetCommerceLaunch();
  const [value, setValue] = useState(() => isoToLagosInput(launch.publicLaunchAt));
  const [reason, setReason] = useState("");
  const latest = useRef(launch);
  latest.current = launch;
  const draftIso = value ? lagosInputToIso(value) : null;
  const changed = draftIso !== (launch.publicLaunchAt ? new Date(launch.publicLaunchAt).toISOString() : null);
  const valid = (value === "" || !!draftIso) && reason.trim().length >= 10 && changed;

  function save() {
    set.mutate({ data: { publicLaunchAt: draftIso, reason: reason.trim() } }, {
      onSuccess: (l) => {
        setValue(isoToLagosInput(l.publicLaunchAt)); setReason("");
        qc.invalidateQueries({ queryKey: ADMIN_KEY });
        qc.invalidateQueries({ queryKey: getGetCommerceAccountQueryKey() });
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        toast({ title: "Launch date updated" });
      },
      onError: (e) => toast({ title: "Could not update launch", description: errMessage(e), variant: "destructive" }),
    });
  }

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="launch-h">
      <h2 id="launch-h" className="font-display text-lg font-semibold">Official launch</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Public launch</dt><dd data-testid="text-launch-at">{lagosDateTime(launch.publicLaunchAt)}</dd></div>
        <div><dt className="text-muted-foreground">Seller Premium eligible from</dt><dd data-testid="text-premium-eligible-at">{launch.premiumEligibleAt ? lagosDateTime(launch.premiumEligibleAt) : "Not set until launch is set"}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">Timezone {launch.timezone}. The launch date is never set automatically.</p>
      {isOwner ? (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="launch-at">Launch date and time (Lagos)</Label>
              <Input id="launch-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} data-testid="input-launch-at" />
              <p className="mt-1 text-xs text-muted-foreground">{value ? (draftIso ? `Premium preview: ${lagosDateTime(previewEligible(draftIso))}` : "Enter a complete date and time.") : "Empty clears the launch date."}</p>
            </div>
            <div>
              <Label htmlFor="launch-reason">Reason (at least 10 characters)</Label>
              <Textarea id="launch-reason" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-launch-reason" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!valid || set.isPending} onClick={save} data-testid="button-save-launch">{set.isPending ? "Saving" : value ? "Save launch date" : "Clear launch date"}</Button>
            <Button size="sm" variant="outline" onClick={() => setValue("")} disabled={!value} data-testid="button-clear-launch">Clear field</Button>
            <Button size="sm" variant="ghost" onClick={() => setValue(isoToLagosInput(latest.current.publicLaunchAt))} data-testid="button-reload-launch"><RotateCw className="mr-2 h-4 w-4" />Load saved value</Button>
          </div>
        </div>
      ) : <p className="mt-3 text-sm text-muted-foreground">Only the owner can correct the launch date.</p>}
    </section>
  );
}

function FinancePanel({ f }: { f: CommerceAdmin["finance"] }) {
  const money = (v: number | null) => v === null ? <span className="text-muted-foreground">Unknown</span> : minorMoney(v);
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="fin-h">
      <h2 id="fin-h" className="font-display text-lg font-semibold">Finance</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {f.paymentsEnabled ? "Live payments are enabled." : "Live payments are not configured. No money is collected in-app, so recorded amounts reflect only ledger entries."}
        {" "}{f.escrowEnabled ? "Escrow is enabled." : "Escrow is not available."} This is not a full financial integration.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Block title="Marketplace">
          <Row l="Verified sales" v={money(f.verifiedMarketplaceMinor)} id="verified" />
          <Row l="Refunds" v={money(f.marketplaceRefundsMinor)} id="refunds" />
        </Block>
        <Block title="Premium and platform">
          <Row l="Premium revenue" v={money(f.premiumRevenueMinor)} id="premium" />
          <Row l="Processing fees" v={money(f.processingFeesMinor)} id="fees" />
          <Row l="Platform earnings" v={money(f.platformEarningsMinor)} id="earnings" />
        </Block>
        <Block title="Ledger status counts">
          <Row l="Pending" v={f.pending} id="pending" /><Row l="Failed" v={f.failed} id="failed" /><Row l="Cancelled" v={f.cancelled} id="cancelled" />
          <Row l="Disputed" v={f.disputed} id="disputed" /><Row l="Refunded" v={f.refunded} id="refunded" />
        </Block>
      </div>
    </section>
  );
}
function Block({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-xl border p-3"><p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-primary">{title}</p><dl className="space-y-1.5 text-sm">{children}</dl></div>;
}
function Row({ l, v, id }: { l: string; v: ReactNode; id: string }) {
  return <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{l}</dt><dd className="font-mono" data-testid={`finance-${id}`}>{v}</dd></div>;
}

function ChangeTypeDialog({ user, onClose }: { user: CommerceUser | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const manage = useManageCommerceAccount();
  const [reason, setReason] = useState("");
  useEffect(() => { setReason(""); }, [user?.id]);
  const next = user?.accountType === "buyer" ? "seller" : "buyer";
  function submit() {
    if (!user) return;
    manage.mutate({ id: user.id, data: { accountType: next, reason: reason.trim() } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ADMIN_KEY });
        qc.invalidateQueries({ queryKey: getGetCommerceAccountQueryKey() });
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        toast({ title: `${user.displayName} is now a ${next}` });
        onClose();
      },
      onError: (e) => toast({ title: "Could not change account type", description: errMessage(e), variant: "destructive" }),
    });
  }
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change {user?.displayName} to {next}</DialogTitle>
          <DialogDescription>This change is recorded in the audit log with your reason.</DialogDescription>
        </DialogHeader>
        <Label htmlFor="type-reason">Reason (at least 10 characters)</Label>
        <Textarea id="type-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-type-reason" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={reason.trim().length < 10 || manage.isPending} onClick={submit} data-testid="button-confirm-type">{manage.isPending ? "Saving" : "Confirm change"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

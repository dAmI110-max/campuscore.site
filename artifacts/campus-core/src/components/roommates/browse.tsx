import { useState, type FormEvent, type ReactNode } from "react";
import { BedDouble, Ban, EyeOff, Flag, Heart } from "lucide-react";
import { useListRoommates, getListRoommatesQueryKey, useSendRoommateInterest, type ListRoommatesParams, type RoommateCard } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states";
import { UniversitySelect } from "@/components/university-select";
import { BlockDialog, ReportUserDialog } from "@/components/safety-dialogs";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { errMessage, naira, day } from "@/lib/format";
import { ACC, ANY, BROWSE_PAGE_SIZE, CLEAN, OptionSelect, SHARING, SLEEP, SMOKING, STUDY, SimplePager, Unavailable, label, noRetry503, useInvalidateRoommates } from "./shared";
import { ModerateDialog, StaffModerationPanel } from "./moderate-dialog";


interface Filters { q: string; campus: string; mine: boolean; university: string; minBudget: string; maxBudget: string; accommodationType: string; sharing: string; smoking: string }
const EMPTY: Filters = { q: "", campus: "", mine: true, university: "", minBudget: "", maxBudget: "", accommodationType: ANY, sharing: ANY, smoking: ANY };

function toParams(f: Filters, page: number, uni: number | null | undefined): ListRoommatesParams {
  const p: ListRoommatesParams = { page };
  if (f.q.trim()) p.q = f.q.trim().slice(0, 100);
  if (f.campus.trim()) p.campus = f.campus.trim().slice(0, 100);
  if (f.mine && uni) p.universityId = uni;
  else if (!f.mine && f.university) p.universityId = Number(f.university);
  const mn = parseInt(f.minBudget, 10), mx = parseInt(f.maxBudget, 10);
  if (Number.isFinite(mn) && mn >= 0) p.minBudget = mn;
  if (Number.isFinite(mx) && mx >= 0) p.maxBudget = mx;
  if (f.accommodationType !== ANY) p.accommodationType = f.accommodationType as ListRoommatesParams["accommodationType"];
  if (f.sharing !== ANY) p.sharing = f.sharing as ListRoommatesParams["sharing"];
  if (f.smoking !== ANY) p.smoking = f.smoking as ListRoommatesParams["smoking"];
  return p;
}

export function Browse({ onEdit }: { onEdit: () => void }) {
  const me = useMe();
  const uni = me.profile?.universityId;
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const params = toParams(applied, page, uni);
  const { data, isLoading, error, refetch, isFetching } = useListRoommates(params, { query: { queryKey: getListRoommatesQueryKey(params), staleTime: 30_000, retry: noRetry503 } });
  const isStaff = me.profile?.role === "admin" || me.profile?.role === "owner";

  function apply(e: FormEvent) { e.preventDefault(); setApplied(draft); setPage(1); }
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <form onSubmit={apply} className="h-fit space-y-3 rounded-2xl border bg-card p-4" aria-label="Roommate filters">
        <div><Label htmlFor="rf-q">Search</Label><Input id="rf-q" value={draft.q} maxLength={100} onChange={(e) => set("q", e.target.value)} placeholder="Name or keyword" data-testid="input-filter-q" /></div>
        <div><Label htmlFor="rf-campus">Campus area</Label><Input id="rf-campus" value={draft.campus} maxLength={100} onChange={(e) => set("campus", e.target.value)} placeholder="e.g. Main campus" data-testid="input-filter-campus" /></div>
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>My university only</span>
          <Switch checked={draft.mine && !!uni} disabled={!uni} onCheckedChange={(v) => set("mine", v)} data-testid="switch-filter-university" />
        </label>
        {!(draft.mine && uni) && (
          <div><Label className="mb-1.5 block">University</Label>
            <UniversitySelect value={draft.university} onChange={(v) => set("university", v)} allowAll testId="select-filter-university" placeholder="All universities" /></div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="rf-min">Min NGN</Label><Input id="rf-min" inputMode="numeric" value={draft.minBudget} onChange={(e) => set("minBudget", e.target.value.replace(/\D/g, ""))} data-testid="input-filter-min" /></div>
          <div><Label htmlFor="rf-max">Max NGN</Label><Input id="rf-max" inputMode="numeric" value={draft.maxBudget} onChange={(e) => set("maxBudget", e.target.value.replace(/\D/g, ""))} data-testid="input-filter-max" /></div>
        </div>
        <OptionSelect withAny id="filter-accommodation" label="Accommodation" value={draft.accommodationType} options={ACC} onChange={(v) => set("accommodationType", v)} />
        <OptionSelect withAny id="filter-sharing" label="Sharing" value={draft.sharing} options={SHARING} onChange={(v) => set("sharing", v)} />
        <OptionSelect withAny id="filter-smoking" label="Smoking" value={draft.smoking} options={SMOKING} onChange={(v) => set("smoking", v)} />
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1" data-testid="button-apply-filters">Apply</Button>
          <Button type="button" variant="ghost" onClick={() => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); }} data-testid="button-reset-filters">Reset</Button>
        </div>
      </form>
      {isStaff && <div className="lg:col-start-1"><StaffModerationPanel /></div>}

      <section className="lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-live="polite" aria-busy={isFetching}>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
        ) : error || !data ? (
          <Unavailable error={error} onRetry={() => refetch()} />
        ) : !data.items.length ? (
          <EmptyState icon={<BedDouble className="h-5 w-5" />} title="No matching roommates yet"
            action={<Button variant="outline" size="sm" onClick={onEdit} data-testid="button-empty-edit">Set up your profile</Button>}>
            Try widening your filters. Publishing your own profile helps others find you too.
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 font-mono text-xs text-muted-foreground" data-testid="text-roommate-total">{data.total} {data.total === 1 ? "match" : "matches"}</p>
            <div className="grid gap-4 sm:grid-cols-2">{data.items.map((c) => <Card key={c.username} card={c} isStaff={isStaff} />)}</div>
            <SimplePager page={page} total={data.total} size={BROWSE_PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{children}</span>;
}

function Card({ card: c, isStaff }: { card: RoommateCard; isStaff: boolean }) {
  const send = useSendRoommateInterest();
  const inval = useInvalidateRoommates();
  const { toast } = useToast();
  const [dlg, setDlg] = useState<null | "block" | "report" | "hide">(null);
  const hasBudget = typeof c.budgetMin === "number" && typeof c.budgetMax === "number";
  const prefs = [label(SHARING, c.sharing), label(SMOKING, c.smoking), label(CLEAN, c.cleanliness), label(SLEEP, c.sleep), label(STUDY, c.study)].filter(Boolean) as string[];

  function interest() {
    send.mutate({ data: { username: c.username } }, {
      onSuccess: (r) => { inval(); toast({ title: "Interest sent", description: r.message }); },
      onError: (e) => toast({ title: "Could not send", description: errMessage(e), variant: "destructive" }),
    });
  }

  return (
    <article className="flex flex-col rounded-2xl border bg-card p-5" data-testid={`card-roommate-${c.username}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-bold">{c.displayName}</h3>
          <p className="truncate text-xs text-muted-foreground">@{c.username} · {c.universityName}</p>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{label(ACC, c.accommodationType)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {c.campus && <div><dt className="text-xs text-muted-foreground">Campus</dt><dd className="font-medium">{c.campus}</dd></div>}
        {hasBudget && <div><dt className="text-xs text-muted-foreground">Monthly budget</dt><dd className="font-mono font-medium">{naira(c.budgetMin)} to {naira(c.budgetMax)}</dd></div>}
        {c.moveInDate && <div><dt className="text-xs text-muted-foreground">Move in</dt><dd className="font-medium">{day(c.moveInDate)}</dd></div>}
      </dl>
      {prefs.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{prefs.map((p) => <Chip key={p}>{p}</Chip>)}</div>}
      {c.about && <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm">{c.about}</p>}
      {c.reasons.length > 0 && (
        <div className="mt-4 rounded-xl bg-accent/50 p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-primary">Why this may fit</p>
          <ul className="mt-1 list-disc pl-4 text-sm">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Based only on what each person declared. Not a safety check. Meet in public first.</p>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <Button size="sm" onClick={interest} disabled={send.isPending} data-testid={`button-interest-${c.username}`}><Heart className="mr-1.5 h-4 w-4" />{send.isPending ? "Sending" : "I'm interested"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setDlg("report")} aria-label={`Report ${c.displayName}`} data-testid={`button-report-${c.username}`}><Flag className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setDlg("block")} aria-label={`Block ${c.displayName}`} data-testid={`button-block-${c.username}`}><Ban className="h-4 w-4" /></Button>
        {isStaff && <Button size="sm" variant="ghost" onClick={() => setDlg("hide")} aria-label="Hide profile (staff)" data-testid={`button-moderate-${c.username}`}><EyeOff className="h-4 w-4" /></Button>}
      </div>
      <ReportUserDialog username={c.username} displayName={c.displayName} open={dlg === "report"} onOpenChange={(o) => { if (!o) { setDlg(null); inval(); } }} />
      {dlg === "block" && <BlockDialog username={c.username} displayName={c.displayName} mode="block" open onOpenChange={(o) => { if (!o) setDlg(null); }} onDone={inval} />}
      {isStaff && <ModerateDialog username={c.username} open={dlg === "hide"} onClose={() => setDlg(null)} />}
    </article>
  );
}


import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Search, Users, X } from "lucide-react";
import { useSearchPeople, getSearchPeopleQueryKey, type SearchPeopleParams } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/states";
import { UniversitySelect } from "@/components/university-select";
import { PersonAvatar } from "@/components/person-avatar";
import { Pager } from "@/components/pager";
import { MessageButton } from "@/components/message-button";

export default function PeopleSearch() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [page, setPage] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setQ(qInput.trim().slice(0, 100)); setPage(1); }, 350);
    return () => clearTimeout(timer.current);
  }, [qInput]);

  const params: SearchPeopleParams = { page };
  if (q) params.q = q;
  if (universityId) params.universityId = Number(universityId);
  const { data, isLoading, error, refetch, isFetching } = useSearchPeople(params, { query: { queryKey: getSearchPeopleQueryKey(params), placeholderData: (p) => p } });
  const filtered = !!(q || universityId);
  const clear = () => { setQInput(""); setQ(""); setUniversityId(""); setPage(1); };

  return (
    <div>
      <PageHeader eyebrow="Community" title="People">Find students by name or username, and narrow it down to a school.</PageHeader>
      <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_280px_auto] sm:items-end">
        <div>
          <label htmlFor="people-q" className="mb-1 block text-xs font-medium text-muted-foreground">Name or username</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="people-q" value={qInput} maxLength={100} onChange={(e) => setQInput(e.target.value)} placeholder="e.g. Adaeze or @ada_k" className="h-11 pl-9" data-testid="input-people-search" />
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">University</span>
          <UniversitySelect value={universityId} onChange={(v) => { setUniversityId(v); setPage(1); }} allowAll testId="filter-people-university" />
        </div>
        <Button variant="ghost" className="h-11" disabled={!filtered} onClick={clear} data-testid="button-clear-people"><X className="mr-1.5 h-4 w-4" />Clear</Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        ) : error || !data ? <ErrorState error={error} onRetry={() => refetch()} /> : !data.items.length ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title={filtered ? "No one matches that" : "No public profiles yet"}
            action={filtered ? <Button variant="outline" onClick={clear}>Clear search</Button> : undefined}>
            {filtered ? "Try a shorter name, or search all universities." : "As students finish their profiles, they appear here."}
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">{data.total} {data.total === 1 ? "person" : "people"}{isFetching ? " · updating" : ""}</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="list-people">
              {data.items.map((p) => (
                <li key={p.username} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 transition-colors hover:border-primary/40">
                  <PersonAvatar person={p} className="h-12 w-12" />
                  <Link href={`/people/${p.username}`} className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-person-${p.username}`}>
                    <p className="truncate font-semibold">{p.displayName}</p>
                    <p className="truncate text-sm text-muted-foreground">@{p.username}</p>
                  </Link>
                  <MessageButton username={p.username} label="Message" variant="outline" className="h-9 shrink-0 px-3" />
                </li>
              ))}
            </ul>
            <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} label="people" />
          </>
        )}
      </div>
    </div>
  );
}

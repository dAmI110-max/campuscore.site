import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Plus, Search } from "lucide-react";
import { useGetSummary, getGetSummaryQueryKey, useListListings, getListListingsQueryKey, type ListListingsParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingCard } from "@/components/listing-card";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { useMe } from "@/hooks/use-me";
import { KINDS } from "@/lib/kinds";

export default function Explore() {
  const me = useMe();
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState(KINDS[0].kind);
  const summary = useGetSummary({ query: { queryKey: getGetSummaryQueryKey() } });
  const uni = me.profile?.universityId ?? undefined;
  const latestParams: ListListingsParams = { sort: "newest", page: 1 };
  const latest = useListListings(latestParams, { query: { queryKey: getListListingsQueryKey(latestParams) } });
  const uniParams: ListListingsParams = { universityId: uni, sort: "newest", page: 1 };
  const atSchool = useListListings(uniParams, { query: { enabled: !!uni, queryKey: getListListingsQueryKey(uniParams) } });
  const first = me.profile?.displayName?.split(" ")[0];

  function go(e: React.FormEvent) {
    e.preventDefault();
    const target = KINDS.find((k) => k.kind === kind);
    if (target) setLocation(q.trim() ? `${target.path}?q=${encodeURIComponent(q.trim())}` : target.path);
  }

  return (
    <div className="space-y-12">
      <section className="rounded-3xl border bg-card p-6 sm:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Explore</p>
        <h1 className="mt-1 font-display text-3xl font-bold sm:text-5xl">{first ? `Good to see you, ${first}.` : "What are you looking for?"}</h1>
        <form onSubmit={go} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="flex gap-2 overflow-x-auto sm:hidden">
            {KINDS.map((k) => <button key={k.kind} type="button" onClick={() => setKind(k.kind)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${kind === k.kind ? "border-primary bg-primary text-primary-foreground" : ""}`}>{k.label}</button>)}
          </div>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a board, e.g. calculator" className="h-12 pl-9" data-testid="input-explore-search" />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="hidden h-12 rounded-md border bg-background px-3 text-sm sm:block" data-testid="select-explore-kind">
            {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <Button type="submit" size="lg" className="h-12" data-testid="button-explore-go">Go to board <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">Boards</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {KINDS.map((k) => (
            <Link key={k.kind} href={k.path} className="group overflow-hidden rounded-2xl border bg-card hover:border-primary/60" data-testid={`link-board-${k.kind}`}>
              <img src={k.art} alt="" className="aspect-[4/3] w-full object-cover" />
              <div className="p-3">
                <p className="font-display font-semibold group-hover:text-primary">{k.label}</p>
                {summary.isLoading ? <Skeleton className="mt-1 h-3 w-12" /> : <p className="font-mono text-xs text-muted-foreground">{summary.data ? `${summary.data.counts[k.kind]} live` : "count unavailable"}</p>}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {uni && (
        <section>
          <SectionHead title="At your university" />
          {atSchool.isLoading ? <CardGridSkeleton count={3} /> : atSchool.error ? <ErrorState error={atSchool.error} onRetry={() => atSchool.refetch()} /> :
            !atSchool.data?.items.length ? (
              <EmptyState icon={<Plus className="h-5 w-5" />} title="Nothing posted at your school yet" action={<Button asChild><Link href="/create">Post something</Link></Button>}>
                You could be the first. Old textbooks and spare rooms are a good place to start.
              </EmptyState>
            ) : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{atSchool.data.items.slice(0, 6).map((l) => <ListingCard key={l.id} listing={l} />)}</div>}
        </section>
      )}

      <section>
        <SectionHead title="Newest everywhere" />
        {latest.isLoading ? <CardGridSkeleton count={3} /> : latest.error ? <ErrorState error={latest.error} onRetry={() => latest.refetch()} /> :
          !latest.data?.items.length ? (
            <EmptyState art={KINDS[4].art} title="The boards are empty for now" action={<Button asChild><Link href={me.signedIn ? "/create" : "/sign-up"}>{me.signedIn ? "Post the first listing" : "Join to post"}</Link></Button>}>
              Campus Core just opened. Real listings from students appear here as soon as they are published.
            </EmptyState>
          ) : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{latest.data.items.slice(0, 9).map((l) => <ListingCard key={l.id} listing={l} />)}</div>}
      </section>
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return <h2 className="mb-4 font-display text-2xl font-bold">{title}</h2>;
}

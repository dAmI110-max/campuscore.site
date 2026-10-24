import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Search, SlidersHorizontal, X, Plus } from "lucide-react";
import { useListListings, getListListingsQueryKey, type ListListingsParams, type ListListingsSort } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingCard } from "@/components/listing-card";
import { UniversitySelect } from "@/components/university-select";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import type { KindMeta } from "@/lib/kinds";

export function ListingBrowser({ meta, signedIn, initialQ = "" }: { meta: KindMeta; signedIn: boolean; initialQ?: string }) {
  const [qInput, setQInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [location, setLocation] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<ListListingsSort>("newest");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer.current);
  }, [qInput]);

  const params = useMemo<ListListingsParams>(() => {
    const p: ListListingsParams = { kind: meta.kind, sort, page };
    if (q) p.q = q;
    if (category) p.category = category;
    if (universityId) p.universityId = Number(universityId);
    if (location.trim()) p.location = location.trim();
    if (minPrice !== "" && !Number.isNaN(Number(minPrice))) p.minPrice = Number(minPrice);
    if (maxPrice !== "" && !Number.isNaN(Number(maxPrice))) p.maxPrice = Number(maxPrice);
    return p;
  }, [meta.kind, q, category, universityId, location, minPrice, maxPrice, sort, page]);

  const { data, isLoading, error, refetch, isFetching } = useListListings(params, { query: { queryKey: getListListingsQueryKey(params), placeholderData: (prev) => prev } });
  const filtered = !!(q || category || universityId || location || minPrice || maxPrice);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function reset() {
    setQInput(""); setQ(""); setCategory(""); setUniversityId(""); setLocation(""); setMinPrice(""); setMaxPrice(""); setPage(1);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={`Search ${meta.label.toLowerCase()}`} className="h-11 pl-9" data-testid="input-search" />
        </div>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={(v) => { setSort(v as ListListingsSort); setPage(1); }}>
            <SelectTrigger className="h-11 w-[150px]" data-testid="select-sort"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low">Price: low first</SelectItem>
              <SelectItem value="price-high">Price: high first</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={showFilters ? "secondary" : "outline"} className="h-11" onClick={() => setShowFilters((s) => !s)} data-testid="button-toggle-filters">
            <SlidersHorizontal className="mr-2 h-4 w-4" />Filters
          </Button>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <Chip active={!category} onClick={() => { setCategory(""); setPage(1); }}>All</Chip>
        {meta.categories.map((c) => <Chip key={c} active={category === c} onClick={() => { setCategory(c); setPage(1); }}>{c}</Chip>)}
      </div>

      {showFilters && (
        <div className="mt-3 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="mb-1 block text-xs font-medium text-muted-foreground">University</label>
            <UniversitySelect value={universityId} onChange={(v) => { setUniversityId(v); setPage(1); }} allowAll testId="filter-university" /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
            <Input value={location} onChange={(e) => { setLocation(e.target.value); setPage(1); }} placeholder="e.g. Osogbo, Akoka" data-testid="filter-location" /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Min price (NGN)</label>
            <Input type="number" min={0} inputMode="numeric" value={minPrice} onChange={(e) => { setMinPrice(e.target.value); setPage(1); }} data-testid="filter-min-price" /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Max price (NGN)</label>
            <Input type="number" min={0} inputMode="numeric" value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); setPage(1); }} data-testid="filter-max-price" /></div>
          {filtered && <Button variant="ghost" className="justify-start sm:col-span-2 lg:col-span-4" onClick={reset} data-testid="button-reset-filters"><X className="mr-2 h-4 w-4" />Clear filters</Button>}
        </div>
      )}

      <div className="mt-6">
        {isLoading ? <CardGridSkeleton /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : !data || data.items.length === 0 ? (
          filtered ? (
            <EmptyState icon={<Search className="h-5 w-5" />} title="Nothing matches those filters" action={<Button variant="outline" onClick={reset}>Clear filters</Button>}>
              Try a broader search, another category or a different school.
            </EmptyState>
          ) : (
            <EmptyState art={meta.art} title={`No ${meta.label.toLowerCase()} posted yet`}
              action={<Button asChild data-testid="button-empty-post"><Link href={signedIn ? `/create?kind=${meta.kind}` : "/sign-up"}><Plus className="mr-2 h-4 w-4" />{signedIn ? `Post the first ${meta.singular.toLowerCase()}` : "Join to post"}</Link></Button>}>
              This board is brand new. When students post here, their listings show up straight away.
            </EmptyState>
          )
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground" data-testid="text-result-count">{data.total} {data.total === 1 ? "result" : "results"}{isFetching ? " · updating" : ""}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
            {pages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page">Previous</Button>
                <span className="font-mono text-sm">{page} / {pages}</span>
                <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">Next</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50"}`}
      data-testid={`chip-category-${children.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      {children}
    </button>
  );
}

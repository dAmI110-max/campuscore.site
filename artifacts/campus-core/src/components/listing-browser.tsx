import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Search, SlidersHorizontal, X, Plus } from "lucide-react";
import { useListListings, getListListingsQueryKey, type ListListingsParams, type ListListingsSort, type ListListingsCondition } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingCard } from "@/components/listing-card";
import { UniversitySelect } from "@/components/university-select";
import { Pager } from "@/components/pager";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { CONDITIONS, type KindMeta } from "@/lib/kinds";

const SORTS: ListListingsSort[] = ["newest", "price-low", "price-high"];
const MAX_PRICE = 1_000_000_000;
const ANY = "__any";

interface Filters { q: string; category: string; universityId: string; location: string; minPrice: string; maxPrice: string; condition: string; sort: ListListingsSort; page: number }

function parse(search: string, meta: KindMeta): Filters {
  const s = new URLSearchParams(search);
  const sort = s.get("sort") as ListListingsSort;
  const cond = s.get("condition") ?? "";
  const uni = s.get("university") ?? "";
  const page = Number(s.get("page"));
  return {
    q: s.get("q") ?? "",
    category: meta.categories.includes(s.get("category") ?? "") ? s.get("category")! : "",
    universityId: /^\d+$/.test(uni) ? uni : "",
    location: s.get("location") ?? "",
    minPrice: s.get("min") ?? "",
    maxPrice: s.get("max") ?? "",
    condition: meta.showCondition && CONDITIONS.includes(cond) ? cond : "",
    sort: SORTS.includes(sort) ? sort : "newest",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

function serialize(f: Filters) {
  const s = new URLSearchParams();
  if (f.q) s.set("q", f.q);
  if (f.category) s.set("category", f.category);
  if (f.universityId) s.set("university", f.universityId);
  if (f.location) s.set("location", f.location);
  if (f.minPrice) s.set("min", f.minPrice);
  if (f.maxPrice) s.set("max", f.maxPrice);
  if (f.condition) s.set("condition", f.condition);
  if (f.sort !== "newest") s.set("sort", f.sort);
  if (f.page > 1) s.set("page", String(f.page));
  return s.toString();
}

function priceError(min: string, max: string): string | null {
  const check = (v: string, label: string) => {
    if (v === "") return null;
    if (!/^\d+(\.\d{1,2})?$/.test(v.trim())) return `${label} must be a positive number.`;
    if (Number(v) > MAX_PRICE) return `${label} cannot be more than NGN 1,000,000,000.`;
    return null;
  };
  const e = check(min, "Min price") || check(max, "Max price");
  if (e) return e;
  if (min !== "" && max !== "" && Number(min) > Number(max)) return "Min price cannot be higher than max price.";
  return null;
}

/** Listing board with URL-synced filters. The URL is the source of truth, so refresh and back/forward restore state. */
export function ListingBrowser({ meta, signedIn }: { meta: KindMeta; signedIn: boolean }) {
  const search = useSearch();
  const [, navigate] = useLocation();
  const f = useMemo(() => parse(search, meta), [search, meta]);

  // Free-text fields are edited locally, then committed to the URL after a short pause.
  const [qInput, setQInput] = useState(f.q);
  const [locInput, setLocInput] = useState(f.location);
  const [minInput, setMinInput] = useState(f.minPrice);
  const [maxInput, setMaxInput] = useState(f.maxPrice);
  const [showFilters, setShowFilters] = useState(() => !!(f.universityId || f.location || f.minPrice || f.maxPrice || f.condition));

  // When the URL changes externally (back/forward, Explore navigation), resync the inputs.
  const lastWritten = useRef(search);
  useEffect(() => {
    if (search === lastWritten.current) return;
    lastWritten.current = search;
    setQInput(f.q); setLocInput(f.location); setMinInput(f.minPrice); setMaxInput(f.maxPrice);
  }, [search, f]);

  const fRef = useRef(f);
  fRef.current = f;
  function commit(patch: Partial<Filters>, replace = false) {
    const next: Filters = { ...fRef.current, page: 1, ...patch };
    const qs = serialize(next);
    if (qs === serialize(fRef.current)) return;
    lastWritten.current = qs;
    navigate(qs ? `${meta.path}?${qs}` : meta.path, { replace });
  }
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const pErr = priceError(minInput, maxInput);
  useEffect(() => {
    const t = setTimeout(() => {
      const patch: Partial<Filters> = { q: qInput.trim(), location: locInput.trim() };
      if (!priceError(minInput, maxInput)) { patch.minPrice = minInput.trim(); patch.maxPrice = maxInput.trim(); }
      commitRef.current(patch, true);
    }, 400);
    return () => clearTimeout(t);
  }, [qInput, locInput, minInput, maxInput]);

  const params = useMemo<ListListingsParams>(() => {
    const p: ListListingsParams = { kind: meta.kind, sort: f.sort, page: f.page };
    if (f.q) p.q = f.q;
    if (f.category) p.category = f.category;
    if (f.universityId) p.universityId = Number(f.universityId);
    if (f.location) p.location = f.location;
    if (f.minPrice) p.minPrice = Number(f.minPrice);
    if (f.maxPrice) p.maxPrice = Number(f.maxPrice);
    if (f.condition) p.condition = f.condition as ListListingsCondition;
    return p;
  }, [meta.kind, f]);

  const urlPriceErr = priceError(f.minPrice, f.maxPrice);
  const { data, isLoading, error, refetch, isFetching } = useListListings(params, {
    // Never present a previous filter's empty result while this request fails
    // or silently retries. Give students an immediate, explicit retry action.
    query: { queryKey: getListListingsQueryKey(params), retry: false, enabled: !pErr && !urlPriceErr },
  });
  const panelCount = [f.universityId, f.location, f.minPrice, f.maxPrice, f.condition].filter(Boolean).length;
  const activeCount = panelCount + (f.category ? 1 : 0);
  const filtered = !!(f.q || activeCount);
  const blockedByPrice = !!(pErr || urlPriceErr);

  function reset() {
    setQInput(""); setLocInput(""); setMinInput(""); setMaxInput("");
    commit({ q: "", category: "", universityId: "", location: "", minPrice: "", maxPrice: "", condition: "", sort: "newest" });
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="listing-search" className="sr-only">Search {meta.label.toLowerCase()}</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="listing-search" type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={`Search ${meta.label.toLowerCase()}`} className="h-11 pl-9" data-testid="input-search" />
        </div>
        <div className="flex gap-2">
          <Select value={f.sort} onValueChange={(v) => commit({ sort: v as ListListingsSort })}>
            <SelectTrigger className="h-11 w-[160px]" aria-label="Sort" data-testid="select-sort"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low">Price: low first</SelectItem>
              <SelectItem value="price-high">Price: high first</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={showFilters ? "secondary" : "outline"} className="h-11" onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters} aria-controls="listing-filters" aria-label={`Filters${panelCount ? `, ${panelCount} active` : ""}`} data-testid="button-toggle-filters">
            <SlidersHorizontal className="mr-2 h-4 w-4" />Filters
            {panelCount > 0 && <span className="ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-[11px] text-primary-foreground" data-testid="text-filter-count">{panelCount}</span>}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Category">
        <Chip active={!f.category} onClick={() => commit({ category: "" })}>All</Chip>
        {meta.categories.map((c) => <Chip key={c} active={f.category === c} onClick={() => commit({ category: c })}>{c}</Chip>)}
      </div>

      {showFilters && (
        <div id="listing-filters" className="mt-3 rounded-2xl border bg-card p-4">
          <div className={`grid gap-3 sm:grid-cols-2 ${meta.showCondition ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            <div><span className="mb-1 block text-xs font-medium text-muted-foreground">University</span>
              <UniversitySelect value={f.universityId} onChange={(v) => commit({ universityId: v })} allowAll testId="filter-university" /></div>
            <div><label htmlFor="filter-location" className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
              <Input id="filter-location" value={locInput} maxLength={200} onChange={(e) => setLocInput(e.target.value)} placeholder="e.g. Osogbo, Akoka" data-testid="filter-location" /></div>
            <div><label htmlFor="filter-min" className="mb-1 block text-xs font-medium text-muted-foreground">Min price (NGN)</label>
              <Input id="filter-min" type="number" min={0} max={MAX_PRICE} inputMode="numeric" value={minInput} aria-invalid={!!pErr} aria-describedby={pErr ? "price-error" : undefined} onChange={(e) => setMinInput(e.target.value)} data-testid="filter-min-price" /></div>
            <div><label htmlFor="filter-max" className="mb-1 block text-xs font-medium text-muted-foreground">Max price (NGN)</label>
              <Input id="filter-max" type="number" min={0} max={MAX_PRICE} inputMode="numeric" value={maxInput} aria-invalid={!!pErr} aria-describedby={pErr ? "price-error" : undefined} onChange={(e) => setMaxInput(e.target.value)} data-testid="filter-max-price" /></div>
            {meta.showCondition && (
              <div><span className="mb-1 block text-xs font-medium text-muted-foreground">Condition</span>
                <Select value={f.condition || ANY} onValueChange={(v) => commit({ condition: v === ANY ? "" : v })}>
                  <SelectTrigger aria-label="Condition" data-testid="filter-condition"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any condition</SelectItem>
                    {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            )}
          </div>
          {pErr && <p id="price-error" role="alert" className="mt-3 text-sm text-destructive" data-testid="text-price-error">{pErr}</p>}
        </div>
      )}

      {filtered && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{activeCount} {activeCount === 1 ? "filter" : "filters"}{f.q ? ` and search "${f.q}"` : ""}</span>
          <Button variant="ghost" size="sm" onClick={reset} data-testid="button-reset-filters"><X className="mr-1.5 h-4 w-4" />Clear all</Button>
        </div>
      )}

      <div className="mt-6">
        {blockedByPrice ? (
          <EmptyState icon={<SlidersHorizontal className="h-5 w-5" />} title="Check the price range">{pErr || urlPriceErr}</EmptyState>
        ) : error ? <ErrorState error={error} onRetry={() => refetch()} title="Listings could not be loaded" /> : isLoading || (isFetching && !data?.items.length) ? <CardGridSkeleton /> : !data || data.items.length === 0 ? (
          filtered ? (
            <EmptyState icon={<Search className="h-5 w-5" />} title="Nothing matches those filters" action={<Button variant="outline" onClick={reset}>Clear filters</Button>}>
              Try a broader search, another category or a different school.
            </EmptyState>
          ) : f.page > 1 ? (
            <EmptyState title="No more results" action={<Button variant="outline" onClick={() => commit({ page: 1 })}>Back to first page</Button>} />
          ) : (
            <EmptyState art={meta.art} title={`No ${meta.label.toLowerCase()} posted yet`}
              action={<Button asChild data-testid="button-empty-post"><Link href={signedIn ? `/create?kind=${meta.kind}` : "/sign-up"}><Plus className="mr-2 h-4 w-4" />{signedIn ? `Post the first ${meta.singular.toLowerCase()}` : "Join to post"}</Link></Button>}>
              This board is brand new. When students post here, their listings show up straight away.
            </EmptyState>
          )
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground" aria-live="polite" data-testid="text-result-count">{data.total} {data.total === 1 ? "result" : "results"}{isFetching ? " · updating" : ""}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
            <Pager page={f.page} total={data.total} pageSize={data.pageSize} onPage={(p) => { commit({ page: p }); window.scrollTo({ top: 0 }); }} label="page" />
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50"}`}
      data-testid={`chip-category-${children.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      {children}
    </button>
  );
}

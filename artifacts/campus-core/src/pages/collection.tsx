import { Link } from "wouter";
import { Bookmark, FileText, Plus } from "lucide-react";
import { useListListings, getListListingsQueryKey, type ListListingsParams } from "@workspace/api-client-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/listing-card";
import { CardGridSkeleton, EmptyState, ErrorState, PageHeader } from "@/components/states";

export default function Collection({ mode }: { mode: "saved" | "mine" }) {
  const [page, setPage] = useState(1);
  const params: ListListingsParams = mode === "saved" ? { saved: true, page } : { mine: true, page };
  const { data, isLoading, error, refetch } = useListListings(params, { query: { queryKey: getListListingsQueryKey(params) } });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div>
      <PageHeader eyebrow={mode === "saved" ? "Your shortlist" : "Your posts"} title={mode === "saved" ? "Saved" : "My listings"}
        actions={mode === "mine" ? <Button asChild data-testid="button-new-listing"><Link href="/create"><Plus className="mr-2 h-4 w-4" />New listing</Link></Button> : undefined}>
        {mode === "saved" ? "Listings you bookmarked. Only you can see this list." : "Drafts, published and unavailable listings you have created."}
      </PageHeader>
      {isLoading ? <CardGridSkeleton /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : !data?.items.length ? (
        mode === "saved" ? (
          <EmptyState icon={<Bookmark className="h-5 w-5" />} title="Nothing saved yet" action={<Button asChild variant="outline"><Link href="/explore">Explore boards</Link></Button>}>
            Tap Save on any listing to keep it here while you decide.
          </EmptyState>
        ) : (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="You have not posted anything" action={<Button asChild><Link href="/create">Create your first listing</Link></Button>}>
            Sell something, offer a service or share a study resource. You can save it as a draft first.
          </EmptyState>
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
          {pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="font-mono text-sm">{page} / {pages}</span>
              <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

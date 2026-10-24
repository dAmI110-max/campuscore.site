import { useState } from "react";
import { Link } from "wouter";
import { ShieldCheck, Ban, Flag } from "lucide-react";
import {
  useListBlocks, getListBlocksQueryKey, useListMyUserReports, getListMyUserReportsQueryKey,
  type BlockRecord, type UserSafetyReportStatus,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/states";
import { PersonAvatar } from "@/components/person-avatar";
import { Pager } from "@/components/pager";
import { BlockDialog } from "@/components/safety-dialogs";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Safety() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Your safety" title="Blocks and reports">
        People you have blocked cannot message you. Reports you send are reviewed by Campus Core staff, and their decision comes back here.
      </PageHeader>
      <Tabs defaultValue="blocks">
        <TabsList className="mb-4">
          <TabsTrigger value="blocks" data-testid="tab-blocks"><Ban className="mr-1.5 h-4 w-4" />Blocked</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-my-reports"><Flag className="mr-1.5 h-4 w-4" />My reports</TabsTrigger>
        </TabsList>
        <TabsContent value="blocks"><Blocks /></TabsContent>
        <TabsContent value="reports"><MyReports /></TabsContent>
      </Tabs>
    </div>
  );
}

function ListSkeleton() {
  return <ul className="divide-y rounded-2xl border bg-card" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <li key={i} className="flex items-center gap-3 p-4"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-40" /></li>)}</ul>;
}

function Blocks() {
  const [page, setPage] = useState(1);
  const params = { page };
  const { data, isLoading, error, refetch } = useListBlocks(params, { query: { queryKey: getListBlocksQueryKey(params), refetchOnMount: "always", placeholderData: (p) => p } });
  const [target, setTarget] = useState<BlockRecord | null>(null);
  if (isLoading) return <ListSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data.items.length) return <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="You have not blocked anyone">Block someone from their profile or a conversation if they make you uncomfortable.</EmptyState>;
  return (
    <>
      <ul className="divide-y rounded-2xl border bg-card" data-testid="list-blocks">
        {data.items.map((b) => (
          <li key={b.person.username} className="flex items-center gap-3 p-4">
            <PersonAvatar person={b.person} />
            <div className="min-w-0 flex-1">
              <Link href={`/people/${b.person.username}`} className="block truncate font-medium hover:text-primary">{b.person.displayName}</Link>
              <p className="truncate text-xs text-muted-foreground">@{b.person.username} · blocked {ago(b.createdAt)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setTarget(b)} data-testid={`button-unblock-${b.person.username}`}>Unblock</Button>
          </li>
        ))}
      </ul>
      <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} label="blocks" />
      {target && <BlockDialog username={target.person.username} displayName={target.person.displayName} mode="unblock" open={!!target}
        onOpenChange={(o) => { if (!o) setTarget(null); }} onDone={() => { if (data.items.length === 1 && page > 1) setPage(page - 1); }} />}
    </>
  );
}

export function StatusPill({ status }: { status: UserSafetyReportStatus }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider",
      status === "pending" ? "bg-accent text-accent-foreground" : status === "resolved" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

function MyReports() {
  const [page, setPage] = useState(1);
  const params = { page };
  const { data, isLoading, error, refetch } = useListMyUserReports(params, { query: { queryKey: getListMyUserReportsQueryKey(params), refetchOnMount: "always", placeholderData: (p) => p } });
  if (isLoading) return <ListSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data.items.length) return <EmptyState icon={<Flag className="h-5 w-5" />} title="No reports sent">If someone harasses you or tries to scam you, report them from their profile or your conversation.</EmptyState>;
  return (
    <>
      <ul className="space-y-3" data-testid="list-my-reports">
        {data.items.map((r) => (
          <li key={r.id} className="rounded-2xl border bg-card p-4 sm:p-5" data-testid={`row-my-report-${r.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <PersonAvatar person={r.target} className="h-8 w-8" />
              <Link href={`/people/${r.target.username}`} className="font-medium hover:text-primary">{r.target.displayName}</Link>
              <span className="text-xs text-muted-foreground">@{r.target.username}</span>
              <span className="ml-auto"><StatusPill status={r.status} /></span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{r.reason}</p>
            {r.snapshot && (
              <blockquote className="mt-3 border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground">
                <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-wider">Message you shared{r.snapshotAt ? ` · sent ${ago(r.snapshotAt)}` : ""}</span>
                <span className="whitespace-pre-wrap">{r.snapshot}</span>
              </blockquote>
            )}
            {r.decisionReason && (
              <div className="mt-3 rounded-xl bg-muted/70 p-3 text-sm">
                <p className="font-mono text-[10px] uppercase tracking-wider text-primary">Staff response{r.decidedAt ? ` · ${ago(r.decidedAt)}` : ""}</p>
                <p className="mt-1 whitespace-pre-wrap">{r.decisionReason}</p>
              </div>
            )}
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">Sent {ago(r.createdAt)}</p>
          </li>
        ))}
      </ul>
      <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} label="reports" />
    </>
  );
}

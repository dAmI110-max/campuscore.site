import { useState } from "react";
import { useLocation } from "wouter";
import { Ban, Check, Flag, Inbox, MessageCircle, X } from "lucide-react";
import { useGetRoommateInterests, getGetRoommateInterestsQueryKey, useRespondRoommateInterest, useOpenRoommateConversation, type GetRoommateInterests200ItemsItem, type RespondRoommateInterestBodyAction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states";
import { BlockDialog, ReportUserDialog } from "@/components/safety-dialogs";
import { useVisible } from "@/hooks/use-visible";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { REQUESTS_PAGE_SIZE, SimplePager, Unavailable, noRetry503, useInvalidateRoommates } from "./shared";

export function Requests() {
  const [page, setPage] = useState(1);
  const params = { page };
  const visible = useVisible();
  const { data, isLoading, error, refetch } = useGetRoommateInterests(params, { query: { queryKey: getGetRoommateInterestsQueryKey(params), staleTime: 10_000, refetchInterval: visible ? 20_000 : false, refetchIntervalInBackground: false, retry: noRetry503 } });
  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>;
  if (error || !data) return <Unavailable error={error} onRetry={() => refetch()} />;
  if (!data.items.length) return <EmptyState icon={<Inbox className="h-5 w-5" />} title="No requests yet">When you show interest in someone, or they in you, it appears here.</EmptyState>;
  return (
    <>
      <ul className="divide-y rounded-2xl border bg-card" data-testid="list-roommate-requests">
        {data.items.map((r) => <RequestRow key={r.id} r={r} />)}
      </ul>
      <SimplePager page={page} total={data.total} size={REQUESTS_PAGE_SIZE} onPage={setPage} />
    </>
  );
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-accent text-accent-foreground", accepted: "bg-primary text-primary-foreground",
  declined: "bg-muted text-muted-foreground", cancelled: "bg-muted text-muted-foreground",
};

function RequestRow({ r }: { r: GetRoommateInterests200ItemsItem }) {
  const respond = useRespondRoommateInterest();
  const open = useOpenRoommateConversation();
  const inval = useInvalidateRoommates();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [dlg, setDlg] = useState<null | "block" | "report">(null);
  function act(action: RespondRoommateInterestBodyAction) {
    respond.mutate({ id: r.id, data: { action } }, {
      onSuccess: (m) => { inval(); toast({ title: "Updated", description: m.message }); },
      onError: (e) => toast({ title: "Could not update", description: errMessage(e), variant: "destructive" }),
    });
  }
  function message() {
    open.mutate({ id: r.id }, {
      onSuccess: (c) => setLocation(`/messages/${c.id}`),
      onError: (e) => toast({ title: "Could not open chat", description: errMessage(e), variant: "destructive" }),
    });
  }
  const busy = respond.isPending;
  return (
    <li className="flex flex-wrap items-center gap-3 p-4" data-testid={`row-request-${r.id}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">@{r.username} · {r.incoming ? "wants to room with you" : "you showed interest"}</p>
      </div>
      <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider", STATUS_STYLE[r.status])} data-testid={`status-request-${r.id}`}>{r.status}</span>
      <div className="flex flex-wrap gap-2">
        {r.status === "pending" && r.incoming && <>
          <Button size="sm" onClick={() => act("accept")} disabled={busy} data-testid={`button-accept-${r.id}`}><Check className="mr-1 h-4 w-4" />Accept</Button>
          <Button size="sm" variant="outline" onClick={() => act("decline")} disabled={busy} data-testid={`button-decline-${r.id}`}><X className="mr-1 h-4 w-4" />Decline</Button>
        </>}
        {(r.status === "pending" || r.status === "accepted") && !r.incoming && <Button size="sm" variant="outline" onClick={() => act("cancel")} disabled={busy} data-testid={`button-cancel-${r.id}`}>Withdraw</Button>}
        {r.status === "accepted" && r.canMessage && <Button size="sm" onClick={message} disabled={open.isPending} data-testid={`button-message-${r.id}`}><MessageCircle className="mr-1 h-4 w-4" />{open.isPending ? "Opening" : "Message"}</Button>}
        <Button size="sm" variant="ghost" onClick={() => setDlg("report")} aria-label={`Report ${r.displayName}`} data-testid={`button-report-request-${r.id}`}><Flag className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setDlg("block")} aria-label={`Block ${r.displayName}`} data-testid={`button-block-request-${r.id}`}><Ban className="h-4 w-4" /></Button>
      </div>
      <ReportUserDialog username={r.username} displayName={r.displayName} open={dlg === "report"} onOpenChange={(o) => { if (!o) { setDlg(null); inval(); } }} />
      {dlg === "block" && <BlockDialog username={r.username} displayName={r.displayName} mode="block" open onOpenChange={(o) => { if (!o) setDlg(null); }} onDone={inval} />}
    </li>
  );
}


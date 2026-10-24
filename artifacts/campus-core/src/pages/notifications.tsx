import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CheckCheck, MessageCircle, ShieldCheck, Flag, Circle } from "lucide-react";
import {
  useListNotifications, getListNotificationsQueryKey, listNotifications, useReadNotification, useReadAllNotifications,
  type InAppNotification,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { ago, errMessage } from "@/lib/format";
import { invalidateSocial } from "@/lib/social";
import { cn } from "@/lib/utils";
import { useVisible } from "@/hooks/use-visible";

function kindIcon(kind: string) {
  if (kind.includes("message")) return MessageCircle;
  if (kind.includes("report")) return Flag;
  if (kind.includes("listing") || kind.includes("moderation")) return ShieldCheck;
  return Bell;
}

export default function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Activity" title="Notifications"
        actions={<div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5"><Switch id="unread-only" checked={unreadOnly} onCheckedChange={setUnreadOnly} data-testid="switch-unread-only" /><Label htmlFor="unread-only" className="cursor-pointer text-sm">Unread only</Label></div>}>
        New messages, report reviews and moderation decisions on your listings. Message text is never shown here.
      </PageHeader>
      <Feed key={String(unreadOnly)} unreadOnly={unreadOnly} />
    </div>
  );
}

function Feed({ unreadOnly }: { unreadOnly: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = unreadOnly ? { unreadOnly: true } : {};
  const visible = useVisible();
  const { data, isLoading, error, refetch } = useListNotifications(params, { query: {
    queryKey: getListNotificationsQueryKey(params), refetchOnMount: "always",
    refetchInterval: visible ? 15000 : false, refetchIntervalInBackground: false,
  } });
  const [older, setOlder] = useState<InAppNotification[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState<string | null>(null);
  const [localRead, setLocalRead] = useState<Set<number>>(new Set());
  const next = cursor === undefined ? data?.nextBefore ?? null : cursor;
  const readOne = useReadNotification();
  const readAll = useReadAllNotifications();
  useEffect(() => {
    if (!data) return;
    setOlder(previous => {
      const byId = new Map(previous.map(n => [n.id, n]));
      for (const notification of data.items) byId.set(notification.id, notification);
      return [...byId.values()];
    });
    setCursor(previous => previous === undefined ? data.nextBefore : previous);
  }, [data?.items, data?.nextBefore]);

  const items = useMemo(() => {
    const map = new Map<number, InAppNotification>();
    for (const n of [...(data?.items ?? []), ...older]) if (!map.has(n.id)) map.set(n.id, n);
    return [...map.values()].sort((a, b) => b.id - a.id)
      .map((n) => localRead.has(n.id) && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)
      .filter(n => !unreadOnly || (!n.readAt && data?.unreadCount !== 0));
  }, [data?.items, data?.unreadCount, older, localRead, unreadOnly]);
  const unreadLoaded = items.filter((n) => !n.readAt).length;

  async function more() {
    if (!next) return;
    setLoadingMore(true); setMoreErr(null);
    try {
      const p = await listNotifications({ ...params, before: next });
      setOlder((o) => [...o, ...p.items]);
      setCursor(p.nextBefore);
    } catch (e) { setMoreErr(errMessage(e)); } finally { setLoadingMore(false); }
  }

  function open(n: InAppNotification) {
    const go = () => { if (n.href.startsWith("/")) setLocation(n.href); };
    if (n.readAt) return go();
    readOne.mutate({ id: n.id }, {
      onSuccess: () => { setLocalRead((s) => new Set(s).add(n.id)); invalidateSocial(qc, { conversations: false }); go(); },
      onError: (e) => toast({ variant: "destructive", title: "Could not mark as read", description: errMessage(e) }),
    });
  }

  function markOne(n: InAppNotification) {
    readOne.mutate({ id: n.id }, {
      onSuccess: () => { setLocalRead((s) => new Set(s).add(n.id)); invalidateSocial(qc, { conversations: false }); },
      onError: (e) => toast({ variant: "destructive", title: "Could not mark as read", description: errMessage(e) }),
    });
  }

  function markAll() {
    const throughId = items.reduce((m, n) => Math.max(m, n.id), 0);
    if (!throughId) return;
    readAll.mutate({ data: { throughId } }, {
      onSuccess: (r) => {
        setLocalRead(new Set(items.map((n) => n.id)));
        setOlder([]); setCursor(undefined);
        invalidateSocial(qc, { conversations: false });
        qc.invalidateQueries({ queryKey: ["/api/conversations"] });
        toast({ title: "All caught up", description: r.message });
      },
      onError: (e) => toast({ variant: "destructive", title: "Could not mark all as read", description: errMessage(e) }),
    });
  }

  if (isLoading) return <ul className="divide-y rounded-2xl border bg-card" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <li key={i} className="flex gap-3 p-4"><Skeleton className="h-9 w-9 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-24" /></div></li>)}</ul>;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!items.length) {
    return <EmptyState icon={unreadOnly ? <CheckCheck className="h-5 w-5" /> : <BellOff className="h-5 w-5" />} title={unreadOnly ? "Nothing unread" : "No notifications yet"}>
      {unreadOnly ? "You have seen everything. Switch off the filter to see your history." : "When someone messages you or staff review something you reported, it shows up here."}
    </EmptyState>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" data-testid="text-unread-count">{data.unreadCount} unread</p>
        <Button size="sm" variant="outline" onClick={markAll} disabled={readAll.isPending || unreadLoaded === 0} data-testid="button-mark-all-read">
          <CheckCheck className="mr-2 h-4 w-4" />{readAll.isPending ? "Marking" : "Mark all as read"}
        </Button>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card" data-testid="list-notifications">
        {items.map((n) => {
          const Icon = kindIcon(n.kind);
          const unread = !n.readAt;
          return (
            <li key={n.id} className={cn("flex items-start gap-3 p-4", unread && "bg-accent/30")} data-testid={`row-notification-${n.id}`}>
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", unread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Icon className="h-4 w-4" /></span>
              <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <p className={cn("text-sm", unread ? "font-semibold" : "text-muted-foreground")}>{n.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{ago(n.createdAt)}{unread ? " · new" : ""}</p>
              </button>
              {unread && (
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => markOne(n)} disabled={readOne.isPending} aria-label={`Mark "${n.title}" as read`} data-testid={`button-read-${n.id}`}>
                  <Circle className="h-2.5 w-2.5 fill-primary text-primary sm:mr-1.5" /><span className="hidden sm:inline">Mark read</span>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {next && (
        <div className="mt-5 text-center">
          <Button variant="outline" onClick={more} disabled={loadingMore} data-testid="button-load-more-notifications">{loadingMore ? "Loading" : "Load older"}</Button>
          {moreErr && <p role="alert" className="mt-2 text-sm text-destructive">{moreErr}</p>}
        </div>
      )}
    </div>
  );
}

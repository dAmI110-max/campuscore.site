import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Flag, MoreVertical, ShieldOff, UserRound } from "lucide-react";
import {
  useGetConversation, getGetConversationQueryKey, getConversation, useReadConversation,
  type ChatMessage, type ConversationDetail,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/states";
import { PersonAvatar } from "@/components/person-avatar";
import { BlockDialog, ReportUserDialog } from "@/components/safety-dialogs";
import { Composer } from "@/components/messages/composer";
import { MessageList } from "@/components/messages/message-list";
import { useVisible } from "@/hooks/use-visible";
import { errMessage, errStatus } from "@/lib/format";
import { invalidateSocial, mergeMessages } from "@/lib/social";

export function ConversationThread({ id }: { id: number }) {
  const visible = useVisible();
  const qc = useQueryClient();
  const key = getGetConversationQueryKey(id);
  const { data, isLoading, error, refetch, dataUpdatedAt } = useGetConversation(id, undefined, {
    query: { queryKey: key, refetchInterval: visible ? 5000 : false, refetchIntervalInBackground: false, refetchOnMount: "always" },
  });

  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderErr, setOlderErr] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    // Retain messages that slide out of the latest 50-message polling window.
    // Otherwise a previously loaded older page can become separated by a gap.
    setOlder(previous => mergeMessages(previous, data.messages));
    setCursor(previous => previous === undefined ? data.nextBefore : previous);
  }, [data?.messages, data?.nextBefore]);
  const nextBefore = cursor === undefined ? data?.nextBefore ?? null : cursor;

  const messages = useMemo(() => mergeMessages(older, data?.messages ?? []), [older, data?.messages]);
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  const conv = data?.conversation;

  const [reportOpen, setReportOpen] = useState(false);
  const [reportMsg, setReportMsg] = useState<number | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  // Scroll handling: stick to the bottom for new messages, hold position when older history loads.
  const scroller = useRef<HTMLDivElement>(null);
  const prevLast = useRef(0);
  const anchor = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (anchor.current !== null) { el.scrollTop = el.scrollHeight - anchor.current; anchor.current = null; return; }
    if (lastId !== prevLast.current) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      if (prevLast.current === 0 || nearBottom) el.scrollTop = el.scrollHeight;
      prevLast.current = lastId;
    }
  }, [lastId, messages.length]);

  // Read receipts: only after messages are rendered, only while the tab is visible,
  // and only through the newest message that is actually on screen.
  const read = useReadConversation();
  const readRef = useRef(read.mutate);
  readRef.current = read.mutate;
  const lastRead = useRef(0);
  useEffect(() => {
    if (!visible || !lastId || lastRead.current >= lastId) return;
    const prev = lastRead.current;
    lastRead.current = lastId;
    readRef.current({ id, data: { throughMessageId: lastId } }, {
      onSuccess: () => { invalidateSocial(qc, { conversations: false }); qc.invalidateQueries({ queryKey: ["/api/conversations"] }); },
      onError: () => { if (lastRead.current === lastId) lastRead.current = prev; },
    });
  }, [visible, lastId, id, qc, dataUpdatedAt]);

  async function loadOlder() {
    if (!nextBefore || loadingOlder) return;
    setLoadingOlder(true); setOlderErr(null);
    try {
      const page = await getConversation(id, { before: nextBefore });
      if (scroller.current) anchor.current = scroller.current.scrollHeight - scroller.current.scrollTop;
      setOlder((o) => mergeMessages(page.messages, o));
      setCursor(page.nextBefore);
    } catch (e) {
      setOlderErr(errMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  }

  const onSent = useCallback((m: ChatMessage) => {
    qc.setQueryData<ConversationDetail>(key, (old) => old ? { ...old, messages: mergeMessages(old.messages, [m]) } : old);
    invalidateSocial(qc);
  }, [qc, key]);

  if (isLoading) return <ThreadSkeleton />;
  if (errStatus(error) === 404 || errStatus(error) === 403) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div><p className="font-display text-lg font-semibold">Conversation not found</p>
          <p className="mt-1 text-sm text-muted-foreground">It may not exist, or you are not part of it.</p>
          <Button asChild variant="outline" className="mt-4"><Link href="/messages">All messages</Link></Button></div>
      </div>
    );
  }
  if (error || !data || !conv) return <div className="p-6"><ErrorState error={error} onRetry={() => refetch()} /></div>;

  const peer = conv.peer;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex items-center gap-3 border-b bg-card/80 px-3 py-2.5 sm:px-4">
        <Button asChild variant="ghost" size="icon" className="lg:hidden" aria-label="Back to conversations"><Link href="/messages"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <Link href={`/people/${peer.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="link-peer-profile">
          <PersonAvatar person={peer} />
          <div className="min-w-0">
            <p className="truncate font-semibold" data-testid="text-peer-name">{peer.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">@{peer.username}</p>
          </div>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Conversation options" data-testid="button-thread-menu"><MoreVertical className="h-5 w-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href={`/people/${peer.username}`}><UserRound className="mr-2 h-4 w-4" />View profile</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setReportMsg(null); setReportOpen(true); }} data-testid="menu-report-user"><Flag className="mr-2 h-4 w-4" />Report</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBlockOpen(true)} className={conv.blockedByMe ? "" : "text-destructive"} data-testid="menu-block-user">
              {conv.blockedByMe ? <><ShieldOff className="mr-2 h-4 w-4" />Unblock</> : <><Ban className="mr-2 h-4 w-4" />Block</>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6" aria-live="polite">
        {nextBefore ? (
          <div className="mb-4 text-center">
            <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder} data-testid="button-load-older">{loadingOlder ? "Loading" : "Load earlier messages"}</Button>
            {olderErr && <p role="alert" className="mt-2 text-xs text-destructive">{olderErr}</p>}
          </div>
        ) : messages.length > 0 ? (
          <p className="mb-4 text-center text-xs text-muted-foreground">Start of your conversation with {peer.displayName}. Only the two of you can read it.</p>
        ) : null}
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-xs">
              <PersonAvatar person={peer} className="mx-auto h-16 w-16" />
              <p className="mt-3 font-display text-lg font-semibold">Say hello to {peer.displayName}</p>
              <p className="mt-1 text-sm text-muted-foreground">Keep payments and meetups safe: meet in public places on campus and never pay before you have seen the item.</p>
            </div>
          </div>
        ) : (
          <MessageList messages={messages} onReport={(m) => { setReportMsg(m.id); setReportOpen(true); }} />
        )}
      </div>

      {conv.canMessage ? (
        <Composer key={id} conversationId={id} onSent={onSent} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/60 px-4 py-3 text-sm" data-testid="text-cannot-message">
          <span className="flex items-center gap-2 text-muted-foreground"><Ban className="h-4 w-4" />
            {conv.blockedByMe ? `You blocked @${peer.username}. Unblock to send messages.` : "Messaging is not available in this conversation right now."}</span>
          {conv.blockedByMe && <Button size="sm" variant="outline" onClick={() => setBlockOpen(true)} data-testid="button-unblock-inline">Unblock</Button>}
        </div>
      )}

      <ReportUserDialog username={peer.username} displayName={peer.displayName} open={reportOpen} onOpenChange={setReportOpen} evidence={messages} presetMessageId={reportMsg} />
      <BlockDialog username={peer.username} displayName={peer.displayName} mode={conv.blockedByMe ? "unblock" : "block"} open={blockOpen} onOpenChange={setBlockOpen} />
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <div className="flex items-center gap-3 border-b p-4"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-40" /></div>
      <div className="flex-1 space-y-3 p-6">
        {[60, 40, 70, 35, 55].map((w, i) => <div key={i} className={i % 2 ? "flex justify-end" : "flex"}><Skeleton className="h-10 rounded-2xl" style={{ width: w + "%" }} /></div>)}
      </div>
    </div>
  );
}

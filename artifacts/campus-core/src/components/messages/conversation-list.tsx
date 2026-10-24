import { Link } from "wouter";
import { MessagesSquare, Ban } from "lucide-react";
import type { ChatConversation } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonAvatar } from "@/components/person-avatar";
import { shortStamp } from "@/lib/social";
import { cn } from "@/lib/utils";

export function ConversationListSkeleton() {
  return (
    <ul className="divide-y" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 p-4"><Skeleton className="h-11 w-11 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></li>
      ))}
    </ul>
  );
}

export function ConversationList({ items, activeId }: { items: ChatConversation[]; activeId?: number }) {
  return (
    <ul className="divide-y" data-testid="list-conversations">
      {items.map((c) => {
        const unread = c.unreadCount > 0;
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} aria-current={active ? "page" : undefined}
              className={cn("flex items-center gap-3 px-4 py-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active ? "bg-accent/70" : "hover:bg-muted/70")}
              data-testid={`link-conversation-${c.id}`}>
              <div className="relative">
                <PersonAvatar person={c.peer} className="h-11 w-11" />
                {unread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("truncate", unread ? "font-semibold" : "font-medium")}>{c.peer.displayName}</p>
                  <time className="shrink-0 font-mono text-[11px] text-muted-foreground" dateTime={c.updatedAt}>{shortStamp(c.lastMessage?.createdAt ?? c.updatedAt)}</time>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>
                    {!c.canMessage && <Ban className="mr-1 inline h-3 w-3 -translate-y-px" aria-label="Messaging unavailable" />}
                    {c.lastMessage ? <>{c.lastMessage.isMine && <span className="text-muted-foreground">You: </span>}{c.lastMessage.body}</> : <span className="italic">No messages yet</span>}
                  </p>
                  {unread && <span className="shrink-0 rounded-full bg-primary px-1.5 font-mono text-[11px] font-semibold text-primary-foreground" aria-label={`${c.unreadCount} unread`}>{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function NoConversations() {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><MessagesSquare className="h-5 w-5" /></span>
      <p className="mt-4 font-display text-lg font-semibold">No conversations yet</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">Message a poster from their listing, or find a classmate in People.</p>
      <Link href="/people" className="mt-4 text-sm font-semibold text-primary hover:underline">Find people</Link>
    </div>
  );
}

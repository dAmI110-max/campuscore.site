import { useState } from "react";
import { useParams } from "wouter";
import { MessagesSquare, LockKeyhole } from "lucide-react";
import { useListConversations, getListConversationsQueryKey } from "@workspace/api-client-react";
import { ErrorState } from "@/components/states";
import { Pager } from "@/components/pager";
import { ConversationList, ConversationListSkeleton, NoConversations } from "@/components/messages/conversation-list";
import { ConversationThread } from "@/components/messages/conversation-thread";
import { useVisible } from "@/hooks/use-visible";
import { cn } from "@/lib/utils";

export default function Messages() {
  const params = useParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : NaN;
  const hasThread = Number.isInteger(id) && id > 0;
  const [page, setPage] = useState(1);
  const visible = useVisible();
  const lp = { page };
  const { data, isLoading, error, refetch, isFetching } = useListConversations(lp, {
    query: { queryKey: getListConversationsQueryKey(lp), refetchInterval: visible ? 5000 : false, refetchIntervalInBackground: false, refetchOnMount: "always", placeholderData: (p) => p },
  });

  return (
    <div className="-mx-4 -my-6 sm:mx-0 sm:my-0">
      <div className="grid h-[calc(100dvh-4rem-5rem)] min-w-0 grid-cols-1 overflow-hidden border-y bg-card sm:h-[calc(100dvh-4rem-5rem)] sm:rounded-3xl sm:border md:h-[calc(100dvh-4rem-5rem)] lg:h-[calc(100dvh-9rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={cn("flex min-h-0 flex-col border-r", hasThread && "hidden lg:flex")} aria-label="Conversations">
          <div className="flex items-center justify-between border-b px-4 py-3.5">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">Inbox</p>
              <h1 className="font-display text-xl font-bold">Messages</h1>
            </div>
            {data && <span className="font-mono text-xs text-muted-foreground">{data.total}{isFetching ? " ·" : ""}</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? <ConversationListSkeleton /> : error ? <div className="p-4"><ErrorState error={error} onRetry={() => refetch()} /></div>
              : !data || data.items.length === 0 ? <NoConversations />
              : <><ConversationList items={data.items} activeId={hasThread ? id : undefined} /><div className="pb-4"><Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} label="conversations" /></div></>}
          </div>
        </aside>
        <section className={cn("min-h-0 min-w-0", !hasThread && "hidden lg:block")}>
          {hasThread ? <ConversationThread key={id} id={id} /> : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><MessagesSquare className="h-6 w-6" /></span>
                <p className="mt-4 font-display text-xl font-semibold">Pick a conversation</p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" />Private between you and the other student.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

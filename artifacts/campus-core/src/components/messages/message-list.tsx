import { Fragment } from "react";
import { Flag } from "lucide-react";
import type { ChatMessage } from "@workspace/api-client-react";
import { clock, dayLabel } from "@/lib/social";
import { cn } from "@/lib/utils";

export function MessageList({ messages, onReport }: { messages: ChatMessage[]; onReport?: (m: ChatMessage) => void }) {
  let prevDay = "";
  return (
    <ol className="min-w-0 space-y-1.5" aria-label="Messages">
      {messages.map((m) => {
        const d = dayLabel(m.createdAt);
        const showDay = d !== prevDay;
        prevDay = d;
        return (
          <Fragment key={m.id}>
            {showDay && <li className="py-3 text-center"><span className="rounded-full bg-muted px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{d}</span></li>}
            <li className={cn("group flex min-w-0", m.isMine ? "justify-end" : "justify-start")} data-testid={`message-${m.id}`}>
              <div className={cn("flex min-w-0 max-w-[85%] items-end gap-1.5 sm:max-w-[70%]", m.isMine && "flex-row-reverse")}>
                <div className={cn("min-w-0 rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
                  m.isMine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card")}>
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                  <time dateTime={m.createdAt} className={cn("mt-0.5 block text-right font-mono text-[10px]", m.isMine ? "text-primary-foreground/75" : "text-muted-foreground")}>{clock(m.createdAt)}</time>
                </div>
                {!m.isMine && onReport && (
                  <button type="button" onClick={() => onReport(m)} aria-label="Report this message"
                    className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 sm:opacity-0"
                    data-testid={`button-report-message-${m.id}`}>
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

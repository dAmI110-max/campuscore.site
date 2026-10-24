import { useRef, useState, type KeyboardEvent } from "react";
import { SendHorizontal, RotateCw } from "lucide-react";
import { useSendMessage, type ChatMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { errMessage } from "@/lib/format";
import { newClientId } from "@/lib/social";

const MAX = 4000;

/**
 * Text composer. A clientMessageId is minted per distinct message and reused on every retry
 * of that same text until the server confirms, so a lost response never creates a duplicate.
 */
export function Composer({ conversationId, onSent }: { conversationId: number; onSent: (m: ChatMessage) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const pending = useRef<{ body: string; cid: string } | null>(null);
  const send = useSendMessage();
  const body = text.trim();
  const tooLong = text.length > MAX;

  function submit() {
    if (!body || tooLong || send.isPending) return;
    if (!pending.current || pending.current.body !== body) pending.current = { body, cid: newClientId() };
    const { cid } = pending.current;
    setErr(null);
    send.mutate({ id: conversationId, data: { body, clientMessageId: cid } }, {
      onSuccess: (m) => {
        if (pending.current?.cid === cid) pending.current = null;
        setText((t) => (t.trim() === body ? "" : t));
        onSent(m);
      },
      onError: (e) => setErr(errMessage(e, "Message not sent. Your text is kept, so you can try again.")),
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  }

  return (
    <form className="border-t bg-card/80 p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {err && (
        <div role="alert" className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{err}</span>
          <Button type="submit" size="sm" variant="outline" disabled={send.isPending} data-testid="button-retry-send"><RotateCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">Write a message</label>
        <textarea id="composer" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={1} maxLength={MAX}
          placeholder="Write a message" aria-describedby="composer-hint"
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm [field-sizing:content] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="input-message" />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-xl" disabled={!body || tooLong || send.isPending} aria-label="Send message" data-testid="button-send-message">
          <SendHorizontal className={send.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
        </Button>
      </div>
      <p id="composer-hint" className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span className="hidden sm:inline">Enter to send, Shift + Enter for a new line</span>
        <span className={`ml-auto font-mono ${text.length > MAX - 200 ? "text-destructive" : ""}`}>{send.isPending ? "Sending · " : ""}{text.length}/{MAX}</span>
      </p>
    </form>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { BookOpen, Loader2, Send, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@clerk/react";
import { useMe } from "@/hooks/use-me";

type Msg = { role: "user" | "assistant"; content: string };

type Status = {
  name: string;
  enabled: boolean;
  sitePremiumActive: boolean;
  sitePremiumPriceMinor: number;
  dailyLimit: number;
  dailyUsed: number;
  unlockNote: string;
};

export default function CoreAiPage() {
  const me = useMe();
  const { getToken } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function api(path: string, init?: RequestInit) {
    const token = await getToken();
    const res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  useEffect(() => {
    if (!me.signedIn) return;
    api("/core-ai/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [me.signedIn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const data = await api("/core-ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history: messages.slice(-12) }),
      });
      setMessages([...next, { role: "assistant", content: data.reply }]);
      setStatus((s) => (s ? { ...s, dailyUsed: Math.min(s.dailyLimit, s.dailyUsed + 1) } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages(messages);
    } finally {
      setBusy(false);
    }
  }

  if (!me.signedIn) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border bg-card p-8 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 font-display text-3xl font-bold">Core AI</h1>
        <p className="mt-2 text-muted-foreground">Sign in to use Campus Core’s study assistant.</p>
        <Button asChild className="mt-6"><Link href="/sign-in">Sign in</Link></Button>
      </div>
    );
  }

  const locked = status && !status.sitePremiumActive;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col gap-4">
      <header className="rounded-3xl border bg-card p-6 sm:p-8">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
          <BookOpen className="h-4 w-4" /> Study · Core AI
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Core AI</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Explain topics, revise for tests, build study plans, and practise questions — built for campus life.
        </p>
        {status && (
          <p className="mt-3 text-sm text-muted-foreground">
            {status.dailyUsed}/{status.dailyLimit} messages today · Site Premium ₦{(status.sitePremiumPriceMinor / 100).toLocaleString("en-NG")}
          </p>
        )}
      </header>

      {locked && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">Site Premium required</p>
              <p className="mt-1 text-sm text-muted-foreground">{status?.unlockNote}</p>
              <Button asChild className="mt-4" size="sm"><Link href="/account">View Premium options</Link></Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 rounded-3xl border bg-card p-4 sm:p-6">
        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.length === 0 && !locked && (
            <p className="text-sm text-muted-foreground">
              Try: “Explain osmosis for a first-year biology student” or “Give me 10 JAMB-style questions on quadratic equations with answers.”
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-8 rounded-2xl bg-primary px-4 py-3 text-primary-foreground"
                  : "mr-8 rounded-2xl border bg-background px-4 py-3 whitespace-pre-wrap"
              }
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Core AI is thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={locked ? "Unlock with Site Premium to chat…" : "Ask Core AI…"}
            disabled={Boolean(locked) || busy}
            className="min-h-[3rem] flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button onClick={() => void send()} disabled={Boolean(locked) || busy || !input.trim()} size="icon" className="h-12 w-12 shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

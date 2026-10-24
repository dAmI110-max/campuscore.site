import { Link, useSearch } from "wouter";
import { Plus, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingBrowser } from "@/components/listing-browser";
import { useMe } from "@/hooks/use-me";
import { KIND_MAP, type Kind } from "@/lib/kinds";

export default function KindPage({ kind }: { kind: Kind }) {
  const meta = KIND_MAP[kind];
  const me = useMe();
  const initialQ = new URLSearchParams(useSearch()).get("q") ?? "";
  return (
    <div>
      <section className="mb-8 grid items-center gap-6 rounded-3xl border bg-card p-6 sm:p-8 md:grid-cols-[1fr_auto]">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-primary"><meta.icon className="h-4 w-4" />Board</p>
          <h1 className="mt-1 font-display text-4xl font-bold sm:text-5xl">{meta.label}</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">{meta.blurb}</p>
          <p className="mt-4 flex max-w-xl gap-2 text-sm"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="font-semibold">Tip.</span> {meta.tip}</span></p>
          <Button asChild className="mt-5" data-testid="button-post-kind">
            <Link href={me.signedIn ? `/create?kind=${kind}` : "/sign-up"}><Plus className="mr-2 h-4 w-4" />Post {meta.singular.toLowerCase()}</Link>
          </Button>
        </div>
        <img src={meta.art} alt="" className="hidden h-44 w-44 rounded-2xl object-cover md:block" />
      </section>
      <ListingBrowser key={kind + initialQ} initialQ={initialQ} meta={meta} signedIn={me.signedIn} />
    </div>
  );
}

import { Link } from "wouter";
import { ArrowRight, ShieldCheck, School, UserRound, Megaphone } from "lucide-react";
import { useGetSummary, getGetSummaryQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoMark } from "@/components/brand";
import { UnavailableNote } from "@/components/unavailable-note";
import { KINDS } from "@/lib/kinds";

export default function Home() {
  const { data, isLoading, isError } = useGetSummary({ query: { queryKey: getGetSummaryQueryKey() } });
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-20 sm:space-y-28">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> For students across Nigeria
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl lg:text-7xl">
            Everything students need.<br /><span className="text-primary">One place.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Sell your old textbooks, find a room near school, hire a fellow student, catch the next seminar, and join the people who share your interests. Organised by university, posted by students.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" data-testid="button-hero-join"><Link href="/sign-up">Create your free account <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline" data-testid="button-hero-browse"><Link href="/marketplace">Browse without signing in</Link></Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {KINDS.slice(0, 6).map((k, i) => (
            <Link key={k.kind} href={k.path} className={`overflow-hidden rounded-2xl border bg-card ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
              <img src={k.art} alt={`${k.label} illustration`} className="aspect-square h-full w-full object-cover" />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Seven boards</p>
            <h2 className="mt-1 font-display text-3xl font-bold sm:text-4xl">What you can find here</h2>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-total-listings">
            {isLoading ? "Counting live listings" : isError ? "Live counts unavailable right now" : total === 0 ? "No listings yet. The boards open with you." : `${total} live ${total === 1 ? "listing" : "listings"} across all boards`}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((k, i) => (
            <Link key={k.kind} href={k.path} className={`group flex flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-primary/60 ${i === 0 ? "lg:col-span-2 lg:row-span-1" : ""}`} data-testid={`card-kind-${k.kind}`}>
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground"><k.icon className="h-5 w-5" /></span>
                {isLoading ? <Skeleton className="h-5 w-10" /> : data && <span className="font-mono text-sm text-muted-foreground">{data.counts[k.kind]} live</span>}
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold group-hover:text-primary">{k.label}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{k.blurb}</p>
            </Link>
          ))}
          <div className="flex flex-col justify-between rounded-2xl bg-primary p-5 text-primary-foreground">
            <LogoMark className="h-9 w-9 [&_rect]:fill-primary-foreground [&_path]:stroke-primary [&_circle]:fill-primary/60" />
            <div>
              <p className="font-display text-xl font-semibold">Have something to share?</p>
              <Link href="/sign-up" className="mt-2 inline-flex items-center text-sm font-semibold underline-offset-4 hover:underline">Post your first listing <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-10 rounded-3xl border bg-card p-6 sm:p-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">How it works</p>
          <h2 className="mt-1 font-display text-3xl font-bold">Three steps, then you are in.</h2>
          <p className="mt-3 text-muted-foreground">Your school anchors everything, so what you see is close to where you actually are.</p>
        </div>
        <ol className="grid gap-5 sm:grid-cols-3">
          {[
            { icon: UserRound, t: "Sign up", d: "Use Google or email. Pick a username people can find you by." },
            { icon: School, t: "Choose your school", d: "Pick your university from our directory. Faculty and department are optional." },
            { icon: Megaphone, t: "Post or browse", d: "Share what you have, save what you like and contact posters directly." },
          ].map((s, i) => (
            <li key={s.t} className="rounded-2xl bg-muted/60 p-5">
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              <s.icon className="mt-3 h-5 w-5 text-primary" />
              <p className="mt-3 font-display text-lg font-semibold">{s.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border p-6 sm:p-8">
          <School className="h-6 w-6 text-primary" />
          <h2 className="mt-4 font-display text-2xl font-bold">A directory we can stand behind</h2>
          <p className="mt-2 text-muted-foreground">
            Every university, faculty and department comes from an official source. Where we have not sourced something yet, we say so, and you can request it.
          </p>
          <p className="mt-4 font-mono text-sm" data-testid="text-university-count">
            {isLoading ? "Loading" : data ? `${data.universities} ${data.universities === 1 ? "university" : "universities"} in the directory today` : "Directory count unavailable"}
          </p>
        </div>
        <div className="rounded-3xl border p-6 sm:p-8">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h2 className="mt-4 font-display text-2xl font-bold">Safer by default</h2>
          <ul className="mt-2 space-y-2 text-muted-foreground">
            <li>Any listing can be reported, and moderators review every report.</li>
            <li>Verified badges are given by moderators, never bought.</li>
            <li>Meet in public places on campus and inspect before paying.</li>
          </ul>
          <div className="mt-4"><UnavailableNote /></div>
        </div>
      </section>

      <section className="rounded-3xl bg-foreground p-8 text-background sm:p-12">
        <h2 className="max-w-2xl font-display text-3xl font-bold sm:text-5xl">Your campus is already full of what you need. Let us make it findable.</h2>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary"><Link href="/sign-up">Join Campus Core</Link></Button>
          <Button asChild size="lg" variant="ghost" className="text-background hover:bg-background/10 hover:text-background"><Link href="/sign-in">I already have an account</Link></Button>
        </div>
      </section>
    </div>
  );
}

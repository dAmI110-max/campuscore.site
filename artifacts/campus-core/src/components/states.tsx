import type { ReactNode } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { errMessage } from "@/lib/format";

export function ErrorState({ error, onRetry, title = "We could not load this" }: { error?: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center" data-testid="state-error">
      <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-destructive" />
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{errMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry} data-testid="button-retry">
          <RotateCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ art, icon, title, children, action }: { art?: string; icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-12 text-center" data-testid="state-empty">
      {art ? <img src={art} alt="" className="mb-5 h-36 w-36 rounded-2xl object-cover" /> : icon ? <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground">{icon}</div> : null}
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

/** Signed-in only. Redirects signed-out visitors to sign-in. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.authLoaded) return <PageSkeleton />;
  if (!me.signedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

/** Signed in, completed profile, not suspended. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const me = useMe();
  const [loc] = useLocation();
  if (!me.authLoaded) return <PageSkeleton />;
  if (!me.signedIn) return <Redirect to="/sign-in" />;
  if (me.loading) return <PageSkeleton />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => me.refetch()} title="We could not load your profile" />;
  if (me.profile && !me.profile.complete) return <Redirect to={`/onboarding?next=${encodeURIComponent(loc)}`} />;
  if (me.profile?.suspended) {
    return (
      <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title="Your account is suspended" action={<Button asChild variant="outline"><Link href="/explore">Back to Explore</Link></Button>}>
        You can still browse, but posting and editing are paused while a moderator reviews your account.
      </EmptyState>
    );
  }
  return <>{children}</>;
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-muted-foreground">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

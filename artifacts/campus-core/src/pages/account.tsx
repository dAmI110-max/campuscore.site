import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, FileText, Info, Plus, ReceiptText, ShoppingBag, Store } from "lucide-react";
import {
  useGetCommerceAccount, getGetCommerceAccountQueryKey, useChooseCommerceAccount,
  getGetProfileQueryKey, getListListingsQueryKey, type CommerceAccount,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { errMessage, day } from "@/lib/format";
import { lagosDateTime, minorMoney } from "@/lib/commerce";
import { cn } from "@/lib/utils";

const PREMIUM_STATUS: Record<string, string> = {
  launch_unconfigured: "Waiting for official launch date",
  waiting: "Not yet eligible",
  payment_unavailable: "Eligible, payments not available yet",
};

export default function Account() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetCommerceAccount({ query: { queryKey: getGetCommerceAccountQueryKey(), staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000, refetchIntervalInBackground: false } });
  const choose = useChooseCommerceAccount();

  function pick(accountType: "buyer" | "seller") {
    choose.mutate({ data: { accountType } }, {
      onSuccess: (acc) => {
        qc.setQueryData(getGetCommerceAccountQueryKey(), acc);
        qc.invalidateQueries({ queryKey: getGetCommerceAccountQueryKey() });
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        qc.invalidateQueries({ queryKey: ["/api/admin/commerce"] });
        qc.invalidateQueries({ queryKey: getListListingsQueryKey() });
        toast({ title: accountType === "seller" ? "You are now in seller mode" : "You are now in buyer mode" });
      },
      onError: (e) => toast({ title: "Could not switch mode", description: errMessage(e), variant: "destructive" }),
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Your account" title="Buying and selling">Choose how you use the marketplace. Sellers can still buy from other students.</PageHeader>
      {q.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-36 w-full rounded-2xl" /><Skeleton className="h-48 w-full rounded-2xl" /></div>
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We could not load your account" />
      ) : (
        <Body acc={q.data} onPick={pick} pending={choose.isPending} />
      )}
    </div>
  );
}

function Body({ acc, onPick, pending }: { acc: CommerceAccount; onPick: (t: "buyer" | "seller") => void; pending: boolean }) {
  const seller = acc.accountType === "seller";
  const blockBuyer = seller && acc.sellerListingCount > 0;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="mode-h">
        <h2 id="mode-h" className="font-display text-lg font-semibold">Account mode</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Account mode">
          <ModeCard active={!seller} icon={<ShoppingBag className="h-5 w-5" />} title="Buyer" text="Browse, save and message sellers. You cannot post marketplace items in this mode."
            disabled={pending || blockBuyer || !seller} onClick={() => onPick("buyer")} testId="button-mode-buyer" />
          <ModeCard active={seller} icon={<Store className="h-5 w-5" />} title="Seller" text="Post marketplace items and keep buying too."
            disabled={pending || seller} onClick={() => onPick("seller")} testId="button-mode-seller" />
        </div>
        {blockBuyer && (
          <p className="mt-3 flex gap-2 text-sm text-muted-foreground" data-testid="text-buyer-blocked">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            You have {acc.sellerListingCount} active marketplace {acc.sellerListingCount === 1 ? "listing" : "listings"}. Mark them unavailable or delete them before switching to buyer mode.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Other boards such as accommodation, services and study are open to everyone in either mode.</p>
      </section>

      {seller && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="sell-h">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="sell-h" className="font-display text-lg font-semibold">Your shop</h2>
              <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono text-foreground" data-testid="text-seller-count">{acc.sellerListingCount}</span> active marketplace {acc.sellerListingCount === 1 ? "listing" : "listings"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm"><Link href="/my-listings" data-testid="link-my-marketplace"><FileText className="mr-2 h-4 w-4" />My listings</Link></Button>
              <Button asChild size="sm"><Link href="/create?kind=marketplace" data-testid="link-new-marketplace"><Plus className="mr-2 h-4 w-4" />New marketplace listing</Link></Button>
            </div>
          </div>
        </section>
      )}

      {seller && acc.premium && (
        <section className="rounded-2xl border border-primary/30 bg-accent/40 p-5 sm:p-6" aria-labelledby="prem-h" data-testid="section-premium">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Seller Premium</p>
          <h2 id="prem-h" className="mt-1 font-display text-lg font-semibold">{PREMIUM_STATUS[acc.premium.status] ?? acc.premium.status}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Planned price</dt><dd className="font-mono" data-testid="text-premium-price">{minorMoney(acc.premium.priceMinor, acc.premium.currency)} / month</dd></div>
            <div><dt className="text-muted-foreground">Eligible from</dt><dd data-testid="text-premium-eligible">{acc.premium.eligibleAt ? lagosDateTime(acc.premium.eligibleAt) : "After the official launch date is set"}</dd></div>
            <div><dt className="text-muted-foreground">Checkout</dt><dd>Not available</dd></div>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground" data-testid="text-premium-explanation">{acc.premium.explanation}</p>
          <p className="mt-2 text-xs text-muted-foreground">Premium becomes eligible two calendar months after the platform's official launch. Nothing can be purchased until payments are configured; you will not be charged.</p>
        </section>
      )}

      <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="orders-h">
        <h2 id="orders-h" className="font-display text-lg font-semibold">Order history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {acc.launch.paymentsEnabled ? "Recorded payments on your account." : "In-app payments and escrow are not live yet. Arrange any deal directly and meet safely on campus."}
        </p>
        <div className="mt-4">
          {!acc.orders.length ? (
            <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="No orders">Nothing has been paid through Campus Core on this account.</EmptyState>
          ) : (
            <ul className="divide-y rounded-xl border">
              {acc.orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-testid={`row-order-${o.id}`}>
                  <div className="min-w-0"><p className="font-medium capitalize">{o.kind.replace(/_/g, " ")}</p><p className="text-xs text-muted-foreground">{day(o.createdAt)}</p></div>
                  <div className="text-right"><p className="font-mono">{minorMoney(o.amountMinor, o.currency)}</p><p className="text-xs capitalize text-muted-foreground">{o.status}</p></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Times shown in {acc.launch.timezone}.</p>
    </div>
  );
}

function ModeCard({ active, icon, title, text, disabled, onClick, testId }: { active: boolean; icon: ReactNode; title: string; text: string; disabled: boolean; onClick: () => void; testId: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick} data-testid={testId}
      className={cn("flex gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-accent text-accent-foreground" : "bg-background hover:border-primary/50", disabled && !active && "cursor-not-allowed opacity-60")}>
      <span className="text-primary">{icon}</span>
      <span><span className="block font-semibold">{title}{active && <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span>}</span><span className="mt-1 block text-sm text-muted-foreground">{text}</span></span>
    </button>
  );
}

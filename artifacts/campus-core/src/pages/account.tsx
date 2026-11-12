import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Clock, FileText, Info, Plus, ReceiptText, ShoppingBag, Sparkles, Store } from "lucide-react";
import {
  useGetCommerceAccount, getGetCommerceAccountQueryKey, useChooseCommerceAccount,
  getGetProfileQueryKey, getListListingsQueryKey, useStartCommerceCheckout, type CommerceAccount,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { errMessage, day } from "@/lib/format";
import { lagosDateTime, minorMoney } from "@/lib/commerce";
import { cn } from "@/lib/utils";

type PlanId = "premium" | "site_premium" | "premium_bundle";

type Plan = {
  id: PlanId;
  name: string;
  priceMinor: number;
  compareAtMinor?: number;
  description: string;
  includesCoreAi: boolean;
  active: boolean;
  until: string | null;
  available: boolean;
};

type PlansResponse = {
  currency: string;
  eligible: boolean;
  eligibleAt: string | null;
  checkoutEnabled: boolean;
  checkoutMode: string;
  plans: Plan[];
};

export default function Account() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { getToken } = useAuth();
  const q = useGetCommerceAccount({
    query: {
      queryKey: getGetCommerceAccountQueryKey(),
      staleTime: 0,
      refetchOnMount: "always",
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });
  const plansQ = useQuery({
    queryKey: ["/api/commerce/plans"],
    queryFn: async (): Promise<PlansResponse> => {
      const token = await getToken();
      const res = await fetch("/api/commerce/plans", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load plans");
      return data as PlansResponse;
    },
    staleTime: 15_000,
    refetchOnMount: "always",
  });
  const choose = useChooseCommerceAccount();
  const checkout = useStartCommerceCheckout();

  function pick(accountType: "buyer" | "seller") {
    choose.mutate(
      { data: { accountType } },
      {
        onSuccess: (acc) => {
          qc.setQueryData(getGetCommerceAccountQueryKey(), acc);
          qc.invalidateQueries({ queryKey: getGetCommerceAccountQueryKey() });
          qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
          qc.invalidateQueries({ queryKey: ["/api/admin/commerce"] });
          qc.invalidateQueries({ queryKey: getListListingsQueryKey() });
          qc.invalidateQueries({ queryKey: ["/api/commerce/plans"] });
          toast({
            title: accountType === "seller" ? "You are now in seller mode" : "You are now in buyer mode",
          });
        },
        onError: (e) =>
          toast({ title: "Could not switch mode", description: errMessage(e), variant: "destructive" }),
      },
    );
  }

  function startCheckout(kind: PlanId) {
    checkout.mutate(
      { data: { kind: kind as "premium" } },
      {
        onSuccess: (result) => window.location.assign(result.authorizationUrl),
        onError: (error) =>
          toast({ title: "Could not start checkout", description: errMessage(error), variant: "destructive" }),
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Your account"
        title="Buying and selling"
      >
        Choose how you use the marketplace. Sellers can still buy from other students.
      </PageHeader>
      {q.isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : q.isError || !q.data ? (
        <ErrorState title="Could not load account" onRetry={() => q.refetch()} />
      ) : (
        <Body
          acc={q.data}
          onPick={pick}
          pending={choose.isPending}
          onCheckout={startCheckout}
          checkoutPending={checkout.isPending}
          plans={plansQ.data}
          plansLoading={plansQ.isLoading}
          plansError={plansQ.isError}
          onRetryPlans={() => plansQ.refetch()}
        />
      )}
    </div>
  );
}

function Body({
  acc,
  onPick,
  pending,
  onCheckout,
  checkoutPending,
  plans,
  plansLoading,
  plansError,
  onRetryPlans,
}: {
  acc: CommerceAccount;
  onPick: (t: "buyer" | "seller") => void;
  pending: boolean;
  onCheckout: (kind: PlanId) => void;
  checkoutPending: boolean;
  plans?: PlansResponse;
  plansLoading: boolean;
  plansError: boolean;
  onRetryPlans: () => void;
}) {
  const seller = acc.accountType === "seller";
  const blockBuyer = seller && acc.sellerListingCount > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Account mode</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={!seller}
            icon={<ShoppingBag className="h-5 w-5" />}
            title="Buyer"
            text="Browse, save and message sellers. You cannot post marketplace items in this mode."
            disabled={pending || blockBuyer || !seller}
            onClick={() => onPick("buyer")}
            testId="button-mode-buyer"
          />
          <ModeCard
            active={seller}
            icon={<Store className="h-5 w-5" />}
            title="Seller"
            text="Post marketplace items and keep buying too."
            disabled={pending || seller}
            onClick={() => onPick("seller")}
            testId="button-mode-seller"
          />
        </div>
        {blockBuyer && (
          <p className="mt-3 text-sm text-muted-foreground">
            You have {acc.sellerListingCount} active marketplace{" "}
            {acc.sellerListingCount === 1 ? "listing" : "listings"}. Mark them unavailable or delete them before
            switching to buyer mode.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Other boards such as accommodation, services and study are open to everyone in either mode.
        </p>
      </section>

      {seller && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="sell-h">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="sell-h" className="font-display text-lg font-semibold">
                Your shop
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-mono text-foreground" data-testid="text-seller-count">
                  {acc.sellerListingCount}
                </span>{" "}
                active marketplace {acc.sellerListingCount === 1 ? "listing" : "listings"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/my-listings" data-testid="link-my-marketplace">
                  <FileText className="mr-2 h-4 w-4" />
                  My listings
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/create?kind=marketplace" data-testid="link-new-marketplace">
                  <Plus className="mr-2 h-4 w-4" />
                  New marketplace listing
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-primary/30 bg-accent/30 p-5 sm:p-6" data-testid="section-premium-plans">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Premium</p>
        <h2 className="mt-1 font-display text-lg font-semibold">Choose a plan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Seller Premium improves marketplace tools. Site Premium unlocks Core AI. Bundle both and save ₦500.
        </p>
        {plans?.eligibleAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Eligible from {lagosDateTime(plans.eligibleAt)}
            {plans.checkoutEnabled ? ` · Checkout ${plans.checkoutMode}` : " · Payments not enabled yet"}
          </p>
        )}

        {plansLoading ? (
          <Skeleton className="mt-4 h-48 w-full rounded-xl" />
        ) : plansError || !plans ? (
          <div className="mt-4">
            <ErrorState title="Could not load plans" onRetry={onRetryPlans} />
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {plans.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currency={plans.currency}
                eligible={plans.eligible}
                checkoutEnabled={plans.checkoutEnabled}
                pending={checkoutPending}
                onBuy={() => onCheckout(plan.id)}
              />
            ))}
          </div>
        )}
        <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Core AI is limited per day and by a monthly token budget so usage stays fair for everyone.
        </p>
        <p className="mt-2">
          <Button asChild variant="link" className="h-auto p-0 text-sm">
            <Link href="/study/core-ai">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Open Core AI
            </Link>
          </Button>
        </p>
      </section>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {!acc.launch.paymentsEnabled
            ? "Marketplace payments and escrow are not live yet. Arrange any deal directly and meet safely on campus."
            : "Verified Premium charges are recorded. Marketplace checkout and escrow remain disabled until compliant release is ready."}
        </p>
        <div className="mt-4">
          {!acc.orders.length ? (
            <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="No orders">
              Nothing has been paid through Campus Core on this account.
            </EmptyState>
          ) : (
            <ul className="divide-y rounded-xl border">
              {acc.orders.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                  data-testid={`row-order-${o.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium capitalize">{o.kind.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.mode === "test"
                        ? "Paystack test transaction"
                        : o.mode === "live"
                          ? "Paystack payment"
                          : "Recorded order"}{" "}
                      · {day(o.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono">{minorMoney(o.amountMinor, o.currency)}</p>
                    <p className="text-xs capitalize text-muted-foreground">{o.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Times shown in {acc.launch.timezone}.
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  currency,
  eligible,
  checkoutEnabled,
  pending,
  onBuy,
}: {
  plan: Plan;
  currency: string;
  eligible: boolean;
  checkoutEnabled: boolean;
  pending: boolean;
  onBuy: () => void;
}) {
  const canBuy = plan.available && eligible && checkoutEnabled && !plan.active;
  return (
    <div
      className={cn(
        "rounded-xl border bg-background p-4",
        plan.active && "border-primary/40 bg-primary/5",
        plan.id === "premium_bundle" && "border-primary/50",
      )}
      data-testid={`plan-${plan.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {plan.name}
            {plan.id === "premium_bundle" && (
              <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                Save ₦500
              </span>
            )}
            {plan.active && (
              <span className="ml-2 text-xs font-normal text-primary">Active</span>
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
          {plan.includesCoreAi && (
            <p className="mt-1 flex items-center gap-1 text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Includes Core AI
            </p>
          )}
          {!plan.available && (
            <p className="mt-1 text-xs text-muted-foreground">Switch to seller mode to buy this plan.</p>
          )}
        </div>
        <div className="text-right">
          {plan.compareAtMinor != null && (
            <p className="text-xs text-muted-foreground line-through">{minorMoney(plan.compareAtMinor, currency)}</p>
          )}
          <p className="font-mono text-lg font-semibold">{minorMoney(plan.priceMinor, currency)}</p>
          <p className="text-xs text-muted-foreground">/ month</p>
        </div>
      </div>
      <div className="mt-3">
        {plan.active ? (
          <Button size="sm" variant="outline" disabled>
            Current plan
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!canBuy || pending}
            onClick={onBuy}
            data-testid={`button-buy-${plan.id}`}
          >
            {pending ? "Starting…" : `Get ${plan.name}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function ModeCard({
  active,
  icon,
  title,
  text,
  disabled,
  onClick,
  testId,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  text: string;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-accent text-accent-foreground" : "bg-background hover:border-primary/50",
        disabled && !active && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="text-primary">{icon}</span>
      <span>
        <span className="block font-semibold">
          {title}
          {active && <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span>}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

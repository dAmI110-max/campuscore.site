import { useEffect } from "react";
import { Link } from "wouter";
import { useVerifyCommerceCheckout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/states";
import { useMe } from "@/hooks/use-me";
import { errMessage } from "@/lib/format";
import { lagosDateTime } from "@/lib/commerce";

export default function PaymentCallback() {
  const me = useMe();
  const reference = new URLSearchParams(window.location.search).get("reference") ?? "";
  const verify = useVerifyCommerceCheckout();

  useEffect(() => {
    if (reference && me.signedIn && me.profile?.complete && !verify.isPending && !verify.data && !verify.error) {
      verify.mutate({ data: { reference } });
    }
  }, [reference, me.signedIn, me.profile?.complete, verify.isPending, verify.data, verify.error, verify.mutate]);

  const payment = verify.data;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Paystack" title="Payment confirmation">
        A return from checkout is not proof of payment. Campus Core checks the transaction with Paystack before recording it.
      </PageHeader>
      <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-live="polite">
        {!reference ? (
          <p data-testid="text-payment-callback-error">No payment reference was returned. Check your order history before trying again.</p>
        ) : me.loading ? (
          <p data-testid="text-payment-account-loading">Checking your account…</p>
        ) : !me.signedIn ? (
          <div className="space-y-3">
            <p data-testid="text-payment-sign-in">Sign in to the same Campus Core account that started checkout to verify this payment.</p>
            <Button asChild><Link href="/sign-in">Sign in</Link></Button>
          </div>
        ) : !me.profile?.complete ? (
          <div className="space-y-3">
            <p data-testid="text-payment-profile-required">Complete your profile before verifying this transaction.</p>
            <Button asChild><Link href="/onboarding">Complete profile</Link></Button>
          </div>
        ) : verify.isPending || (!payment && !verify.error) ? (
          <p data-testid="text-payment-verifying">Checking transaction status with Paystack…</p>
        ) : verify.error ? (
          <div className="space-y-3">
            <p className="text-destructive" data-testid="text-payment-callback-error">{errMessage(verify.error)}</p>
            <Button variant="outline" onClick={() => verify.mutate({ data: { reference } })} data-testid="button-payment-retry">Check again</Button>
          </div>
        ) : payment?.status === "paid" ? (
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold" data-testid="text-payment-result">Paystack transaction verified</h2>
            {payment.mode === "test" ? (
              <p data-testid="text-payment-test-warning">This was a test transaction. No real money was collected and it does not activate production Premium.</p>
            ) : payment.kind === "premium" ? (
              <p>Seller Premium is active until {payment.premiumUntil ? lagosDateTime(payment.premiumUntil) : "the recorded expiry date"}.</p>
            ) : (
              <p data-testid="text-marketplace-no-escrow">This order does not include escrow or seller fund release. Do not treat the funds as held for a safe handover.</p>
            )}
            <Button asChild variant="outline"><Link href="/account">View account and orders</Link></Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p data-testid="text-payment-pending">Paystack has not confirmed a successful transaction. No Premium access or marketplace delivery has been granted.</p>
            <Button variant="outline" onClick={() => verify.mutate({ data: { reference } })} disabled={verify.isPending} data-testid="button-payment-retry">
              {verify.isPending ? "Checking…" : "Check again"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

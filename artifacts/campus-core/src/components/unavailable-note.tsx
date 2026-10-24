import { Info } from "lucide-react";
import { useGetSummary, getGetSummaryQueryKey } from "@workspace/api-client-react";

/** Honest status of features that are not switched on. Renders nothing for enabled features. */
export function UnavailableNote({ features = ["messaging", "payments"] }: { features?: ("messaging" | "payments" | "ai")[] }) {
  const { data } = useGetSummary({ query: { queryKey: getGetSummaryQueryKey(), staleTime: 60_000 } });
  if (!data) return null;
  const off: string[] = [];
  if (features.includes("payments") && !data.paymentsEnabled) off.push("Payments do not go through Campus Core. Never send money before you have verified the person and the item.");
  if (features.includes("ai") && !data.aiEnabled) off.push("AI assistance is turned off.");
  if (!off.length) return null;
  return (
    <div className="flex gap-3 rounded-xl border bg-muted/60 p-3.5 text-sm" data-testid="note-unavailable">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="space-y-1 text-muted-foreground">{off.map((t) => <p key={t}>{t}</p>)}</div>
    </div>
  );
}

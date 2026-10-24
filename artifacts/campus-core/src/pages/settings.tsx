import { useState } from "react";
import { useClerk, useUser, UserProfile } from "@clerk/react";
import { Monitor, Moon, Sun, LogOut, KeyRound } from "lucide-react";
import { useGetSummary, getGetSummaryQueryKey, useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/states";
import { useTheme, type ThemeChoice } from "@/lib/theme";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [manage, setManage] = useState(false);
  const summary = useGetSummary({ query: { queryKey: getGetSummaryQueryKey() } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60_000 } });
  const opts: { v: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { v: "light", label: "Light", icon: Sun }, { v: "dark", label: "Dark", icon: Moon }, { v: "system", label: "System", icon: Monitor },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Preferences" title="Settings" />
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">Saved on this device.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {opts.map((o) => (
            <button key={o.v} onClick={() => setTheme(o.v)} className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium ${theme === o.v ? "border-primary bg-accent text-accent-foreground" : "hover:border-primary/50"}`} data-testid={`button-theme-${o.v}`}>
              <o.icon className="h-5 w-5" />{o.label}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as <span className="font-medium text-foreground" data-testid="text-email">{user?.primaryEmailAddress?.emailAddress ?? "your account"}</span></p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setManage(true)} data-testid="button-manage-account"><KeyRound className="mr-2 h-4 w-4" />Email, password and sign-in methods</Button>
          <Button variant="ghost" onClick={() => signOut({ redirectUrl: basePath || "/" })} data-testid="button-settings-sign-out"><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Feature status</h2>
        <p className="text-sm text-muted-foreground">What is switched on right now. We would rather tell you than pretend.</p>
        <ul className="mt-4 divide-y text-sm">
          <Row label="Service" value={health.isLoading ? "Checking" : health.data?.status === "ok" ? "Online" : "Unreachable"} on={health.data?.status === "ok"} />
          <Row label="In-app messaging" value={summary.data ? (summary.data.messagingEnabled ? "On" : "Not available yet") : "Unknown"} on={!!summary.data?.messagingEnabled} />
          <Row label="Payments" value={summary.data ? (summary.data.paymentsEnabled ? "On" : "Not available. Arrange payment directly.") : "Unknown"} on={!!summary.data?.paymentsEnabled} />
          <Row label="AI assistance" value={summary.data ? (summary.data.aiEnabled ? "On" : "Off") : "Unknown"} on={!!summary.data?.aiEnabled} />
        </ul>
      </section>
      <Dialog open={manage} onOpenChange={setManage}>
        <DialogContent className="max-h-[90dvh] max-w-fit overflow-auto p-0">
          <DialogHeader className="sr-only"><DialogTitle>Manage account</DialogTitle></DialogHeader>
          <UserProfile routing="hash" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2 text-right text-muted-foreground"><span className={`h-2 w-2 rounded-full ${on ? "bg-primary" : "bg-muted-foreground/40"}`} />{value}</span>
    </li>
  );
}

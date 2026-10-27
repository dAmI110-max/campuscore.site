import { useState } from "react";
import { useModerateRoommate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { useInvalidateRoommates } from "./shared";

export function ModerateDialog({ username, open, onClose, initialHidden = true }: { username: string; open: boolean; onClose: () => void; initialHidden?: boolean }) {
  const [reason, setReason] = useState("");
  const [hidden, setHidden] = useState(initialHidden);
  const [err, setErr] = useState<string | null>(null);
  const mut = useModerateRoommate();
  const inval = useInvalidateRoommates();
  const { toast } = useToast();
  function go() {
    const r = reason.trim();
    if (r.length < 5) { setErr("Give a reason of at least 5 characters."); return; }
    mut.mutate({ username, data: { hidden, reason: r } }, {
      onSuccess: (m) => { inval(); toast({ title: hidden ? "Profile hidden" : "Profile restored", description: m.message }); setReason(""); onClose(); },
      onError: (e) => setErr(errMessage(e)),
    });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !mut.isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Moderate @{username}</DialogTitle>
          <DialogDescription>Staff only. The server checks your permission and records this action.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center justify-between text-sm"><span>Hide from Roommate Finder</span><Switch checked={hidden} onCheckedChange={setHidden} data-testid="switch-moderate-hidden" /></label>
        <div><Label htmlFor="mod-reason">Reason</Label><Textarea id="mod-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} data-testid="input-moderate-reason" /></div>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={mut.isPending} data-testid="button-moderate-submit">{mut.isPending ? "Saving" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const USERNAME_RE = /^[a-z][a-z0-9_]{2,23}$/;

/** Staff entry point by username, so hidden profiles (absent from results) can still be restored. */
export function StaffModerationPanel() {
  const [name, setName] = useState("");
  const [target, setTarget] = useState<{ username: string; hidden: boolean } | null>(null);
  const clean = name.trim().replace(/^@/, "").toLowerCase();
  const valid = USERNAME_RE.test(clean);
  return (
    <section className="rounded-2xl border border-dashed p-4" aria-label="Staff roommate moderation">
      <p className="font-mono text-[10px] uppercase tracking-wider text-primary">Staff only</p>
      <Label htmlFor="staff-username" className="mt-1 block">Moderate by username</Label>
      <Input id="staff-username" value={name} maxLength={25} onChange={(e) => setName(e.target.value)} placeholder="username" className="mt-1" data-testid="input-staff-username" />
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!valid} onClick={() => setTarget({ username: clean, hidden: true })} data-testid="button-staff-hide">Hide</Button>
        <Button type="button" size="sm" variant="outline" disabled={!valid} onClick={() => setTarget({ username: clean, hidden: false })} data-testid="button-staff-restore">Restore</Button>
      </div>
      {target && <ModerateDialog key={`${target.username}-${target.hidden}`} username={target.username} initialHidden={target.hidden} open onClose={() => setTarget(null)} />}
    </section>
  );
}

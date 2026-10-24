import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useBlockUser, useUnblockUser, useCreateUserReport, type ChatMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { clock, dayLabel, invalidateSocial } from "@/lib/social";

const NONE = "none";

/**
 * Report a person to Campus Core staff. Optionally attaches ONE received message as evidence.
 * evidence should only contain messages the current user received in a conversation they belong to.
 */
export function ReportUserDialog({ username, displayName, open, onOpenChange, evidence = [], presetMessageId }: {
  username: string; displayName: string; open: boolean; onOpenChange: (o: boolean) => void;
  evidence?: ChatMessage[]; presetMessageId?: number | null;
}) {
  const received = evidence.filter((m) => !m.isMine).slice(-30).reverse();
  const [reason, setReason] = useState("");
  const [messageId, setMessageId] = useState<string>(NONE);
  const [block, setBlock] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  const mut = useCreateUserReport();
  const qc = useQueryClient();
  const { toast } = useToast();
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setReason(""); setBlock(false); setErr(null); setMessageId(presetMessageId ? String(presetMessageId) : NONE); }
  }
  const len = reason.trim().length;
  function submit() {
    if (len < 10 || len > 1000) { setErr("Describe what happened in 10 to 1000 characters."); return; }
    const mid = messageId !== NONE ? Number(messageId) : undefined;
    mut.mutate({ data: { username, reason: reason.trim(), blockUser: block, ...(mid ? { messageId: mid } : {}) } }, {
      onSuccess: () => {
        invalidateSocial(qc, { safety: true });
        toast({ title: "Report sent to staff", description: (block ? "You also blocked this person." : "We will let you know when it is reviewed.") });
        onOpenChange(false);
      },
      onError: (e) => setErr(errMessage(e)),
    });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!mut.isPending) onOpenChange(o); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" />Report {displayName}</DialogTitle>
          <DialogDescription>Reports go to Campus Core staff only. @{username} is not told who reported them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="report-reason">What happened?</Label>
            <Textarea id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={4}
              placeholder="For example: asked me to pay a deposit before showing the room." data-testid="input-user-report-reason" />
            <p className={`mt-1 text-right font-mono text-xs ${len > 0 && len < 10 ? "text-destructive" : "text-muted-foreground"}`}>{len}/1000</p>
          </div>
          {received.length > 0 && (
            <div>
              <Label>Attach a message as evidence (optional)</Label>
              <Select value={messageId} onValueChange={setMessageId}>
                <SelectTrigger className="mt-1" data-testid="select-report-message"><SelectValue /></SelectTrigger>
                <SelectContent className="max-w-[90vw]">
                  <SelectItem value={NONE}>No message, report the person only</SelectItem>
                  {received.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      <span className="block max-w-[60vw] truncate sm:max-w-sm">{dayLabel(m.createdAt)} {clock(m.createdAt)}: {m.body}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {messageId !== NONE && (
                <p className="mt-2 rounded-lg border border-primary/30 bg-accent/50 p-2.5 text-xs text-accent-foreground" data-testid="text-evidence-consent">
                  By sending, you agree that only this one message is shared with staff. The rest of your conversation stays private.
                </p>
              )}
            </div>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm">
            <Checkbox checked={block} onCheckedChange={(v) => setBlock(v === true)} className="mt-0.5" data-testid="checkbox-report-block" />
            <span><span className="font-medium">Also block @{username}</span><span className="block text-muted-foreground">They will not be able to message you. You can undo this in Safety.</span></span>
          </label>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={mut.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={mut.isPending} onClick={submit} data-testid="button-submit-user-report">{mut.isPending ? "Sending" : "Send report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirm a block or unblock. */
export function BlockDialog({ username, displayName, mode, open, onOpenChange, onDone }: {
  username: string; displayName: string; mode: "block" | "unblock"; open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void;
}) {
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const mut = mode === "block" ? block : unblock;
  const [err, setErr] = useState<string | null>(null);
  function go() {
    setErr(null);
    mut.mutate({ username }, {
      onSuccess: (r) => {
        invalidateSocial(qc, { safety: true });
        toast({ title: mode === "block" ? `Blocked @${username}` : `Unblocked @${username}`, description: r.message });
        onOpenChange(false); onDone?.();
      },
      onError: (e) => setErr(errMessage(e)),
    });
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!mut.isPending) { setErr(null); onOpenChange(o); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">{mode === "block" ? `Block ${displayName}?` : `Unblock ${displayName}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "block"
              ? "Neither of you will be able to send messages in your conversation. They are not notified. You can unblock any time from Safety."
              : "You will be able to message each other again if neither account is restricted."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mut.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={mut.isPending} onClick={(e) => { e.preventDefault(); go(); }}
            className={mode === "block" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} data-testid={`button-confirm-${mode}`}>
            {mut.isPending ? "Working" : mode === "block" ? "Block" : "Unblock"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

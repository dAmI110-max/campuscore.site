import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Bookmark, BookmarkCheck, CalendarClock, ExternalLink, Flag, MapPin, Pencil, School, Trash2, Phone } from "lucide-react";
import { useGetListing, getGetListingQueryKey, getListListingsQueryKey, getGetSummaryQueryKey, useToggleSavedListing, useDeleteListing, useCreateReport } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { UnavailableNote } from "@/components/unavailable-note";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { KIND_MAP } from "@/lib/kinds";
import { ago, day, errMessage, errStatus, naira, storageUrl } from "@/lib/format";

export default function ListingDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: l, isLoading, error, refetch } = useGetListing(id, { query: { enabled: valid, queryKey: getGetListingQueryKey(id) } });
  const toggle = useToggleSavedListing();
  const del = useDeleteListing();
  const report = useCreateReport();
  const [active, setActive] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reportErr, setReportErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!valid || errStatus(error) === 404) {
    return <EmptyState title="Listing not found" action={<Button asChild variant="outline"><Link href="/explore">Back to Explore</Link></Button>}>It may have been removed, hidden by a moderator, or the link is wrong.</EmptyState>;
  }
  if (isLoading) return <PageSkeleton />;
  if (error || !l) return <ErrorState error={error} onRetry={() => refetch()} />;

  const meta = KIND_MAP[l.kind];
  const isOwner = !!me.profile && me.profile.id === l.ownerId;
  const canAct = me.signedIn && me.profile?.complete && !me.profile?.suspended;

  function needProfile() {
    if (!me.signedIn) { setLocation("/sign-in"); return true; }
    if (!me.profile?.complete) { setLocation("/onboarding"); return true; }
    return false;
  }

  function onSave() {
    if (needProfile()) return;
    toggle.mutate({ id }, {
      onSuccess: (r) => {
        qc.setQueryData(getGetListingQueryKey(id), (old: typeof l) => (old ? { ...old, saved: r.saved } : old));
        qc.invalidateQueries({ queryKey: getListListingsQueryKey() });
        toast({ title: r.saved ? "Saved" : "Removed from saved" });
      },
      onError: (e) => toast({ title: "Could not update saved", description: errMessage(e), variant: "destructive" }),
    });
  }

  function onReport() {
    if (reason.trim().length < 10) { setReportErr("Please describe the problem in at least 10 characters."); return; }
    setReportErr(null);
    report.mutate({ data: { listingId: id, reason: reason.trim() } }, {
      onSuccess: () => { setReportOpen(false); setReason(""); toast({ title: "Report sent", description: "Thank you. A moderator will review it." }); },
      onError: (e) => setReportErr(errMessage(e)),
    });
  }

  function onDelete() {
    del.mutate({ id }, {
      onSuccess: () => {
        qc.removeQueries({ queryKey: getGetListingQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListListingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        toast({ title: "Listing deleted" });
        setLocation("/my-listings");
      },
      onError: (e) => toast({ title: "Could not delete", description: errMessage(e), variant: "destructive" }),
    });
  }

  return (
    <div>
      <Link href={meta.path} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back"><ArrowLeft className="h-4 w-4" />{meta.label}</Link>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-3xl border bg-muted">
            {l.images.length ? (
              <img src={storageUrl(l.images[active])} alt={l.title} className="aspect-[4/3] w-full object-cover" data-testid="img-listing" />
            ) : (
              <div className="dot-grid grid aspect-[4/3] place-items-center bg-accent/40"><meta.icon className="h-16 w-16 text-primary/50" /><span className="sr-only">No photos</span></div>
            )}
          </div>
          {l.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {l.images.map((p, i) => (
                <button key={p} onClick={() => setActive(i)} className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${i === active ? "border-primary" : "border-transparent"}`} data-testid={`button-thumb-${i}`}>
                  <img src={storageUrl(p)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="mt-8">
            <h2 className="mb-2 font-display text-xl font-semibold">Details</h2>
            <p className="whitespace-pre-wrap leading-relaxed" data-testid="text-description">{l.description}</p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border bg-card p-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-foreground">{meta.singular}</span>
              <span className="rounded-full border px-2.5 py-1">{l.category}</span>
              {l.condition && <span className="rounded-full border px-2.5 py-1">{l.condition}</span>}
              {l.status !== "published" && <span className="rounded-full bg-foreground px-2.5 py-1 font-semibold capitalize text-background">{l.status}</span>}
              {l.verified && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground"><BadgeCheck className="h-3.5 w-3.5" />Verified</span>}
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight" data-testid="text-title">{l.title}</h1>
            {l.price !== null && <p className="mt-2 font-mono text-2xl font-medium" data-testid="text-price">{naira(l.price)}</p>}
            <dl className="mt-5 space-y-2 text-sm">
              <p className="flex gap-2"><School className="h-4 w-4 text-muted-foreground" />{l.universityName}</p>
              {l.location && <p className="flex gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{l.location}</p>}
              {l.closesAt && <p className="flex gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" />{l.kind === "events" ? "Happens" : "Closes"} {day(l.closesAt)}</p>}
              <p className="text-muted-foreground">Posted {ago(l.createdAt)}</p>
            </dl>
            {l.resourceUrl && (
              <a href={l.resourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline" data-testid="link-resource">
                Open link <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {isOwner ? (
                <>
                  <Button asChild data-testid="button-edit"><Link href={`/edit/${l.id}`}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button>
                  <Button variant="outline" className="text-destructive" onClick={() => setConfirmDel(true)} data-testid="button-delete"><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                </>
              ) : (
                <>
                  <Button variant={l.saved ? "secondary" : "default"} onClick={onSave} disabled={toggle.isPending} data-testid="button-save">
                    {l.saved ? <BookmarkCheck className="mr-2 h-4 w-4" /> : <Bookmark className="mr-2 h-4 w-4" />}{l.saved ? "Saved" : "Save"}
                  </Button>
                  <Button variant="ghost" onClick={() => { if (!needProfile()) setReportOpen(true); }} data-testid="button-report"><Flag className="mr-2 h-4 w-4" />Report</Button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-6">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Posted by</p>
            <Link href={`/people/${l.sellerUsername}`} className="mt-2 block font-display text-lg font-semibold hover:text-primary" data-testid="link-seller">{l.sellerName}</Link>
            <p className="text-sm text-muted-foreground">@{l.sellerUsername}</p>
            <div className="mt-4 rounded-xl bg-muted/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><Phone className="h-4 w-4 text-primary" />Contact</p>
              {me.signedIn ? (
                <p className="mt-1 whitespace-pre-wrap break-words" data-testid="text-contact">{l.contact || "The poster did not share contact details."}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground"><Link href="/sign-in" className="font-semibold text-primary hover:underline">Sign in</Link> to see how to reach this poster.</p>
              )}
            </div>
            <div className="mt-4"><UnavailableNote /></div>
          </div>
          {!canAct && me.signedIn && !isOwner && <p className="text-xs text-muted-foreground">Finish your profile to save or report listings.</p>}
        </aside>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Report this listing</DialogTitle>
            <DialogDescription>Tell moderators what is wrong. Scams, prohibited items, harassment and misleading posts are all worth reporting.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={5} placeholder="What is the problem?" data-testid="input-report-reason" />
          {reportErr && <p className="text-sm text-destructive">{reportErr}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button onClick={onReport} disabled={report.isPending} data-testid="button-submit-report">{report.isPending ? "Sending" : "Send report"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
            <AlertDialogDescription>This removes "{l.title}" for everyone. It cannot be undone. If you only want to pause it, edit it and mark it unavailable instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">{del.isPending ? "Deleting" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

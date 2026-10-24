import { Link } from "wouter";
import { BadgeCheck, MapPin, CalendarClock } from "lucide-react";
import type { Listing } from "@workspace/api-client-react";
import { KIND_MAP } from "@/lib/kinds";
import { ago, day, naira, storageUrl } from "@/lib/format";

export function ListingCard({ listing }: { listing: Listing }) {
  const meta = KIND_MAP[listing.kind];
  const img = listing.images[0];
  return (
    <Link href={`/listing/${listing.id}`} className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/50" data-testid={`card-listing-${listing.id}`}>
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {img ? (
          <img src={storageUrl(img)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="dot-grid grid h-full w-full place-items-center bg-accent/40">
            <meta.icon className="h-10 w-10 text-primary/60" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold">{listing.category}</span>
        {listing.status !== "published" && (
          <span className="absolute right-3 top-3 rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold capitalize text-background">{listing.status}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug group-hover:text-primary">{listing.title}</h3>
          {listing.verified && <BadgeCheck className="h-5 w-5 shrink-0 text-primary" aria-label="Verified" />}
        </div>
        {listing.price !== null && <p className="font-mono text-sm font-medium">{naira(listing.price)}</p>}
        <div className="mt-auto space-y-1 pt-2 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" />{listing.location || listing.universityName}</p>
          {listing.closesAt ? (
            <p className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{listing.kind === "events" ? "On" : "Closes"} {day(listing.closesAt)}</p>
          ) : (
            <p>{listing.universityName} · {ago(listing.createdAt)}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

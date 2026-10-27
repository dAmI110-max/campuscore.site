import { useQueryClient } from "@tanstack/react-query";
import { getListRoommatesQueryKey, getGetMyRoommateQueryKey, getGetRoommateInterestsQueryKey, type RoommateInputVisibleFieldsItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/states";
import { errMessage, errStatus } from "@/lib/format";

export const noRetry503 = (n: number, e: unknown) => errStatus(e) !== 503 && n < 1;

export const ANY = "any-value";
export const ACC = [["hostel", "Hostel"], ["flat", "Flat"], ["self-contained", "Self-contained"], ["any", "Open to any"]] as const;
export const SHARING = [["private", "Private room"], ["shared", "Shared room"], ["either", "Either"]] as const;
export const SMOKING = [["non-smoker", "Non-smoker"], ["smoker", "Smoker"], ["either", "Either"]] as const;
export const CLEAN = [["tidy", "Tidy"], ["flexible", "Flexible"]] as const;
export const SLEEP = [["early", "Early sleeper"], ["late", "Late sleeper"], ["flexible", "Flexible"]] as const;
export const STUDY = [["quiet", "Quiet study"], ["social", "Social study"], ["flexible", "Flexible"]] as const;
export const VIS: [RoommateInputVisibleFieldsItem, string][] = [["campus", "Campus area"], ["budget", "Budget"], ["moveInDate", "Move-in date"], ["preferences", "Lifestyle preferences"], ["about", "About me"]];
export const label = (list: readonly (readonly [string, string])[], v?: string) => list.find((x) => x[0] === v)?.[1] ?? v;

export function useInvalidateRoommates() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: getListRoommatesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyRoommateQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRoommateInterestsQueryKey() });
  };
}

export function Unavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (errStatus(error) === 503) {
    return (
      <div className="rounded-2xl border border-dashed bg-accent/40 p-6 sm:p-8" role="status" data-testid="status-roommates-unavailable">
        <p className="font-mono text-[11px] uppercase tracking-wider text-primary">Not switched on yet</p>
        <h2 className="mt-2 font-display text-xl font-bold">Roommate Finder is waiting on setup</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">{errMessage(error, "The roommate database is still being prepared. Nothing you see here is missing because of you.")}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} data-testid="button-retry-roommates">Check again</Button>
      </div>
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}


export const BROWSE_PAGE_SIZE = 24;
export const REQUESTS_PAGE_SIZE = 25;

export function SimplePager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const hasNext = page * size < total;
  if (page === 1 && !hasNext) return null;
  return (
    <nav className="mt-5 flex items-center justify-between" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="button-page-prev">Previous</Button>
      <span className="font-mono text-xs text-muted-foreground">Page {page} of {Math.max(1, Math.ceil(total / size))}</span>
      <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPage(page + 1)} data-testid="button-page-next">Next</Button>
    </nav>
  );
}

export function OptionSelect({ id, label: l, value, options, onChange, withAny }: { id: string; label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void; withAny?: boolean }) {
  return (
    <div>
      <Label htmlFor={id}>{l}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} data-testid={`select-${id}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {withAny && <SelectItem value={ANY}>Any</SelectItem>}
          {options.map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

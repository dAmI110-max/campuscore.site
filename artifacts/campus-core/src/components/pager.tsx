import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pager({ page, total, pageSize, onPage, label = "page" }: { page: number; total: number; pageSize: number; onPage: (p: number) => void; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-3" aria-label={`${label} pagination`}>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid={`button-prev-${label}`}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
      <span className="font-mono text-sm" aria-live="polite">{page} / {pages}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid={`button-next-${label}`}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
    </nav>
  );
}

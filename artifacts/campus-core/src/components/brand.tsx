import { Link } from "wouter";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8 shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-primary" />
      <path d="M42 21.5a14 14 0 1 0 0 21" fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-primary-foreground" />
      <circle cx="32" cy="32" r="5" className="fill-primary-foreground/70" />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" data-testid="link-home">
      <LogoMark />
      <span className="font-display text-lg font-bold tracking-tight">Campus Core</span>
    </Link>
  );
}

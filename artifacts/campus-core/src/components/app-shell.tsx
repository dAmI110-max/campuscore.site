import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { Bookmark, Compass, LogOut, Menu, Plus, Settings, ShieldCheck, User, FileText, AlertTriangle, MessageCircle, Bell, Users, ShieldAlert } from "lucide-react";
import { useGetSocialSummary, getGetSocialSummaryQueryKey } from "@workspace/api-client-react";
import { useVisible } from "@/hooks/use-visible";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Brand } from "@/components/brand";
import { useMe } from "@/hooks/use-me";
import { KINDS } from "@/lib/kinds";
import { initials, storageUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function NavLink({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) {
  const [loc] = useLocation();
  const active = loc === href || loc.startsWith(href + "/");
  return (
    <Link href={href} onClick={onClick}
      className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
      data-testid={`link-nav-${href.slice(1) || "home"}`}>
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();
  const p = me.profile;
  const isAuthPage = loc.startsWith("/sign-in") || loc.startsWith("/sign-up");
  const visible = useVisible();
  const social = useGetSocialSummary({ query: { queryKey: getGetSocialSummaryQueryKey(), enabled: me.signedIn && !!p, refetchInterval: me.signedIn && visible ? 15_000 : false, refetchIntervalInBackground: false } });
  const unreadMsgs = me.signedIn ? social.data?.unreadMessages ?? 0 : 0;
  const unreadNotes = me.signedIn ? social.data?.unreadNotifications ?? 0 : 0;

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" data-testid="button-menu"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader><SheetTitle className="font-display">Browse</SheetTitle></SheetHeader>
              <nav className="mt-4 flex flex-col gap-1">
                <MobileLink href={me.signedIn ? "/explore" : "/"} icon={<Compass className="h-4 w-4" />} onClick={() => setOpen(false)}>Explore</MobileLink>
                {KINDS.map((k) => (
                  <MobileLink key={k.kind} href={k.path} icon={<k.icon className="h-4 w-4" />} onClick={() => setOpen(false)}>{k.label}</MobileLink>
                ))}
                {me.signedIn && (
                  <>
                    <div className="my-2 border-t" />
                    <MobileLink href="/people" icon={<Users className="h-4 w-4" />} onClick={() => setOpen(false)}>People</MobileLink>
                    <MobileLink href="/messages" icon={<MessageCircle className="h-4 w-4" />} onClick={() => setOpen(false)}>Messages<Count n={unreadMsgs} /></MobileLink>
                    <MobileLink href="/notifications" icon={<Bell className="h-4 w-4" />} onClick={() => setOpen(false)}>Notifications<Count n={unreadNotes} /></MobileLink>
                    <MobileLink href="/safety" icon={<ShieldAlert className="h-4 w-4" />} onClick={() => setOpen(false)}>Safety</MobileLink>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
          <Brand href={me.signedIn ? "/explore" : "/"} />
          <nav className="ml-4 hidden flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
            <NavLink href="/explore">Explore</NavLink>
            {KINDS.map((k) => <NavLink key={k.kind} href={k.path}>{k.label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me.signedIn ? (
              <>
                <Button asChild size="sm" className="hidden sm:inline-flex" data-testid="button-create">
                  <Link href="/create"><Plus className="mr-1.5 h-4 w-4" />Post</Link>
                </Button>
                <IconLink href="/messages" label="Messages" count={unreadMsgs} className="hidden md:inline-flex"><MessageCircle className="h-5 w-5" /></IconLink>
                <IconLink href="/notifications" label="Notifications" count={unreadNotes}><Bell className="h-5 w-5" /></IconLink>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="button-user-menu">
                      <Avatar className="h-9 w-9 border">
                        <AvatarImage src={storageUrl(p?.avatarPath)} alt="" />
                        <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials(p?.displayName)}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <p className="truncate font-semibold">{p?.displayName || "Your account"}</p>
                      {p?.username && <p className="truncate text-xs text-muted-foreground">@{p.username}</p>}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild><Link href="/profile"><User className="mr-2 h-4 w-4" />Profile</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href="/my-listings"><FileText className="mr-2 h-4 w-4" />My listings</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href="/saved"><Bookmark className="mr-2 h-4 w-4" />Saved</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href="/settings"><Settings className="mr-2 h-4 w-4" />Settings</Link></DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild><Link href="/people"><Users className="mr-2 h-4 w-4" />People</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href="/messages"><MessageCircle className="mr-2 h-4 w-4" />Messages<Count n={unreadMsgs} /></Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href="/notifications"><Bell className="mr-2 h-4 w-4" />Notifications<Count n={unreadNotes} /></Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href="/safety"><ShieldAlert className="mr-2 h-4 w-4" />Safety</Link></DropdownMenuItem>
                    {(p?.role === "admin" || p?.role === "owner") && <DropdownMenuItem asChild><Link href="/admin"><ShieldCheck className="mr-2 h-4 w-4" />Admin</Link></DropdownMenuItem>}
                    {(p?.role === "admin" || p?.role === "owner") && <DropdownMenuItem asChild><Link href="/admin/safety"><ShieldAlert className="mr-2 h-4 w-4" />Safety reports</Link></DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => signOut({ redirectUrl: basePath || "/" })} data-testid="button-sign-out"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : me.authLoaded && !isAuthPage ? (
              <>
                <Button asChild variant="ghost" size="sm" data-testid="link-sign-in"><Link href="/sign-in">Sign in</Link></Button>
                <Button asChild size="sm" data-testid="link-sign-up"><Link href="/sign-up">Join free</Link></Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {me.signedIn && p && !p.complete && !loc.startsWith("/onboarding") && (
        <div className="border-b bg-accent/60">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
            <span className="text-accent-foreground">Finish your profile to post, save and report listings.</span>
            <Link href="/onboarding" className="font-semibold text-primary underline-offset-4 hover:underline" data-testid="link-finish-profile">Finish setup</Link>
          </div>
        </div>
      )}
      {p?.suspended && (
        <div className="border-b bg-destructive/10">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 text-sm text-destructive sm:px-6">
            <AlertTriangle className="h-4 w-4" /> Your account is suspended. Browsing still works; posting is paused.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      <footer className="mt-10 hidden border-t md:block">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <p>Campus Core. Built for students across Nigeria, starting with the schools in our directory.</p>
          <div className="flex gap-4">
            <Link href="/explore" className="hover:text-foreground">Explore</Link>
            <Link href="/settings" className="hover:text-foreground">Settings</Link>
          </div>
        </div>
      </footer>

      {me.signedIn && (
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 backdrop-blur md:hidden" data-testid="nav-mobile">
          <BottomTab href="/explore" icon={<Compass className="h-5 w-5" />} label="Explore" />
          <BottomTab href="/saved" icon={<Bookmark className="h-5 w-5" />} label="Saved" />
          <BottomTab href="/create" icon={<Plus className="h-5 w-5" />} label="Post" primary />
          <BottomTab href="/messages" icon={<MessageCircle className="h-5 w-5" />} label="Messages" count={unreadMsgs} />
          <BottomTab href="/profile" icon={<User className="h-5 w-5" />} label="Profile" />
        </nav>
      )}
    </div>
  );
}

function MobileLink({ href, icon, children, onClick }: { href: string; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
      <span className="text-primary">{icon}</span>{children}
    </Link>
  );
}

function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-auto rounded-full bg-primary px-1.5 font-mono text-[11px] font-semibold text-primary-foreground">{n > 99 ? "99+" : n}</span>;
}

function IconLink({ href, label, count, children, className }: { href: string; label: string; count: number; children: ReactNode; className?: string }) {
  const [loc] = useLocation();
  const active = loc === href || loc.startsWith(href + "/");
  return (
    <Link href={href} aria-label={count ? `${label}, ${count} unread` : label} title={label}
      className={cn("relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground", className)}
      data-testid={`link-${label.toLowerCase()}`}>
      {children}
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-background bg-primary px-1 font-mono text-[10px] font-semibold leading-none text-primary-foreground">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

function BottomTab({ href, icon, label, primary, count = 0 }: { href: string; icon: ReactNode; label: string; primary?: boolean; count?: number }) {
  const [loc] = useLocation();
  const active = loc === href || (href !== "/" && loc.startsWith(href + "/"));
  return (
    <Link href={href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")} data-testid={`tab-${label.toLowerCase()}`}>
      <span className={cn("relative", primary && "grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground")}>{icon}
        {count > 0 && <span className="absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-label={`${count} unread`} />}</span>
      {label}
    </Link>
  );
}

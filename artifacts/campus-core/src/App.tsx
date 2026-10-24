import { useEffect, useRef } from "react";
import { ClerkProvider, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app-shell";
import { RequireAuth, RequireProfile } from "@/components/states";
import { ThemeProvider } from "@/lib/theme";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Explore from "@/pages/explore";
import KindPage from "@/pages/kind-page";
import ListingDetail from "@/pages/listing-detail";
import ListingForm from "@/pages/listing-form";
import Collection from "@/pages/collection";
import ProfilePage from "@/pages/profile";
import People from "@/pages/people";
import PeopleSearch from "@/pages/people-search";
import Messages from "@/pages/messages";
import Notifications from "@/pages/notifications";
import Safety from "@/pages/safety";
import AdminSafety from "@/pages/admin-safety";
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import AdminAccess from "@/pages/admin-access";
import AdminCommerce from "@/pages/admin-commerce";
import Account from "@/pages/account";
import { SignInPage, SignUpPage } from "@/pages/auth";
import { KINDS } from "@/lib/kinds";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkProxyUrl =
  import.meta.env.VITE_CLERK_PROXY_URL ||
  (import.meta.env.PROD
    ? `${window.location.origin}/api/__clerk`
    : undefined);

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(var(--primary))",
    colorForeground: "hsl(var(--foreground))",
    colorMutedForeground: "hsl(var(--muted-foreground))",
    colorDanger: "hsl(var(--destructive))",
    colorBackground: "hsl(var(--card))",
    colorInput: "hsl(var(--background))",
    colorInputForeground: "hsl(var(--foreground))",
    colorNeutral: "hsl(var(--foreground))",
    fontFamily: "'Instrument Sans', system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card border border-border rounded-2xl w-[440px] max-w-full overflow-hidden shadow-none",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-display text-2xl font-bold text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary font-semibold",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-primary",
    alertText: "text-foreground",
    logoBox: "justify-center",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border border-border bg-background",
    formButtonPrimary: "bg-primary text-primary-foreground font-semibold",
    formFieldInput: "border border-input bg-background text-foreground",
    footerAction: "justify-center",
    dividerLine: "bg-border",
    alert: "border border-destructive/30 bg-destructive/5",
    otpCodeFieldInput: "border border-input text-foreground",
    formFieldRow: "gap-3",
    main: "gap-5",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/explore" /></Show>
      <Show when="signed-out"><Home /></Show>
    </>
  );
}

function IdentityScopedRouter() {
  const { userId } = useAuth();
  // Clearing query caches does not clear local history, composer text or dialogs.
  // Switching active Clerk accounts must remount every user-scoped screen too.
  return <Router key={userId ?? "signed-out"} />;
}

function Router() {
  const [location] = useLocation();
  return (
    <AppShell>
      <ErrorBoundary resetKey={location}>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/explore" component={Explore} />
          {KINDS.map((k) => <Route key={k.kind} path={k.path}>{() => <KindPage kind={k.kind} />}</Route>)}
          <Route path="/listing/:id" component={ListingDetail} />
          <Route path="/create"><RequireProfile><ListingForm /></RequireProfile></Route>
          <Route path="/edit/:id"><RequireProfile><ListingForm /></RequireProfile></Route>
          <Route path="/saved"><RequireAuth><Collection mode="saved" /></RequireAuth></Route>
          <Route path="/my-listings"><RequireAuth><Collection mode="mine" /></RequireAuth></Route>
          <Route path="/profile"><RequireAuth><ProfilePage /></RequireAuth></Route>
          <Route path="/onboarding"><RequireAuth><ProfilePage onboarding /></RequireAuth></Route>
          <Route path="/people"><RequireAuth><PeopleSearch /></RequireAuth></Route>
          <Route path="/people/:username" component={People} />
          <Route path="/messages"><RequireAuth><Messages /></RequireAuth></Route>
          <Route path="/messages/:id"><RequireAuth><Messages /></RequireAuth></Route>
          <Route path="/notifications"><RequireAuth><Notifications /></RequireAuth></Route>
          <Route path="/safety"><RequireAuth><Safety /></RequireAuth></Route>
          <Route path="/settings"><RequireAuth><Settings /></RequireAuth></Route>
          <Route path="/admin"><RequireAuth><Admin /></RequireAuth></Route>
          <Route path="/admin/access"><RequireAuth><AdminAccess /></RequireAuth></Route>
          <Route path="/admin/safety"><RequireAuth><AdminSafety /></RequireAuth></Route>
          <Route path="/admin/commerce"><RequireAuth><AdminCommerce /></RequireAuth></Route>
          <Route path="/account"><RequireProfile><Account /></RequireProfile></Route>
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </AppShell>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Sign in to Campus Core", subtitle: "Welcome back. Pick up where you left off." } },
        signUp: { start: { title: "Join Campus Core", subtitle: "Free for students. Takes a minute." } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <IdentityScopedRouter />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;

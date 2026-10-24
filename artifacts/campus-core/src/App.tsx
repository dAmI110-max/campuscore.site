import { useEffect, useRef, type ReactNode } from "react";
import { ClerkProvider, Show, useClerk } from "@clerk/react";
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
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import { SignInPage, SignUpPage } from "@/pages/auth";
import { KINDS } from "@/lib/kinds";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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

const auth = (node: ReactNode) => () => <RequireAuth>{node}</RequireAuth>;
const full = (node: ReactNode) => () => <RequireProfile>{node}</RequireProfile>;

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
          <Route path="/create" component={full(<ListingForm />)} />
          <Route path="/edit/:id" component={full(<ListingForm />)} />
          <Route path="/saved" component={auth(<Collection mode="saved" />)} />
          <Route path="/my-listings" component={auth(<Collection mode="mine" />)} />
          <Route path="/profile" component={auth(<ProfilePage />)} />
          <Route path="/onboarding" component={auth(<ProfilePage onboarding />)} />
          <Route path="/people/:username" component={People} />
          <Route path="/settings" component={auth(<Settings />)} />
          <Route path="/admin" component={auth(<Admin />)} />
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
          <Router />
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

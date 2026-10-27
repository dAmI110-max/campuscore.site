import { SignIn, SignUp } from "@clerk/react";
import { Link } from "wouter";
import { KINDS } from "@/lib/kinds";
import { Brand } from "@/components/brand";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function Frame({ children, title, text }: { children: React.ReactNode; title: string; text: string }) {
  return (
    <div className="grid min-h-[calc(100dvh-10rem)] min-w-0 grid-cols-1 items-center gap-10 lg:grid-cols-2">
      <div className="hidden lg:block">
        <h1 className="font-display text-5xl font-extrabold leading-tight">{title}</h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground">{text}</p>
        <div className="mt-8 grid max-w-md grid-cols-4 gap-2">
          {KINDS.slice(0, 4).map((k) => <img key={k.kind} src={k.art} alt="" className="aspect-square rounded-xl border object-cover" />)}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Not ready? <Link href="/" className="font-semibold text-primary hover:underline">Look around first</Link></p>
      </div>
      <div className="flex w-full min-w-0 flex-col items-center gap-6">
        <div className="lg:hidden"><Brand /></div>
        {children}
      </div>
    </div>
  );
}

export function SignInPage() {
  return (
    <Frame title="Welcome back." text="Your saved listings, your posts and your school are right where you left them.">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/explore`} />
    </Frame>
  );
}

export function SignUpPage() {
  return (
    <Frame title="Your campus, organised." text="One account for the marketplace, rooms, services, opportunities, study material, communities and events.">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/onboarding`} />
    </Frame>
  );
}

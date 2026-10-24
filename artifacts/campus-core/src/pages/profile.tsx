import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { useGetProfile, getGetProfileQueryKey, useSaveProfile, useCheckUsername, getCheckUsernameQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { InstitutionPicker, type Institution } from "@/components/institution-picker";
import { AvatarPicker } from "@/components/image-picker";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { errMessage, initials } from "@/lib/format";

const USER_RE = /^[a-z][a-z0-9_]{2,23}$/;

export default function ProfilePage({ onboarding }: { onboarding?: boolean }) {
  const { data: profile, isLoading, error, refetch } = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } });
  const save = useSaveProfile();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [debounced, setDebounced] = useState("");
  const [bio, setBio] = useState("");
  const [showAcademics, setShowAcademics] = useState(true);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [inst, setInst] = useState<Institution>({ countryId: null, universityId: null, facultyId: null, departmentId: null });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inited = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (profile && inited.current !== profile.id) {
      inited.current = profile.id;
      setDisplayName(profile.displayName);
      setUsername(profile.username ?? "");
      setDebounced(profile.username ?? "");
      setBio(profile.bio);
      setShowAcademics(profile.showAcademics);
      setAvatarPath(profile.avatarPath);
      setInst({ countryId: profile.countryId, universityId: profile.universityId, facultyId: profile.facultyId, departmentId: profile.departmentId });
    }
  }, [profile]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(username), 400);
    return () => clearTimeout(timer.current);
  }, [username]);

  const unameValid = USER_RE.test(debounced);
  const unchanged = !!profile?.username && debounced === profile.username;
  const checkParams = { username: debounced };
  const check = useCheckUsername(checkParams, { query: { enabled: unameValid && !unchanged, queryKey: getCheckUsernameQueryKey(checkParams) } });
  const typing = username !== debounced;

  if (isLoading) return <PageSkeleton />;
  if (error || !profile) return <ErrorState error={error} onRetry={() => refetch()} title="We could not load your profile" />;

  let unameStatus: { ok: boolean | null; text: string } = { ok: null, text: "3 to 24 characters: start with a letter, then lowercase letters, numbers and underscores." };
  if (username && !USER_RE.test(username)) unameStatus = { ok: false, text: "Start with a letter, then use lowercase letters, numbers or underscores (3 to 24 total)." };
  else if (typing || check.isFetching) unameStatus = { ok: null, text: "Checking availability" };
  else if (unchanged) unameStatus = { ok: true, text: "This is your current username." };
  else if (check.data) unameStatus = check.data.available ? { ok: true, text: "Available" } : { ok: false, text: check.data.reason || "Already taken" };
  else if (check.error) unameStatus = { ok: false, text: "Could not check right now." };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (uploading) return setFormErr("Wait for your photo to finish uploading before saving.");
    setFormErr(null);
    if (displayName.trim().length < 2) return setFormErr("Your name needs at least 2 characters.");
    if (!USER_RE.test(username)) return setFormErr("Choose a valid username.");
    if (unameStatus.ok === false) return setFormErr("That username is not available.");
    if (!inst.countryId || !inst.universityId) return setFormErr("Choose your country and university. If yours is missing, request it below the selector.");
    save.mutate({ data: {
      displayName: displayName.trim(), username, countryId: inst.countryId, universityId: inst.universityId,
      facultyId: inst.facultyId, departmentId: inst.departmentId, bio: bio.trim(), showAcademics, avatarPath,
    } }, {
      onSuccess: (p) => {
        qc.setQueryData(getGetProfileQueryKey(), p);
        qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/profiles/") });
        qc.invalidateQueries({ queryKey: ["/api/listings"] });
        toast({ title: onboarding ? "You are all set" : "Profile saved" });
        if (onboarding) {
          const next = new URLSearchParams(search).get("next");
          setLocation(next && next.startsWith("/") && !next.startsWith("//") ? next : "/explore");
        }
      },
      onError: (err) => setFormErr(errMessage(err)),
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={onboarding ? "Welcome" : "Your profile"} title={onboarding ? "Set up your student profile" : "Edit profile"}
        actions={!onboarding && profile.username ? <Button asChild variant="outline"><Link href={`/people/${profile.username}`}>View public profile</Link></Button> : undefined}>
        {onboarding ? "A name, a username and your school. That is all we need to get you posting." : "This is what other students see when they view your listings."}
      </PageHeader>
      <form onSubmit={submit} className="space-y-6">
        <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
          <AvatarPicker value={avatarPath} onChange={setAvatarPath} fallback={initials(displayName)} onUploadingChange={setUploading} />
          <div className="grid gap-5 sm:grid-cols-2">
            <div><Label htmlFor="dn">Display name</Label><Input id="dn" className="mt-1.5" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} data-testid="input-display-name" /></div>
            <div>
              <Label htmlFor="un">Username</Label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input id="un" className="pl-7 pr-9" value={username} maxLength={24} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} data-testid="input-username" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {unameStatus.ok === true ? <Check className="h-4 w-4 text-primary" /> : unameStatus.ok === false ? <X className="h-4 w-4 text-destructive" /> : username && (typing || check.isFetching) ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                </span>
              </div>
              <p className={`mt-1 text-xs ${unameStatus.ok === false ? "text-destructive" : "text-muted-foreground"}`} data-testid="text-username-status">{unameStatus.text}</p>
            </div>
          </div>
          <div><Label htmlFor="bio">Bio</Label><Textarea id="bio" className="mt-1.5" rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Course, level, what you are into" data-testid="input-bio" />
            <p className="mt-1 text-right font-mono text-xs text-muted-foreground">{bio.length}/500</p></div>
        </section>

        <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-semibold">Your school</h2>
            <p className="text-sm text-muted-foreground">University is required. Our faculty and department lists are still growing, so leave them empty if yours is not there yet.</p>
          </div>
          <InstitutionPicker value={inst} onChange={setInst} />
          <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-4">
            <div><p className="text-sm font-medium">Show university on your public profile</p><p className="text-xs text-muted-foreground">Your university is always shown on listings. Faculty and department are private.</p></div>
            <Switch checked={showAcademics} onCheckedChange={setShowAcademics} data-testid="switch-show-academics" />
          </div>
        </section>

        {formErr && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" data-testid="text-form-error">{formErr}</p>}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={save.isPending || uploading} data-testid="button-save-profile">{uploading ? "Uploading photo" : save.isPending ? "Saving" : onboarding ? "Finish setup" : "Save profile"}</Button>
        </div>
      </form>
    </div>
  );
}

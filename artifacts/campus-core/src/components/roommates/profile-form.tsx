import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, ShieldAlert } from "lucide-react";
import { useGetMyRoommate, getGetMyRoommateQueryKey, useSaveMyRoommate, type RoommateInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { InstitutionPicker, type Institution } from "@/components/institution-picker";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { ACC, CLEAN, OptionSelect, SHARING, SLEEP, SMOKING, STUDY, Unavailable, VIS, noRetry503, useInvalidateRoommates } from "./shared";

type FormState = Omit<RoommateInput, "budgetMin" | "budgetMax" | "universityId"> & { budgetMin: string; budgetMax: string };
const BLANK: FormState = { campus: "", accommodationType: "any", budgetMin: "", budgetMax: "", moveInDate: "", sharing: "either", smoking: "either", cleanliness: "flexible", sleep: "flexible", study: "flexible", about: "", visibleFields: ["campus", "budget", "moveInDate", "preferences"], active: true };
const CONTACT_RE = /(@[a-z0-9-]+\.[a-z]{2,}|\+?\d[\d\s-]{8,}\d|\bno\.?\s*\d+|\bstreet\b|\bclose\b|\bcrescent\b)/i;

export function MyProfile() {
  const me = useMe();
  const { data, isLoading, error, refetch } = useGetMyRoommate({ query: { queryKey: getGetMyRoommateQueryKey(), staleTime: 60_000, retry: noRetry503 } });
  const save = useSaveMyRoommate();
  const inval = useInvalidateRoommates();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(BLANK);
  const [inst, setInst] = useState<Institution>({ countryId: null, universityId: null, facultyId: null, departmentId: null });
  const [savedUni, setSavedUni] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !data) return;
    initialized.current = true;
    const p = data.profile;
    const pr = me.profile;
    if (p) {
      setForm({ ...p, budgetMin: String(p.budgetMin), budgetMax: String(p.budgetMax), visibleFields: [...p.visibleFields] });
      setSavedUni(p.universityId);
      if (pr?.countryId && pr.universityId === p.universityId) setInst({ countryId: pr.countryId, universityId: p.universityId, facultyId: null, departmentId: null });
    } else if (pr?.countryId) {
      setInst({ countryId: pr.countryId, universityId: pr.universityId ?? null, facultyId: null, departmentId: null });
    }
  }, [data, me.profile]);

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (error || !data) return <Unavailable error={error} onRetry={() => refetch()} />;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const uni = inst.universityId ?? savedUni;
  const aboutWarn = CONTACT_RE.test(form.about);

  function submit(e: FormEvent) {
    e.preventDefault();
    const min = parseInt(form.budgetMin, 10), max = parseInt(form.budgetMax, 10);
    if (!uni) return setErr("Choose your university.");
    if (form.campus.trim().length < 2) return setErr("Add a campus or general area (at least 2 characters).");
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100_000_000 || min > max) return setErr("Enter a monthly budget range in naira, with minimum not above maximum.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.moveInDate)) return setErr("Pick a move-in date.");
    setErr(null);
    const body: RoommateInput = { ...form, universityId: uni, campus: form.campus.trim(), about: form.about.trim(), budgetMin: min, budgetMax: max };
    save.mutate({ data: body }, {
      onSuccess: () => { setSavedUni(uni); inval(); toast({ title: form.active ? "Profile saved and visible" : "Profile saved and paused" }); },
      onError: (e2) => setErr(errMessage(e2)),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border bg-card p-5 sm:p-7" aria-label="Your roommate profile">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{data.profile ? "Your roommate profile" : "Create your roommate profile"}</h2>
          <p className="text-sm text-muted-foreground">Your email, phone and exact address are never shown here.</p>
        </div>
        <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
          <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} data-testid="switch-roommate-active" />
          {form.active ? "Visible to students" : "Paused"}
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">University</legend>
        <InstitutionPicker value={inst} onChange={setInst} />
        {savedUni && !inst.universityId && <p className="text-xs text-muted-foreground">Your saved university is kept unless you choose another.</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="rm-campus">Campus or general area *</Label><Input id="rm-campus" value={form.campus} maxLength={100} onChange={(e) => set("campus", e.target.value)} placeholder="e.g. Main campus, North gate area" data-testid="input-roommate-campus" />
          <p className="mt-1 text-xs text-muted-foreground">Keep it general. No house numbers or street names.</p></div>
        <div><Label htmlFor="rm-date">Move-in date *</Label><Input id="rm-date" type="date" value={form.moveInDate} onChange={(e) => set("moveInDate", e.target.value)} data-testid="input-roommate-date" /></div>
        <div><Label htmlFor="rm-min">Monthly budget from (NGN) *</Label><Input id="rm-min" inputMode="numeric" value={form.budgetMin} onChange={(e) => set("budgetMin", e.target.value.replace(/\D/g, ""))} data-testid="input-roommate-min" /></div>
        <div><Label htmlFor="rm-max">Monthly budget to (NGN) *</Label><Input id="rm-max" inputMode="numeric" value={form.budgetMax} onChange={(e) => set("budgetMax", e.target.value.replace(/\D/g, ""))} data-testid="input-roommate-max" /></div>
        <OptionSelect id="roommate-acc" label="Accommodation" value={form.accommodationType} options={ACC} onChange={(v) => set("accommodationType", v as FormState["accommodationType"])} />
        <OptionSelect id="roommate-sharing" label="Sharing" value={form.sharing} options={SHARING} onChange={(v) => set("sharing", v as FormState["sharing"])} />
        <OptionSelect id="roommate-smoking" label="Smoking" value={form.smoking} options={SMOKING} onChange={(v) => set("smoking", v as FormState["smoking"])} />
        <OptionSelect id="roommate-clean" label="Cleanliness" value={form.cleanliness} options={CLEAN} onChange={(v) => set("cleanliness", v as FormState["cleanliness"])} />
        <OptionSelect id="roommate-sleep" label="Sleep" value={form.sleep} options={SLEEP} onChange={(v) => set("sleep", v as FormState["sleep"])} />
        <OptionSelect id="roommate-study" label="Study" value={form.study} options={STUDY} onChange={(v) => set("study", v as FormState["study"])} />
      </div>

      <div>
        <Label htmlFor="rm-about">About you</Label>
        <Textarea id="rm-about" rows={4} value={form.about} maxLength={800} onChange={(e) => set("about", e.target.value)} placeholder="Course, routine, what you are like to live with." data-testid="input-roommate-about" />
        <div className="mt-1 flex justify-between gap-3 text-xs">
          <span className={aboutWarn ? "text-destructive" : "text-muted-foreground"} role={aboutWarn ? "alert" : undefined}>
            {aboutWarn ? "This looks like contact or address details. Please remove them; share them only after you have met." : "Do not include your phone, email or exact address."}
          </span>
          <span className="font-mono text-muted-foreground">{form.about.length}/800</span>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">What other students can see</legend>
        <p className="mb-2 text-xs text-muted-foreground">Your name, username, university and accommodation type are always shown.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {VIS.map(([k, t]) => (
            <label key={k} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <Checkbox checked={form.visibleFields.includes(k)} data-testid={`check-visible-${k}`}
                onCheckedChange={(c) => set("visibleFields", c ? [...form.visibleFields.filter((x) => x !== k), k] : form.visibleFields.filter((x) => x !== k))} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-start gap-2 rounded-xl bg-accent/50 p-3 text-xs text-accent-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        Never pay a deposit before viewing a place in person. Meet somewhere public, and report anyone who pressures you.
      </div>
      {err && <p className="text-sm text-destructive" role="alert" data-testid="text-roommate-error">{err}</p>}
      <Button type="submit" disabled={save.isPending} data-testid="button-save-roommate"><Send className="mr-1.5 h-4 w-4" />{save.isPending ? "Saving" : data.profile ? "Save changes" : "Publish profile"}</Button>
    </form>
  );
}

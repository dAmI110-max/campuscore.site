import { useEffect, useRef } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateListing, useUpdateListing, useGetListing, getGetListingQueryKey, getListListingsQueryKey, getGetSummaryQueryKey, ListingInputKind, type ListingInput } from "@workspace/api-client-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImagePicker } from "@/components/image-picker";
import { UniversitySelect } from "@/components/university-select";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/states";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { CONDITIONS, KINDS, KIND_MAP, type Kind } from "@/lib/kinds";
import { errMessage } from "@/lib/format";

const schema = z.object({
  kind: z.nativeEnum(ListingInputKind),
  title: z.string().trim().min(3, "At least 3 characters").max(150),
  description: z.string().trim().min(20, "Give at least 20 characters of detail").max(10000),
  category: z.string().trim().min(2, "Pick a category").max(80),
  price: z.string().refine((v) => v === "" || (/^\d+(\.\d+)?$/.test(v) && Number(v) <= 1_000_000_000), "Enter a number between 0 and 1,000,000,000"),
  location: z.string().max(200),
  universityId: z.string().min(1, "Choose the university this belongs to"),
  condition: z.string().max(40),
  status: z.enum(["draft", "published", "unavailable"]),
  images: z.array(z.string()).max(6),
  contact: z.string().max(250),
  closesAt: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date"),
  resourceUrl: z.string().max(1000).refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Must start with http:// or https://"),
});
type Values = z.infer<typeof schema>;

export default function ListingForm() {
  const params = useParams<{ id?: string }>();
  const isNew = !params.id;
  const id = Number(params.id);
  const search = useSearch();
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const create = useCreateListing();
  const update = useUpdateListing();
  const existing = useGetListing(id, { query: { enabled: !isNew && Number.isInteger(id), queryKey: getGetListingQueryKey(id) } });
  const initKind = (new URLSearchParams(search).get("kind") as Kind) || "marketplace";

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: KIND_MAP[initKind] ? initKind : "marketplace", title: "", description: "", category: "", price: "", location: "",
      universityId: me.profile?.universityId ? String(me.profile.universityId) : "", condition: "", status: "published",
      images: [], contact: "", closesAt: "", resourceUrl: "",
    },
  });
  const inited = useRef<number | null>(null);
  useEffect(() => {
    const l = existing.data;
    if (l && inited.current !== l.id) {
      inited.current = l.id;
      form.reset({
        kind: l.kind, title: l.title, description: l.description, category: l.category, price: l.price === null ? "" : String(l.price),
        location: l.location, universityId: String(l.universityId), condition: l.condition, status: l.status, images: l.images,
        contact: l.contact, closesAt: l.closesAt ?? "", resourceUrl: l.resourceUrl ?? "",
      });
    }
  }, [existing.data, form]);
  useEffect(() => {
    if (isNew && me.profile?.universityId && !form.getValues("universityId")) form.setValue("universityId", String(me.profile.universityId));
  }, [isNew, me.profile?.universityId, form]);

  const kind = form.watch("kind");
  const meta = KIND_MAP[kind];

  if (!isNew) {
    if (existing.isLoading) return <PageSkeleton />;
    if (existing.error || !existing.data) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
    if (me.profile && existing.data.ownerId !== me.profile.id) {
      return <EmptyState title="You can only edit your own listings" action={<Button asChild variant="outline"><Link href={`/listing/${id}`}>View listing</Link></Button>} />;
    }
  }

  function onSubmit(v: Values) {
    const m = KIND_MAP[v.kind];
    const data: ListingInput = {
      kind: v.kind, title: v.title.trim(), description: v.description.trim(), category: v.category.trim(),
      price: v.price === "" ? null : Number(v.price), location: v.location.trim(), universityId: Number(v.universityId),
      condition: m.showCondition ? v.condition : "", status: v.status, images: v.images, contact: v.contact.trim(),
      closesAt: m.showCloses && v.closesAt ? v.closesAt : null, resourceUrl: m.showResource ? v.resourceUrl.trim() : "",
    };
    const done = (savedId: number) => {
      qc.invalidateQueries({ queryKey: getListListingsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      qc.invalidateQueries({ queryKey: getGetListingQueryKey(savedId) });
      toast({ title: isNew ? (v.status === "draft" ? "Draft saved" : "Listing published") : "Changes saved" });
      setLocation(`/listing/${savedId}`);
    };
    const fail = (e: unknown) => toast({ title: "Could not save", description: errMessage(e), variant: "destructive" });
    if (isNew) create.mutate({ data }, { onSuccess: (l) => done(l.id), onError: fail });
    else update.mutate({ id, data }, { onSuccess: (l) => done(l.id), onError: fail });
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={isNew ? "New listing" : "Edit listing"} title={isNew ? "What are you posting?" : "Update your listing"}>
        Be specific and honest. Clear photos and a fair price get responses faster.
      </PageHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField control={form.control} name="kind" render={({ field }) => (
            <FormItem>
              <FormLabel>Board</FormLabel>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {KINDS.map((k) => (
                  <button type="button" key={k.kind} onClick={() => { field.onChange(k.kind); form.setValue("category", ""); }}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium ${field.value === k.kind ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:border-primary/50"}`}
                    data-testid={`button-kind-${k.kind}`}>
                    <k.icon className="h-4 w-4 text-primary" />{k.label}
                  </button>
                ))}
              </div>
            </FormItem>
          )} />

          <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} maxLength={150} data-testid="input-title" /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-category"><SelectValue placeholder="Pick one" /></SelectTrigger></FormControl>
                    <SelectContent>{meta.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select><FormMessage /></FormItem>
              )} />
              {meta.priceLabel && (
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem><FormLabel>{meta.priceLabel}</FormLabel><FormControl><Input {...field} inputMode="decimal" placeholder="Leave empty if not applicable, 0 for free" data-testid="input-price" /></FormControl><FormMessage /></FormItem>
                )} />
              )}
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} rows={7} maxLength={10000} data-testid="input-description" /></FormControl>
                <FormDescription>Include what matters: size, edition, rules, requirements, dates.</FormDescription><FormMessage /></FormItem>
            )} />
            {meta.showCondition && (
              <FormField control={form.control} name="condition" render={({ field }) => (
                <FormItem><FormLabel>Condition</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-condition"><SelectValue placeholder="Select condition" /></SelectTrigger></FormControl>
                    <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select><FormMessage /></FormItem>
              )} />
            )}
            {(meta.showCloses || meta.showResource) && (
              <div className="grid gap-5 sm:grid-cols-2">
                {meta.showCloses && (
                  <FormField control={form.control} name="closesAt" render={({ field }) => (
                    <FormItem><FormLabel>{kind === "events" ? "Event date" : "Deadline"}</FormLabel><FormControl><Input type="date" {...field} data-testid="input-closes-at" /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
                {meta.showResource && (
                  <FormField control={form.control} name="resourceUrl" render={({ field }) => (
                    <FormItem><FormLabel>Link (optional)</FormLabel><FormControl><Input {...field} placeholder="https://" data-testid="input-resource-url" /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
              </div>
            )}
          </section>

          <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField control={form.control} name="universityId" render={({ field }) => (
                <FormItem><FormLabel>University</FormLabel><UniversitySelect value={field.value} onChange={field.onChange} /><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem><FormLabel>Area or venue</FormLabel><FormControl><Input {...field} maxLength={200} placeholder="e.g. Oke-Baale, main gate" data-testid="input-location" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="contact" render={({ field }) => (
              <FormItem><FormLabel>How to reach you</FormLabel><FormControl><Input {...field} maxLength={250} placeholder="Phone, WhatsApp number or email" data-testid="input-contact" /></FormControl>
                <FormDescription>Visible to signed-in students. In-app messaging is not available, so this is how people contact you.</FormDescription><FormMessage /></FormItem>
            )} />
          </section>

          <section className="rounded-2xl border bg-card p-5 sm:p-6">
            <FormField control={form.control} name="images" render={({ field }) => (
              <FormItem><FormLabel>Photos</FormLabel><ImagePicker value={field.value} onChange={field.onChange} /><FormMessage /></FormItem>
            )} />
          </section>

          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-end sm:justify-between">
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem className="sm:w-60"><FormLabel>Visibility</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="published">Published, visible to all</SelectItem>
                    <SelectItem value="draft">Draft, only you</SelectItem>
                    <SelectItem value="unavailable">Unavailable, sold or closed</SelectItem>
                  </SelectContent>
                </Select></FormItem>
            )} />
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => history.back()}>Cancel</Button>
              <Button type="submit" disabled={pending} data-testid="button-submit-listing">{pending ? "Saving" : isNew ? "Save listing" : "Save changes"}</Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

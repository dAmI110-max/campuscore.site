import { Link, useParams } from "wouter";
import { School } from "lucide-react";
import { useGetPublicProfile, getGetPublicProfileQueryKey } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { UnavailableNote } from "@/components/unavailable-note";
import { errStatus, initials, storageUrl } from "@/lib/format";

export default function People() {
  const { username = "" } = useParams<{ username: string }>();
  const { data, isLoading, error, refetch } = useGetPublicProfile(username, { query: { enabled: !!username, queryKey: getGetPublicProfileQueryKey(username) } });
  if (isLoading) return <PageSkeleton />;
  if (errStatus(error) === 404) return <EmptyState title="No one by that username" action={<Button asChild variant="outline"><Link href="/explore">Back to Explore</Link></Button>}>Check the spelling, or the account may no longer be public.</EmptyState>;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl border bg-card p-6 sm:p-10">
        <Avatar className="h-24 w-24 border-4 border-background ring-2 ring-primary/30">
          <AvatarImage src={storageUrl(data.avatarPath)} alt="" />
          <AvatarFallback className="bg-accent text-2xl font-semibold text-accent-foreground">{initials(data.displayName)}</AvatarFallback>
        </Avatar>
        <h1 className="mt-5 font-display text-3xl font-bold" data-testid="text-display-name">{data.displayName}</h1>
        <p className="text-muted-foreground" data-testid="text-username">@{data.username}</p>
        {data.universityName && <p className="mt-3 flex items-center gap-2 text-sm"><School className="h-4 w-4 text-primary" />{data.universityName}</p>}
        <p className="mt-5 whitespace-pre-wrap">{data.bio || <span className="text-muted-foreground">No bio yet.</span>}</p>
      </div>
      <div className="mt-4"><UnavailableNote features={["messaging"]} /></div>
    </div>
  );
}

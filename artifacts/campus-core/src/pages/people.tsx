import { useState } from "react";
import { Link, useParams } from "wouter";
import { School, Flag, Ban, ArrowLeft } from "lucide-react";
import { useGetPublicProfile, getGetPublicProfileQueryKey } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { MessageButton } from "@/components/message-button";
import { BlockDialog, ReportUserDialog } from "@/components/safety-dialogs";
import { useMe } from "@/hooks/use-me";
import { errStatus, initials, storageUrl } from "@/lib/format";

export default function People() {
  const { username = "" } = useParams<{ username: string }>();
  const me = useMe();
  const { data, isLoading, error, refetch } = useGetPublicProfile(username, { query: { enabled: !!username, queryKey: getGetPublicProfileQueryKey(username) } });
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  if (isLoading) return <PageSkeleton />;
  if (errStatus(error) === 404) return <EmptyState title="No one by that username" action={<Button asChild variant="outline"><Link href="/explore">Back to Explore</Link></Button>}>Check the spelling, or the account may no longer be public.</EmptyState>;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const isSelf = !!me.profile?.username && me.profile.username.toLowerCase() === data.username.toLowerCase();
  const canAct = me.signedIn && !!me.profile?.complete && !isSelf;
  return (
    <div className="mx-auto max-w-2xl">
      {me.signedIn && <Link href="/people" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />People</Link>}
      <div className="rounded-3xl border bg-card p-6 sm:p-10">
        <Avatar className="h-24 w-24 border-4 border-background ring-2 ring-primary/30">
          <AvatarImage src={storageUrl(data.avatarPath)} alt="" />
          <AvatarFallback className="bg-accent text-2xl font-semibold text-accent-foreground">{initials(data.displayName)}</AvatarFallback>
        </Avatar>
        <h1 className="mt-5 font-display text-3xl font-bold" data-testid="text-display-name">{data.displayName}</h1>
        <p className="text-muted-foreground" data-testid="text-username">@{data.username}</p>
        {data.universityName && <p className="mt-3 flex items-center gap-2 text-sm"><School className="h-4 w-4 text-primary" />{data.universityName}</p>}
        <p className="mt-5 whitespace-pre-wrap">{data.bio || <span className="text-muted-foreground">No bio yet.</span>}</p>
        {!isSelf && (
          <div className="mt-6 flex flex-wrap gap-2 border-t pt-5">
            <MessageButton username={data.username} />
            {canAct && (
              <>
                <Button variant="outline" onClick={() => setReportOpen(true)} data-testid="button-report-user"><Flag className="mr-2 h-4 w-4" />Report</Button>
                <Button variant="ghost" className="text-destructive" onClick={() => setBlockOpen(true)} data-testid="button-block-user"><Ban className="mr-2 h-4 w-4" />Block</Button>
              </>
            )}
          </div>
        )}
        {isSelf && <p className="mt-6 border-t pt-5 text-sm text-muted-foreground">This is how other students see you. <Link href="/profile" className="font-semibold text-primary hover:underline">Edit profile</Link></p>}
      </div>
      {canAct && (
        <>
          <ReportUserDialog username={data.username} displayName={data.displayName} open={reportOpen} onOpenChange={setReportOpen} />
          <BlockDialog username={data.username} displayName={data.displayName} mode="block" open={blockOpen} onOpenChange={setBlockOpen} />
        </>
      )}
    </div>
  );
}

import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useStartConversation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { invalidateSocial } from "@/lib/social";

/** Opens (or resumes) a private conversation. The server decides whether it is allowed. */
export function MessageButton({ username, label = "Message", variant = "default", className }: {
  username: string; label?: string; variant?: "default" | "outline" | "secondary"; className?: string;
}) {
  const me = useMe();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const start = useStartConversation();
  if (!me.signedIn) {
    return <Button asChild variant={variant} className={className}><Link href="/sign-in"><MessageCircle className="mr-2 h-4 w-4" />Sign in to message</Link></Button>;
  }
  if (me.profile && !me.profile.complete) {
    return <Button asChild variant="outline" className={className}><Link href="/onboarding"><MessageCircle className="mr-2 h-4 w-4" />Finish profile to message</Link></Button>;
  }
  if (me.profile?.username && me.profile.username.toLowerCase() === username.toLowerCase()) return null;
  return (
    <Button variant={variant} className={className} disabled={start.isPending} data-testid="button-start-conversation"
      onClick={() => start.mutate({ data: { username } }, {
        onSuccess: (c) => { invalidateSocial(qc); setLocation(`/messages/${c.id}`); },
        onError: (e) => toast({ variant: "destructive", title: "Could not open a conversation", description: errMessage(e) }),
      })}>
      <MessageCircle className="mr-2 h-4 w-4" />{start.isPending ? "Opening" : label}
    </Button>
  );
}

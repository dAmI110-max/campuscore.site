import type { ChatPerson } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, storageUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PersonAvatar({ person, className }: { person: Pick<ChatPerson, "displayName" | "avatarPath">; className?: string }) {
  return (
    <Avatar className={cn("h-10 w-10 border", className)}>
      <AvatarImage src={storageUrl(person.avatarPath)} alt="" />
      <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials(person.displayName)}</AvatarFallback>
    </Avatar>
  );
}

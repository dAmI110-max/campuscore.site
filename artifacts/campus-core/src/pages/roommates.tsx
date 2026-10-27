import { useState } from "react";
import { BedDouble, Inbox, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/states";
import { Browse } from "@/components/roommates/browse";
import { Requests } from "@/components/roommates/requests";
import { MyProfile } from "@/components/roommates/profile-form";

export default function Roommates() {
  const [tab, setTab] = useState("browse");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Housing" title="Roommate Finder">
        Find students heading to the same campus. You choose what others see, and contact only opens after both of you agree.
      </PageHeader>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="browse" data-testid="tab-roommates-browse"><Search className="mr-1.5 h-4 w-4" />Browse</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-roommates-requests"><Inbox className="mr-1.5 h-4 w-4" />Requests</TabsTrigger>
          <TabsTrigger value="mine" data-testid="tab-roommates-mine"><BedDouble className="mr-1.5 h-4 w-4" />My profile</TabsTrigger>
        </TabsList>
        <TabsContent value="browse"><Browse onEdit={() => setTab("mine")} /></TabsContent>
        <TabsContent value="requests"><Requests /></TabsContent>
        <TabsContent value="mine"><MyProfile /></TabsContent>
      </Tabs>
    </div>
  );
}

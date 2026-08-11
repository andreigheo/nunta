"use client";

import { BedDouble, Building2, Compass, Star } from "lucide-react";
import { AccommodationDiscoveryTab } from "@/components/accommodation/discovery-tab";
import { ManagedAccommodationTab } from "@/components/accommodation/managed-accommodation-tab";
import { AccommodationRecommendationsTab } from "@/components/accommodation/recommendations-tab";
import {
  EmptyState,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { useWorkspace } from "@/lib/api/workspace-context";

export default function AccommodationPage() {
  const { bootstrap, demoMode } = useWorkspace();
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("accommodation.write");
  const canPublish = capabilities.includes("accommodation.publish");

  if (demoMode) {
    return (
      <EmptyState
        icon={Building2}
        title="Cazarea este izolată în demo"
        description="Nu afișăm rezultate sau recomandări demonstrative. Ieși din demo pentru a căuta informațiile publice reale."
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-testid="accommodation-page">
      <PageHeader
        title="Cazare"
        description="Descoperă variante din jurul evenimentului, pregătește recomandările pentru invitați și administrează separat camerele confirmate."
      />

      <Tabs defaultValue="discover">
        <TabsList className="w-full justify-start" aria-label="Zonele modulului de cazare">
          <TabsTrigger value="discover">
            <Compass className="size-4" aria-hidden />
            Descoperă
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <Star className="size-4" aria-hidden />
            <span className="sm:hidden">Recomandări</span>
            <span className="hidden sm:inline">Recomandate invitaților</span>
          </TabsTrigger>
          <TabsTrigger value="operations">
            <BedDouble className="size-4" aria-hidden />
            <span className="sm:hidden">Camere</span>
            <span className="hidden sm:inline">Camere și alocări</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="mt-5">
          <AccommodationDiscoveryTab
            key={bootstrap?.workspace.id ?? "discovery"}
            canWrite={canWrite}
          />
        </TabsContent>

        <TabsContent value="recommendations" className="mt-5">
          <AccommodationRecommendationsTab
            key={bootstrap?.workspace.id ?? "recommendations"}
            canWrite={canWrite}
            canPublish={canPublish}
          />
        </TabsContent>

        <TabsContent value="operations" className="mt-5">
          <ManagedAccommodationTab key={bootstrap?.workspace.id ?? "operations"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

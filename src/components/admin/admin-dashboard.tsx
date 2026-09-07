"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedbackTab } from "./feedback-tab";
import { GuardrailFlagsTab } from "./guardrail-flags-tab";
import { IngestionHealthTab } from "./ingestion-health-tab";
import { OverviewTab } from "./overview-tab";
import { UsageTab } from "./usage-tab";

/**
 * Tabbed admin dashboard. Each tab is a client component that fetches its
 * own data on mount (inactive panels are unmounted, so switching back
 * refetches fresh data).
 */
export function AdminDashboard() {
  return (
    <Tabs defaultValue="overview" className="gap-6">
      <div className="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="overview" className="px-3">
            Overview
          </TabsTrigger>
          <TabsTrigger value="ingestion" className="px-3">
            Ingestion health
          </TabsTrigger>
          <TabsTrigger value="guardrails" className="px-3">
            Guardrail flags
          </TabsTrigger>
          <TabsTrigger value="usage" className="px-3">
            Usage &amp; cost
          </TabsTrigger>
          <TabsTrigger value="feedback" className="px-3">
            Feedback
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview">
        <OverviewTab />
      </TabsContent>
      <TabsContent value="ingestion">
        <IngestionHealthTab />
      </TabsContent>
      <TabsContent value="guardrails">
        <GuardrailFlagsTab />
      </TabsContent>
      <TabsContent value="usage">
        <UsageTab />
      </TabsContent>
      <TabsContent value="feedback">
        <FeedbackTab />
      </TabsContent>
    </Tabs>
  );
}

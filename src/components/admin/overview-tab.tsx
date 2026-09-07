"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@/components/documents/types";
import { formatInt } from "./format";
import { LoadError } from "./tab-states";
import type { AdminStatsDto } from "./types";
import { useAdminData } from "./use-admin-data";

const PROCESSING_STATUSES: readonly DocumentStatus[] = [
  "pending",
  "parsing",
  "chunking",
  "embedding",
];

function StatCard({
  label,
  value,
  valueClassName,
  caption,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  caption?: string;
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn("text-2xl font-semibold tabular-nums", valueClassName)}
        >
          {value}
        </span>
        {caption ? (
          <span className="font-mono text-xs text-muted-foreground">
            {caption}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function OverviewTab() {
  const { data, error, reload } = useAdminData<AdminStatsDto>(
    "/api/admin/stats",
  );

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (data === null) {
    return (
      <div
        aria-busy="true"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const processing = PROCESSING_STATUSES.reduce(
    (sum, status) => sum + data.documents[status],
    0,
  );
  const processingCaption = PROCESSING_STATUSES.filter(
    (status) => data.documents[status] > 0,
  )
    .map((status) => `${status} ${data.documents[status]}`)
    .join(" · ");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Documents ready"
        value={formatInt(data.documents.ready)}
        valueClassName="text-status-ready"
      />
      <StatCard
        label="Documents processing"
        value={formatInt(processing)}
        valueClassName={processing > 0 ? "text-status-processing" : undefined}
        caption={processingCaption || undefined}
      />
      <StatCard
        label="Documents failed"
        value={formatInt(data.documents.failed)}
        valueClassName={
          data.documents.failed > 0 ? "text-status-failed" : undefined
        }
      />
      <StatCard label="Chunks" value={formatInt(data.totalChunks)} />
      <StatCard label="Conversations" value={formatInt(data.conversations)} />
      <StatCard
        label="Messages (last 7 days)"
        value={formatInt(data.messagesLast7Days)}
      />
      <StatCard
        label="Feedback"
        value={formatInt(data.feedback.up + data.feedback.down)}
        caption={`${data.feedback.up} up · ${data.feedback.down} down`}
      />
    </div>
  );
}

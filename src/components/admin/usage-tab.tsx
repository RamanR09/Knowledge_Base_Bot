"use client";

import { MessageSquareDashedIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInt, formatUsd } from "./format";
import { EmptyState, LoadError, TableSkeleton } from "./tab-states";
import { PRICING_USD_PER_MTOK, type UsageDayDto } from "./types";
import { useAdminData } from "./use-admin-data";

const NUM_CELL = "text-right font-mono text-xs tabular-nums";

export function UsageTab() {
  const { data, error, reload } = useAdminData<UsageDayDto[]>(
    "/api/admin/usage",
  );

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (data === null) return <TableSkeleton rows={6} />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareDashedIcon}
        title="No usage yet"
        description="No messages in the last 30 days — usage and cost will appear here as people chat."
      />
    );
  }

  const totals = data.reduce(
    (acc, day) => ({
      messages: acc.messages + day.messages,
      inputTokens: acc.inputTokens + day.inputTokens,
      outputTokens: acc.outputTokens + day.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + day.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + day.cacheWriteTokens,
      estimatedCostUsd: acc.estimatedCostUsd + day.estimatedCostUsd,
    }),
    {
      messages: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCostUsd: 0,
    },
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead className="text-right">Input tokens</TableHead>
              <TableHead className="text-right">Output tokens</TableHead>
              <TableHead className="text-right">Cache read</TableHead>
              <TableHead className="text-right">Cache write</TableHead>
              <TableHead className="text-right">Est. cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((day) => (
              <TableRow key={day.date}>
                <TableCell className="font-mono text-xs">{day.date}</TableCell>
                <TableCell className={NUM_CELL}>
                  {formatInt(day.messages)}
                </TableCell>
                <TableCell className={NUM_CELL}>
                  {formatInt(day.inputTokens)}
                </TableCell>
                <TableCell className={NUM_CELL}>
                  {formatInt(day.outputTokens)}
                </TableCell>
                <TableCell className={NUM_CELL}>
                  {formatInt(day.cacheReadTokens)}
                </TableCell>
                <TableCell className={NUM_CELL}>
                  {formatInt(day.cacheWriteTokens)}
                </TableCell>
                <TableCell className={NUM_CELL}>
                  {formatUsd(day.estimatedCostUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total (30 days)</TableCell>
              <TableCell className={NUM_CELL}>
                {formatInt(totals.messages)}
              </TableCell>
              <TableCell className={NUM_CELL}>
                {formatInt(totals.inputTokens)}
              </TableCell>
              <TableCell className={NUM_CELL}>
                {formatInt(totals.outputTokens)}
              </TableCell>
              <TableCell className={NUM_CELL}>
                {formatInt(totals.cacheReadTokens)}
              </TableCell>
              <TableCell className={NUM_CELL}>
                {formatInt(totals.cacheWriteTokens)}
              </TableCell>
              <TableCell className={NUM_CELL}>
                {formatUsd(totals.estimatedCostUsd)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Costs are estimates at ${PRICING_USD_PER_MTOK.input}/M input, $
        {PRICING_USD_PER_MTOK.output}/M output, ${PRICING_USD_PER_MTOK.cacheRead}
        /M cache read, ${PRICING_USD_PER_MTOK.cacheWrite}/M cache write — update
        PRICING_USD_PER_MTOK when pricing changes.
      </p>
    </div>
  );
}

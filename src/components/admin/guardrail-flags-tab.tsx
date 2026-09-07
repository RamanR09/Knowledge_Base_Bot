"use client";

import * as React from "react";
import { BugIcon, ChevronDownIcon, ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateTime, truncate } from "./format";
import { EmptyState, LoadError, TableSkeleton } from "./tab-states";
import type { GuardrailFlagDto } from "./types";
import { useAdminData } from "./use-admin-data";

/** Flags that came back clean-ish (uncited) get a calmer badge than blocks/leaks. */
function flagVariant(flag: string): "destructive" | "outline" {
  return flag === "uncited" ? "outline" : "destructive";
}

function DebugPopover({ row }: { row: GuardrailFlagDto }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Retrieval debug for message in ${row.conversationTitle}`}
          />
        }
      >
        <BugIcon aria-hidden />
        Debug
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Retrieval debug</span>
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {JSON.stringify(row.retrievalDebug, null, 2)}
          </pre>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function GuardrailFlagsTab() {
  const { data, error, reload } = useAdminData<GuardrailFlagDto[]>(
    "/api/admin/guardrail-flags",
  );
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (data === null) return <TableSkeleton />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheckIcon}
        title="No guardrail flags"
        description="No blocked inputs, secret leaks, or uncited answers in the latest messages."
      />
    );
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Conversation</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead>Message</TableHead>
            <TableHead className="w-28 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => {
            const expanded = expandedId === row.messageId;
            return (
              <React.Fragment key={row.messageId}>
                <TableRow>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-44">
                    <span className="block truncate">
                      {row.conversationTitle}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {row.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      {row.flags.map((flag) => (
                        <Badge
                          key={flag}
                          variant={flagVariant(flag)}
                          className="font-mono"
                        >
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-muted-foreground">
                        {truncate(row.content, 96)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Hide" : "Show"} full message`}
                        onClick={() =>
                          setExpandedId(expanded ? null : row.messageId)
                        }
                      >
                        <ChevronDownIcon
                          aria-hidden
                          className={cn(
                            "transition-transform motion-reduce:transition-none",
                            expanded && "rotate-180",
                          )}
                        />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      {row.role === "assistant" && row.retrievalDebug !== null ? (
                        <DebugPopover row={row} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
                {expanded ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="whitespace-normal">
                      <p className="max-h-60 max-w-[70ch] overflow-auto rounded-lg bg-muted p-3 text-sm leading-6 whitespace-pre-wrap">
                        {row.content}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

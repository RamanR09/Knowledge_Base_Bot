import type * as React from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  Loader2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "./types";

const PROCESSING_CLASSES =
  "border-status-processing/40 bg-status-processing/10 text-status-processing";

interface StatusConfig {
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  spin?: boolean;
}

const CONFIG: Record<DocumentStatus, StatusConfig> = {
  pending: { label: "Pending", className: PROCESSING_CLASSES, icon: ClockIcon },
  parsing: {
    label: "Parsing",
    className: PROCESSING_CLASSES,
    icon: Loader2Icon,
    spin: true,
  },
  chunking: {
    label: "Chunking",
    className: PROCESSING_CLASSES,
    icon: Loader2Icon,
    spin: true,
  },
  embedding: {
    label: "Embedding",
    className: PROCESSING_CLASSES,
    icon: Loader2Icon,
    spin: true,
  },
  ready: {
    label: "Ready",
    className: "border-status-ready/40 bg-status-ready/10 text-status-ready",
    icon: CircleCheckIcon,
  },
  failed: {
    label: "Failed",
    className: "border-status-failed/40 bg-status-failed/10 text-status-failed",
    icon: CircleAlertIcon,
  },
};

/** Shown instead of "Failed" when the failure was a provider rate limit. */
const RATE_LIMITED_CONFIG: StatusConfig = {
  label: "Rate limited",
  className: PROCESSING_CLASSES,
  icon: ClockIcon,
};

export function StatusBadge({
  status,
  rateLimited = false,
  className,
}: {
  status: DocumentStatus;
  /** Renders an amber "Rate limited" badge for failed docs hit by provider 429s. */
  rateLimited?: boolean;
  className?: string;
}) {
  const config =
    status === "failed" && rateLimited ? RATE_LIMITED_CONFIG : CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-mono", config.className, className)}>
      <Icon
        aria-hidden
        className={cn(config.spin && "animate-spin motion-reduce:animate-none")}
      />
      {config.label}
    </Badge>
  );
}

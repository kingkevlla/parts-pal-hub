import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AccessibleKpiProps {
  /** Short/compact value shown in the card (e.g. "FRw 1.23M"). */
  compact: string;
  /** Full precise value revealed on hover/focus and to assistive tech. */
  full: string;
  className?: string;
}

/**
 * Renders a truncated KPI value with a controlled tooltip that exposes the
 * full amount on hover, keyboard focus, Enter/Space, and to screen readers.
 * Use this anywhere a numeric/currency value may be visually truncated on
 * dashboard cards so users can always retrieve the precise figure.
 */
export function AccessibleKpi({ compact, full, className }: AccessibleKpiProps) {
  const [open, setOpen] = useState(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="button"
          className={cn("outline-none cursor-help focus-visible:ring-2 focus-visible:ring-ring rounded-sm", className)}
          aria-label={`Full amount: ${full}`}
          onKeyDown={handleKeyDown}
        >
          {compact}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{full}</p>
      </TooltipContent>
    </Tooltip>
  );
}

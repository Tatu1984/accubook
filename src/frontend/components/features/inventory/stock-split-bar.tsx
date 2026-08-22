"use client";

import * as React from "react";
import { cn } from "@/shared/utils/common.util";

interface StockSplitBarProps {
  /** Books position: physical minus what is awaiting dispatch. Can go negative. */
  accounting: number;
  /** Invoiced to a customer, still on the shelf. */
  inProgress: number;
  /** What a shelf count finds. */
  physical: number;
  className?: string;
  /** Renders the numbers under the bar. Off inside dense tables. */
  showLegend?: boolean;
}

/**
 * The three stock positions as one bar, because they are one quantity split
 * two ways rather than three independent figures:
 *
 *     physical = accounting + inProgress
 *
 * The filled segment is stock the books still consider owned; the striped
 * segment is stock already invoiced out but not yet physically gone. Reading
 * the gap is the whole point of the screen, so it is drawn rather than left
 * for the viewer to subtract.
 *
 * Oversold — more invoiced than held — makes `accounting` negative, which no
 * proportional bar can express. That case switches to a single red bar so it
 * reads as a problem instead of silently clamping to zero.
 */
export function StockSplitBar({
  accounting,
  inProgress,
  physical,
  className,
  showLegend = false,
}: StockSplitBarProps) {
  const oversold = accounting < 0;

  // Nothing held and nothing owed: an empty track, not a divide by zero.
  const total = Math.max(physical, 0);
  const accountingPct = total > 0 ? (Math.max(accounting, 0) / total) * 100 : 0;
  const inProgressPct = total > 0 ? (Math.min(inProgress, total) / total) * 100 : 0;

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          oversold
            ? `Oversold by ${Math.abs(accounting)} — ${inProgress} awaiting dispatch against ${physical} on hand`
            : `${accounting} on the books, ${inProgress} awaiting dispatch, ${physical} physically held`
        }
      >
        {oversold ? (
          <div className="h-full w-full bg-red-500" />
        ) : (
          <>
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${accountingPct}%` }}
            />
            <div
              className="h-full bg-amber-400 transition-all"
              style={{
                width: `${inProgressPct}%`,
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,.45) 3px, rgba(255,255,255,.45) 6px)",
              }}
            />
          </>
        )}
      </div>

      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                oversold ? "bg-red-500" : "bg-emerald-500"
              )}
            />
            Accounting {accounting}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            In progress {inProgress}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            Physical {physical}
          </span>
        </div>
      )}
    </div>
  );
}

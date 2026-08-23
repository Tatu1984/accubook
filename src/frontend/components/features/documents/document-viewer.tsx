"use client";

import * as React from "react";
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Download } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/shared/utils/common.util";

interface DocumentViewerProps {
  src: string;
  mimeType: string;
  fileName: string;
  className?: string;
}

/**
 * The original, big enough to read.
 *
 * Half of this screen's job is that a person can actually check a figure
 * against the paper, and phone photos are the hard case: taken at an angle, in
 * poor light, often sideways. Zoom and rotate are therefore not decoration —
 * without them the reviewer opens the file in another tab and loses the
 * side-by-side, which is the whole point.
 *
 * PDFs are handed to the browser's own viewer, which already has paging,
 * search and its own zoom; re-implementing that in canvas would be worse in
 * every respect.
 */
export function DocumentViewer({ src, mimeType, fileName, className }: DocumentViewerProps) {
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const isPdf = mimeType === "application/pdf";

  return (
    <div className={cn("flex h-full flex-col overflow-hidden rounded-lg border", className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <p className="truncate text-sm font-medium" title={fileName}>
          {fileName}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {!isPdf && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(6, Number((z + 0.25).toFixed(2))))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Rotate"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Fit to width"
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                }}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a href={src} target="_blank" rel="noopener noreferrer" aria-label="Open original">
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900">
        {isPdf ? (
          <iframe src={src} title={fileName} className="h-full min-h-[600px] w-full border-0" />
        ) : (
          <div className="flex min-h-full items-start justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={fileName}
              className="max-w-none origin-top shadow-sm transition-transform"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                width: zoom === 1 ? "100%" : undefined,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

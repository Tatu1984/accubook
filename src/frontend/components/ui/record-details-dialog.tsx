"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { ScrollArea } from "@/frontend/components/ui/scroll-area";

export interface DetailField {
  label: string;
  value: React.ReactNode;
  /** Render this field across the full dialog width. */
  full?: boolean;
}

export interface DetailSection {
  title?: string;
  fields: DetailField[];
}

export interface DetailTable {
  title?: string;
  columns: string[];
  rows: React.ReactNode[][];
}

interface RecordDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  status?: { label: string; variant?: "default" | "secondary" | "destructive" | "outline" };
  sections: DetailSection[];
  table?: DetailTable;
  /** Extra actions rendered next to Close, e.g. Print. */
  actions?: React.ReactNode;
}

/**
 * Read-only view of a record the list page has already loaded.
 *
 * Every list screen needs a "View Details" that shows the real record rather
 * than navigating to a detail route that does not exist for most resources.
 */
export function RecordDetailsDialog({
  open,
  onOpenChange,
  title,
  description,
  status,
  sections,
  table,
  actions,
}: RecordDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>{title}</DialogTitle>
            {status && (
              <Badge variant={status.variant ?? "secondary"}>{status.label}</Badge>
            )}
          </div>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {sections.map((section, sectionIndex) => (
              <div key={section.title ?? sectionIndex} className="space-y-3">
                {section.title && (
                  <h4 className="text-sm font-semibold text-muted-foreground">
                    {section.title}
                  </h4>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.fields.map((field) => (
                    <div
                      key={field.label}
                      className={field.full ? "sm:col-span-2 space-y-1" : "space-y-1"}
                    >
                      <p className="text-xs text-muted-foreground">{field.label}</p>
                      <div className="text-sm font-medium break-words">
                        {field.value === null ||
                        field.value === undefined ||
                        field.value === ""
                          ? "-"
                          : field.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {table && table.rows.length > 0 && (
              <div className="space-y-3">
                {table.title && (
                  <h4 className="text-sm font-semibold text-muted-foreground">
                    {table.title}
                  </h4>
                )}
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        {table.columns.map((column) => (
                          <th
                            key={column}
                            className="px-3 py-2 text-left font-medium whitespace-nowrap"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="px-3 py-2 align-top">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          {actions}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

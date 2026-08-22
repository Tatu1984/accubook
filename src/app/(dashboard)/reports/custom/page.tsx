"use client";

import * as React from "react";
import {
  FileText,
  Loader2,
  Plus,
  Play,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/frontend/components/ui/alert-dialog";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { exportReport, type ReportType } from "@/frontend/utils/export-report";
import { resolvePeriod } from "@/frontend/utils/report-period";
import { toast } from "sonner";

/**
 * Saved report definitions.
 *
 * Both "Create Report" buttons on this screen were inert and nothing ever read
 * or wrote the `ReportTemplate` table. A template pins a statement type and a
 * period so a report run every month does not need re-configuring; running it
 * goes through `/reports/export`, which is what produces these statements.
 */

interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  config: {
    period?: string;
    startDate?: string;
    endDate?: string;
    format?: "xlsx" | "csv" | "json";
    notes?: string;
  } | null;
  isSystem: boolean;
}

const REPORT_TYPES: { value: string; label: string; exportType: ReportType }[] = [
  { value: "BALANCE_SHEET", label: "Balance Sheet", exportType: "balance-sheet" },
  { value: "PROFIT_LOSS", label: "Profit & Loss", exportType: "profit-loss" },
  { value: "CASH_FLOW", label: "Cash Flow", exportType: "cash-flow" },
  { value: "TRIAL_BALANCE", label: "Trial Balance", exportType: "trial-balance" },
];

const PERIODS = [
  { value: "current-fy", label: "Current financial year" },
  { value: "last-fy", label: "Last financial year" },
  { value: "ytd", label: "Year to date" },
  { value: "q1", label: "Q1 (Apr–Jun)" },
  { value: "q2", label: "Q2 (Jul–Sep)" },
  { value: "q3", label: "Q3 (Oct–Dec)" },
  { value: "q4", label: "Q4 (Jan–Mar)" },
  { value: "custom", label: "Fixed date range" },
];

const emptyForm = {
  name: "",
  type: "PROFIT_LOSS",
  period: "current-fy",
  startDate: "",
  endDate: "",
  format: "xlsx" as "xlsx" | "csv" | "json",
};

export default function CustomReportsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);
  const [templates, setTemplates] = React.useState<ReportTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ReportTemplate | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [deleteTemplate, setDeleteTemplate] =
    React.useState<ReportTemplate | null>(null);

  const fetchTemplates = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/report-templates`
      );
      if (!r.ok) throw new Error("Failed to load saved reports");
      const body = await r.json();
      setTemplates((body.data ?? []) as ReportTemplate[]);
    } catch (e) {
      toast.error((e as Error).message || "Failed to load saved reports");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      fetchTemplates();
    }
  }, [organizationId, fetchTemplates]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (template: ReportTemplate) => {
    setEditing(template);
    setForm({
      name: template.name,
      type: template.type,
      period: template.config?.period ?? "current-fy",
      startDate: template.config?.startDate ?? "",
      endDate: template.config?.endDate ?? "",
      format: template.config?.format ?? "xlsx",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!organizationId) return;
    if (!form.name.trim()) return toast.error("Give the report a name");
    if (form.period === "custom" && (!form.startDate || !form.endDate)) {
      return toast.error("A fixed range needs both a start and an end date");
    }

    setSaving(true);
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/report-templates`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editing ? { templateId: editing.id } : {}),
            name: form.name.trim(),
            type: form.type,
            config: {
              period: form.period,
              startDate: form.period === "custom" ? form.startDate : undefined,
              endDate: form.period === "custom" ? form.endDate : undefined,
              format: form.format,
            },
          }),
        }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to save the report");
      toast.success(editing ? "Report updated" : "Report saved");
      setDialogOpen(false);
      setEditing(null);
      fetchTemplates();
    } catch (e) {
      toast.error((e as Error).message || "Failed to save the report");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (template: ReportTemplate) => {
    if (!organizationId) return;
    const definition = REPORT_TYPES.find((t) => t.value === template.type);
    if (!definition) {
      toast.error(`Unsupported report type "${template.type}"`);
      return;
    }

    const period = template.config?.period ?? "current-fy";
    const range =
      period === "custom" && template.config?.startDate && template.config?.endDate
        ? { startDate: template.config.startDate, endDate: template.config.endDate }
        : resolvePeriod(period);

    setRunningId(template.id);
    try {
      await exportReport(
        organizationId,
        definition.exportType,
        { startDate: range.startDate, endDate: range.endDate },
        template.config?.format ?? "xlsx"
      );
      toast.success(`${template.name} generated`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to generate the report");
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!organizationId || !deleteTemplate) return;
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/report-templates?templateId=${deleteTemplate.id}`,
        { method: "DELETE" }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to delete the report");
      toast.success("Report deleted");
      setDeleteTemplate(null);
      fetchTemplates();
    } catch (e) {
      toast.error((e as Error).message || "Failed to delete the report");
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  const periodLabel = (template: ReportTemplate) => {
    const period = template.config?.period ?? "current-fy";
    if (period === "custom") {
      return `${template.config?.startDate ?? "?"} → ${template.config?.endDate ?? "?"}`;
    }
    return PERIODS.find((p) => p.value === period)?.label ?? period;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom Reports</h1>
          <p className="text-muted-foreground">
            Save a statement and period you run often, then generate it in one click
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Report
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No saved reports</h3>
              <p className="text-muted-foreground mb-4">
                Save a statement and its period to generate it without
                re-configuring each time
              </p>
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create Report
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription>
                      {REPORT_TYPES.find((t) => t.value === template.type)?.label ??
                        template.type}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="uppercase">
                    {template.config?.format ?? "xlsx"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {periodLabel(template)}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={runningId === template.id}
                    onClick={() => handleRun(template)}
                  >
                    {runningId === template.id ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-3 w-3" />
                    )}
                    Generate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={template.isSystem}
                    onClick={() => openEdit(template)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600"
                    aria-label={`Delete ${template.name}`}
                    disabled={template.isSystem}
                    onClick={() => setDeleteTemplate(template)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.name}` : "Create Report"}
            </DialogTitle>
            <DialogDescription>
              Pin a statement and the period it covers. Generating downloads it
              through the same exporter the report screens use.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="report-name">Name *</Label>
              <Input
                id="report-name"
                placeholder="e.g., Monthly P&L for the board"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Statement *</Label>
              <Select
                value={form.type}
                onValueChange={(value) => setForm({ ...form, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period *</Label>
              <Select
                value={form.period}
                onValueChange={(value) => setForm({ ...form, period: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.period === "custom" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="report-from">From *</Label>
                  <Input
                    id="report-from"
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-to">To *</Label>
                  <Input
                    id="report-to"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={form.format}
                onValueChange={(value) =>
                  setForm({ ...form, format: value as "xlsx" | "csv" | "json" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTemplate}
        onOpenChange={(open) => !open && setDeleteTemplate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteTemplate?.name}&quot;? The underlying data is
              untouched — only this saved definition is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

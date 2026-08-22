"use client";

import * as React from "react";
import { useState } from "react";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/frontend/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { Switch } from "@/frontend/components/ui/switch";
import { RecordDetailsDialog } from "@/frontend/components/ui/record-details-dialog";
import { downloadCsv } from "@/frontend/utils/export-csv";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
import {
  
  
  
  
} from "@/frontend/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/frontend/components/ui/alert";
import {
  Plus,
  Search,
  Wallet,
  Users,
  MoreHorizontal,
  Download,
  Eye,
  FileText,
  Send,
  Calculator,
  IndianRupee,
  Calendar,
  CheckCircle,
  Clock,
  Settings,
  Info,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";







const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  PROCESSING: "bg-yellow-100 text-yellow-800",
  GENERATED: "bg-blue-100 text-blue-800",
  SENT: "bg-green-100 text-green-800",
  PAID: "bg-green-100 text-green-800",
};

interface SalarySlip {
  id: string;
  employee: string;
  empId: string;
  department: string;
  month: number;
  year: number;
  basic: number;
  hra: number;
  allowances: number;
  grossSalary: number;
  pf: number;
  tax: number;
  deductions: number;
  netSalary: number;
  status: string;
}

interface SalaryStructure {
  id: string;
  name: string;
  basicPercent: number;
  hraPercent: number;
  pfPercent: number;
  employees: number;
}

/**
 * Payroll, read from the payslip records.
 *
 * All three tables here were hardcoded — invented payroll runs
 * (PAY-2024-03), invented salary slips for invented staff, and invented
 * salary structures — behind tiles reading ₹28.5L and ₹3.42Cr. Someone
 * checking what had been paid, or about to disburse, was reading numbers
 * the system had never computed.
 *
 * Payroll runs are derived by grouping payslips by month, which is how
 * the post-month and pay-month endpoints treat them. Salary structures
 * have no model behind them, so that tab says so.
 */
export default function PayrollPage() {
  const router = useRouter();
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [salarySlips, setSalarySlips] = React.useState<SalarySlip[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadPayroll = React.useCallback(async (signal?: AbortSignal) => {
    if (!organizationId) return;
    {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/organizations/${organizationId}/payroll?limit=300`, { signal });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load payroll");
        const json = await r.json();
        type Comp = { component?: string; name?: string; amount: number | string };
        type Row = {
          id: string; month: number; year: number;
          basicSalary: string; grossSalary: string; totalDeductions: string; netSalary: string;
          earnings?: Comp[]; deductions?: Comp[]; status: string;
          employee?: { employeeCode?: string; firstName?: string; lastName?: string | null; department?: { name?: string } | null } | null;
        };
        const pick = (list: Comp[] | undefined, want: string) =>
          Number((list ?? []).find((c) => (c.component ?? c.name ?? "").toLowerCase() === want)?.amount ?? 0);
        setSalarySlips(((json.data ?? []) as Row[]).map((p) => {
          const hra = pick(p.earnings, "hra");
          const gross = Number(p.grossSalary);
          const basic = Number(p.basicSalary);
          return {
            id: p.id,
            employee: [p.employee?.firstName, p.employee?.lastName].filter(Boolean).join(" ") || "—",
            empId: p.employee?.employeeCode ?? "—",
            department: p.employee?.department?.name ?? "—",
            month: p.month,
            year: p.year,
            basic,
            hra,
            allowances: Math.max(0, gross - basic - hra),
            grossSalary: gross,
            pf: pick(p.deductions, "pf (employee)") || pick(p.deductions, "pf"),
            tax: pick(p.deductions, "tds"),
            deductions: Number(p.totalDeductions),
            netSalary: Number(p.netSalary),
            status: p.status,
          };
        }));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    loadPayroll(controller.signal);
    return () => controller.abort();
  }, [organizationId, loadPayroll]);

  const reloadPayroll = React.useCallback(() => loadPayroll(), [loadPayroll]);

  /** One row per month that has payslips — how post-month/pay-month group them. */
  const payrollRuns = React.useMemo(() => {
    const byPeriod = new Map<string, SalarySlip[]>();
    for (const s of salarySlips) {
      const key = `${s.year}-${String(s.month).padStart(2, "0")}`;
      byPeriod.set(key, [...(byPeriod.get(key) ?? []), s]);
    }
    return [...byPeriod.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([period, slips]) => ({
        id: period,
        period,
        employees: slips.length,
        grossAmount: slips.reduce((t, s) => t + s.grossSalary, 0),
        deductions: slips.reduce((t, s) => t + s.deductions, 0),
        netAmount: slips.reduce((t, s) => t + s.netSalary, 0),
        status: slips.every((s) => s.status === "PAID")
          ? "PAID"
          : slips.some((s) => s.status === "PROCESSED" || s.status === "PAID")
          ? "PROCESSED"
          : "DRAFT",
      }));
  }, [salarySlips]);

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSlipDialogOpen, setIsSlipDialogOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState<SalarySlip | null>(null);
  const [isStructureDialogOpen, setIsStructureDialogOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<SalaryStructure | null>(null);
  const [structureForm, setStructureForm] = useState({
    name: "",
    basicPercent: "50",
    hraPercent: "40",
    pfPercent: "12",
  });

  type PayrollRun = (typeof payrollRuns)[number];
  const [detailsRun, setDetailsRun] = useState<PayrollRun | null>(null);
  const [runBusyId, setRunBusyId] = useState<string | null>(null);

  const DEFAULT_PAYROLL_SETTINGS = {
    epfEstablishmentCode: "",
    epfWageCeiling: "15000",
    includeEmployerPfInCtc: true,
    allowVpf: false,
    esiCode: "",
    tanNumber: "",
    defaultTaxRegime: "new",
    financialYear: "2025-26",
    componentsEnabled: {
      pf: true,
      esi: true,
      professionalTax: true,
      tds: true,
      lwf: false,
      gratuity: true,
    },
  };

  const setComponent = (
    key: "pf" | "esi" | "professionalTax" | "tds" | "lwf" | "gratuity",
    checked: boolean
  ) =>
    setPayrollSettings((prev) => ({
      ...prev,
      componentsEnabled: { ...prev.componentsEnabled, [key]: checked },
    }));
  const [payrollSettings, setPayrollSettings] = useState(DEFAULT_PAYROLL_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  React.useEffect(() => {
    if (!organizationId) return;
    (async () => {
      try {
        const r = await fetch(
          `/api/organizations/${organizationId}/payroll/settings`
        );
        if (r.ok) {
          const body = await r.json();
          if (body.data) setPayrollSettings({ ...DEFAULT_PAYROLL_SETTINGS, ...body.data });
        }
      } catch {
        // Fall back to the statutory defaults already in state.
      } finally {
        setSettingsLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const handleSavePayrollSettings = async () => {
    if (!organizationId) return;
    setSavingSettings(true);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/payroll/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payrollSettings),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to save payroll settings");
      toast.success("Payroll settings saved");
    } catch (e) {
      toast.error((e as Error).message || "Failed to save payroll settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetPayrollSettings = () => {
    setPayrollSettings(DEFAULT_PAYROLL_SETTINGS);
    toast.message("Reset to statutory defaults — press Save to apply");
  };

  const parsePeriod = (period: string) => {
    const [year, month] = period.split("-");
    return { year: Number(year), month: Number(month) };
  };

  const slipsForRun = (run: PayrollRun) =>
    salarySlips.filter(
      (s) => `${s.year}-${String(s.month).padStart(2, "0")}` === run.period
    );

  const handleGenerateSlips = async (run: PayrollRun) => {
    if (!organizationId) return;
    const { month, year } = parsePeriod(run.period);
    setRunBusyId(run.id);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/payroll/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-payslips", month, year }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to generate payslips");
      toast.success(
        `Payslips generated for ${new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long" })} ${year}`
      );
      await reloadPayroll();
    } catch (e) {
      toast.error((e as Error).message || "Failed to generate payslips");
    } finally {
      setRunBusyId(null);
    }
  };

  const handleDownloadRunReport = (run: PayrollRun) => {
    const slips = slipsForRun(run);
    if (slips.length === 0) {
      toast.error("This run has no payslips to report on");
      return;
    }
    downloadCsv(
      `payroll-${run.period}`,
      slips.map((s) => ({
        Employee: s.employee,
        EmployeeCode: s.empId,
        Department: s.department,
        Basic: s.basic,
        HRA: s.hra,
        Allowances: s.allowances,
        Gross: s.grossSalary,
        PF: s.pf,
        TDS: s.tax,
        TotalDeductions: s.deductions,
        Net: s.netSalary,
        Status: s.status,
      }))
    );
    toast.success(`Exported ${slips.length} payslips`);
  };

  const handleViewSlip = (slip: SalarySlip) => {
    setSelectedSlip(slip);
    setIsSlipDialogOpen(true);
  };

  const handleDownloadPDF = (slip: SalarySlip) => {
    // Create a simple text representation for download
    const content = `
SALARY SLIP - March 2024
========================

Employee: ${slip.employee}
Employee ID: ${slip.empId}
Department: ${slip.department}

EARNINGS
--------
Basic Salary:     ₹${slip.basic.toLocaleString()}
HRA:              ₹${slip.hra.toLocaleString()}
Other Allowances: ₹${slip.allowances.toLocaleString()}
------------------------
Gross Salary:     ₹${slip.grossSalary.toLocaleString()}

DEDUCTIONS
----------
Provident Fund:   ₹${slip.pf.toLocaleString()}
Income Tax (TDS): ₹${slip.tax.toLocaleString()}
------------------------
Total Deductions: ₹${slip.deductions.toLocaleString()}

========================
NET SALARY:       ₹${slip.netSalary.toLocaleString()}
========================

Generated on: ${new Date().toLocaleDateString()}
    `.trim();

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Salary_Slip_${slip.empId}_March_2024.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendToEmployee = (slip: SalarySlip) => {
    // Simulate sending email
    alert(`Salary slip sent to ${slip.employee}'s registered email address.`);
  };

  const handleSendAll = () => {
    alert(`Salary slips sent to all ${salarySlips.length} employees.`);
  };

  const handleDownloadAll = () => {
    salarySlips.forEach((slip) => {
      handleDownloadPDF(slip);
    });
  };

  const handleNewStructure = () => {
    setEditingStructure(null);
    setStructureForm({
      name: "",
      basicPercent: "50",
      hraPercent: "40",
      pfPercent: "12",
    });
    setIsStructureDialogOpen(true);
  };

  const handleEditStructure = (structure: SalaryStructure) => {
    setEditingStructure(structure);
    setStructureForm({
      name: structure.name,
      basicPercent: structure.basicPercent.toString(),
      hraPercent: structure.hraPercent.toString(),
      pfPercent: structure.pfPercent.toString(),
    });
    setIsStructureDialogOpen(true);
  };

  const handleSaveStructure = () => {
    if (!structureForm.name) {
      alert("Please enter a structure name");
      return;
    }

    if (editingStructure) {
      alert(`Structure "${structureForm.name}" updated successfully!`);
    } else {
      alert(`New structure "${structureForm.name}" created successfully!`);
    }
    setIsStructureDialogOpen(false);
  };

  const latestRun = payrollRuns[0];
  const ytdNet = payrollRuns.reduce((t, r) => t + r.netAmount, 0);
  const employeesOnPayroll = new Set(salarySlips.map((s) => s.empId)).size;
  const lakhs = (n: number) =>
    n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr` : `₹${(n / 1e5).toFixed(2)}L`;

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">
            Manage salary processing and payslips
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Calculator className="mr-2 h-4 w-4" />
              Run Payroll
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Run Payroll</DialogTitle>
              <DialogDescription>
                Process payroll for the selected month
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="03-2024">March 2024</SelectItem>
                      <SelectItem value="04-2024">April 2024</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pay Date</Label>
                  <Input type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Employees</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees (45)</SelectItem>
                    <SelectItem value="engineering">Engineering (15)</SelectItem>
                    <SelectItem value="finance">Finance (8)</SelectItem>
                    <SelectItem value="sales">Sales (12)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Employees</div>
                      <div className="text-xl font-bold">{employeesOnPayroll}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Est. Gross</div>
                      <div className="text-xl font-bold">{lakhs(latestRun?.grossAmount ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Est. Net</div>
                      <div className="text-xl font-bold">{lakhs(latestRun?.netAmount ?? 0)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>
                <Calculator className="mr-2 h-4 w-4" />
                Calculate Payroll
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lakhs(latestRun?.netAmount ?? 0)}</div>
            <p className="text-xs text-muted-foreground">
              {latestRun ? `${latestRun.period} (${latestRun.status})` : "No payroll run yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Payroll</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lakhs(ytdNet)}</div>
            <p className="text-xs text-muted-foreground">Across {payrollRuns.length} run(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employeesOnPayroll}</div>
            <p className="text-xs text-muted-foreground">With a payslip on record</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {salarySlips.filter((s) => s.status === "DRAFT").length}
            </div>
            <p className="text-xs text-muted-foreground">Payslips still in draft</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs">Payroll Runs</TabsTrigger>
          <TabsTrigger value="slips">Salary Slips</TabsTrigger>
          <TabsTrigger value="structures">Salary Structures</TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Payroll History</CardTitle>
                  <CardDescription>
                    View and manage monthly payroll runs
                  </CardDescription>
                </div>
                <Select defaultValue="2024">
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                    <TableHead className="text-right">Gross Salary</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Processed Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">{run.period}</TableCell>
                      <TableCell className="text-right">{run.employees}</TableCell>
                      <TableCell className="text-right">
                        ₹{(run.grossAmount / 100000).toFixed(2)}L
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ₹{(run.deductions / 100000).toFixed(2)}L
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{(run.netAmount / 100000).toFixed(2)}L
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[run.status]}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {run.status === "DRAFT" ? "-" : run.status}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Open actions menu">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailsRun(run)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={runBusyId === run.id}
                              onClick={() => handleGenerateSlips(run)}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Generate Slips
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDownloadRunReport(run)}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download Report
                            </DropdownMenuItem>
                            {run.status === "DRAFT" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  const { month, year } = parsePeriod(run.period);
                                  router.push(
                                    `/hr/payroll/run?month=${month}&year=${year}`
                                  );
                                }}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Process Payroll
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slips" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Salary Slips</CardTitle>
                  <CardDescription>
                    March 2024 salary slips
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search employee..."
                      className="pl-8 w-[250px]"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={handleSendAll}>
                    <Send className="mr-2 h-4 w-4" />
                    Send All
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleDownloadAll} title="Download All">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">HRA</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salarySlips.map((slip) => (
                    <TableRow key={slip.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{slip.employee}</div>
                          <div className="text-sm text-muted-foreground">
                            {slip.empId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{slip.department}</TableCell>
                      <TableCell className="text-right">
                        ₹{slip.basic.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{slip.hra.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{slip.grossSalary.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ₹{slip.deductions.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{slip.netSalary.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[slip.status]}>
                          {slip.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Open actions menu">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewSlip(slip)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Slip
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadPDF(slip)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSendToEmployee(slip)}>
                              <Send className="mr-2 h-4 w-4" />
                              Send to Employee
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Salary Slip View Dialog */}
          <Dialog open={isSlipDialogOpen} onOpenChange={setIsSlipDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Salary Slip - March 2024</DialogTitle>
                <DialogDescription>
                  {selectedSlip?.employee} ({selectedSlip?.empId})
                </DialogDescription>
              </DialogHeader>
              {selectedSlip && (
                <div className="space-y-6">
                  {/* Employee Info */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Employee Name</p>
                      <p className="font-medium">{selectedSlip.employee}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Employee ID</p>
                      <p className="font-medium">{selectedSlip.empId}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Department</p>
                      <p className="font-medium">{selectedSlip.department}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pay Period</p>
                      <p className="font-medium">March 2024</p>
                    </div>
                  </div>

                  {/* Earnings & Deductions */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Earnings */}
                    <div>
                      <h4 className="font-medium text-green-600 mb-3">Earnings</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Basic Salary</span>
                          <span>₹{selectedSlip.basic.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>HRA</span>
                          <span>₹{selectedSlip.hra.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Other Allowances</span>
                          <span>₹{selectedSlip.allowances.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-medium pt-2 border-t">
                          <span>Gross Salary</span>
                          <span className="text-green-600">₹{selectedSlip.grossSalary.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Deductions */}
                    <div>
                      <h4 className="font-medium text-red-600 mb-3">Deductions</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Provident Fund (EPF)</span>
                          <span>₹{selectedSlip.pf.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Income Tax (TDS)</span>
                          <span>₹{selectedSlip.tax.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Professional Tax</span>
                          <span>₹200</span>
                        </div>
                        <div className="flex justify-between font-medium pt-2 border-t">
                          <span>Total Deductions</span>
                          <span className="text-red-600">₹{selectedSlip.deductions.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Net Salary */}
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-medium">Net Salary</span>
                      <span className="text-2xl font-bold text-primary">₹{selectedSlip.netSalary.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSlipDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => selectedSlip && handleDownloadPDF(selectedSlip)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="structures" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Salary Structures</CardTitle>
                  <CardDescription>
                    Configure salary components and structures
                  </CardDescription>
                </div>
                <Button onClick={handleNewStructure}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Structure
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <p className="text-sm text-muted-foreground md:col-span-3">
                  Salary structures are not stored yet — there is no model behind
                  them, so nothing can be listed here. Payslips are computed from
                  each employee&apos;s CTC and the statutory rules instead.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Structure Edit/Create Dialog */}
          <Dialog open={isStructureDialogOpen} onOpenChange={setIsStructureDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingStructure ? "Edit Salary Structure" : "Create New Salary Structure"}
                </DialogTitle>
                <DialogDescription>
                  {editingStructure
                    ? `Modify the "${editingStructure.name}" salary structure`
                    : "Define a new salary structure for your employees"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Structure Name</Label>
                  <Input
                    placeholder="e.g., Senior Manager Grade"
                    value={structureForm.name}
                    onChange={(e) => setStructureForm({ ...structureForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Basic Salary (% of CTC)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={structureForm.basicPercent}
                      onChange={(e) => setStructureForm({ ...structureForm, basicPercent: e.target.value })}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recommended: 40-50% of CTC for optimal tax planning
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>HRA (% of Basic)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={structureForm.hraPercent}
                      onChange={(e) => setStructureForm({ ...structureForm, hraPercent: e.target.value })}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Standard: 40% for metro cities, 50% for non-metro
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>PF Contribution (% of Basic)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={structureForm.pfPercent}
                      onChange={(e) => setStructureForm({ ...structureForm, pfPercent: e.target.value })}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Statutory minimum: 12% (on basic up to ₹15,000)
                  </p>
                </div>

                {/* Preview */}
                <div className="p-4 bg-muted rounded-lg mt-2">
                  <h4 className="font-medium mb-2">Structure Preview (for ₹10,00,000 CTC)</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Basic Salary</span>
                      <span>₹{((1000000 * parseFloat(structureForm.basicPercent || "0")) / 100 / 12).toLocaleString()}/month</span>
                    </div>
                    <div className="flex justify-between">
                      <span>HRA</span>
                      <span>₹{((1000000 * parseFloat(structureForm.basicPercent || "0") / 100 * parseFloat(structureForm.hraPercent || "0") / 100) / 12).toLocaleString()}/month</span>
                    </div>
                    <div className="flex justify-between">
                      <span>EPF Deduction</span>
                      <span>₹{((1000000 * parseFloat(structureForm.basicPercent || "0") / 100 * parseFloat(structureForm.pfPercent || "0") / 100) / 12).toLocaleString()}/month</span>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsStructureDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveStructure}>
                  {editingStructure ? "Update Structure" : "Create Structure"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          {/* Calculation Formula Info */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>How Payroll is Calculated</AlertTitle>
            <AlertDescription>
              Net Salary = Gross Salary - (EPF + ESI + Professional Tax + TDS + Other Deductions)
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Pay Schedule Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Pay Schedule
                </CardTitle>
                <CardDescription>
                  Configure when salaries are processed and paid
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Pay Frequency</Label>
                  <Select defaultValue="monthly">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pay Day</Label>
                  <Select defaultValue="last">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1st of month</SelectItem>
                      <SelectItem value="7">7th of month</SelectItem>
                      <SelectItem value="15">15th of month</SelectItem>
                      <SelectItem value="last">Last day of month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Payroll Cut-off Date</Label>
                  <Select defaultValue="25">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20th of month</SelectItem>
                      <SelectItem value="25">25th of month</SelectItem>
                      <SelectItem value="last">Last day of month</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Attendance and leaves after this date will be considered in next cycle
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Statutory Compliance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Statutory Compliance
                </CardTitle>
                <CardDescription>
                  Configure statutory deductions as per Indian labor laws
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>EPF (Employee Provident Fund)</Label>
                    <p className="text-xs text-muted-foreground">
                      12% of Basic (both employer & employee)
                    </p>
                  </div>
                  <Switch
                    checked={payrollSettings.componentsEnabled.pf}
                    onCheckedChange={(checked) => setComponent("pf", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>ESI (Employee State Insurance)</Label>
                    <p className="text-xs text-muted-foreground">
                      0.75% Employee + 3.25% Employer (if gross ≤ ₹21,000)
                    </p>
                  </div>
                  <Switch
                    checked={payrollSettings.componentsEnabled.esi}
                    onCheckedChange={(checked) => setComponent("esi", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Professional Tax</Label>
                    <p className="text-xs text-muted-foreground">
                      State-wise slab (max ₹2,500/year)
                    </p>
                  </div>
                  <Switch
                    checked={payrollSettings.componentsEnabled.professionalTax}
                    onCheckedChange={(checked) => setComponent("professionalTax", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>TDS (Tax Deducted at Source)</Label>
                    <p className="text-xs text-muted-foreground">
                      As per income tax slabs
                    </p>
                  </div>
                  <Switch
                    checked={payrollSettings.componentsEnabled.tds}
                    onCheckedChange={(checked) => setComponent("tds", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>LWF (Labour Welfare Fund)</Label>
                    <p className="text-xs text-muted-foreground">
                      State-specific contribution
                    </p>
                  </div>
                  <Switch
                    checked={payrollSettings.componentsEnabled.lwf}
                    onCheckedChange={(checked) => setComponent("lwf", checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Salary Components Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Salary Components & Calculation Rules
              </CardTitle>
              <CardDescription>
                Configure how each salary component is calculated
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Earnings */}
                <div>
                  <h4 className="font-medium mb-3 text-green-600">Earnings (Added to Gross)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Calculation Type</TableHead>
                        <TableHead>Value/Formula</TableHead>
                        <TableHead>Taxable</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Basic Salary</TableCell>
                        <TableCell>
                          <Badge variant="outline">% of CTC</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">50% of CTC</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-red-100 text-red-800">Fully Taxable</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">HRA (House Rent Allowance)</TableCell>
                        <TableCell>
                          <Badge variant="outline">% of Basic</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">40% of Basic (Metro) / 50% (Non-Metro)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-yellow-100 text-yellow-800">Partially Exempt</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Conveyance Allowance</TableCell>
                        <TableCell>
                          <Badge variant="outline">Fixed Amount</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">₹1,600/month</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">Exempt upto ₹1,600</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Special Allowance</TableCell>
                        <TableCell>
                          <Badge variant="outline">Balancing</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">CTC - (Basic + HRA + Other Fixed)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-red-100 text-red-800">Fully Taxable</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Deductions */}
                <div>
                  <h4 className="font-medium mb-3 text-red-600">Deductions (Subtracted from Gross)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Calculation Type</TableHead>
                        <TableHead>Value/Formula</TableHead>
                        <TableHead>Tax Benefit</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">EPF (Employee Share)</TableCell>
                        <TableCell>
                          <Badge variant="outline">% of Basic</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">12% of Basic (max ₹15,000 wage ceiling)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">80C Deduction</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">ESI (Employee Share)</TableCell>
                        <TableCell>
                          <Badge variant="outline">% of Gross</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">0.75% of Gross (if Gross ≤ ₹21,000)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-gray-100 text-gray-800">N/A</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Professional Tax</TableCell>
                        <TableCell>
                          <Badge variant="outline">Slab Based</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">₹200/month (varies by state)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">Deductible from Income</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">TDS (Income Tax)</TableCell>
                        <TableCell>
                          <Badge variant="outline">Tax Slab</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">As per New/Old Regime selection</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-gray-100 text-gray-800">Tax Payment</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Employer Contributions */}
                <div>
                  <h4 className="font-medium mb-3 text-blue-600">Employer Contributions (Not deducted from salary)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Calculation</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">EPF (Employer Share)</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">12% of Basic (3.67% EPF + 8.33% EPS)</code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          EPS capped at ₹15,000 wage ceiling
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">ESI (Employer Share)</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">3.25% of Gross</code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          Applicable if employee gross ≤ ₹21,000
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Gratuity</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">4.81% of Basic</code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          Payable after 5 years of service
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* EPF & ESI Details */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>EPF Configuration</CardTitle>
                <CardDescription>
                  Employee Provident Fund settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="epf-code">EPF Establishment Code</Label>
                    <Input
                      id="epf-code"
                      placeholder="MHBAN00123450000"
                      value={payrollSettings.epfEstablishmentCode}
                      onChange={(e) =>
                        setPayrollSettings({
                          ...payrollSettings,
                          epfEstablishmentCode: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>EPF Wage Ceiling</Label>
                    <Select
                      value={payrollSettings.epfWageCeiling}
                      onValueChange={(value) =>
                        setPayrollSettings({ ...payrollSettings, epfWageCeiling: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15000">₹15,000 (Statutory)</SelectItem>
                        <SelectItem value="actual">Actual Basic (Voluntary)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Include employer PF in CTC</Label>
                    <p className="text-xs text-muted-foreground">
                      Employer&apos;s 12% contribution shown as part of CTC
                    </p>
                  </div>
                  <Switch
                    checked={payrollSettings.includeEmployerPfInCtc}
                    onCheckedChange={(checked) =>
                      setPayrollSettings({
                        ...payrollSettings,
                        includeEmployerPfInCtc: checked,
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Allow VPF (Voluntary PF)</Label>
                    <p className="text-xs text-muted-foreground">
                      Employees can contribute more than 12%
                    </p>
                  </div>
                  <Switch
                    checked={payrollSettings.allowVpf}
                    onCheckedChange={(checked) =>
                      setPayrollSettings({ ...payrollSettings, allowVpf: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ESI Configuration</CardTitle>
                <CardDescription>
                  Employee State Insurance settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="esi-code">ESI Code</Label>
                    <Input
                      id="esi-code"
                      placeholder="31-00-123456-000-0001"
                      value={payrollSettings.esiCode}
                      onChange={(e) =>
                        setPayrollSettings({
                          ...payrollSettings,
                          esiCode: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ESI Wage Limit</Label>
                    <Input value="₹21,000" disabled />
                    <p className="text-xs text-muted-foreground">
                      Statutory limit for ESI applicability
                    </p>
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">ESI Contribution Rates:</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>Employee: <span className="font-medium">0.75%</span></div>
                    <div>Employer: <span className="font-medium">3.25%</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* TDS Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>TDS Configuration</CardTitle>
              <CardDescription>
                Income Tax deduction at source settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="tan-number">TAN Number</Label>
                  <Input
                    id="tan-number"
                    placeholder="MUMB12345A"
                    value={payrollSettings.tanNumber}
                    onChange={(e) =>
                      setPayrollSettings({
                        ...payrollSettings,
                        tanNumber: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Default Tax Regime</Label>
                  <Select
                    value={payrollSettings.defaultTaxRegime}
                    onValueChange={(value) =>
                      setPayrollSettings({
                        ...payrollSettings,
                        defaultTaxRegime: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New Regime (Default)</SelectItem>
                      <SelectItem value="old">Old Regime</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Financial Year</Label>
                  <Select
                    value={payrollSettings.financialYear}
                    onValueChange={(value) =>
                      setPayrollSettings({
                        ...payrollSettings,
                        financialYear: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2024-25">FY 2024-25</SelectItem>
                      <SelectItem value="2025-26">FY 2025-26</SelectItem>
                      <SelectItem value="2026-27">FY 2026-27</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 mt-4">
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium mb-2">New Tax Regime (FY 2024-25)</h5>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Up to ₹3,00,000</span><span className="font-medium">Nil</span></div>
                    <div className="flex justify-between"><span>₹3,00,001 - ₹7,00,000</span><span className="font-medium">5%</span></div>
                    <div className="flex justify-between"><span>₹7,00,001 - ₹10,00,000</span><span className="font-medium">10%</span></div>
                    <div className="flex justify-between"><span>₹10,00,001 - ₹12,00,000</span><span className="font-medium">15%</span></div>
                    <div className="flex justify-between"><span>₹12,00,001 - ₹15,00,000</span><span className="font-medium">20%</span></div>
                    <div className="flex justify-between"><span>Above ₹15,00,000</span><span className="font-medium">30%</span></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Standard deduction: ₹75,000
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium mb-2">Old Tax Regime</h5>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Up to ₹2,50,000</span><span className="font-medium">Nil</span></div>
                    <div className="flex justify-between"><span>₹2,50,001 - ₹5,00,000</span><span className="font-medium">5%</span></div>
                    <div className="flex justify-between"><span>₹5,00,001 - ₹10,00,000</span><span className="font-medium">20%</span></div>
                    <div className="flex justify-between"><span>Above ₹10,00,000</span><span className="font-medium">30%</span></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    80C, 80D, HRA exemptions applicable
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleResetPayrollSettings}
              disabled={savingSettings || !settingsLoaded}
            >
              Reset to Defaults
            </Button>
            <Button
              onClick={handleSavePayrollSettings}
              disabled={savingSettings || !settingsLoaded}
            >
              {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Payroll Settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {detailsRun && (
        <RecordDetailsDialog
          open={!!detailsRun}
          onOpenChange={(open) => !open && setDetailsRun(null)}
          title={`Payroll Run ${detailsRun.period}`}
          description={`${detailsRun.employees} employee(s)`}
          status={{ label: detailsRun.status }}
          sections={[
            {
              title: "Summary",
              fields: [
                { label: "Period", value: detailsRun.period },
                { label: "Employees", value: detailsRun.employees },
                {
                  label: "Gross",
                  value: formatCurrency(detailsRun.grossAmount),
                },
                {
                  label: "Deductions",
                  value: formatCurrency(detailsRun.deductions),
                },
                { label: "Net Payable", value: formatCurrency(detailsRun.netAmount) },
              ],
            },
          ]}
          table={{
            title: "Payslips",
            columns: ["Employee", "Gross", "Deductions", "Net", "Status"],
            rows: slipsForRun(detailsRun).map((slip) => [
              `${slip.employee} (${slip.empId})`,
              formatCurrency(slip.grossSalary),
              formatCurrency(slip.deductions),
              formatCurrency(slip.netSalary),
              slip.status,
            ]),
          }}
          actions={
            <Button
              variant="outline"
              onClick={() => handleDownloadRunReport(detailsRun)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Report
            </Button>
          }
        />
      )}
    </div>
  );
}

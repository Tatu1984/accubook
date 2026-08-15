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
import { Textarea } from "@/frontend/components/ui/textarea";
import { Calendar } from "@/frontend/components/ui/calendar";
import {
  Plus,
  Search,
  Clock,
  Calendar as 
  
  MoreHorizontal,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Timer,
  Coffee,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";







const attendanceStatusColors: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-800",
  ABSENT: "bg-red-100 text-red-800",
  LATE: "bg-yellow-100 text-yellow-800",
  HALF_DAY: "bg-orange-100 text-orange-800",
  ON_LEAVE: "bg-blue-100 text-blue-800",
  HOLIDAY: "bg-purple-100 text-purple-800",
};

const leaveStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

/**
 * Attendance and leave, read from the HR endpoints.
 *
 * All three tables here were hardcoded — invented attendance for invented
 * staff (ATT001 "Rahul Sharma"), invented leave requests, and invented
 * leave balances — alongside five tiles reading 42 / 2 / 1 / 3 / 5. A
 * manager approving leave or checking who was in was reading fiction.
 *
 * Leave balances have no endpoint behind them, so that tab now says so
 * rather than showing numbers nobody computed.
 */
/** Hours between check-in and check-out, when both were recorded. */
function workedHours(checkIn: string | null, checkOut: string | null) {
  if (!checkIn || !checkOut) return "-";
  const [inH, inM] = checkIn.split(":").map(Number);
  const [outH, outM] = checkOut.split(":").map(Number);
  if ([inH, inM, outH, outM].some((n) => Number.isNaN(n))) return "-";
  let mins = outH * 60 + outM - (inH * 60 + inM);
  if (mins < 0) mins += 24 * 60;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

interface AttendanceRow {
  id: string;
  employee: string;
  empId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
}

interface LeaveRow {
  id: string;
  employee: string;
  empId: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
}

export default function AttendancePage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [attendanceData, setAttendanceData] = React.useState<AttendanceRow[]>([]);
  const [leaveRequests, setLeaveRequests] = React.useState<LeaveRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const get = async (path: string) => {
          const r = await fetch(`/api/organizations/${organizationId}/${path}`, { signal: controller.signal });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed to load ${path}`);
          return r.json();
        };
        type Emp = { employeeCode?: string; firstName?: string; lastName?: string | null } | null;
        const name = (e: Emp | undefined) => [e?.firstName, e?.lastName].filter(Boolean).join(" ") || "—";
        const [att, lv] = await Promise.all([get("attendance?limit=200"), get("leaves?limit=200")]);

        type AttRow = { id: string; date: string; checkIn?: string | null; checkOut?: string | null; status: string; employee?: Emp };
        setAttendanceData(((att.data ?? []) as AttRow[]).map((r) => ({
          id: r.id,
          employee: name(r.employee),
          empId: r.employee?.employeeCode ?? "—",
          date: r.date,
          checkIn: r.checkIn ?? null,
          checkOut: r.checkOut ?? null,
          status: r.status,
        })));

        type LvRow = {
          id: string; fromDate: string; toDate: string; days?: number; reason?: string | null;
          status: string; employee?: Emp; leaveType?: { name?: string } | null;
        };
        setLeaveRequests(((lv.data ?? []) as LvRow[]).map((r) => {
          const from = new Date(r.fromDate), to = new Date(r.toDate);
          return {
            id: r.id,
            employee: name(r.employee),
            empId: r.employee?.employeeCode ?? "—",
            type: r.leaveType?.name ?? "Leave",
            startDate: r.fromDate,
            endDate: r.toDate,
            days: r.days ?? Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5) + 1),
            reason: r.reason ?? "",
            status: r.status,
          };
        }));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [organizationId]);

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const todayKey = new Date().toDateString();
  const todaysRows = attendanceData.filter((r) => new Date(r.date).toDateString() === todayKey);
  const countBy = (st: string) => todaysRows.filter((r) => r.status === st).length;
  const todayCounts = {
    total: todaysRows.length,
    PRESENT: countBy("PRESENT"),
    ABSENT: countBy("ABSENT"),
    ON_LEAVE: countBy("ON_LEAVE"),
    LATE: countBy("LATE"),
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Attendance & Leave</h1>
          <p className="text-muted-foreground">
            Track attendance and manage leave requests
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Apply Leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
              <DialogDescription>
                Submit a new leave request
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Casual Leave (9 available)</SelectItem>
                    <SelectItem value="sick">Sick Leave (11 available)</SelectItem>
                    <SelectItem value="earned">Earned Leave (10 available)</SelectItem>
                    <SelectItem value="lop">Loss of Pay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea placeholder="Enter reason for leave..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>Submit Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCounts.PRESENT}</div>
            <p className="text-xs text-muted-foreground">Of {todayCounts.total} marked today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Leave</CardTitle>
            <Coffee className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCounts.ON_LEAVE}</div>
            <p className="text-xs text-muted-foreground">Approved leaves</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absent</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCounts.ABSENT}</div>
            <p className="text-xs text-muted-foreground">Without leave</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Late Arrivals</CardTitle>
            <Timer className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCounts.LATE}</div>
            <p className="text-xs text-muted-foreground">After 9:30 AM</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leaveRequests.filter((l) => l.status === "PENDING").length}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="attendance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="attendance">Daily Attendance</TabsTrigger>
          <TabsTrigger value="leaves">Leave Requests</TabsTrigger>
          <TabsTrigger value="balance">Leave Balance</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Daily Attendance</CardTitle>
                  <CardDescription>
                    Track employee check-in and check-out times
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="date" className="w-[180px]" defaultValue="2024-03-15" />
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search employee..."
                      className="pl-8 w-[200px]"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="icon">
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
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Work Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceData.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{record.employee}</div>
                          <div className="text-sm text-muted-foreground">
                            {record.empId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {record.checkIn ? (
                          <div className="flex items-center">
                            <Clock className="mr-1 h-3 w-3 text-green-600" />
                            {record.checkIn}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {record.checkOut ? (
                          <div className="flex items-center">
                            <Clock className="mr-1 h-3 w-3 text-red-600" />
                            {record.checkOut}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{workedHours(record.checkIn, record.checkOut)}</TableCell>
                      <TableCell>
                        <Badge className={attendanceStatusColors[record.status]}>
                          {record.status.replace("_", " ")}
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
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Clock className="mr-2 h-4 w-4" />
                              Edit Time
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
        </TabsContent>

        <TabsContent value="leaves" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Leave Requests</CardTitle>
                  <CardDescription>
                    Manage employee leave applications
                  </CardDescription>
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveRequests.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{leave.employee}</div>
                          <div className="text-sm text-muted-foreground">
                            {leave.empId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{leave.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(leave.startDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {new Date(leave.endDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{leave.days}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {leave.reason}
                      </TableCell>
                      <TableCell>
                        <Badge className={leaveStatusColors[leave.status]}>
                          {leave.status}
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
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {leave.status === "PENDING" && (
                              <>
                                <DropdownMenuItem className="text-green-600">
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600">
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Reject
                                </DropdownMenuItem>
                              </>
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

        <TabsContent value="balance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Leave Balance</CardTitle>
              <CardDescription>
                Employee leave entitlements and balances
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-center" colSpan={3}>
                      Casual Leave
                    </TableHead>
                    <TableHead className="text-center" colSpan={3}>
                      Sick Leave
                    </TableHead>
                    <TableHead className="text-center" colSpan={3}>
                      Earned Leave
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead className="text-center text-xs">Total</TableHead>
                    <TableHead className="text-center text-xs">Used</TableHead>
                    <TableHead className="text-center text-xs">Balance</TableHead>
                    <TableHead className="text-center text-xs">Total</TableHead>
                    <TableHead className="text-center text-xs">Used</TableHead>
                    <TableHead className="text-center text-xs">Balance</TableHead>
                    <TableHead className="text-center text-xs">Total</TableHead>
                    <TableHead className="text-center text-xs">Used</TableHead>
                    <TableHead className="text-center text-xs">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      Leave balances are not tracked yet — there is no entitlement or
                      accrual data behind this view.
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Calendar</CardTitle>
              <CardDescription>
                Visual overview of attendance patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-8">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="rounded-md border"
                />
                <div className="flex-1">
                  <h3 className="font-medium mb-4">
                    {selectedDate?.toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <span className="text-2xl font-bold">{todayCounts.PRESENT}</span>
                          <span className="text-muted-foreground">Present</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-5 w-5 text-red-600" />
                          <span className="text-2xl font-bold">{todayCounts.ABSENT}</span>
                          <span className="text-muted-foreground">Absent</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                          <Coffee className="h-5 w-5 text-blue-600" />
                          <span className="text-2xl font-bold">{todayCounts.ON_LEAVE}</span>
                          <span className="text-muted-foreground">On Leave</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                          <Timer className="h-5 w-5 text-yellow-600" />
                          <span className="text-2xl font-bold">3</span>
                          <span className="text-muted-foreground">Late</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

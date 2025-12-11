"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Plus,
  Search,
  Clock,
  Calendar as CalendarIcon,
  Users,
  MoreHorizontal,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Timer,
  Coffee,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const attendanceData = [
  {
    id: "ATT001",
    employee: "Rahul Sharma",
    empId: "EMP001",
    date: "2024-03-15",
    checkIn: "09:05",
    checkOut: "18:30",
    workHours: "9h 25m",
    status: "PRESENT",
    overtime: "1h 25m",
  },
  {
    id: "ATT002",
    employee: "Priya Patel",
    empId: "EMP002",
    date: "2024-03-15",
    checkIn: "09:45",
    checkOut: "17:00",
    workHours: "7h 15m",
    status: "LATE",
    overtime: null,
  },
  {
    id: "ATT003",
    employee: "Amit Kumar",
    empId: "EMP003",
    date: "2024-03-15",
    checkIn: null,
    checkOut: null,
    workHours: null,
    status: "ABSENT",
    overtime: null,
  },
  {
    id: "ATT004",
    employee: "Sneha Reddy",
    empId: "EMP004",
    date: "2024-03-15",
    checkIn: "08:55",
    checkOut: "18:00",
    workHours: "9h 5m",
    status: "PRESENT",
    overtime: "1h 5m",
  },
  {
    id: "ATT005",
    employee: "Vikram Singh",
    empId: "EMP005",
    date: "2024-03-15",
    checkIn: "10:30",
    checkOut: null,
    workHours: "Working...",
    status: "HALF_DAY",
    overtime: null,
  },
];

const leaveRequests = [
  {
    id: "LV001",
    employee: "Rahul Sharma",
    empId: "EMP001",
    type: "Casual Leave",
    startDate: "2024-03-20",
    endDate: "2024-03-21",
    days: 2,
    reason: "Personal work",
    status: "PENDING",
    appliedOn: "2024-03-14",
  },
  {
    id: "LV002",
    employee: "Priya Patel",
    empId: "EMP002",
    type: "Sick Leave",
    startDate: "2024-03-18",
    endDate: "2024-03-18",
    days: 1,
    reason: "Not feeling well",
    status: "APPROVED",
    appliedOn: "2024-03-15",
  },
  {
    id: "LV003",
    employee: "Amit Kumar",
    empId: "EMP003",
    type: "Earned Leave",
    startDate: "2024-04-01",
    endDate: "2024-04-05",
    days: 5,
    reason: "Family vacation",
    status: "PENDING",
    appliedOn: "2024-03-10",
  },
  {
    id: "LV004",
    employee: "Sneha Reddy",
    empId: "EMP004",
    type: "Casual Leave",
    startDate: "2024-03-12",
    endDate: "2024-03-12",
    days: 1,
    reason: "Doctor appointment",
    status: "REJECTED",
    appliedOn: "2024-03-11",
  },
];

const leaveBalances = [
  {
    employee: "Rahul Sharma",
    empId: "EMP001",
    casual: { total: 12, used: 3, balance: 9 },
    sick: { total: 12, used: 1, balance: 11 },
    earned: { total: 15, used: 5, balance: 10 },
  },
  {
    employee: "Priya Patel",
    empId: "EMP002",
    casual: { total: 12, used: 5, balance: 7 },
    sick: { total: 12, used: 2, balance: 10 },
    earned: { total: 15, used: 0, balance: 15 },
  },
  {
    employee: "Amit Kumar",
    empId: "EMP003",
    casual: { total: 12, used: 8, balance: 4 },
    sick: { total: 12, used: 3, balance: 9 },
    earned: { total: 15, used: 10, balance: 5 },
  },
];

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

export default function AttendancePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

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
            <div className="text-2xl font-bold">42</div>
            <p className="text-xs text-muted-foreground">Out of 45 employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Leave</CardTitle>
            <Coffee className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2</div>
            <p className="text-xs text-muted-foreground">Approved leaves</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absent</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1</div>
            <p className="text-xs text-muted-foreground">Without leave</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Late Arrivals</CardTitle>
            <Timer className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">After 9:30 AM</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5</div>
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
                    <TableHead>Overtime</TableHead>
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
                      <TableCell>{record.workHours || "-"}</TableCell>
                      <TableCell>
                        {record.overtime ? (
                          <Badge variant="outline" className="bg-green-50">
                            +{record.overtime}
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={attendanceStatusColors[record.status]}>
                          {record.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
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
                            <Button variant="ghost" size="icon">
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
                  {leaveBalances.map((emp) => (
                    <TableRow key={emp.empId}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{emp.employee}</div>
                          <div className="text-sm text-muted-foreground">
                            {emp.empId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{emp.casual.total}</TableCell>
                      <TableCell className="text-center text-red-600">
                        {emp.casual.used}
                      </TableCell>
                      <TableCell className="text-center font-medium text-green-600">
                        {emp.casual.balance}
                      </TableCell>
                      <TableCell className="text-center">{emp.sick.total}</TableCell>
                      <TableCell className="text-center text-red-600">
                        {emp.sick.used}
                      </TableCell>
                      <TableCell className="text-center font-medium text-green-600">
                        {emp.sick.balance}
                      </TableCell>
                      <TableCell className="text-center">{emp.earned.total}</TableCell>
                      <TableCell className="text-center text-red-600">
                        {emp.earned.used}
                      </TableCell>
                      <TableCell className="text-center font-medium text-green-600">
                        {emp.earned.balance}
                      </TableCell>
                    </TableRow>
                  ))}
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
                          <span className="text-2xl font-bold">42</span>
                          <span className="text-muted-foreground">Present</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-5 w-5 text-red-600" />
                          <span className="text-2xl font-bold">1</span>
                          <span className="text-muted-foreground">Absent</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                          <Coffee className="h-5 w-5 text-blue-600" />
                          <span className="text-2xl font-bold">2</span>
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

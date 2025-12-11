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
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  Receipt,
  MoreHorizontal,
  Edit,
  Trash2,
  FileText,
  Calculator,
  Percent,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const taxRates = [
  {
    id: "TAX001",
    name: "GST 18%",
    type: "GST",
    rate: 18,
    cgst: 9,
    sgst: 9,
    igst: 18,
    isActive: true,
    isDefault: true,
  },
  {
    id: "TAX002",
    name: "GST 12%",
    type: "GST",
    rate: 12,
    cgst: 6,
    sgst: 6,
    igst: 12,
    isActive: true,
    isDefault: false,
  },
  {
    id: "TAX003",
    name: "GST 5%",
    type: "GST",
    rate: 5,
    cgst: 2.5,
    sgst: 2.5,
    igst: 5,
    isActive: true,
    isDefault: false,
  },
  {
    id: "TAX004",
    name: "GST 28%",
    type: "GST",
    rate: 28,
    cgst: 14,
    sgst: 14,
    igst: 28,
    isActive: true,
    isDefault: false,
  },
  {
    id: "TAX005",
    name: "GST Exempt",
    type: "GST",
    rate: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    isActive: true,
    isDefault: false,
  },
  {
    id: "TAX006",
    name: "TDS 10%",
    type: "TDS",
    rate: 10,
    cgst: null,
    sgst: null,
    igst: null,
    isActive: true,
    isDefault: false,
  },
  {
    id: "TAX007",
    name: "TDS 2%",
    type: "TDS",
    rate: 2,
    cgst: null,
    sgst: null,
    igst: null,
    isActive: true,
    isDefault: false,
  },
];

const hsnCodes = [
  {
    code: "8471",
    description: "Automatic data processing machines and units",
    gstRate: 18,
    category: "Electronics",
  },
  {
    code: "7308",
    description: "Structures and parts of structures of iron or steel",
    gstRate: 18,
    category: "Metals",
  },
  {
    code: "3926",
    description: "Articles of plastics and articles of other materials",
    gstRate: 18,
    category: "Plastics",
  },
  {
    code: "8544",
    description: "Insulated wire, cable and other insulated electric conductors",
    gstRate: 18,
    category: "Electrical",
  },
  {
    code: "9403",
    description: "Furniture and parts thereof",
    gstRate: 18,
    category: "Furniture",
  },
];

const sacCodes = [
  {
    code: "998311",
    description: "Management consulting and management services",
    gstRate: 18,
    category: "Professional Services",
  },
  {
    code: "998312",
    description: "Business consulting services",
    gstRate: 18,
    category: "Professional Services",
  },
  {
    code: "998313",
    description: "Information technology consulting and support services",
    gstRate: 18,
    category: "IT Services",
  },
  {
    code: "998314",
    description: "IT design and development services",
    gstRate: 18,
    category: "IT Services",
  },
];

export default function TaxesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tax Configuration</h1>
          <p className="text-muted-foreground">
            Configure GST, TDS, and other tax rates
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Tax Rate
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Tax Rate</DialogTitle>
              <DialogDescription>
                Create a new tax rate configuration
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Tax Name</Label>
                <Input placeholder="e.g., GST 18%" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tax Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gst">GST</SelectItem>
                      <SelectItem value="vat">VAT</SelectItem>
                      <SelectItem value="tds">TDS</SelectItem>
                      <SelectItem value="tcs">TCS</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rate (%)</Label>
                  <Input type="number" placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CGST (%)</Label>
                  <Input type="number" placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>SGST (%)</Label>
                  <Input type="number" placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>IGST (%)</Label>
                  <Input type="number" placeholder="0" />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="default" />
                <Label htmlFor="default">Set as default tax rate</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>Save Tax Rate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tax Rates</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">7</div>
            <p className="text-xs text-muted-foreground">GST, TDS, TCS</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">HSN Codes</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">156</div>
            <p className="text-xs text-muted-foreground">For goods</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SAC Codes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">89</div>
            <p className="text-xs text-muted-foreground">For services</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Filing Due</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">GSTR-3B</div>
            <p className="text-xs text-muted-foreground">Due: 20th Mar</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rates">Tax Rates</TabsTrigger>
          <TabsTrigger value="hsn">HSN Codes</TabsTrigger>
          <TabsTrigger value="sac">SAC Codes</TabsTrigger>
          <TabsTrigger value="settings">GST Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tax Rates</CardTitle>
                  <CardDescription>
                    Manage tax rates for invoices and transactions
                  </CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tax rates..."
                    className="pl-8 w-[250px]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxRates.map((tax) => (
                    <TableRow key={tax.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tax.name}</span>
                          {tax.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tax.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {tax.rate}%
                      </TableCell>
                      <TableCell className="text-right">
                        {tax.cgst !== null ? `${tax.cgst}%` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {tax.sgst !== null ? `${tax.sgst}%` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {tax.igst !== null ? `${tax.igst}%` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            tax.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {tax.isActive ? "Active" : "Inactive"}
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
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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

        <TabsContent value="hsn" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>HSN Codes</CardTitle>
                  <CardDescription>
                    Harmonized System of Nomenclature codes for goods
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search HSN codes..."
                      className="pl-8 w-[250px]"
                    />
                  </div>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add HSN
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HSN Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">GST Rate</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hsnCodes.map((hsn) => (
                    <TableRow key={hsn.code}>
                      <TableCell className="font-mono font-medium">
                        {hsn.code}
                      </TableCell>
                      <TableCell>{hsn.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{hsn.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{hsn.gstRate}%</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sac" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>SAC Codes</CardTitle>
                  <CardDescription>
                    Services Accounting Codes for services
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search SAC codes..."
                      className="pl-8 w-[250px]"
                    />
                  </div>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add SAC
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SAC Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">GST Rate</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sacCodes.map((sac) => (
                    <TableRow key={sac.code}>
                      <TableCell className="font-mono font-medium">
                        {sac.code}
                      </TableCell>
                      <TableCell>{sac.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{sac.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{sac.gstRate}%</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>GST Settings</CardTitle>
              <CardDescription>
                Configure GST related settings for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>GSTIN</Label>
                  <Input defaultValue="27DEMO12345A1ZA" />
                </div>
                <div className="space-y-2">
                  <Label>GST Registration Type</Label>
                  <Select defaultValue="regular">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="composition">Composition</SelectItem>
                      <SelectItem value="unregistered">Unregistered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Select defaultValue="MH">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MH">Maharashtra (27)</SelectItem>
                      <SelectItem value="DL">Delhi (07)</SelectItem>
                      <SelectItem value="KA">Karnataka (29)</SelectItem>
                      <SelectItem value="TN">Tamil Nadu (33)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>E-Invoice Applicable</Label>
                  <Select defaultValue="yes">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Reverse Charge Mechanism</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable RCM for applicable purchases
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-apply IGST for inter-state</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically use IGST for transactions outside state
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>E-Way Bill Integration</Label>
                    <p className="text-sm text-muted-foreground">
                      Auto-generate e-way bills for applicable shipments
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
              <div className="flex justify-end">
                <Button>Save Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

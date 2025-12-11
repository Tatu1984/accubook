"use client";

import * as React from "react";
import {
  FileSpreadsheet,
  Loader2,
  Download,
  Calendar,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOrganization } from "@/hooks/use-organization";

const taxReports = [
  {
    title: "GST Summary Report",
    description: "Summary of GST collected and paid",
    icon: FileSpreadsheet,
  },
  {
    title: "GSTR-1 Report",
    description: "Outward supplies report",
    icon: FileSpreadsheet,
  },
  {
    title: "GSTR-2A/2B Reconciliation",
    description: "Input tax credit reconciliation",
    icon: FileSpreadsheet,
  },
  {
    title: "TDS Summary Report",
    description: "Summary of TDS deductions",
    icon: FileSpreadsheet,
  },
  {
    title: "TCS Summary Report",
    description: "Summary of TCS collections",
    icon: FileSpreadsheet,
  },
  {
    title: "Tax Ledger Report",
    description: "All tax transactions",
    icon: FileSpreadsheet,
  },
];

export default function TaxationReportsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(false);
    }
  }, [organizationId]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taxation Reports</h1>
          <p className="text-muted-foreground">
            Generate and download tax-related reports
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {taxReports.map((report) => (
          <Card key={report.title} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <report.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {report.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Filter className="mr-2 h-4 w-4" />
                  Configure
                </Button>
                <Button size="sm" className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  Generate
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

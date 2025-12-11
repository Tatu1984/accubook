"use client";

import * as React from "react";
import {
  FileText,
  Loader2,
  Plus,
  Settings,
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

export default function CustomReportsPage() {
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
          <h1 className="text-2xl font-bold tracking-tight">Custom Reports</h1>
          <p className="text-muted-foreground">
            Create and manage custom reports
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Report
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No custom reports</h3>
            <p className="text-muted-foreground mb-4">
              Create custom reports tailored to your needs
            </p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

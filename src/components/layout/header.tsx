"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Bell, Search, Building, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface Branch {
  id: string;
  name: string;
  code: string;
  isHeadOffice: boolean;
}

export function Header() {
  const { data: session, update } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  const organizationId = session?.user?.organizationId;
  const currentBranchId = session?.user?.branchId;

  useEffect(() => {
    if (!organizationId) return;

    const fetchBranches = async () => {
      try {
        const response = await fetch(`/api/organizations/${organizationId}/branches`);
        if (response.ok) {
          const data = await response.json();
          setBranches(data);
        }
      } catch (error) {
        console.error("Error fetching branches:", error);
      }
    };

    fetchBranches();
  }, [organizationId]);

  const handleBranchSwitch = async (branch: Branch) => {
    if (branch.id === currentBranchId) return;

    setLoading(true);
    try {
      // Update the session with new branch info
      await update({
        branchId: branch.id,
        branchName: branch.name,
      });
      // Reload the page to refresh all data for the new branch
      window.location.reload();
    } catch (error) {
      console.error("Error switching branch:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />

        {/* Breadcrumb / Current Location */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {session?.user?.organizationName || "Dashboard"}
          </span>
          {session?.user?.branchName && (
            <>
              <span>/</span>
              <span>{session.user.branchName}</span>
            </>
          )}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md ml-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search transactions, parties, items..."
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Branch Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" disabled={loading}>
              <Building className="h-4 w-4" />
              <span className="hidden sm:inline-block max-w-[100px] truncate">
                {session?.user?.branchName || "Select Branch"}
              </span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Switch Branch</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {branches.length === 0 ? (
              <DropdownMenuItem disabled>No branches found</DropdownMenuItem>
            ) : (
              branches.map((branch) => (
                <DropdownMenuItem
                  key={branch.id}
                  onClick={() => handleBranchSwitch(branch)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    <span>{branch.name}</span>
                    {branch.isHeadOffice && (
                      <Badge variant="outline" className="text-xs">
                        HQ
                      </Badge>
                    )}
                  </div>
                  {branch.id === currentBranchId && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
                3
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs">
                Mark all read
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="font-medium text-sm">Invoice Payment Due</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">
                  INV-2024-001 payment is due tomorrow
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="font-medium text-sm">Low Stock Alert</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">
                  5 items are below reorder level
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-medium text-sm">Approval Required</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">
                  Purchase Order PO-2024-045 needs approval
                </span>
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center text-sm">
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

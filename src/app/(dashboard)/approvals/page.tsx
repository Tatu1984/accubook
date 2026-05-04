"use client";

import * as React from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Inbox,
  History,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
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
} from "@/frontend/components/ui/dialog";
import { Label } from "@/frontend/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import { useOrganization } from "@/frontend/hooks/use-organization";

type Approval = {
  id: string;
  entityType: string;
  entityId: string;
  stepNumber: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  comments: string | null;
  approvedAt: string | null;
  createdAt: string;
  requester: { id: string; name: string; email: string };
  approver?: { id: string; name: string };
};

const STATUS_STYLE: Record<Approval["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default function ApprovalsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();

  if (orgLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!organizationId) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground">
          Vouchers and other entities that need your sign-off live here. Approve
          or reject — you cannot edit; the requester does that.
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            <Inbox className="mr-2 h-4 w-4" />
            Pending (your queue)
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <PendingPanel orgId={organizationId} />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HistoryPanel orgId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PendingPanel({ orgId }: { orgId: string }) {
  const [data, setData] = React.useState<Approval[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<{ approval: Approval; action: "APPROVE" | "REJECT" } | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/approvals?view=pending&limit=100`,
        { cache: "no-store" }
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed");
      setData(body.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Awaiting your decision</CardTitle>
          <CardDescription>
            Sorted newest first. Click Approve or Reject to action; you can add a
            comment that&apos;s visible to the requester.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <Empty message="Loading…" />}
          {error && <ErrorBanner message={error} />}
          {!loading && !error && data && data.length === 0 && (
            <Empty message="Inbox zero. Nothing's waiting on you." />
          )}
          {!loading && !error && data && data.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(a.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">{a.entityType}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {a.entityId.slice(0, 12)}…
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">#{a.stepNumber}</TableCell>
                      <TableCell>
                        <div>{a.requester.name}</div>
                        <div className="text-xs text-muted-foreground">{a.requester.email}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                            onClick={() => setActing({ approval: a, action: "APPROVE" })}
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/20"
                            onClick={() => setActing({ approval: a, action: "REJECT" })}
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {acting && (
        <ActionDialog
          orgId={orgId}
          approval={acting.approval}
          action={acting.action}
          onClose={() => setActing(null)}
          onDone={() => {
            setActing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function HistoryPanel({ orgId }: { orgId: string }) {
  const [data, setData] = React.useState<Approval[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/organizations/${orgId}/approvals?view=history&limit=100`,
          { cache: "no-store" }
        );
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(body.error ?? "Failed");
        setData(body.data ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Past approvals</CardTitle>
        <CardDescription>
          Where you were either the approver or the requester. Useful for
          tracking what you signed off on last quarter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <Empty message="Loading…" />}
        {error && <ErrorBanner message={error} />}
        {!loading && !error && data && data.length === 0 && (
          <Empty message="No past approvals yet." />
        )}
        {!loading && !error && data && data.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decided</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Comments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {a.approvedAt ? new Date(a.approvedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[a.status]}`}>
                        {a.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{a.entityType}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {a.entityId.slice(0, 12)}…
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">#{a.stepNumber}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.comments ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionDialog({
  orgId,
  approval,
  action,
  onClose,
  onDone,
}: {
  orgId: string;
  approval: Approval;
  action: "APPROVE" | "REJECT";
  onClose: () => void;
  onDone: () => void;
}) {
  const [comments, setComments] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isReject = action === "REJECT";

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/organizations/${orgId}/approvals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId: approval.id,
          action,
          comments: comments || undefined,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReject ? "Reject" : "Approve"} {approval.entityType.toLowerCase()}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              ({approval.entityId.slice(0, 8)}…)
            </span>
          </DialogTitle>
          <DialogDescription>
            Requested by {approval.requester.name}. Step #{approval.stepNumber}.
            {isReject &&
              " Reject sends it back to the requester; they can edit and re-submit."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="comments" className="text-xs">
            Comments {isReject && "(recommended — explain why)"}
          </Label>
          <textarea
            id="comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={
              isReject
                ? "e.g. Vendor isn't on the approved list — please check with procurement."
                : "Optional note for the requester."
            }
          />
          {error && <ErrorBanner message={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className={
              isReject
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReject ? "Reject" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
      <Inbox className="mb-3 h-8 w-8 opacity-50" />
      <span>{message}</span>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Client side of `POST /api/organizations/[orgId]/reports/export`.
 *
 * The report screens each had an Export button with no handler, while the
 * endpoint that renders these statements as CSV / XLSX / JSON already existed.
 * This posts to it and hands the resulting file to the browser.
 */

export type ReportType =
  | "trial-balance"
  | "profit-loss"
  | "balance-sheet"
  | "cash-flow"
  | "aging"
  | "invoices"
  | "bills"
  | "ledger";

export type ExportFormat = "xlsx" | "csv" | "json";

export async function exportReport(
  organizationId: string,
  reportType: ReportType,
  filters: Record<string, string> = {},
  format: ExportFormat = "xlsx"
): Promise<void> {
  const response = await fetch(
    `/api/organizations/${organizationId}/reports/export`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportType, format, filters }),
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Failed to export ${reportType}`);
  }

  const blob = await response.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const extension = format === "xlsx" ? "xlsx" : format;

  // Prefer the filename the server set, if it sent one.
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"';]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? `${reportType}-${stamp}.${extension}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

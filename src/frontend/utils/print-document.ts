/**
 * Printing / "Save as PDF" for documents rendered from data already on screen.
 *
 * Everything is written into a same-origin hidden iframe rather than a popup:
 * `window.open` is blocked by default in most browsers when it is not the
 * direct result of a trusted click on a link, which made popup-based printing
 * fail silently. The iframe is removed once the print dialog closes.
 */

export interface PrintField {
  label: string;
  value: string | number | null | undefined;
}

export interface PrintTable {
  columns: string[];
  rows: (string | number | null | undefined)[][];
}

export interface PrintDocumentOptions {
  /** Document heading, e.g. "Tax Invoice". */
  title: string;
  /** Usually the document number. */
  subtitle?: string;
  /** Organization / issuer name printed at the top. */
  issuer?: string;
  /** Key-value blocks printed above the table. */
  fields?: PrintField[];
  /** Optional line-item table. */
  table?: PrintTable;
  /** Totals printed under the table. */
  totals?: PrintField[];
  /** Images (e.g. generated barcodes) printed as a grid. */
  images?: { src: string; caption?: string }[];
  /** Free text printed at the bottom (terms, notes). */
  notes?: string | null;
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFields(fields: PrintField[]): string {
  return fields
    .filter((f) => f.value !== null && f.value !== undefined && f.value !== "")
    .map(
      (f) => `
        <div class="field">
          <span class="field-label">${escapeHtml(f.label)}</span>
          <span class="field-value">${escapeHtml(f.value)}</span>
        </div>`
    )
    .join("");
}

function renderTable(table: PrintTable): string {
  const head = table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = table.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
    )
    .join("");
  return `
    <table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderImages(images: NonNullable<PrintDocumentOptions["images"]>): string {
  return `<div class="images">${images
    .map(
      (img) => `
        <figure>
          <img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.caption ?? "")}" />
          ${img.caption ? `<figcaption>${escapeHtml(img.caption)}</figcaption>` : ""}
        </figure>`
    )
    .join("")}</div>`;
}

function buildHtml(options: PrintDocumentOptions): string {
  const { title, subtitle, issuer, fields, table, totals, images, notes } = options;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(subtitle ? `${title} ${subtitle}` : title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #111827;
        margin: 32px;
        font-size: 12px;
      }
      header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 20px; }
      .issuer { font-size: 16px; font-weight: 700; }
      h1 { font-size: 20px; margin: 4px 0 0; }
      .subtitle { color: #6b7280; margin-top: 2px; }
      .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 24px; margin-bottom: 20px; }
      .field { display: flex; gap: 8px; }
      .field-label { color: #6b7280; min-width: 120px; }
      .field-value { font-weight: 500; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
      th { background: #f3f4f6; font-weight: 600; }
      .totals { margin-left: auto; width: 280px; }
      .totals .field { justify-content: space-between; padding: 3px 0; }
      .images { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
      .images figure { margin: 0; text-align: center; page-break-inside: avoid; }
      .images img { max-width: 240px; }
      .images figcaption { font-size: 10px; color: #6b7280; margin-top: 4px; }
      .notes { margin-top: 24px; white-space: pre-wrap; color: #374151; }
      footer { margin-top: 32px; color: #9ca3af; font-size: 10px; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <header>
      ${issuer ? `<div class="issuer">${escapeHtml(issuer)}</div>` : ""}
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
    </header>
    ${fields && fields.length > 0 ? `<div class="fields">${renderFields(fields)}</div>` : ""}
    ${images && images.length > 0 ? renderImages(images) : ""}
    ${table && table.rows.length > 0 ? renderTable(table) : ""}
    ${totals && totals.length > 0 ? `<div class="totals">${renderFields(totals)}</div>` : ""}
    ${notes ? `<div class="notes">${escapeHtml(notes)}</div>` : ""}
    <footer>Generated on ${escapeHtml(new Date().toLocaleString("en-IN"))}</footer>
  </body>
</html>`;
}

/** Render `options` into a printable document and open the browser print dialog. */
export function printDocument(options: PrintDocumentOptions): void {
  if (typeof window === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error("Unable to open the print view");
  }

  doc.open();
  doc.write(buildHtml(options));
  doc.close();

  const cleanup = () => {
    // Give the print dialog a moment to take its snapshot before teardown.
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  const run = () => {
    // Printing before embedded images have decoded produces blank boxes,
    // so wait for them (with a ceiling so a broken image can't hang the print).
    const imgs = Array.from(doc.images ?? []);
    const pending = imgs.filter((img) => !img.complete);
    const printNow = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        cleanup();
      }
    };

    if (pending.length === 0) {
      printNow();
      return;
    }

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      printNow();
    };
    let remaining = pending.length;
    pending.forEach((img) => {
      const onSettle = () => {
        remaining -= 1;
        if (remaining === 0) done();
      };
      img.addEventListener("load", onSettle, { once: true });
      img.addEventListener("error", onSettle, { once: true });
    });
    window.setTimeout(done, 3000);
  };

  if (doc.readyState === "complete") {
    run();
  } else {
    iframe.onload = run;
  }
}

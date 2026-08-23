import { z } from "zod";

/**
 * The shape a scanned document is read into — this system's own invoice/bill
 * vocabulary, not the extractor's.
 *
 * Every field is optional and every number is loose: a phone photo of a
 * handwritten challan may yield a party name and nothing else, and a reading
 * that refuses to parse is worse than a partial one a human can finish. The
 * strictness lives at the confirm step, where this turns into a real Bill or
 * Invoice and the existing validators apply in full.
 *
 * Kept in one place because three things must agree on it: the JSON schema the
 * model is constrained to, the review form's fields, and the mapper that posts
 * a confirmed document.
 */

export const DOC_TYPES = [
  "PURCHASE_BILL",
  "SALES_INVOICE",
  "PAYMENT_VOUCHER",
  "RECEIPT",
  "UNKNOWN",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DIRECTIONS = ["INCOMING", "OUTGOING"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const extractedLineSchema = z.object({
  description: z.string().nullable().optional(),
  hsnCode: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  discountPercent: z.number().nullable().optional(),
  taxRate: z.number().nullable().optional(),
  taxAmount: z.number().nullable().optional(),
  amount: z.number().nullable().optional(),
});

export const extractedDocumentSchema = z.object({
  docType: z.enum(DOC_TYPES).default("UNKNOWN"),
  direction: z.enum(DIRECTIONS).nullable().optional(),

  /** The other party — vendor on a purchase bill, customer on a sales invoice. */
  partyName: z.string().nullable().optional(),
  partyGstin: z.string().nullable().optional(),
  partyPan: z.string().nullable().optional(),
  partyAddress: z.string().nullable().optional(),
  partyState: z.string().nullable().optional(),
  partyPhone: z.string().nullable().optional(),
  partyEmail: z.string().nullable().optional(),

  documentNumber: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  poNumber: z.string().nullable().optional(),

  placeOfSupply: z.string().nullable().optional(),
  reverseCharge: z.boolean().nullable().optional(),

  currency: z.string().nullable().optional(),
  subtotal: z.number().nullable().optional(),
  discountAmount: z.number().nullable().optional(),
  cgstAmount: z.number().nullable().optional(),
  sgstAmount: z.number().nullable().optional(),
  igstAmount: z.number().nullable().optional(),
  cessAmount: z.number().nullable().optional(),
  roundOff: z.number().nullable().optional(),
  totalAmount: z.number().nullable().optional(),
  amountInWords: z.string().nullable().optional(),

  paymentMode: z.string().nullable().optional(),
  paymentReference: z.string().nullable().optional(),

  notes: z.string().nullable().optional(),
  lines: z.array(extractedLineSchema).default([]),
});

export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;
export type ExtractedLine = z.infer<typeof extractedLineSchema>;

/** 0–1 per field, same keys as the document. Absent means "not asserted". */
export type FieldConfidence = Partial<Record<keyof ExtractedDocument, number>> & {
  overall?: number;
};

/**
 * JSON Schema handed to the model, kept deliberately flat and free of
 * constraints the structured-output validator rejects (no min/max, no
 * formats). Nullable rather than absent: a model that must emit every key is
 * far less likely to quietly drop one it was unsure about.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    docType: { type: "string", enum: [...DOC_TYPES] },
    direction: { type: ["string", "null"], enum: [...DIRECTIONS, null] },
    partyName: { type: ["string", "null"] },
    partyGstin: { type: ["string", "null"] },
    partyPan: { type: ["string", "null"] },
    partyAddress: { type: ["string", "null"] },
    partyState: { type: ["string", "null"] },
    partyPhone: { type: ["string", "null"] },
    partyEmail: { type: ["string", "null"] },
    documentNumber: { type: ["string", "null"] },
    documentDate: { type: ["string", "null"] },
    dueDate: { type: ["string", "null"] },
    poNumber: { type: ["string", "null"] },
    placeOfSupply: { type: ["string", "null"] },
    reverseCharge: { type: ["boolean", "null"] },
    currency: { type: ["string", "null"] },
    subtotal: { type: ["number", "null"] },
    discountAmount: { type: ["number", "null"] },
    cgstAmount: { type: ["number", "null"] },
    sgstAmount: { type: ["number", "null"] },
    igstAmount: { type: ["number", "null"] },
    cessAmount: { type: ["number", "null"] },
    roundOff: { type: ["number", "null"] },
    totalAmount: { type: ["number", "null"] },
    amountInWords: { type: ["string", "null"] },
    paymentMode: { type: ["string", "null"] },
    paymentReference: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: ["string", "null"] },
          hsnCode: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          unitPrice: { type: ["number", "null"] },
          discountPercent: { type: ["number", "null"] },
          taxRate: { type: ["number", "null"] },
          taxAmount: { type: ["number", "null"] },
          amount: { type: ["number", "null"] },
        },
        required: [
          "description",
          "hsnCode",
          "quantity",
          "unit",
          "unitPrice",
          "discountPercent",
          "taxRate",
          "taxAmount",
          "amount",
        ],
      },
    },
    fieldConfidence: {
      type: "object",
      additionalProperties: false,
      description:
        "0-1 confidence for the fields you were least sure of. Omit a field you read cleanly.",
      properties: {
        partyName: { type: ["number", "null"] },
        partyGstin: { type: ["number", "null"] },
        documentNumber: { type: ["number", "null"] },
        documentDate: { type: ["number", "null"] },
        totalAmount: { type: ["number", "null"] },
        lines: { type: ["number", "null"] },
        overall: { type: ["number", "null"] },
      },
      required: [],
    },
  },
  required: [
    "docType",
    "direction",
    "partyName",
    "documentNumber",
    "documentDate",
    "totalAmount",
    "lines",
  ],
} as const;

/**
 * An empty reading — what a free extractor returns when it found a file it
 * cannot read at all, so the review screen still opens with the original on
 * one side and a blank form on the other.
 */
export function emptyDocument(): ExtractedDocument {
  return extractedDocumentSchema.parse({ docType: "UNKNOWN", lines: [] });
}

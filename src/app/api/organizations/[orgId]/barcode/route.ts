import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { z } from "zod";
import * as bwipjs from "bwip-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supported barcode formats
const BARCODE_FORMATS = [
  "code128",      // General purpose, alphanumeric
  "ean13",        // European Article Number (13 digits)
  "ean8",         // European Article Number (8 digits)
  "upca",         // Universal Product Code (12 digits)
  "upce",         // UPC-E (8 digits, compressed)
  "code39",       // Code 39, alphanumeric
  "code93",       // Code 93, alphanumeric
  "interleaved2of5", // ITF, numeric pairs
  "qrcode",       // QR Code
  "datamatrix",   // Data Matrix
  "pdf417",       // PDF417 2D barcode
] as const;

const generateBarcodeSchema = z.object({
  text: z.string().min(1, "Barcode text is required"),
  format: z.enum(BARCODE_FORMATS).default("code128"),
  width: z.number().min(50).max(500).default(200),
  height: z.number().min(20).max(200).default(80),
  scale: z.number().min(1).max(10).default(3),
  includeText: z.boolean().default(true),
  textSize: z.number().min(6).max(24).default(10),
});

const bulkGenerateSchema = z.object({
  items: z.array(z.object({
    id: z.string().optional(),
    text: z.string().min(1),
    label: z.string().optional(),
  })),
  format: z.enum(BARCODE_FORMATS).default("code128"),
  width: z.number().min(50).max(500).default(200),
  height: z.number().min(20).max(200).default(80),
  includeText: z.boolean().default(true),
});

// Generate a unique SKU/barcode number if not provided
function generateBarcodeNumber(prefix: string = "PRD"): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

// Validate barcode format requirements
function validateBarcodeText(text: string, format: string): { valid: boolean; error?: string } {
  switch (format) {
    case "ean13":
      if (!/^\d{12,13}$/.test(text)) {
        return { valid: false, error: "EAN-13 requires 12-13 numeric digits" };
      }
      break;
    case "ean8":
      if (!/^\d{7,8}$/.test(text)) {
        return { valid: false, error: "EAN-8 requires 7-8 numeric digits" };
      }
      break;
    case "upca":
      if (!/^\d{11,12}$/.test(text)) {
        return { valid: false, error: "UPC-A requires 11-12 numeric digits" };
      }
      break;
    case "upce":
      if (!/^\d{6,8}$/.test(text)) {
        return { valid: false, error: "UPC-E requires 6-8 numeric digits" };
      }
      break;
    case "interleaved2of5":
      if (!/^\d+$/.test(text) || text.length % 2 !== 0) {
        return { valid: false, error: "ITF requires even number of digits" };
      }
      break;
    case "code39":
      if (!/^[A-Z0-9\-. $/+%]+$/i.test(text)) {
        return { valid: false, error: "Code 39 only supports A-Z, 0-9, and -. $/+%" };
      }
      break;
  }
  return { valid: true };
}

// Calculate EAN/UPC check digit
function calculateCheckDigit(code: string, type: "ean13" | "ean8" | "upca"): string {
  const digits = code.split("").map(Number);
  let sum = 0;

  if (type === "ean13" || type === "upca") {
    for (let i = 0; i < digits.length; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
  } else if (type === "ean8") {
    for (let i = 0; i < digits.length; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "formats";
    const itemId = searchParams.get("itemId");

    if (view === "formats") {
      // Return supported barcode formats
      return NextResponse.json({
        formats: [
          { code: "code128", name: "Code 128", description: "General purpose, alphanumeric", example: "ABC123XYZ" },
          { code: "ean13", name: "EAN-13", description: "European Article Number (retail)", example: "590123412345" },
          { code: "ean8", name: "EAN-8", description: "Short EAN (small products)", example: "9638507" },
          { code: "upca", name: "UPC-A", description: "Universal Product Code (US/Canada)", example: "01234567890" },
          { code: "upce", name: "UPC-E", description: "Compressed UPC", example: "0123456" },
          { code: "code39", name: "Code 39", description: "Industrial, alphanumeric", example: "CODE-39" },
          { code: "code93", name: "Code 93", description: "Compact alphanumeric", example: "CODE93" },
          { code: "interleaved2of5", name: "ITF", description: "Numeric, used in logistics", example: "12345678" },
          { code: "qrcode", name: "QR Code", description: "2D code, high capacity", example: "https://example.com" },
          { code: "datamatrix", name: "Data Matrix", description: "2D code, small items", example: "DM12345" },
          { code: "pdf417", name: "PDF417", description: "2D code, documents/IDs", example: "PDF417DATA" },
        ],
        defaultFormat: "code128",
        tips: [
          "Use EAN-13 or UPC-A for retail products",
          "Code 128 is versatile for internal use",
          "QR codes can store URLs, contact info, etc.",
          "ITF is common for shipping cartons",
        ],
      });
    }

    if (view === "items") {
      // Get items without barcodes or with barcodes
      const withBarcode = searchParams.get("withBarcode") === "true";

      const items = await prisma.item.findMany({
        where: {
          organizationId: orgId,
          ...(withBarcode ? { barcode: { not: null } } : { OR: [{ barcode: null }, { barcode: "" }] }),
        },
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          type: true,
          category: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      });

      return NextResponse.json({
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          type: item.type,
          category: item.category?.name,
        })),
        total: items.length,
      });
    }

    if (view === "generate" && itemId) {
      // Generate barcode for a specific item
      const item = await prisma.item.findFirst({
        where: { id: itemId, organizationId: orgId },
        select: { id: true, name: true, sku: true, barcode: true },
      });

      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      const barcodeText = item.barcode || item.sku || generateBarcodeNumber();
      const format = searchParams.get("format") || "code128";
      const width = parseInt(searchParams.get("width") || "200");
      const height = parseInt(searchParams.get("height") || "80");

      try {
        const png = await bwipjs.toBuffer({
          bcid: format,
          text: barcodeText,
          scale: 3,
          height: Math.round(height / 3),
          includetext: true,
          textxalign: "center",
        });

        // Return as base64 data URL
        const base64 = png.toString("base64");
        return NextResponse.json({
          itemId: item.id,
          itemName: item.name,
          barcodeText,
          format,
          image: `data:image/png;base64,${base64}`,
        });
      } catch (barcodeError) {
        return NextResponse.json({
          error: "Failed to generate barcode",
          details: barcodeError instanceof Error ? barcodeError.message : "Unknown error",
        }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { action = "generate" } = body;

    if (action === "generate") {
      const validationResult = generateBarcodeSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const { text, format, height, scale, includeText, textSize } = validationResult.data;

      // Validate text for specific formats
      const validation = validateBarcodeText(text, format);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      try {
        const png = await bwipjs.toBuffer({
          bcid: format,
          text,
          scale,
          height: Math.round(height / scale),
          includetext: includeText,
          textxalign: "center",
          textsize: textSize,
        });

        const base64 = png.toString("base64");
        return NextResponse.json({
          format,
          text,
          outputFormat: "png",
          image: `data:image/png;base64,${base64}`,
        });
      } catch (barcodeError) {
        return NextResponse.json({
          error: "Failed to generate barcode",
          details: barcodeError instanceof Error ? barcodeError.message : "Unknown error",
        }, { status: 400 });
      }
    }

    if (action === "bulk-generate") {
      const validationResult = bulkGenerateSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const { items, format, width, height, includeText } = validationResult.data;
      const results = [];

      for (const item of items) {
        try {
          const png = await bwipjs.toBuffer({
            bcid: format,
            text: item.text,
            scale: 3,
            height: Math.round(height / 3),
            includetext: includeText,
            textxalign: "center",
          });

          const base64 = png.toString("base64");
          results.push({
            id: item.id,
            text: item.text,
            label: item.label,
            success: true,
            image: `data:image/png;base64,${base64}`,
          });
        } catch (err) {
          results.push({
            id: item.id,
            text: item.text,
            label: item.label,
            success: false,
            error: err instanceof Error ? err.message : "Generation failed",
          });
        }
      }

      return NextResponse.json({
        total: items.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      });
    }

    if (action === "assign-to-item") {
      const { itemId, barcode, autoGenerate } = body;

      if (!itemId) {
        return NextResponse.json({ error: "Item ID required" }, { status: 400 });
      }

      const item = await prisma.item.findFirst({
        where: { id: itemId, organizationId: orgId },
      });

      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      let barcodeValue = barcode;
      if (autoGenerate || !barcode) {
        barcodeValue = generateBarcodeNumber();
      }

      const updatedItem = await prisma.item.update({
        where: { id: itemId },
        data: { barcode: barcodeValue },
        select: { id: true, name: true, sku: true, barcode: true },
      });

      return NextResponse.json({
        message: "Barcode assigned successfully",
        item: updatedItem,
      });
    }

    if (action === "bulk-assign") {
      const { itemIds, prefix } = body;

      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return NextResponse.json({ error: "Item IDs required" }, { status: 400 });
      }

      const results = [];
      for (const itemId of itemIds) {
        const item = await prisma.item.findFirst({
          where: { id: itemId, organizationId: orgId },
        });

        if (!item) {
          results.push({ itemId, success: false, error: "Not found" });
          continue;
        }

        if (item.barcode) {
          results.push({ itemId, success: false, error: "Already has barcode" });
          continue;
        }

        const barcodeValue = generateBarcodeNumber(prefix || "PRD");
        await prisma.item.update({
          where: { id: itemId },
          data: { barcode: barcodeValue },
        });

        results.push({ itemId, success: true, barcode: barcodeValue });
      }

      return NextResponse.json({
        message: "Bulk assignment completed",
        total: itemIds.length,
        successful: results.filter(r => r.success).length,
        results,
      });
    }

    if (action === "generate-ean13") {
      // Generate a valid EAN-13 with check digit
      const { countryCode = "590", companyCode, productCode } = body;

      if (!companyCode || !productCode) {
        return NextResponse.json({
          error: "Company code and product code required",
          example: { countryCode: "590", companyCode: "12345", productCode: "6789" },
        }, { status: 400 });
      }

      const baseCode = `${countryCode}${companyCode}${productCode}`.substring(0, 12).padEnd(12, "0");
      const ean13 = calculateCheckDigit(baseCode, "ean13");

      try {
        const png = await bwipjs.toBuffer({
          bcid: "ean13",
          text: ean13,
          scale: 3,
          height: 25,
          includetext: true,
          textxalign: "center",
        });

        const base64 = png.toString("base64");
        return NextResponse.json({
          ean13,
          checkDigit: ean13.charAt(12),
          image: `data:image/png;base64,${base64}`,
        });
      } catch (err) {
        return NextResponse.json({
          ean13,
          checkDigit: ean13.charAt(12),
          error: "Image generation failed",
        });
      }
    }

    if (action === "print-labels") {
      // Generate print-ready label data
      const { items, labelSize = "standard", columns = 3, rows = 10 } = body;

      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "Items required" }, { status: 400 });
      }

      const labelSizes = {
        small: { width: 100, height: 50 },
        standard: { width: 150, height: 80 },
        large: { width: 200, height: 100 },
      };

      const size = labelSizes[labelSize as keyof typeof labelSizes] || labelSizes.standard;
      const labels = [];

      for (const item of items) {
        try {
          const png = await bwipjs.toBuffer({
            bcid: item.format || "code128",
            text: item.barcode || item.sku || item.text,
            scale: 2,
            height: 20,
            includetext: true,
            textxalign: "center",
          });

          labels.push({
            id: item.id,
            name: item.name,
            sku: item.sku,
            barcode: item.barcode || item.sku || item.text,
            price: item.price,
            image: `data:image/png;base64,${png.toString("base64")}`,
            copies: item.copies || 1,
          });
        } catch (err) {
          labels.push({
            id: item.id,
            name: item.name,
            error: "Failed to generate barcode",
          });
        }
      }

      return NextResponse.json({
        labelSize: size,
        layout: { columns, rows, labelsPerPage: columns * rows },
        labels,
        totalLabels: labels.reduce((sum, l) => sum + (l.copies || 1), 0),
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

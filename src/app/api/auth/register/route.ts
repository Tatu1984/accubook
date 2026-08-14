import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import bcrypt from "bcryptjs";
import { logger } from "@/backend/utils/logger";
import {
  checkRateLimit,
  clientIpFromHeaders,
  rateLimited,
} from "@/backend/utils/rate-limit";
import {
  provisionOrganization,
  ensureBaseCurrency,
} from "@/backend/services/organization/provision";
import { getOrCreateAdminRoleId } from "@/backend/services/organization/roles";

const registerSchema = z.object({
  // User details
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  phone: optional(z.string()),
  password: z.string().min(8, "Password must be at least 8 characters"),

  // Organization details
  companyName: z.string().min(1, "Company name is required"),
  gstin: optional(z.string()),
  country: z.string().default("IN"),
});

export async function POST(request: NextRequest) {
  try {
    // Rate-limit before parsing — drops abusive traffic with no DB work.
    // 5 registrations per IP per 10 minutes is generous for human use,
    // tight enough to slow scripted enumeration.
    const ip = clientIpFromHeaders(request.headers);
    const rl = await checkRateLimit({
      key: `register:ip:${ip}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.allowed) {
      return rateLimited(rl, "Too many registration attempts. Try again later.") as unknown as NextResponse;
    }

    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      // Generic response to prevent email enumeration. Combined with
      // rate limiting on /api/auth/* (planned), this prevents account discovery.
      return NextResponse.json(
        { error: "Registration could not be completed. Please try a different email or contact support if you already have an account." },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Create user, organization in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // The system roles are normally created by the seed, which refuses
      // to run against production — so on a fresh production database
      // this used to 500 with "System not configured" and there was no
      // way to register the first account. Create them on demand instead.
      const adminRoleId = await getOrCreateAdminRoleId(tx);

      // Create user
      const user = await tx.user.create({
        data: {
          name: `${validatedData.firstName} ${validatedData.lastName}`,
          email: validatedData.email,
          phone: validatedData.phone,
          passwordHash: hashedPassword,
        },
      });

      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: validatedData.companyName,
          gstNo: validatedData.gstin,
          country: validatedData.country,
          fiscalYearStart: 4, // April (month number)
        },
      });

      // Link user to organization with admin role
      await tx.organizationUser.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          roleId: adminRoleId,
          isActive: true,
        },
      });

      // Chart of accounts, default ledgers, fiscal year, head-office
      // branch and default warehouse — the same definition the seed uses.
      //
      // This used to be a hand-rolled list of ledger groups that omitted
      // "Cash & Bank", "Sundry Debtors", "Sundry Creditors" and "Duties &
      // Taxes", all of which the posting layer resolves by name. The
      // result was a tenant that looked fine until the first payment,
      // which failed with a 500. Both paths now share one definition so
      // they cannot drift again.
      await provisionOrganization(tx, {
        organizationId: organization.id,
        fiscalYearStartMonth: 4,
      });

      // Base currency, so amounts render and reports have a unit.
      await ensureBaseCurrency(tx, organization.id, "INR");

      return { user, organization };
    });

    return NextResponse.json(
      {
        message: "Registration successful",
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
        },
        organization: {
          id: result.organization.id,
          name: result.organization.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Registration error");
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}

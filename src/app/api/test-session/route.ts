import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("authjs.session-token")?.value
      || cookieStore.get("__Secure-authjs.session-token")?.value;

    console.log("Test Session - Cookie exists:", !!sessionCookie);

    const session = await auth();
    console.log("Test Session - Auth result:", JSON.stringify(session, null, 2));

    return NextResponse.json({
      hasCookie: !!sessionCookie,
      session: session,
    });
  } catch (error) {
    console.error("Test Session - Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

import { handlers } from "@/lib/auth/config";

// Force Node.js runtime for auth routes (bcryptjs needs crypto)
export const runtime = "nodejs";

export const { GET, POST } = handlers;

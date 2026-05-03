import { handlers } from "@/backend/services/auth.service";

// Force Node.js runtime for auth routes (bcryptjs needs crypto)
export const runtime = "nodejs";

export const { GET, POST } = handlers;

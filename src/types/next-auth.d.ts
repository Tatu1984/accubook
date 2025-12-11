import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      organizationId: string | null;
      organizationName: string | null;
      branchId: string | null;
      branchName: string | null;
      role: string;
      permissions: unknown[];
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    organizationId: string | null;
    organizationName: string | null;
    branchId: string | null;
    branchName: string | null;
    role: string;
    permissions: unknown[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name: string | null;
    picture: string | null;
    organizationId: string | null;
    organizationName: string | null;
    branchId: string | null;
    branchName: string | null;
    role: string;
    permissions: unknown[];
  }
}

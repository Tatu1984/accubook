import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            organizationUsers: {
              where: { isActive: true },
              include: {
                organization: {
                  include: {
                    baseCurrency: true,
                    branches: {
                      where: { isActive: true },
                      orderBy: { isHeadOffice: "desc" },
                    },
                  },
                },
                role: true,
              },
            },
          },
        });

        if (!user || !user.passwordHash) {
          throw new Error("Invalid email or password");
        }

        if (!user.isActive) {
          throw new Error("Your account has been deactivated");
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error("Account is locked. Please try again later.");
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isPasswordValid) {
          // Increment failed login attempts
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: { increment: 1 },
              lockedUntil:
                user.failedLoginAttempts >= 4
                  ? new Date(Date.now() + 30 * 60 * 1000) // Lock for 30 minutes
                  : null,
            },
          });
          throw new Error("Invalid email or password");
        }

        // Reset failed login attempts and update last login
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        // Get the primary organization and branch
        const orgUser = user.organizationUsers[0];
        const org = orgUser?.organization;
        const branch = org?.branches?.[0];

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          organizationId: org?.id || null,
          organizationName: org?.name || null,
          branchId: branch?.id || null,
          branchName: branch?.name || null,
          role: orgUser?.role?.name || "VIEWER",
          permissions: (Array.isArray(orgUser?.role?.permissions) ? orgUser.role.permissions : []) as unknown[],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
        token.organizationId = user.organizationId;
        token.organizationName = user.organizationName;
        token.branchId = user.branchId;
        token.branchName = user.branchName;
        token.role = user.role;
        token.permissions = user.permissions;
      }

      // Handle session updates (e.g., switching organizations)
      if (trigger === "update" && session) {
        token.organizationId = session.organizationId;
        token.organizationName = session.organizationName;
        token.branchId = session.branchId;
        token.branchName = session.branchName;
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.image = token.picture as string | null;
        session.user.organizationId = token.organizationId as string | null;
        session.user.organizationName = token.organizationName as string | null;
        session.user.branchId = token.branchId as string | null;
        session.user.branchName = token.branchName as string | null;
        session.user.role = token.role as string;
        session.user.permissions = token.permissions as unknown[];
      }
      return session;
    },
    async authorized({ auth }) {
      return !!auth?.user;
    },
  },
});

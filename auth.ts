import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

import { credentialsSchema } from "@/lib/auth-validation";
import { db } from "@/lib/db";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
import { ensureDemoWorkspace } from "@/lib/demo-workspace";

const invalidPasswordHash =
  "$2b$12$bk0JAQO5/zdnEaRfXwYP2OTQkomXgDMt0jb1sRMtpWtYppOZn8Dre";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  trustHost: true,
  providers: [
    GitHub,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        if (parsed.data.email === DEMO_EMAIL) {
          if (parsed.data.password !== DEMO_PASSWORD) return null;
          return ensureDemoWorkspace();
        }

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });
        const passwordMatches = await compare(
          parsed.data.password,
          user?.passwordHash ?? invalidPasswordHash,
        );

        if (!user?.passwordHash || !passwordMatches) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { env } from "@/lib/env";

const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : undefined,
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "member", input: false },
    },
  },
  databaseHooks: env.GOOGLE_ALLOWED_DOMAIN
    ? {
        user: {
          create: {
            // Restrict ALL new sign-ups (email/password and Google) to the
            // configured workspace domain — this is an internal team tool.
            before: async (newUser) => {
              const allowed = env.GOOGLE_ALLOWED_DOMAIN?.toLowerCase();
              const domain = newUser.email.split("@")[1]?.toLowerCase();
              if (allowed && domain !== allowed) {
                throw new APIError("FORBIDDEN", {
                  message: `Sign-ups are restricted to @${allowed} accounts`,
                });
              }
              return { data: newUser };
            },
          },
        },
      }
    : undefined,
});

export type Auth = typeof auth;

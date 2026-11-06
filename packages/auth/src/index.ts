import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@qublox-sales/db";
import * as schema from "@qublox-sales/db/schema/auth";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { isTeamMember } from "./access";
export { isTeamMember } from "./access";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  options: { provisionAccounts?: boolean } = {},
) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      disableSignUp: !options.provisionAccounts,
      autoSignIn: false,
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (!(await isTeamMember(database, session.userId)))
              throw new APIError("FORBIDDEN", {
                message: "Your workspace membership is inactive. Contact your administrator.",
              });
            return { data: session };
          },
        },
      },
      user: {
        create: {
          before: async (user) => {
            if (!options.provisionAccounts) {
              throw new APIError("FORBIDDEN", {
                message: "This workspace is private. Ask your administrator to create an account.",
              });
            }
            return { data: { ...user, email: user.email.trim().toLowerCase() } };
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: new URL(env.BETTER_AUTH_URL).protocol === "https:",
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];

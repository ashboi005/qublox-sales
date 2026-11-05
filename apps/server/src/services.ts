import { createAuth } from "@qublox-sales/auth";
import { createDb } from "@qublox-sales/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth({ BETTER_AUTH_URL: ENV.BETTER_AUTH_URL, BETTER_AUTH_SECRET: ENV.BETTER_AUTH_SECRET, CORS_ORIGIN: ENV.CORS_ORIGIN, ALLOWED_EMAILS: process.env.ALLOWED_EMAILS || "" }, db);

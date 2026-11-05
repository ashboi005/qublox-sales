import { createAuth } from "@qublox-sales/auth";
import { createDb } from "@qublox-sales/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

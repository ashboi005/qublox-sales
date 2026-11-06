import { createDeliveryService } from "./deliveries";
import { Elysia } from "elysia";
import { z, ZodError } from "zod";
import { teamMembership, type createAuth } from "@qublox-sales/auth";
import type { Database } from "@qublox-sales/db";
import {
  campaignInput,
  draftInput,
  manualEvidenceInput,
  prospectInput,
  revisionSchema,
  statuses,
  queueEmailInput,
} from "@qublox-sales/shared";
import type { SalesConfig } from "./config";
import { AppError } from "./errors";
import { createSalesService } from "./sales";
import { createMailboxService, type Viewer } from "./mailboxes";
import { mailboxInput } from "./mail-config";
import type { VerifyMailbox } from "./gmail";

export function createApp(options: {
  db: Database;
  auth: ReturnType<typeof createAuth>;
  origin: string;
  config: SalesConfig;
  verifyMailbox?: VerifyMailbox;
}) {
  const { db, auth, origin, config } = options;
  const sales = createSalesService(db, config);
  const delivery = createDeliveryService(db, config);
  const senders = createMailboxService(db, config, options.verifyMailbox);
  const id = (value: string) => z.uuid().parse(value);
  return new Elysia({ serve: { maxRequestBodySize: 1024 * 1024 } })
    .onError(({ error, set, code }) => {
      if (error instanceof AppError) {
        set.status = error.status;
        return { error: { code: error.code, message: error.message } };
      }
      if (error instanceof ZodError) {
        set.status = 422;
        return {
          error: {
            code: "VALIDATION",
            message: error.issues[0]?.message || "Check the submitted fields.",
          },
        };
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Route not found." } };
      }
      const cause = error as { code?: string; cause?: { code?: string } };
      if ([cause.code, cause.cause?.code].some((value) => value === "23505" || value === "23503")) {
        set.status = 409;
        return {
          error: {
            code: "CONFLICT",
            message: "This business already exists, or its campaign is unavailable.",
          },
        };
      }
      console.error(JSON.stringify({ event: "request_failed", code }));
      set.status = 500;
      return {
        error: {
          code: "INTERNAL",
          message: "Something went wrong. Try again or check the server logs.",
        },
      };
    })
    .onAfterHandle(({ set }) => {
      set.headers["X-Content-Type-Options"] = "nosniff";
      set.headers["Cache-Control"] = "no-store";
    })
    .get("/health", async ({ set }) => {
      try {
        await db.$client.query("select 1");
        return { status: "ok" };
      } catch {
        set.status = 503;
        return { status: "unavailable" };
      }
    })
    .all("/api/auth/*", ({ request }) => auth.handler(request))
    .group("/api", (app) =>
      app
        .derive(async ({ request }) => {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session)
            throw new AppError(401, "UNAUTHENTICATED", "Sign in to access your workspace.");
          const membership = await teamMembership(db, session.user.id);
          if (!membership)
            throw new AppError(403, "FORBIDDEN", "Your workspace membership is inactive.");
          if (
            !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
            request.headers.get("origin") !== origin
          )
            throw new AppError(403, "ORIGIN", "This request must come from your workspace.");
          const actor = session.user.name || session.user.email;
          const viewer: Viewer = {
            userId: session.user.id,
            name: actor,
            admin: membership.role === "admin",
          };
          return { actor, viewer };
        })
        .get("/campaigns", () => sales.campaigns())
        .post("/campaigns", ({ body, set }) => {
          set.status = 201;
          return sales.createCampaign(campaignInput.parse(body));
        })
        .patch("/campaigns/:id", ({ params, body, actor }) => {
          const input = campaignInput.extend({ version: z.number().int().min(1) }).parse(body);
          return sales.updateCampaign(id(params.id), input.version, input, actor);
        })
        .get("/prospects", ({ query }) =>
          sales.list(
            z
              .object({
                q: z.string().max(200).optional(),
                status: z.enum(statuses).optional(),
                campaignId: z.uuid().optional(),
                page: z.coerce.number().int().min(1).max(10000).optional(),
                due: z
                  .enum(["true", "false"])
                  .optional()
                  .transform((value) => value === "true"),
              })
              .parse(query),
          ),
        )
        .get("/prospects/:id", ({ params }) => sales.detail(id(params.id)))
        .post("/prospects", ({ body, actor, set }) => {
          set.status = 201;
          return sales.createProspect(prospectInput.parse(body), actor);
        })
        .patch("/prospects/:id", ({ params, body, actor }) => {
          const input = prospectInput.extend({ version: z.number().int().min(1) }).parse(body);
          return sales.updateProspect(id(params.id), input.version, input, actor);
        })
        .post("/prospects/:id/evidence", ({ params, body, actor }) => {
          const input = manualEvidenceInput.parse(body);
          return sales.addEvidence(id(params.id), input.version, input, actor);
        })
        .put("/prospects/:id/draft", ({ params, body, actor }) => {
          const input = draftInput.parse(body);
          return sales.saveDraft(id(params.id), input.version, input, actor);
        })
        .post("/prospects/:id/actions", ({ params, body, actor }) => {
          const input = revisionSchema
            .extend({
              action: z.enum([
                "approve",
                "contacted",
                "replied",
                "close",
                "skip",
                "suppress",
                "followed_up",
              ]),
            })
            .parse(body);
          return sales.action(id(params.id), input.version, input.action, actor);
        })
        .post("/prospects/:id/jobs", ({ params, body, actor }) => {
          const input = revisionSchema.extend({ kind: z.enum(["research", "draft"]) }).parse(body);
          return sales.enqueue(id(params.id), input.version, input.kind, actor);
        })
        .post("/prospects/:id/jobs/cancel", ({ params, body, actor }) => {
          const input = revisionSchema.parse(body);
          return sales.cancelQueued(id(params.id), input.version, actor);
        })
        .post("/imports", ({ body, actor }) => {
          const input = z
            .object({
              records: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
              campaignId: z.uuid().nullable().default(null),
            })
            .parse(body);
          return sales.importRecords(input.records, input.campaignId, actor);
        })
        .get("/deliveries", () => delivery.list())
        .post("/deliveries", ({ body, viewer }) =>
          delivery.queue(queueEmailInput.parse(body), viewer),
        )
        .post("/prospects/:id/delivery/change", ({ params, body, viewer }) => {
          const input = revisionSchema
            .extend({
              deliveryId: z.uuid(),
              action: z.enum(["cancel", "now"]),
              senderIds: z.array(z.string()).min(1).max(10).optional(),
            })
            .parse(body);
          return delivery.change(
            id(params.id),
            input.version,
            input.deliveryId,
            input.action,
            viewer,
            input.senderIds,
          );
        })
        .post("/prospects/:id/delivery/resolve", ({ params, body, actor }) => {
          const input = revisionSchema
            .extend({ deliveryId: z.uuid(), delivered: z.boolean() })
            .parse(body);
          return delivery.resolve(
            id(params.id),
            input.version,
            input.deliveryId,
            input.delivered,
            actor,
          );
        })
        .get("/overview", () => sales.overview())
        .get("/settings", ({ viewer }) => sales.settings(viewer))
        .get("/mailboxes", ({ viewer }) => senders.list(viewer))
        .put("/mailboxes/me", ({ body, viewer }) =>
          senders.connect(viewer, mailboxInput.parse(body)),
        )
        .delete("/mailboxes/:id", ({ params, viewer }) => senders.remove(viewer, id(params.id))),
    );
}

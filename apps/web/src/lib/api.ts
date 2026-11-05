import { z } from "zod";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options?.method || "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: options?.signal,
    ...(options?.body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }
      : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) window.location.assign("/login");
    throw new ApiError(
      data?.error?.message || "The request failed. Please try again.",
      response.status,
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new Error("The server returned an unexpected response. Refresh and try again.");
  return parsed.data;
}
export function message(error: unknown) {
  return error instanceof z.ZodError
    ? error.issues[0]?.message || "Check the form fields."
    : error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
}
export function date(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}
export function time(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

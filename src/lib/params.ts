import type { ZodTypeAny, z } from "zod";

/** Drops empty values that HTML GET forms submit (e.g. status=""). */
export function compact(sp: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
}

/** Parses page search params; invalid params fall back to the schema defaults instead of crashing the page. */
export function parseParams<S extends ZodTypeAny>(schema: S, sp: Record<string, string | string[] | undefined>, extra: Record<string, unknown> = {}): z.infer<S> {
  const r = schema.safeParse({ ...compact(sp), ...extra });
  return r.success ? r.data : schema.parse(extra);
}

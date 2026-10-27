import { api } from "@/server/http/handler";
import { getBrandLanding, updateBrandLanding } from "@/server/services/brand-landing";
import { landingSchema } from "@/server/landing-schema";

/** Brand page content (sections, texts, image URLs). Super admin, or brand admin for own brands. */
export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => getBrandLanding(actor, params.id));
export const PUT = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => updateBrandLanding(actor, params.id, await body(landingSchema)));

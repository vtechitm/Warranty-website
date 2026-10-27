import { api } from "@/server/http/handler";
import { getBrandAsset } from "@/server/services/brand-landing";

/** Public brand page image. File names are random UUIDs, so responses are immutable and cached for a year. */
export const GET = api<{ brandId: string; name: string }>({ auth: "none" }, async ({ params }) => {
  const img = await getBrandAsset(params.brandId, params.name);
  return new Response(new Uint8Array(img.body), {
    headers: {
      "Content-Type": img.contentType,
      "Content-Length": String(img.body.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});

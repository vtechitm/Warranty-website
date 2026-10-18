import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Caddy on-demand TLS gate: a certificate is only requested for hostnames configured as brand
 * domains, so arbitrary hostnames pointed at the server cannot trigger certificate issuance.
 */
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain")?.toLowerCase().slice(0, 253);
  if (!domain) return new NextResponse(null, { status: 400 });
  const found = await prisma.brandDomain.findUnique({ where: { hostname: domain }, select: { id: true } });
  return new NextResponse(null, { status: found ? 200 : 404 });
}

import { NextResponse } from "next/server";
import { openApiSpec } from "@/server/openapi";

export const GET = () => NextResponse.json(openApiSpec());

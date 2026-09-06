import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(req) {
  const auth = await verifyAdminAuth(req);
  if (!auth) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true });
}

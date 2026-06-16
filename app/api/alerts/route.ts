import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { inventoryCache } from "@/lib/inventory-cache";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ alerts: inventoryCache.getAlerts() });
}

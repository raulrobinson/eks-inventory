import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { inventoryCache } from "@/lib/inventory-cache";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const cluster = searchParams.get("cluster");
  const namespace = searchParams.get("namespace");

  let inventory = inventoryCache.getInventory();

  if (status) inventory = inventory.filter((i) => i.status.toUpperCase() === status.toUpperCase());
  if (cluster) inventory = inventory.filter((i) => i.cluster.toLowerCase() === cluster.toLowerCase());
  if (namespace) inventory = inventory.filter((i) => i.namespace.toLowerCase() === namespace.toLowerCase());

  return NextResponse.json({
    inventory,
    metadata: inventoryCache.getMetadata(),
    alerts: inventoryCache.getAlerts(),
    stale: inventoryCache.isStale(),
  });
}

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { accountStore } from "@/lib/account-store";
import { scanAllAccounts } from "@/lib/eks-scanner";
import { inventoryCache } from "@/lib/inventory-cache";

export const maxDuration = 120;

export async function POST() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = accountStore.list();
  const enabled = accounts.filter((a) => a.enabled);

  if (enabled.length === 0) {
    return NextResponse.json(
      { error: "No enabled accounts configured. Go to Settings → Add account first." },
      { status: 400 }
    );
  }

  try {
    const { services, clusterResults, accountErrors } = await scanAllAccounts(accounts);
    inventoryCache.set(services);

    const failedClusters = clusterResults.filter((r) => !r.ok);

    return NextResponse.json({
      ok: true,
      total: services.length,
      clustersScanned: clusterResults.length,
      clustersOk: clusterResults.filter((r) => r.ok).length,
      // Surface partial failures so the UI can show them
      clusterErrors: failedClusters.map((r) => ({
        cluster: r.cluster,
        account: r.account,
        error: r.error,
      })),
      accountErrors,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Scan failed";
    console.error("[scan route]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

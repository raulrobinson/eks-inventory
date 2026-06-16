import type { ServiceInventory, InventoryMetadata, Alert, AccountSummary } from "@/types";
import crypto from "crypto";

interface CacheEntry {
  inventory: ServiceInventory[];
  alerts: Alert[];
  metadata: InventoryMetadata;
  fetchedAt: number;
}

// Module-level singleton (survives across requests in a single Node.js process)
let cache: CacheEntry | null = null;

// ─── Alert generation ─────────────────────────────────────────────────────────

function generateAlerts(inventory: ServiceInventory[]): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  for (const svc of inventory) {
    if (svc.status === "DOWN") {
      alerts.push({
        id: crypto.randomUUID(),
        severity: "critical",
        status: "firing",
        title: `Service DOWN: ${svc.name}`,
        message: `${svc.availableReplicas}/${svc.desiredReplicas} replicas available in ${svc.cluster}/${svc.namespace}`,
        serviceName: svc.name,
        cluster: svc.cluster,
        namespace: svc.namespace,
        account: svc.account,
        detectedAt: now,
      });
    } else if (svc.status === "DEGRADED") {
      alerts.push({
        id: crypto.randomUUID(),
        severity: "warning",
        status: "firing",
        title: `Service DEGRADED: ${svc.name}`,
        message: `Only ${svc.availableReplicas}/${svc.desiredReplicas} replicas running`,
        serviceName: svc.name,
        cluster: svc.cluster,
        namespace: svc.namespace,
        account: svc.account,
        detectedAt: now,
      });
    }

    // High restart count
    const totalRestarts = svc.pods.reduce((s, p) => s + p.restartCount, 0);
    if (totalRestarts >= 5) {
      alerts.push({
        id: crypto.randomUUID(),
        severity: totalRestarts >= 10 ? "critical" : "warning",
        status: "firing",
        title: `High restarts: ${svc.name}`,
        message: `${totalRestarts} pod restarts detected across ${svc.pods.length} pods`,
        serviceName: svc.name,
        cluster: svc.cluster,
        namespace: svc.namespace,
        account: svc.account,
        detectedAt: now,
      });
    }

    // Pods in Failed/Unknown state
    const failedPods = svc.pods.filter((p) =>
      ["Failed", "Unknown"].includes(p.phase ?? "")
    );
    if (failedPods.length > 0) {
      alerts.push({
        id: crypto.randomUUID(),
        severity: "warning",
        status: "firing",
        title: `Failed pods: ${svc.name}`,
        message: `${failedPods.length} pod(s) in Failed/Unknown state`,
        serviceName: svc.name,
        cluster: svc.cluster,
        namespace: svc.namespace,
        account: svc.account,
        detectedAt: now,
      });
    }
  }

  return alerts;
}

// ─── Metadata builder ─────────────────────────────────────────────────────────

function buildMetadata(inventory: ServiceInventory[]): InventoryMetadata {
  const totalClusters = new Set(
    inventory.map((i) => `${i.account}:${i.cluster}`)
  ).size;
  const totalNamespaces = new Set(
    inventory.map((i) => `${i.account}:${i.cluster}:${i.namespace}`)
  ).size;
  const totalPods = inventory.reduce((s, i) => s + i.pods.length, 0);

  // Per-account summary
  const accountMap = new Map<string, AccountSummary>();
  for (const svc of inventory) {
    const key = svc.account;
    if (!accountMap.has(key)) {
      accountMap.set(key, {
        accountName: svc.account,
        region: svc.region,
        clusters: 0,
        services: 0,
        ok: 0,
        problems: 0,
      });
    }
    const entry = accountMap.get(key)!;
    entry.services++;
    if (svc.status === "OK") entry.ok++;
    else entry.problems++;
  }
  // Count distinct clusters per account
  const clustersByAccount = new Map<string, Set<string>>();
  for (const svc of inventory) {
    if (!clustersByAccount.has(svc.account)) clustersByAccount.set(svc.account, new Set());
    clustersByAccount.get(svc.account)!.add(svc.cluster);
  }
  clustersByAccount.forEach((clusters, account) => {
    const entry = accountMap.get(account);
    if (entry) entry.clusters = clusters.size;
  });

  return {
    lastRefresh: new Date().toISOString(),
    totalServices: inventory.length,
    totalClusters,
    totalNamespaces,
    totalPods,
    accountsSummary: Array.from(accountMap.values()),
  };
}

// ─── Public cache API ─────────────────────────────────────────────────────────

export const inventoryCache = {
  set(inventory: ServiceInventory[]) {
    const alerts = generateAlerts(inventory);
    const metadata = buildMetadata(inventory);
    cache = { inventory, alerts, metadata, fetchedAt: Date.now() };
  },

  get(): CacheEntry | null {
    return cache;
  },

  clear() {
    cache = null;
  },

  isStale(ttlMs = 5 * 60 * 1000): boolean {
    if (!cache) return true;
    return Date.now() - cache.fetchedAt > ttlMs;
  },

  getAlerts(): Alert[] {
    return cache?.alerts ?? [];
  },

  getMetadata(): InventoryMetadata | null {
    return cache?.metadata ?? null;
  },

  getInventory(): ServiceInventory[] {
    return cache?.inventory ?? [];
  },
};

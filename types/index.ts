// ─── Kubernetes / EKS inventory ───────────────────────────────────────────────

export interface PodInfo {
  name: string;
  phase: string | null;
  nodeName: string | null;
  reason: string | null;
  message: string | null;
  restartCount: number;
}

export interface ServiceInventory {
  account: string;
  region: string;
  cluster: string;
  namespace: string;
  type: string;
  name: string;
  image: string;
  desiredReplicas: number;
  readyReplicas: number;
  availableReplicas: number;
  status: "OK" | "DEGRADED" | "DOWN" | "STOPPED";
  services: string[];
  ingressHosts: string[];
  pods: PodInfo[];
  scannedAt: string;
}

export interface InventoryMetadata {
  lastRefresh: string;
  totalServices: number;
  totalClusters: number;
  totalNamespaces: number;
  totalPods: number;
  accountsSummary: AccountSummary[];
}

export interface AccountSummary {
  accountName: string;
  region: string;
  clusters: number;
  services: number;
  ok: number;
  problems: number;
}

// ─── Account / profile config ─────────────────────────────────────────────────

export interface AccountConfig {
  id: string;
  name: string;
  awsProfile: string;
  region: string;
  enabled: boolean;
  ignoredNamespaces: string[];
  createdAt: string;
}

export type AccountConfigInput = Omit<AccountConfig, "id" | "createdAt">;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  role: "admin" | "viewer";
}

export interface Session {
  user: User;
  expiresAt: number;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "firing" | "resolved";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  serviceName: string;
  cluster: string;
  namespace: string;
  account: string;
  detectedAt: string;
  resolvedAt?: string;
}

// ─── API responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export type ScanStatus = "idle" | "scanning" | "done" | "error";

import { EKSClient, ListClustersCommand, DescribeClusterCommand } from "@aws-sdk/client-eks";
import { fromSSO } from "@aws-sdk/credential-providers";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import {
  KubeConfig,
  AppsV1Api,
  CoreV1Api,
  NetworkingV1Api,
  type V1Deployment,
  type V1Pod,
  type V1Service,
  type V1Ingress,
} from "@kubernetes/client-node";
import type { AccountConfig, ServiceInventory, PodInfo } from "@/types";

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export interface ClusterScanResult {
  account: string;
  cluster: string;
  ok: boolean;
  services: ServiceInventory[];
  error?: string;
}

// ─── EKS token via pre-signed STS URL ────────────────────────────────────────
// Equivalent to: aws eks get-token --cluster-name X --profile Y --region Z
// EKS accepts: "k8s-aws-v1.<base64url(presigned-sts-url)>"

async function getEksToken(
  clusterName: string,
  profile: string,
  region: string
): Promise<string> {
  // Resolve SSO credentials
  const credProvider = fromSSO({ profile });
  const credentials = await credProvider();

  const signer = new SignatureV4({
    credentials,
    region,
    service: "sts",
    sha256: Sha256,
    applyChecksum: false,
  });

  // Path MUST be "/" only — query params go exclusively in the query object.
  // The x-k8s-aws-id header is required for EKS to scope the token to one cluster.
  const signed = await signer.presign(
    {
      method: "GET",
      hostname: `sts.${region}.amazonaws.com`,
      path: "/",
      headers: {
        host: `sts.${region}.amazonaws.com`,
        "x-k8s-aws-id": clusterName,
      },
      protocol: "https:",
      query: {
        Action: "GetCallerIdentity",
        Version: "2011-06-15",
      },
    },
    { expiresIn: 60 }
  );

  // Reconstruct the full signed URL from the SignatureV4 output
  const qs = Object.entries(signed.query ?? {})
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

  const finalUrl = `https://${signed.hostname}${signed.path}?${qs}`;
  return "k8s-aws-v1." + Buffer.from(finalUrl).toString("base64url");
}

// ─── Status resolution ────────────────────────────────────────────────────────

function resolveStatus(
  desired: number,
  available: number
): ServiceInventory["status"] {
  if (desired === 0) return "STOPPED";
  if (available >= desired) return "OK";
  if (available > 0) return "DEGRADED";
  return "DOWN";
}

// ─── Label matching ───────────────────────────────────────────────────────────

function labelsMatch(
  source: Record<string, string> | undefined | null,
  selector: Record<string, string> | undefined | null
): boolean {
  if (!source || !selector || Object.keys(selector).length === 0) return false;
  return Object.entries(selector).every(([k, v]) => source[k] === v);
}

// ─── Map a single pod ────────────────────────────────────────────────────────

function mapPod(pod: V1Pod): PodInfo {
  const restarts = (pod.status?.containerStatuses ?? []).reduce(
    (s, cs) => s + (cs.restartCount ?? 0),
    0
  );
  let reason = pod.status?.reason ?? null;
  let message = pod.status?.message ?? null;
  if (!reason) {
    const cond = pod.status?.conditions?.find((c) => c.type === "PodScheduled");
    reason = cond?.reason ?? null;
    message = cond?.message ?? message;
  }
  return {
    name: pod.metadata?.name ?? "",
    phase: pod.status?.phase ?? null,
    nodeName: pod.spec?.nodeName ?? null,
    reason,
    message,
    restartCount: restarts,
  };
}

// ─── Scan a single EKS cluster ───────────────────────────────────────────────

async function scanCluster(
  account: AccountConfig,
  clusterName: string,
  eksClient: EKSClient
): Promise<ClusterScanResult> {
  console.log(`[scanner] → ${account.name}/${clusterName}: describing cluster…`);

  let clusterEndpoint: string;
  let clusterCAData: string | undefined;

  try {
    const descResp = await eksClient.send(
      new DescribeClusterCommand({ name: clusterName })
    );
    clusterEndpoint = descResp.cluster?.endpoint ?? "";
    clusterCAData = descResp.cluster?.certificateAuthority?.data;

    if (!clusterEndpoint) {
      throw new Error("Cluster endpoint is empty — cluster may not be ACTIVE");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[scanner] ✗ ${clusterName}: describe failed: ${msg}`);
    return { account: account.name, cluster: clusterName, ok: false, services: [], error: `describe: ${msg}` };
  }

  let token: string;
  try {
    console.log(`[scanner] → ${clusterName}: generating EKS token…`);
    token = await getEksToken(clusterName, account.awsProfile, account.region);
    console.log(`[scanner] ✓ ${clusterName}: token OK (${token.slice(0, 20)}…)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[scanner] ✗ ${clusterName}: token failed: ${msg}`);
    return { account: account.name, cluster: clusterName, ok: false, services: [], error: `token: ${msg}` };
  }

  // Build k8s client
  const kc = new KubeConfig();
  kc.loadFromOptions({
    clusters: [
      {
        name: clusterName,
        server: clusterEndpoint,
        caData: clusterCAData,
        skipTLSVerify: false,
      },
    ],
    users: [{ name: "eks-user", token }],
    contexts: [{ name: "eks-ctx", cluster: clusterName, user: "eks-user" }],
    currentContext: "eks-ctx",
  });

  const appsApi = kc.makeApiClient(AppsV1Api);
  const coreApi = kc.makeApiClient(CoreV1Api);
  const netApi = kc.makeApiClient(NetworkingV1Api);

  let deployments: V1Deployment[];
  let pods: V1Pod[];
  let services: V1Service[];
  let ingresses: V1Ingress[];

  try {
    console.log(`[scanner] → ${clusterName}: fetching k8s resources…`);

    // k8s client v1.x returns the resource list DIRECTLY (not wrapped in .body)
    const [depResp, podResp, svcResp, ingResp] = await Promise.all([
      appsApi.listDeploymentForAllNamespaces(),
      coreApi.listPodForAllNamespaces(),
      coreApi.listServiceForAllNamespaces(),
      netApi.listIngressForAllNamespaces(),
    ]);

    // Handle both v0.x (.body.items) and v1.x (.items) response shapes
    deployments = (depResp as any).items ?? (depResp as any).body?.items ?? [];
    pods        = (podResp as any).items ?? (podResp as any).body?.items ?? [];
    services    = (svcResp as any).items ?? (svcResp as any).body?.items ?? [];
    ingresses   = (ingResp as any).items ?? (ingResp as any).body?.items ?? [];

    console.log(
      `[scanner] ✓ ${clusterName}: ${deployments.length} deployments, ${pods.length} pods, ${services.length} services, ${ingresses.length} ingresses`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[scanner] ✗ ${clusterName}: k8s fetch failed: ${msg}`);
    return { account: account.name, cluster: clusterName, ok: false, services: [], error: `k8s: ${msg}` };
  }

  const ignored = new Set(account.ignoredNamespaces ?? []);
  const now = new Date().toISOString();

  const filteredDeployments = deployments.filter(
    (d) => !ignored.has(d.metadata?.namespace ?? "")
  );

  console.log(
    `[scanner] → ${clusterName}: ${filteredDeployments.length} deployments after filtering ${ignored.size} ignored namespaces`
  );

  const result: ServiceInventory[] = filteredDeployments.map((dep) => {
    const ns = dep.metadata?.namespace ?? "";
    const name = dep.metadata?.name ?? "";
    const selector = dep.spec?.selector?.matchLabels ?? {};

    const desired = dep.spec?.replicas ?? 0;
    const ready = dep.status?.readyReplicas ?? 0;
    const available = dep.status?.availableReplicas ?? 0;

    const myPods = pods.filter(
      (p) => p.metadata?.namespace === ns && labelsMatch(p.metadata?.labels, selector)
    );

    const myServices = services.filter(
      (s) =>
        s.metadata?.namespace === ns &&
        labelsMatch(selector, s.spec?.selector as Record<string, string> | undefined)
    );

    const myHosts = ingresses
      .filter((i) => i.metadata?.namespace === ns)
      .flatMap((i) => (i.spec?.rules ?? []).map((r) => r.host).filter(Boolean))
      .filter((v, i, a) => a.indexOf(v) === i) as string[];

    const image =
      (dep.spec?.template?.spec?.containers ?? [])
        .map((c) => c.image ?? "")
        .filter(Boolean)
        .join(", ") || "unknown";

    return {
      account: account.name,
      region: account.region,
      cluster: clusterName,
      namespace: ns,
      type: "Deployment",
      name,
      image,
      desiredReplicas: desired,
      readyReplicas: ready,
      availableReplicas: available,
      status: resolveStatus(desired, available),
      services: myServices.map((s) => s.metadata?.name ?? ""),
      ingressHosts: myHosts,
      pods: myPods.map(mapPod),
      scannedAt: now,
    };
  });

  return { account: account.name, cluster: clusterName, ok: true, services: result };
}

// ─── Scan all clusters in an account ─────────────────────────────────────────

export async function scanAccount(
  account: AccountConfig
): Promise<{ services: ServiceInventory[]; clusterResults: ClusterScanResult[] }> {
  console.log(`[scanner] Account "${account.name}" (${account.awsProfile} / ${account.region})`);

  const eksClient = new EKSClient({
    region: account.region,
    credentials: fromSSO({ profile: account.awsProfile }),
  });

  let clusterNames: string[];
  try {
    const listResp = await eksClient.send(new ListClustersCommand({}));
    clusterNames = listResp.clusters ?? [];
    console.log(`[scanner] Found ${clusterNames.length} cluster(s): ${clusterNames.join(", ")}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[scanner] ✗ ListClusters failed for ${account.name}: ${msg}`);
    throw new Error(`ListClusters(${account.awsProfile}): ${msg}`);
  }

  // Scan clusters sequentially to avoid SSO token rate-limits
  const clusterResults: ClusterScanResult[] = [];
  for (const name of clusterNames) {
    const result = await scanCluster(account, name, eksClient);
    clusterResults.push(result);
  }

  const services = clusterResults.flatMap((r) => r.services);
  return { services, clusterResults };
}

// ─── Scan all enabled accounts ────────────────────────────────────────────────

export interface ScanReport {
  services: ServiceInventory[];
  clusterResults: ClusterScanResult[];
  accountErrors: { account: string; error: string }[];
}

export async function scanAllAccounts(accounts: AccountConfig[]): Promise<ScanReport> {
  const enabled = accounts.filter((a) => a.enabled);
  console.log(`[scanner] Scanning ${enabled.length} enabled account(s)…`);

  const allServices: ServiceInventory[] = [];
  const allClusterResults: ClusterScanResult[] = [];
  const accountErrors: { account: string; error: string }[] = [];

  for (const account of enabled) {
    try {
      const { services, clusterResults } = await scanAccount(account);
      allServices.push(...services);
      allClusterResults.push(...clusterResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      accountErrors.push({ account: account.name, error: msg });
    }
  }

  console.log(
    `[scanner] Done. ${allServices.length} total services, ${allClusterResults.filter((r) => r.ok).length}/${allClusterResults.length} clusters OK`
  );

  return { services: allServices, clusterResults: allClusterResults, accountErrors };
}

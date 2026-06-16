"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  ServiceInventory, InventoryMetadata, Alert, AccountConfig,
} from "@/types";
import {
  Button, Badge, Card, CardContent, CardHeader, CardTitle,
  Input, Label, Textarea, Switch,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Separator,
} from "@/components/ui";
import {
  Cloud, RefreshCw, LogOut, AlertTriangle, CheckCircle, Server,
  Layers, Table2, Settings, Bell, Plus, Trash2, Edit3, ChevronDown,
  ChevronRight, Globe, RotateCcw, X, Search, ChevronsUpDown,
  ChevronUp, Cpu, Box, Clock, Activity, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  OK:      { label: "OK",       dot: "bg-emerald-500", badge: "success"  },
  DEGRADED:{ label: "Degraded", dot: "bg-amber-500",   badge: "warning"  },
  DOWN:    { label: "Down",     dot: "bg-red-500",     badge: "danger"   },
  STOPPED: { label: "Stopped",  dot: "bg-slate-300",   badge: "stopped"  },
} as const;

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? { label: status, dot: "bg-slate-300", badge: "outline" as const };
  return (
    <Badge variant={cfg.badge as any} className="gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </Badge>
  );
}

function ReplicaBar({ desired, ready, available }: { desired: number; ready: number; available: number }) {
  if (desired === 0) return <span className="text-xs text-slate-400">Stopped</span>;
  const pct = Math.min((available / desired) * 100, 100);
  const color = available === desired ? "bg-emerald-500" : available > 0 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1 w-full">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{ready} ready · {available} avail</span>
        <span className="font-medium text-slate-700">{desired} desired</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Service detail modal ─────────────────────────────────────────────────────

function ServiceModal({ svc, onClose }: { svc: ServiceInventory; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="font-mono text-base">{svc.name}</DialogTitle>
              <DialogDescription>{svc.account} · {svc.region} · {svc.cluster}</DialogDescription>
            </div>
            <StatusBadge status={svc.status} />
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pods">Pods ({svc.pods.length})</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-3">
            <ReplicaBar desired={svc.desiredReplicas} ready={svc.readyReplicas} available={svc.availableReplicas} />
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-500 uppercase tracking-wide">Namespace</p><p className="font-medium mt-0.5">{svc.namespace}</p></div>
              <div><p className="text-xs text-slate-500 uppercase tracking-wide">Type</p><p className="font-medium mt-0.5">{svc.type}</p></div>
              <div className="col-span-2"><p className="text-xs text-slate-500 uppercase tracking-wide">Image</p><p className="font-mono text-xs bg-slate-100 px-2 py-1 rounded mt-0.5 break-all">{svc.image}</p></div>
            </div>
          </TabsContent>

          <TabsContent value="pods" className="pt-3 space-y-2">
            {svc.pods.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No pods found</p>
            ) : svc.pods.map((pod) => (
              <div key={pod.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="text-xs font-mono text-slate-700 break-all">{pod.name}</span>
                  <Badge variant={pod.phase === "Running" ? "success" : pod.phase === "Failed" ? "danger" : "warning"} className="text-xs">{pod.phase ?? "Unknown"}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs text-slate-500">
                  {pod.nodeName && <span className="flex items-center gap-1"><Server className="h-3 w-3" />{pod.nodeName}</span>}
                  <span className="flex items-center gap-1"><RotateCcw className="h-3 w-3" />{pod.restartCount} restarts</span>
                </div>
                {(pod.reason || pod.message) && (
                  <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-800">
                    {pod.reason && <strong>{pod.reason}: </strong>}{pod.message}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="network" className="pt-3 space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Kubernetes Services</p>
              {svc.services.length === 0 ? <p className="text-sm text-slate-400 italic">None</p> : (
                <div className="flex flex-wrap gap-1">{svc.services.map(s => <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>)}</div>
              )}
            </div>
            <Separator />
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Ingress Hosts</p>
              {svc.ingressHosts.length === 0 ? <p className="text-sm text-slate-400 italic">None</p> : (
                <div className="flex flex-col gap-1">
                  {svc.ingressHosts.map(h => <a key={h} href={`https://${h}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-mono text-xs">{h}</a>)}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inventory table ──────────────────────────────────────────────────────────

type SortKey = "name" | "namespace" | "cluster" | "status" | "availableReplicas";

function InventoryTable({ data }: { data: ServiceInventory[] }) {
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("ALL");
  const [nsF, setNsF] = useState("ALL");
  const [clusterF, setClusterF] = useState("ALL");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ServiceInventory | null>(null);
  const PAGE = 20;

  const namespaces = useMemo(() => ["ALL", ...Array.from(new Set(data.map(d => d.namespace))).sort()], [data]);
  const clusters = useMemo(() => ["ALL", ...Array.from(new Set(data.map(d => d.cluster))).sort()], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data
      .filter(i => {
        const matchQ = !q || i.name.toLowerCase().includes(q) || i.namespace.toLowerCase().includes(q) || i.cluster.toLowerCase().includes(q) || i.image.toLowerCase().includes(q);
        const matchS = statusF === "ALL" || i.status === statusF;
        const matchN = nsF === "ALL" || i.namespace === nsF;
        const matchC = clusterF === "ALL" || i.cluster === clusterF;
        return matchQ && matchS && matchN && matchC;
      })
      .sort((a, b) => {
        const va = sort.key === "availableReplicas" ? a[sort.key] : String(a[sort.key]).toLowerCase();
        const vb = sort.key === "availableReplicas" ? b[sort.key] : String(b[sort.key]).toLowerCase();
        return (va < vb ? -1 : va > vb ? 1 : 0) * (sort.dir === "asc" ? 1 : -1);
      });
  }, [data, search, statusF, nsF, clusterF, sort]);

  const paginated = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
    setPage(0);
  }

  function SortTh({ field, label, className }: { field: SortKey; label: string; className?: string }) {
    const active = sort.key === field;
    return (
      <th onClick={() => toggleSort(field)} className={cn("px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none", className)}>
        <div className="flex items-center gap-1">
          {label}
          {active ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
        </div>
      </th>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search name, namespace, image…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-8 h-8 text-sm" />
        </div>
        <Select value={statusF} onValueChange={v => { setStatusF(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["ALL","OK","DEGRADED","DOWN","STOPPED"].map(s => <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={nsF} onValueChange={v => { setNsF(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-[150px] text-sm"><SelectValue placeholder="Namespace" /></SelectTrigger>
          <SelectContent>{namespaces.map(n => <SelectItem key={n} value={n}>{n === "ALL" ? "All namespaces" : n}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={clusterF} onValueChange={v => { setClusterF(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-[150px] text-sm"><SelectValue placeholder="Cluster" /></SelectTrigger>
          <SelectContent>{clusters.map(c => <SelectItem key={c} value={c}>{c === "ALL" ? "All clusters" : c}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length}/{data.length} services</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortTh field="name" label="Service" className="min-w-[180px]" />
                <SortTh field="namespace" label="Namespace" />
                <SortTh field="cluster" label="Cluster" />
                <SortTh field="status" label="Status" className="w-[110px]" />
                <SortTh field="availableReplicas" label="Replicas" className="min-w-[160px]" />
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Pods</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Network</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No services match current filters.</td></tr>
              ) : paginated.map(item => (
                <tr key={`${item.cluster}/${item.namespace}/${item.name}`} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelected(item)}>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-800 truncate max-w-[200px]">{item.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{item.account}</div>
                  </td>
                  <td className="px-3 py-3"><Badge variant="secondary" className="text-xs font-normal">{item.namespace}</Badge></td>
                  <td className="px-3 py-3 text-sm text-slate-600">{item.cluster}</td>
                  <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-3 py-3 min-w-[160px]"><ReplicaBar desired={item.desiredReplicas} ready={item.readyReplicas} available={item.availableReplicas} /></td>
                  <td className="px-3 py-3 text-sm text-slate-600">{item.pods.length}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {item.services.length > 0 && <span className="flex items-center gap-1 text-slate-500"><Server className="h-3 w-3" />{item.services.length} svc</span>}
                      {item.ingressHosts.length > 0 && <span className="flex items-center gap-1 text-blue-500"><Globe className="h-3 w-3" />{item.ingressHosts.length} host</span>}
                      {item.services.length === 0 && item.ingressHosts.length === 0 && <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>Next</Button>
          </div>
        </div>
      )}

      {selected && <ServiceModal svc={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─── Cluster view ─────────────────────────────────────────────────────────────

function ClusterView({ inventory }: { inventory: ServiceInventory[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const clusters = useMemo(() => {
    const map = new Map<string, { cluster: string; account: string; region: string; ok: number; degraded: number; down: number; stopped: number; namespaces: number; items: ServiceInventory[] }>();
    inventory.forEach(item => {
      const key = `${item.account}::${item.cluster}`;
      if (!map.has(key)) map.set(key, { cluster: item.cluster, account: item.account, region: item.region, ok: 0, degraded: 0, down: 0, stopped: 0, namespaces: 0, items: [] });
      const s = map.get(key)!;
      s.items.push(item);
      if (item.status === "OK") s.ok++;
      else if (item.status === "DEGRADED") s.degraded++;
      else if (item.status === "DOWN") s.down++;
      else s.stopped++;
    });
    map.forEach(s => { s.namespaces = new Set(s.items.map(i => i.namespace)).size; });
    return Array.from(map.values()).sort((a, b) => a.cluster.localeCompare(b.cluster));
  }, [inventory]);

  return (
    <div className="space-y-3">
      {clusters.map(c => {
        const key = `${c.account}::${c.cluster}`;
        const open = expanded.has(key);
        const total = c.ok + c.degraded + c.down + c.stopped;
        const hasProblems = c.degraded + c.down > 0;
        return (
          <Card key={key} className={cn(hasProblems && "border-amber-200")}>
            <CardHeader className="p-4 pb-0">
              <button className="flex items-start gap-3 w-full text-left" onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}>
                <div className="mt-0.5">{open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-slate-900">{c.cluster}</span>
                    <Badge variant="secondary" className="text-xs">{c.account}</Badge>
                    <Badge variant="outline" className="text-xs">{c.region}</Badge>
                    {hasProblems && <Badge variant="warning" className="text-xs">{c.degraded + c.down} problem{c.degraded + c.down !== 1 ? "s" : ""}</Badge>}
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
                    <span>{c.items.length} services · {c.namespaces} namespaces</span>
                    {c.ok > 0 && <span className="text-emerald-600">{c.ok} OK</span>}
                    {c.degraded > 0 && <span className="text-amber-600">{c.degraded} Degraded</span>}
                    {c.down > 0 && <span className="text-red-600">{c.down} Down</span>}
                    {c.stopped > 0 && <span className="text-slate-400">{c.stopped} Stopped</span>}
                  </div>
                  <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-0.5 mt-2 mb-1">
                    {c.ok > 0 && <div className="bg-emerald-500 rounded-full" style={{ width: `${(c.ok/total)*100}%` }} />}
                    {c.degraded > 0 && <div className="bg-amber-400 rounded-full" style={{ width: `${(c.degraded/total)*100}%` }} />}
                    {c.down > 0 && <div className="bg-red-500 rounded-full" style={{ width: `${(c.down/total)*100}%` }} />}
                    {c.stopped > 0 && <div className="bg-slate-300 rounded-full" style={{ width: `${(c.stopped/total)*100}%` }} />}
                  </div>
                </div>
              </button>
            </CardHeader>
            {open && <CardContent className="p-4 pt-3"><InventoryTable data={c.items} /></CardContent>}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Problems view ────────────────────────────────────────────────────────────

function ProblemsView({ problems }: { problems: ServiceInventory[] }) {
  const [selected, setSelected] = useState<ServiceInventory | null>(null);
  if (problems.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <CheckCircle className="h-12 w-12 text-emerald-400 mb-4" />
      <h3 className="text-lg font-semibold text-slate-700">All systems operational</h3>
      <p className="text-sm text-slate-400 mt-1">No degraded, down, or stopped services detected.</p>
    </div>
  );
  const sorted = [...problems].sort((a, b) => {
    const order = { DOWN: 0, DEGRADED: 1, STOPPED: 2 };
    return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span><strong className="text-slate-800">{problems.length}</strong> service{problems.length !== 1 ? "s" : ""} need attention</span>
        {problems.filter(p => p.status === "DOWN").length > 0 && <Badge variant="danger">{problems.filter(p => p.status === "DOWN").length} Down</Badge>}
        {problems.filter(p => p.status === "DEGRADED").length > 0 && <Badge variant="warning">{problems.filter(p => p.status === "DEGRADED").length} Degraded</Badge>}
        {problems.filter(p => p.status === "STOPPED").length > 0 && <Badge variant="stopped">{problems.filter(p => p.status === "STOPPED").length} Stopped</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map(item => {
          const totalRestarts = item.pods.reduce((s, p) => s + p.restartCount, 0);
          const problemPods = item.pods.filter(p => p.phase !== "Running" || p.restartCount > 0 || p.reason);
          return (
            <Card key={`${item.cluster}/${item.namespace}/${item.name}`} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(item)}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium text-slate-800 truncate">{item.name}</p><p className="text-xs text-slate-400 mt-0.5">{item.cluster} · {item.namespace}</p></div>
                  <StatusBadge status={item.status} />
                </div>
                <ReplicaBar desired={item.desiredReplicas} ready={item.readyReplicas} available={item.availableReplicas} />
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{item.namespace}</Badge>
                  {totalRestarts > 0 && <span className="flex items-center gap-1 text-amber-600"><RotateCcw className="h-3 w-3" />{totalRestarts} restarts</span>}
                </div>
                {problemPods.length > 0 && (
                  <div className="rounded bg-red-50 border border-red-200 px-2 py-1.5 text-xs text-red-700">
                    {problemPods.length} pod{problemPods.length !== 1 ? "s" : ""} with issues
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {selected && <ServiceModal svc={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─── Alerts panel ─────────────────────────────────────────────────────────────

function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Bell className="h-12 w-12 text-slate-200 mb-4" />
      <p className="text-slate-400">No active alerts</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {alerts.map(alert => (
        <div key={alert.id} className={cn("flex items-start gap-3 rounded-lg border p-4", alert.severity === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50")}>
          <AlertTriangle className={cn("h-4 w-4 mt-0.5 flex-shrink-0", alert.severity === "critical" ? "text-red-500" : "text-amber-500")} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm text-slate-800">{alert.title}</p>
              <Badge variant={alert.severity === "critical" ? "danger" : "warning"} className="text-xs">{alert.severity}</Badge>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>
            <p className="text-xs text-slate-400 mt-1">{alert.cluster} / {alert.namespace} · {new Date(alert.detectedAt).toLocaleTimeString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Account settings ─────────────────────────────────────────────────────────

function AccountForm({ initial, onSave, onCancel }: {
  initial?: Partial<AccountConfig>;
  onSave: (data: Omit<AccountConfig, "id" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [profile, setProfile] = useState(initial?.awsProfile ?? "");
  const [region, setRegion] = useState(initial?.region ?? "us-east-1");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [ignored, setIgnored] = useState((initial?.ignoredNamespaces ?? []).join("\n"));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Account name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="production-hnd" />
        </div>
        <div className="space-y-1.5">
          <Label>AWS Profile</Label>
          <Input value={profile} onChange={e => setProfile(e.target.value)} placeholder="ficohsa-prod" className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label>Region</Label>
          <Input value={region} onChange={e => setRegion(e.target.value)} placeholder="us-east-1" />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={enabled} onCheckedChange={setEnabled} id="enabled" />
          <Label htmlFor="enabled">Enabled</Label>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Ignored namespaces <span className="text-slate-400 font-normal">(one per line)</span></Label>
        <Textarea value={ignored} onChange={e => setIgnored(e.target.value)} rows={5} placeholder={"kube-system\ncert-manager\namazon-cloudwatch"} />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({ name, awsProfile: profile, region, enabled, ignoredNamespaces: ignored.split("\n").map(s => s.trim()).filter(Boolean) })} disabled={!name || !profile || !region}>Save account</Button>
      </div>
    </div>
  );
}

function AccountsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts/list");
      if (res.ok) { const d = await res.json(); setAccounts(d.accounts ?? []); }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function create(data: Omit<AccountConfig, "id" | "createdAt">) {
    const res = await fetch("/api/accounts/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { setCreating(false); load(); } else { const d = await res.json(); setError(d.error); }
  }

  async function update(id: string, data: Partial<AccountConfig>) {
    const res = await fetch(`/api/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { setEditingId(null); load(); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    load();
  }

  if (!isAdmin) return <div className="py-12 text-center text-slate-400">Admin access required to manage accounts.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{accounts.length} account{accounts.length !== 1 ? "s" : ""} configured</p>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add account</Button>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      {creating && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3"><CardTitle className="text-sm">New AWS Account</CardTitle></CardHeader>
          <CardContent><AccountForm onSave={create} onCancel={() => setCreating(false)} /></CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Server className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No accounts yet. Add your first AWS account to start scanning.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(account => (
            <Card key={account.id}>
              {editingId === account.id ? (
                <CardContent className="pt-6">
                  <AccountForm initial={account} onSave={d => update(account.id, d)} onCancel={() => setEditingId(null)} />
                </CardContent>
              ) : (
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-800">{account.name}</span>
                        <Badge variant={account.enabled ? "success" : "stopped"} className="text-xs">{account.enabled ? "Enabled" : "Disabled"}</Badge>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-slate-500">
                        <span className="font-mono">{account.awsProfile}</span>
                        <span>{account.region}</span>
                        <span>{account.ignoredNamespaces.length} ignored NS</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditingId(account.id)}><Edit3 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(account.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface DashboardProps {
  username: string;
  role: "admin" | "viewer";
}

export default function Dashboard({ username, role }: DashboardProps) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [inventory, setInventory] = useState<ServiceInventory[]>([]);
  const [metadata, setMetadata] = useState<InventoryMetadata | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stale, setStale] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [scanError, setScanError] = useState("");
  const [scanDiag, setScanDiag] = useState<{
    clusterErrors: { cluster: string; account: string; error: string }[];
    accountErrors: { account: string; error: string }[];
    total: number;
    clustersOk: number;
    clustersScanned: number;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await fetch("/api/inventory/data");
      if (res.ok) {
        const d = await res.json();
        setInventory(d.inventory ?? []);
        setMetadata(d.metadata ?? null);
        setAlerts(d.alerts ?? []);
        setStale(d.stale ?? true);
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function triggerScan() {
    setScanning(true);
    setScanError("");
    setScanDiag(null);
    try {
      const res = await fetch("/api/inventory/scan", { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        setScanDiag({
          clusterErrors: d.clusterErrors ?? [],
          accountErrors: d.accountErrors ?? [],
          total: d.total ?? 0,
          clustersOk: d.clustersOk ?? 0,
          clustersScanned: d.clustersScanned ?? 0,
        });
        await fetchData();
      } else {
        setScanError(d.error ?? "Scan failed");
      }
    } catch (e) {
      setScanError("Network error — is the Next.js server running?");
    } finally {
      setScanning(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const problems = useMemo(() => inventory.filter(i => i.status !== "OK"), [inventory]);
  const criticalAlerts = alerts.filter(a => a.severity === "critical");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Cloud className="h-4 w-4" />
              </div>
              <div>
                <span className="font-semibold text-slate-900 text-sm">EKS Inventory</span>
                <span className="hidden sm:inline text-slate-400 text-xs ml-2">· Multi-Account</span>
              </div>
              {stale && !loadingData && (
                <Badge variant="warning" className="text-xs hidden sm:flex">Stale data</Badge>
              )}
              {criticalAlerts.length > 0 && (
                <Badge variant="critical" className="text-xs gap-1 hidden sm:flex">
                  <Bell className="h-3 w-3" />{criticalAlerts.length} critical
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {metadata && (
                <span className="hidden lg:inline text-xs text-slate-400">
                  Last scan: {new Date(metadata.lastRefresh).toLocaleTimeString()}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={triggerScan} disabled={scanning} className="gap-1.5">
                <RefreshCw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
                {scanning ? "Scanning…" : "Scan"}
              </Button>
              <span className="hidden sm:inline text-xs text-slate-400 border-l border-slate-200 pl-3">{username}</span>
              <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
                <LogOut className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Fatal scan error */}
        {scanError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Scan failed</p>
              <p className="text-xs text-red-600 mt-0.5 font-mono">{scanError}</p>
              <p className="text-xs text-red-500 mt-1">Check the Next.js terminal for detailed logs.</p>
            </div>
            <button onClick={() => setScanError("")}><X className="h-4 w-4 text-red-400" /></button>
          </div>
        )}

        {/* Scan diagnostics (partial failures or success summary) */}
        {scanDiag && (
          <div className={`rounded-lg border px-4 py-3 space-y-2 ${
            scanDiag.clusterErrors.length > 0 || scanDiag.accountErrors.length > 0
              ? "border-amber-200 bg-amber-50"
              : "border-emerald-200 bg-emerald-50"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {scanDiag.clusterErrors.length > 0 || scanDiag.accountErrors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                )}
                <span className="text-sm font-medium text-slate-800">
                  Scan complete — {scanDiag.total} services across {scanDiag.clustersOk}/{scanDiag.clustersScanned} clusters
                </span>
              </div>
              <button onClick={() => setScanDiag(null)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            {scanDiag.accountErrors.map((e, i) => (
              <div key={i} className="rounded bg-red-100 border border-red-200 px-3 py-2 text-xs">
                <span className="font-semibold text-red-800">Account "{e.account}": </span>
                <span className="font-mono text-red-700">{e.error}</span>
              </div>
            ))}
            {scanDiag.clusterErrors.map((e, i) => (
              <div key={i} className="rounded bg-white/70 border border-amber-200 px-3 py-2 text-xs">
                <span className="font-semibold text-amber-800">{e.account}/{e.cluster}: </span>
                <span className="font-mono text-amber-700">{e.error}</span>
              </div>
            ))}
            {(scanDiag.clusterErrors.length > 0 || scanDiag.accountErrors.length > 0) && (
              <p className="text-xs text-slate-500">See the Next.js terminal for full stack traces.</p>
            )}
          </div>
        )}

        {/* KPI cards */}
        {metadata && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: Box, label: "Services", value: metadata.totalServices, sub: "Total deployments" },
              { icon: Layers, label: "Clusters", value: metadata.totalClusters, sub: "EKS clusters" },
              { icon: Server, label: "Namespaces", value: metadata.totalNamespaces, sub: "Active" },
              { icon: Cpu, label: "Pods", value: metadata.totalPods, sub: "Total pods" },
              { icon: CheckCircle, label: "Healthy", value: inventory.filter(i => i.status === "OK").length, sub: "Status OK", color: "text-emerald-500" },
              { icon: AlertTriangle, label: "Problems", value: problems.length, sub: "Need attention", color: problems.length > 0 ? "text-red-500" : "text-emerald-500" },
            ].map(({ icon: Icon, label, value, sub, color }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                    </div>
                    <Icon className={cn("h-5 w-5 mt-0.5", color ?? "text-slate-400")} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No data state */}
        {!loadingData && inventory.length === 0 && !metadata && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Cloud className="h-16 w-16 text-slate-200 mb-6" />
            <h2 className="text-xl font-semibold text-slate-700 mb-2">No inventory data yet</h2>
            <p className="text-sm text-slate-400 mb-6 max-w-md">
              Configure your AWS accounts in Settings, then click <strong>Scan</strong> to fetch your EKS inventory.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setTab("settings")}>
                <Settings className="h-4 w-4 mr-1.5" /> Configure accounts
              </Button>
              <Button onClick={triggerScan} disabled={scanning}>
                <RefreshCw className={cn("h-4 w-4 mr-1.5", scanning && "animate-spin")} />{scanning ? "Scanning…" : "Start scan"}
              </Button>
            </div>
          </div>
        )}

        {/* Main tabs */}
        {(inventory.length > 0 || loadingData) && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-white border border-slate-200 h-10 p-1">
              <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
                <Table2 className="h-3.5 w-3.5" />All Services
              </TabsTrigger>
              <TabsTrigger value="clusters" className="gap-1.5 text-xs sm:text-sm">
                <Layers className="h-3.5 w-3.5" />By Cluster
              </TabsTrigger>
              <TabsTrigger value="problems" className="gap-1.5 text-xs sm:text-sm">
                <AlertTriangle className="h-3.5 w-3.5" />Problems
                {problems.length > 0 && <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{problems.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="alerts" className="gap-1.5 text-xs sm:text-sm">
                <Bell className="h-3.5 w-3.5" />Alerts
                {alerts.length > 0 && <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{alerts.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
                <Settings className="h-3.5 w-3.5" />Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              {loadingData ? <div className="text-center py-12 text-slate-400">Loading inventory…</div> : <InventoryTable data={inventory} />}
            </TabsContent>

            <TabsContent value="clusters" className="mt-4">
              {loadingData ? <div className="text-center py-12 text-slate-400">Loading…</div> : <ClusterView inventory={inventory} />}
            </TabsContent>

            <TabsContent value="problems" className="mt-4">
              <ProblemsView problems={problems} />
            </TabsContent>

            <TabsContent value="alerts" className="mt-4">
              <AlertsPanel alerts={alerts} />
            </TabsContent>

            <TabsContent value="settings" className="mt-4">
              <div className="max-w-2xl">
                <h2 className="text-base font-semibold text-slate-800 mb-1">AWS Account Configuration</h2>
                <p className="text-sm text-slate-500 mb-6">
                  Configure the AWS SSO profiles to scan. Each profile must be configured in your <code className="font-mono text-xs bg-slate-100 px-1 rounded">~/.aws/config</code> and authenticated via <code className="font-mono text-xs bg-slate-100 px-1 rounded">aws sso login --profile &lt;name&gt;</code>.
                </p>
                <AccountsPanel isAdmin={role === "admin"} />
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Settings tab always accessible even with no data */}
        {inventory.length === 0 && !loadingData && tab === "settings" && (
          <Tabs value="settings" onValueChange={setTab}>
            <TabsList className="bg-white border border-slate-200 h-10 p-1">
              <TabsTrigger value="settings"><Settings className="h-3.5 w-3.5 mr-1.5" />Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="settings" className="mt-4">
              <div className="max-w-2xl"><AccountsPanel isAdmin={role === "admin"} /></div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

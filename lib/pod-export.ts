import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ServiceInventory } from "@/types";

export type PodExportPhaseFilter = "ALL" | "Running" | "Pending" | "Succeeded" | "Failed" | "Unknown";

export interface PodExportFilters {
  phase: PodExportPhaseFilter;
  onlyProblematic: boolean;
}

export type PodExportColumn =
  | "account"
  | "region"
  | "cluster"
  | "namespace"
  | "service"
  | "pod"
  | "phase"
  | "node"
  | "restarts"
  | "reason"
  | "message";

export const POD_EXPORT_COLUMNS: ReadonlyArray<{ key: PodExportColumn; label: string }> = [
  { key: "account", label: "Account" },
  { key: "region", label: "Region" },
  { key: "cluster", label: "Cluster" },
  { key: "namespace", label: "Namespace" },
  { key: "service", label: "Service" },
  { key: "pod", label: "Pod" },
  { key: "phase", label: "Phase" },
  { key: "node", label: "Node" },
  { key: "restarts", label: "Restarts" },
  { key: "reason", label: "Reason" },
  { key: "message", label: "Message" },
];

export const DEFAULT_POD_EXPORT_COLUMNS: ReadonlyArray<PodExportColumn> = POD_EXPORT_COLUMNS.map((c) => c.key);

interface PodExportRow {
  account: string;
  region: string;
  cluster: string;
  namespace: string;
  service: string;
  pod: string;
  phase: string;
  node: string;
  restarts: number;
  reason: string;
  message: string;
}

function getColumnLabels(columns: PodExportColumn[]): string[] {
  const set = new Set(columns);
  return POD_EXPORT_COLUMNS.filter((column) => set.has(column.key)).map((column) => column.label);
}

function getColumnValues(row: PodExportRow, columns: PodExportColumn[]): Array<string | number> {
  return columns.map((column) => row[column]);
}

function normalizePhase(phase: string | null): string {
  if (!phase) return "Unknown";
  return phase;
}

function isProblematicPod(row: PodExportRow): boolean {
  return row.phase !== "Running" || row.restarts > 0 || row.reason !== "-";
}

function quoteCsv(value: string | number): string {
  const text = String(value);
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadBlob(content: BlobPart, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildPodExportRows(
  services: ServiceInventory[],
  filters: PodExportFilters,
): PodExportRow[] {
  const rows = services.flatMap((svc) => {
    return svc.pods.map((pod) => ({
      account: svc.account,
      region: svc.region,
      cluster: svc.cluster,
      namespace: svc.namespace,
      service: svc.name,
      pod: pod.name,
      phase: normalizePhase(pod.phase),
      node: pod.nodeName ?? "-",
      restarts: pod.restartCount,
      reason: pod.reason ?? "-",
      message: pod.message ?? "-",
    }));
  });

  return rows.filter((row) => {
    const byPhase = filters.phase === "ALL" || row.phase === filters.phase;
    const byProblem = !filters.onlyProblematic || isProblematicPod(row);
    return byPhase && byProblem;
  });
}

export function exportPodsToCsv(rows: PodExportRow[], fileName: string, columns: PodExportColumn[]): void {
  const safeColumns = columns.length > 0 ? columns : [...DEFAULT_POD_EXPORT_COLUMNS];
  const header = getColumnLabels(safeColumns);

  const lines = [
    header.join(","),
    ...rows.map((row) => getColumnValues(row, safeColumns).map(quoteCsv).join(",")),
  ];

  downloadBlob(lines.join("\n"), fileName, "text/csv;charset=utf-8;");
}

export function exportPodsToPdf(rows: PodExportRow[], fileName: string, columns: PodExportColumn[]): void {
  const safeColumns = columns.length > 0 ? columns : [...DEFAULT_POD_EXPORT_COLUMNS];
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(12);
  doc.text("EKS Inventory - Pods export", 40, 30);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 46);

  autoTable(doc, {
    startY: 58,
    head: [getColumnLabels(safeColumns)],
    body: rows.map((row) => getColumnValues(row, safeColumns).map(String)),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42] },
    theme: "striped",
  });

  doc.save(fileName);
}


import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { AccountConfig, AccountConfigInput } from "@/types";

const STORE_PATH = path.join(process.cwd(), ".eks-accounts.json");

const DEFAULT_IGNORED = [
  "kube-system",
  "cert-manager",
  "amazon-cloudwatch",
  "datadog",
  "dynatrace",
  "external-secrets",
  "kubecost",
  "opentelemetry-operator-system",
];

function read(): AccountConfig[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as AccountConfig[];
  } catch {
    return [];
  }
}

function write(accounts: AccountConfig[]) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(accounts, null, 2), "utf-8");
}

export const accountStore = {
  list(): AccountConfig[] {
    return read();
  },

  get(id: string): AccountConfig | undefined {
    return read().find((a) => a.id === id);
  },

  create(input: AccountConfigInput): AccountConfig {
    const accounts = read();
    const account: AccountConfig = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ignoredNamespaces: input.ignoredNamespaces?.length
        ? input.ignoredNamespaces
        : DEFAULT_IGNORED,
    };
    accounts.push(account);
    write(accounts);
    return account;
  },

  update(id: string, input: Partial<AccountConfigInput>): AccountConfig {
    const accounts = read();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);
    accounts[idx] = { ...accounts[idx], ...input };
    write(accounts);
    return accounts[idx];
  },

  delete(id: string): void {
    const accounts = read().filter((a) => a.id !== id);
    write(accounts);
  },
};

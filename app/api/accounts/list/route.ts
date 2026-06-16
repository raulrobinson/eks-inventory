import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { accountStore } from "@/lib/account-store";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "FORBIDDEN" ? 403 : 401 });
  }
  return NextResponse.json({ accounts: accountStore.list() });
}

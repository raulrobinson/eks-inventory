import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { accountStore } from "@/lib/account-store";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "FORBIDDEN" ? 403 : 401 });
  }
  try {
    const body = await req.json();
    const { name, awsProfile, region, enabled, ignoredNamespaces } = body;
    if (!name || !awsProfile || !region) {
      return NextResponse.json({ error: "name, awsProfile, region are required" }, { status: 400 });
    }
    const account = accountStore.create({
      name,
      awsProfile,
      region,
      enabled: enabled ?? true,
      ignoredNamespaces: ignoredNamespaces ?? [],
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

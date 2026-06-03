import { NextResponse } from "next/server";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { saveDemoUserProfile, type DemoUserProfile } from "@/lib/tracking";

export async function POST(req: Request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  const body = (await req.json()) as Partial<DemoUserProfile>;
  if (
    !body.first ||
    !body.last ||
    !body.email ||
    !body.phone ||
    !body.company ||
    !body.biz
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  await saveDemoUserProfile(uid, {
    first: body.first,
    last: body.last,
    email: body.email.toLowerCase(),
    phone: body.phone,
    company: body.company,
    title: body.title,
    biz: body.biz,
    createdAt: body.createdAt ?? Date.now(),
  });
  return NextResponse.json({ ok: true });
}

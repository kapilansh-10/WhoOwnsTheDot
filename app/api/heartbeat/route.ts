import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "wotd_visitor_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST() {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  const isNew = !isUuid(existing);
  const visitorId: string = isNew ? randomUUID() : existing;

  const { data, error } = await getSupabaseServer().rpc("heartbeat", {
    p_visitor_id: visitorId,
    p_expire_seconds: 45,
  });

  if (error) {
    return NextResponse.json({ error: "Could not record presence." }, { status: 500 });
  }

  const watching = Number((data as { watching?: number } | null)?.watching ?? 0);
  const visitorsSinceLaunch = Number((data as { visitors_since_launch?: number } | null)?.visitors_since_launch ?? 0);

  const response = NextResponse.json({ watching, visitors_since_launch: visitorsSinceLaunch });
  if (isNew) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }
  return response;
}

import { NextResponse } from "next/server";
import { verifyDodoWebhook } from "@/lib/dodo";
import { getSupabaseServer } from "@/lib/supabase";
import { cleanName, cleanUrl } from "@/lib/validation";

export const runtime = "nodejs";

function metadataValue(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

export async function POST(request: Request) {
  const payload = await request.text();

  let event: ReturnType<typeof verifyDodoWebhook>;
  try {
    event = verifyDodoWebhook(payload, request.headers);
  } catch (error) {
    console.error("Dodo webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type !== "payment.succeeded") {
    return NextResponse.json({ received: true });
  }

  const payment = event.data;
  if (payment.payload_type && payment.payload_type !== "Payment") {
    return NextResponse.json({ received: true });
  }
  if (payment.status && payment.status !== "succeeded") {
    return NextResponse.json({ received: true });
  }
  if (payment.currency !== "USD") {
    return NextResponse.json({ error: "Unexpected payment currency." }, { status: 400 });
  }

  const ownerName = cleanName(metadataValue(payment.metadata, "owner_name"));
  const ownerUrl = cleanUrl(metadataValue(payment.metadata, "owner_url"));
  const expectedAmount = Number(metadataValue(payment.metadata, "expected_amount_cents"));
  const paidAmount = payment.total_amount;
  const paymentId = payment.payment_id ?? null;
  const checkoutSessionId = payment.checkout_session_id ?? null;

  if (!paymentId) {
    console.error("Dodo webhook missing payment_id", { checkoutSessionId });
    return NextResponse.json({ error: "Missing payment ID." }, { status: 400 });
  }

  if (!ownerName || !Number.isInteger(expectedAmount) || expectedAmount <= 0) {
    return NextResponse.json({ error: "Invalid payment metadata." }, { status: 400 });
  }
  if (metadataValue(payment.metadata, "owner_url") && !ownerUrl) {
    return NextResponse.json({ error: "Invalid owner URL." }, { status: 400 });
  }
  if (paidAmount !== expectedAmount) {
    console.error("Dodo webhook payment amount mismatch", { paymentId, paidAmount, expectedAmount });
    return NextResponse.json({ error: "Payment amount mismatch." }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc("claim_dot", {
    p_owner_name: ownerName,
    p_owner_url: ownerUrl,
    p_amount_cents: paidAmount,
    p_dodo_payment_id: paymentId,
    p_dodo_checkout_session_id: checkoutSessionId,
  });

  if (error) {
    console.error("Ownership claim failed", { paymentId, paidAmount, expectedAmount, message: error.message });
    return NextResponse.json({ error: "Could not claim the dot." }, { status: 500 });
  }

  return NextResponse.json({ received: true, result: data });
}

import DodoPayments from "dodopayments";
import { Webhook } from "standardwebhooks";
import type { WebhookPayload } from "dodopayments/resources/webhook-events";

type DodoEnvironment = "live_mode" | "test_mode";

let dodo: DodoPayments | undefined;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function environment(): DodoEnvironment {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode";
}

export function getDodo() {
  if (!dodo) {
    dodo = new DodoPayments({
      bearerToken: required("DODO_PAYMENTS_API_KEY"),
      environment: environment(),
    });
  }

  return dodo;
}

export async function createDotCheckout(params: {
  amountCents: number;
  ownerName: string;
  ownerUrl: string | null;
  imagePath: string | null;
  returnUrl: string;
  cancelUrl: string;
}) {
  const session = await getDodo().checkoutSessions.create({
    product_cart: [
      {
        product_id: required("DODO_PRODUCT_ID"),
        quantity: 1,
        amount: params.amountCents,
      },
    ],
    metadata: {
      owner_name: params.ownerName,
      owner_url: params.ownerUrl ?? "",
      expected_amount_cents: String(params.amountCents),
      // Server-validated staged storage path (e.g. "staged/<uuid>.webp") or "".
      // The webhook promotes this to the owner only after successful payment.
      image_path: params.imagePath ?? "",
    },
    return_url: params.returnUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.checkout_url) throw new Error("Dodo did not return a checkout URL.");

  return {
    checkoutUrl: session.checkout_url,
    checkoutSessionId: session.session_id,
  };
}

export function verifyDodoWebhook(payload: string, headers: Headers) {
  const webhook = new Webhook(required("DODO_WEBHOOK_KEY"));
  return webhook.verify(payload, {
    "webhook-id": headers.get("webhook-id") ?? "",
    "webhook-signature": headers.get("webhook-signature") ?? "",
    "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
  }) as WebhookPayload;
}

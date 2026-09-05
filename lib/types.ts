export type DotState = {
  id: string;
  owner_name: string;
  owner_url: string | null;
  amount_cents: number;
  dodo_payment_id: string | null;
  dodo_checkout_session_id: string | null;
  image_url: string | null;
  updated_at: string;
};

export type DotHistory = {
  id: string;
  owner_name: string;
  owner_url: string | null;
  amount_cents: number;
  dodo_payment_id: string | null;
  dodo_checkout_session_id: string | null;
  image_url: string | null;
  created_at: string;
};

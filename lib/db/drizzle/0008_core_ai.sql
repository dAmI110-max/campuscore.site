-- Dual premium products + Core AI usage ledger
-- seller_premium remains kind "premium" at 200000 (existing)
-- site_premium is kind "site_premium" at 300000 (Core AI + student pack)

ALTER TABLE commerce_orders DROP CONSTRAINT IF EXISTS commerce_order_kind;
ALTER TABLE commerce_orders DROP CONSTRAINT IF EXISTS commerce_premium_price;

ALTER TABLE commerce_orders ADD CONSTRAINT commerce_order_kind
  CHECK (kind IN ('marketplace', 'premium', 'site_premium'));

ALTER TABLE commerce_orders ADD CONSTRAINT commerce_premium_prices
  CHECK (
    (kind = 'premium' AND amount_minor = 200000)
    OR (kind = 'site_premium' AND amount_minor = 300000)
    OR (kind = 'marketplace')
  );

CREATE TABLE IF NOT EXISTS core_ai_usage (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES profiles(id),
  day_lagos date NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT core_ai_usage_nonneg CHECK (
    message_count >= 0 AND prompt_tokens >= 0 AND completion_tokens >= 0
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS core_ai_usage_user_day
  ON core_ai_usage (user_id, day_lagos);

CREATE TABLE IF NOT EXISTS core_ai_messages (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES profiles(id),
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT core_ai_message_role CHECK (role IN ('user', 'assistant', 'system'))
);
CREATE INDEX IF NOT EXISTS core_ai_messages_user_created
  ON core_ai_messages (user_id, created_at DESC);

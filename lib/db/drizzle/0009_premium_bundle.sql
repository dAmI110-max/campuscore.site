-- Premium bundle (Seller + Site) at discounted price
ALTER TABLE commerce_orders DROP CONSTRAINT IF EXISTS commerce_order_kind;
ALTER TABLE commerce_orders DROP CONSTRAINT IF EXISTS commerce_premium_prices;

ALTER TABLE commerce_orders ADD CONSTRAINT commerce_order_kind
  CHECK (kind IN ('marketplace', 'premium', 'site_premium', 'premium_bundle'));

ALTER TABLE commerce_orders ADD CONSTRAINT commerce_premium_prices
  CHECK (
    (kind = 'premium' AND amount_minor = 200000)
    OR (kind = 'site_premium' AND amount_minor = 300000)
    OR (kind = 'premium_bundle' AND amount_minor = 450000)
    OR (kind = 'marketplace')
  );

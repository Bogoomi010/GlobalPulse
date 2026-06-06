UPDATE payment_plans
SET is_active = 0
WHERE provider_name = 'toss';

UPDATE payment_plans
SET is_active = 0
WHERE provider_name = 'stripe'
  AND currency_code != 'KRW';

INSERT OR IGNORE INTO payment_plans
  (id, country_code, currency_code, amount, display_label, provider_name, provider_price_id, is_active)
VALUES
  ('krw-1000-stripe', 'WW', 'KRW', 1000, '1,000원', 'stripe', NULL, 1),
  ('krw-2000-stripe', 'WW', 'KRW', 2000, '2,000원', 'stripe', NULL, 1),
  ('krw-3000-stripe', 'WW', 'KRW', 3000, '3,000원', 'stripe', NULL, 1),
  ('krw-5000-stripe', 'WW', 'KRW', 5000, '5,000원', 'stripe', NULL, 1),
  ('krw-10000-stripe', 'WW', 'KRW', 10000, '10,000원', 'stripe', NULL, 1);

UPDATE payment_plans
SET country_code = 'WW',
    currency_code = 'KRW',
    provider_name = 'stripe',
    is_active = 1
WHERE id IN (
  'krw-1000-stripe',
  'krw-2000-stripe',
  'krw-3000-stripe',
  'krw-5000-stripe',
  'krw-10000-stripe'
);

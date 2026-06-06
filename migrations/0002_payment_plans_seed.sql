INSERT OR IGNORE INTO payment_plans
  (id, country_code, currency_code, amount, display_label, provider_name, provider_price_id, is_active)
VALUES
  ('krw-1000-toss', 'KR', 'KRW', 1000, '1,000원', 'toss', NULL, 1),
  ('krw-2000-toss', 'KR', 'KRW', 2000, '2,000원', 'toss', NULL, 1),
  ('krw-3000-toss', 'KR', 'KRW', 3000, '3,000원', 'toss', NULL, 1),
  ('krw-5000-toss', 'KR', 'KRW', 5000, '5,000원', 'toss', NULL, 1),
  ('krw-10000-toss', 'KR', 'KRW', 10000, '10,000원', 'toss', NULL, 1),
  ('usd-5-stripe', 'US', 'USD', 5, '$5', 'stripe', NULL, 1),
  ('usd-10-stripe', 'US', 'USD', 10, '$10', 'stripe', NULL, 1),
  ('jpy-500-stripe', 'JP', 'JPY', 500, '¥500', 'stripe', NULL, 1),
  ('eur-5-stripe', 'DE', 'EUR', 5, '€5', 'stripe', NULL, 1);

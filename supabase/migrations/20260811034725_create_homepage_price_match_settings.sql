CREATE TABLE public.homepage_price_match_settings (
  id text PRIMARY KEY CHECK (id = 'price-match'),
  enabled boolean NOT NULL DEFAULT true,
  heading text NOT NULL CHECK (char_length(heading) BETWEEN 1 AND 250),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1500),
  button_label text NOT NULL CHECK (char_length(button_label) BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.homepage_price_match_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.homepage_price_match_settings FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.homepage_price_match_settings TO service_role;

INSERT INTO public.homepage_price_match_settings (id, enabled, heading, description, button_label)
VALUES (
  'price-match',
  true,
  'We’ll Do Our Absolute Best To Meet or Beat Any Verified Competitor Price',
  'Found a better price? Send us the competitor’s current advertised price and give us the opportunity to save you even more.',
  'Contact Us'
);

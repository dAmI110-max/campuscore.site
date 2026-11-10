-- University-email eligibility + configurable Premium limits
-- Safe additive migration; no destructive changes.

CREATE TABLE IF NOT EXISTS institution_domains (
  id serial PRIMARY KEY,
  domain text NOT NULL,
  institution_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institution_domain_normalized CHECK (domain = lower(domain) AND domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')
);
CREATE UNIQUE INDEX IF NOT EXISTS institution_domains_domain_uidx ON institution_domains (domain);

-- Eligibility on profiles (pending until university email verified or admin/agent exemption)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS eligibility_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS eligibility_email text,
  ADD COLUMN IF NOT EXISTS eligibility_domain text,
  ADD COLUMN IF NOT EXISTS eligibility_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS eligibility_reviewed_by text REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS eligibility_note text;

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profile_eligibility_status
    CHECK (eligibility_status IN ('pending','verified','manual_verified','exempt','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS eligibility_requests (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES profiles(id),
  institution_name text NOT NULL,
  evidence_note text,
  status text NOT NULL DEFAULT 'open',
  reviewed_by text REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eligibility_request_status CHECK (status IN ('open','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS eligibility_requests_user_idx ON eligibility_requests (user_id, created_at DESC);

-- Configurable seller limits (all values are settings, not hard-coded in app logic)
ALTER TABLE platform_commerce
  ADD COLUMN IF NOT EXISTS free_listing_limit integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS free_images_per_listing integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS premium_listing_limit integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS premium_images_per_listing integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS premium_boosts_per_month integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS premium_boost_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS premium_price_minor bigint NOT NULL DEFAULT 200000;

DO $$ BEGIN
  ALTER TABLE platform_commerce ADD CONSTRAINT platform_commerce_limits_positive
    CHECK (
      free_listing_limit > 0 AND free_images_per_listing > 0
      AND premium_listing_limit >= free_listing_limit
      AND premium_images_per_listing >= free_images_per_listing
      AND premium_boosts_per_month >= 0 AND premium_boost_hours > 0
      AND premium_price_minor > 0
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

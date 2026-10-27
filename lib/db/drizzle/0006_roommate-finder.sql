-- REVIEWED APPLICATION DRAFT; NOT RUN AUTOMATICALLY OR APPLIED BY THIS TASK.
-- Confirm target, back up, and obtain approval before applying to any database.
-- Requires the existing profiles/academic_directory/user_blocks tables and the
-- reviewed campus_core_social role + runtime role membership.
BEGIN;
CREATE TABLE roommate_profiles (
  user_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  university_id integer NOT NULL REFERENCES academic_directory(id),
  campus text NOT NULL CHECK (length(btrim(campus)) BETWEEN 2 AND 100),
  accommodation_type text NOT NULL CONSTRAINT roommate_accommodation CHECK (accommodation_type IN ('hostel','flat','self-contained','any')),
  budget_min integer NOT NULL,
  budget_max integer NOT NULL,
  move_in_date date NOT NULL,
  sharing text NOT NULL CONSTRAINT roommate_sharing CHECK (sharing IN ('private','shared','either')),
  smoking text NOT NULL CONSTRAINT roommate_smoking CHECK (smoking IN ('non-smoker','smoker','either')),
  cleanliness text NOT NULL CONSTRAINT roommate_cleanliness CHECK (cleanliness IN ('tidy','flexible')),
  sleep text NOT NULL CONSTRAINT roommate_sleep CHECK (sleep IN ('early','late','flexible')),
  study text NOT NULL CONSTRAINT roommate_study CHECK (study IN ('quiet','social','flexible')),
  about text NOT NULL DEFAULT '' CHECK (length(about) <= 800),
  visible_fields text[] NOT NULL CONSTRAINT roommate_visibility CHECK (visible_fields <@ ARRAY['campus','budget','moveInDate','preferences','about']::text[]),
  active boolean NOT NULL DEFAULT true,
  hidden boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roommate_budget CHECK (budget_min >= 0 AND budget_max >= budget_min AND budget_max <= 100000000)
);
CREATE INDEX roommate_university_updated ON roommate_profiles(university_id, updated_at);
CREATE INDEX roommate_budget_search ON roommate_profiles(budget_min, budget_max);
CREATE TABLE roommate_interests (
  id serial PRIMARY KEY,
  sender_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roommate_not_self CHECK (sender_id <> recipient_id),
  CONSTRAINT roommate_interest_status CHECK (status IN ('pending','accepted','declined','cancelled'))
);
CREATE UNIQUE INDEX roommate_interest_pair ON roommate_interests(sender_id, recipient_id);
CREATE INDEX roommate_incoming ON roommate_interests(recipient_id, updated_at);
ALTER TABLE roommate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roommate_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE roommate_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE roommate_interests FORCE ROW LEVEL SECURITY;
CREATE POLICY roommate_read ON roommate_profiles FOR SELECT TO campus_core_social USING (
  user_id = nullif(current_setting('app.user_id', true), '') OR (
    active AND NOT hidden
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = user_id AND NOT p.suspended AND p.username IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
      (b.blocker_id = nullif(current_setting('app.user_id', true), '') AND b.blocked_id = user_id) OR
      (b.blocked_id = nullif(current_setting('app.user_id', true), '') AND b.blocker_id = user_id))
  )
);
CREATE POLICY roommate_create ON roommate_profiles FOR INSERT TO campus_core_social WITH CHECK (
  user_id = nullif(current_setting('app.user_id', true), '') AND NOT hidden
);
CREATE POLICY roommate_staff_read ON roommate_profiles FOR SELECT TO campus_core_social USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = nullif(current_setting('app.user_id', true), '') AND p.role IN ('admin','owner') AND NOT p.suspended)
);
CREATE POLICY roommate_edit ON roommate_profiles FOR UPDATE TO campus_core_social
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));
CREATE POLICY roommate_staff_edit ON roommate_profiles FOR UPDATE TO campus_core_social
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = nullif(current_setting('app.user_id', true), '') AND p.role IN ('admin','owner') AND NOT p.suspended))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = nullif(current_setting('app.user_id', true), '') AND p.role IN ('admin','owner') AND NOT p.suspended));
-- Staff and students share the restricted transaction role; row ownership alone
-- must not allow a student to undo a moderation decision, even via direct SQL.
CREATE FUNCTION protect_roommate_moderation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.hidden IS DISTINCT FROM NEW.hidden AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = nullif(current_setting('app.user_id', true), '')
      AND p.role IN ('admin','owner') AND NOT p.suspended
  ) THEN
    RAISE EXCEPTION 'Staff authorization required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_roommate_hidden BEFORE UPDATE OF hidden ON roommate_profiles
  FOR EACH ROW EXECUTE FUNCTION protect_roommate_moderation();
CREATE POLICY roommate_interest_read ON roommate_interests FOR SELECT TO campus_core_social USING (
  sender_id = nullif(current_setting('app.user_id', true), '') OR recipient_id = nullif(current_setting('app.user_id', true), '')
);
CREATE POLICY roommate_interest_create ON roommate_interests FOR INSERT TO campus_core_social WITH CHECK (
  sender_id = nullif(current_setting('app.user_id', true), '') AND status = 'pending'
);
CREATE POLICY roommate_interest_edit ON roommate_interests FOR UPDATE TO campus_core_social
  USING (sender_id = nullif(current_setting('app.user_id', true), '') OR recipient_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (sender_id = nullif(current_setting('app.user_id', true), '') OR recipient_id = nullif(current_setting('app.user_id', true), ''));
CREATE FUNCTION protect_roommate_interest() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := nullif(current_setting('app.user_id', true), '');
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('accepted','declined') AND OLD.recipient_id = actor) OR
    (OLD.status IN ('pending','accepted') AND NEW.status = 'cancelled' AND OLD.sender_id = actor)
  ) THEN
    RAISE EXCEPTION 'Invalid interest transition' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_roommate_interest_status BEFORE UPDATE OF status ON roommate_interests
  FOR EACH ROW EXECUTE FUNCTION protect_roommate_interest();
REVOKE ALL ON roommate_profiles, roommate_interests FROM PUBLIC;
GRANT SELECT ON roommate_profiles, roommate_interests, academic_directory TO campus_core_social;
CREATE POLICY roommate_university_lookup ON academic_directory FOR SELECT TO campus_core_social
  USING (kind = 'university' AND active);
GRANT INSERT (user_id, university_id, campus, accommodation_type, budget_min, budget_max, move_in_date,
  sharing, smoking, cleanliness, sleep, study, about, visible_fields, active) ON roommate_profiles TO campus_core_social;
-- hidden requires staff actor verification in protect_roommate_moderation.
GRANT UPDATE (university_id, campus, accommodation_type, budget_min, budget_max, move_in_date,
  sharing, smoking, cleanliness, sleep, study, about, visible_fields, active, hidden, updated_at) ON roommate_profiles TO campus_core_social;
GRANT INSERT (sender_id, recipient_id) ON roommate_interests TO campus_core_social;
GRANT UPDATE (status, updated_at) ON roommate_interests TO campus_core_social;
GRANT USAGE, SELECT ON SEQUENCE roommate_interests_id_seq TO campus_core_social;
COMMIT;

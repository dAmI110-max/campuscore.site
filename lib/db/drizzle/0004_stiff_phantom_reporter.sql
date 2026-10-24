DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'campus_core_social') THEN
    CREATE ROLE campus_core_social NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;--> statement-breakpoint
ALTER ROLE campus_core_social NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;--> statement-breakpoint
GRANT campus_core_social TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO campus_core_social;--> statement-breakpoint
GRANT SELECT ON profiles TO campus_core_social;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON conversations TO campus_core_social;--> statement-breakpoint
GRANT SELECT, INSERT ON direct_messages TO campus_core_social;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON user_blocks TO campus_core_social;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON notifications, user_reports TO campus_core_social;--> statement-breakpoint
GRANT INSERT ON audit_log TO campus_core_social;--> statement-breakpoint
GRANT USAGE ON SEQUENCE conversations_id_seq, direct_messages_id_seq, notifications_id_seq, user_reports_id_seq, audit_log_id_seq TO campus_core_social;--> statement-breakpoint
CREATE POLICY "social_profile_lookup" ON "profiles" AS PERMISSIVE FOR SELECT TO "campus_core_social" USING ("profiles"."id" = nullif(current_setting('app.user_id', true), '') or "profiles"."username" is not null);--> statement-breakpoint
CREATE POLICY "social_staff_audit_insert" ON "audit_log" AS PERMISSIVE FOR INSERT TO "campus_core_social" WITH CHECK ("audit_log"."actor_id" = nullif(current_setting('app.user_id', true), '') and exists
      (select 1 from profiles where id = nullif(current_setting('app.user_id', true), '')
       and role in ('admin','owner') and not suspended));
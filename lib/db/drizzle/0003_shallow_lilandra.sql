CREATE TABLE "user_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "cannot_block_self" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id")
);
--> statement-breakpoint
ALTER TABLE "user_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_a" text NOT NULL,
	"participant_b" text NOT NULL,
	"read_a" integer DEFAULT 0 NOT NULL,
	"read_b" integer DEFAULT 0 NOT NULL,
	"last_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_sorted_pair" CHECK ("conversations"."participant_a" collate "C" < "conversations"."participant_b" collate "C")
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_id" text NOT NULL,
	"client_message_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_text_length" CHECK (length(btrim("direct_messages"."body")) between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "direct_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"href" text NOT NULL,
	"conversation_id" integer,
	"message_id" integer,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"message_id" integer,
	"snapshot" text,
	"snapshot_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_other_user" CHECK ("user_reports"."reporter_id" <> "user_reports"."target_id"),
	CONSTRAINT "user_report_status" CHECK ("user_reports"."status" in ('pending','resolved','dismissed')),
	CONSTRAINT "user_report_reason_length" CHECK (length(btrim("user_reports"."reason")) between 10 and 1000)
);
--> statement-breakpoint
ALTER TABLE "user_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_profiles_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_profiles_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_a_profiles_id_fk" FOREIGN KEY ("participant_a") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_b_profiles_id_fk" FOREIGN KEY ("participant_b") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_direct_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."direct_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_target_id_profiles_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_message_id_direct_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."direct_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "block_incoming" ON "user_blocks" USING btree ("blocked_id","blocker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_direct_conversation" ON "conversations" USING btree ("participant_a","participant_b");--> statement-breakpoint
CREATE INDEX "conversation_a_updated" ON "conversations" USING btree ("participant_a","updated_at");--> statement-breakpoint
CREATE INDEX "conversation_b_updated" ON "conversations" USING btree ("participant_b","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_retry_key" ON "direct_messages" USING btree ("conversation_id","sender_id","client_message_id");--> statement-breakpoint
CREATE INDEX "conversation_history" ON "direct_messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_once" ON "notifications" USING btree ("user_id","event_key");--> statement-breakpoint
CREATE INDEX "notification_user_history" ON "notifications" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "notification_unread" ON "notifications" USING btree ("user_id","id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_user_report" ON "user_reports" USING btree ("reporter_id","target_id") WHERE "user_reports"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "user_report_queue" ON "user_reports" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "direct_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_blocks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "block_party_read" ON "user_blocks" AS PERMISSIVE FOR SELECT TO public USING ("user_blocks"."blocker_id" = nullif(current_setting('app.user_id', true), '') or "user_blocks"."blocked_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "block_owner_write" ON "user_blocks" AS PERMISSIVE FOR ALL TO public USING ("user_blocks"."blocker_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("user_blocks"."blocker_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "conversation_participant_select" ON "conversations" AS PERMISSIVE FOR SELECT TO public USING (participant_a = nullif(current_setting('app.user_id', true), '') or participant_b = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "conversation_participant_insert" ON "conversations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (participant_a = nullif(current_setting('app.user_id', true), '') or participant_b = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "conversation_participant_update" ON "conversations" AS PERMISSIVE FOR UPDATE TO public USING (participant_a = nullif(current_setting('app.user_id', true), '') or participant_b = nullif(current_setting('app.user_id', true), '')) WITH CHECK (participant_a = nullif(current_setting('app.user_id', true), '') or participant_b = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "message_participant_read" ON "direct_messages" AS PERMISSIVE FOR SELECT TO public USING (exists (select 1 from conversations c where c.id = conversation_id and (c.participant_a = nullif(current_setting('app.user_id', true), '') or c.participant_b = nullif(current_setting('app.user_id', true), ''))));--> statement-breakpoint
CREATE POLICY "message_sender_insert" ON "direct_messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("direct_messages"."sender_id" = nullif(current_setting('app.user_id', true), '') and exists (select 1 from conversations c where c.id = conversation_id and (c.participant_a = nullif(current_setting('app.user_id', true), '') or c.participant_b = nullif(current_setting('app.user_id', true), '')))
    and not exists (select 1 from conversations c join user_blocks b on
      (b.blocker_id=c.participant_a and b.blocked_id=c.participant_b) or
      (b.blocker_id=c.participant_b and b.blocked_id=c.participant_a)
      where c.id=conversation_id));--> statement-breakpoint
CREATE POLICY "notification_recipient_read" ON "notifications" AS PERMISSIVE FOR SELECT TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "notification_recipient_update" ON "notifications" AS PERMISSIVE FOR UPDATE TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("notifications"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "notification_event_insert" ON "notifications" AS PERMISSIVE FOR INSERT TO public WITH CHECK (exists (select 1 from profiles where id = nullif(current_setting('app.user_id', true), '') and role in ('admin','owner') and not suspended) or
    ("notifications"."kind"='message' and exists (
      select 1 from direct_messages m join conversations c on c.id=m.conversation_id
      where m.id="notifications"."message_id" and c.id="notifications"."conversation_id" and m.sender_id=nullif(current_setting('app.user_id', true), '')
      and "notifications"."user_id"<>nullif(current_setting('app.user_id', true), '') and ("notifications"."user_id"=c.participant_a or "notifications"."user_id"=c.participant_b))));--> statement-breakpoint
CREATE POLICY "user_report_author_or_staff_read" ON "user_reports" AS PERMISSIVE FOR SELECT TO public USING ("user_reports"."reporter_id" = nullif(current_setting('app.user_id', true), '') or exists (select 1 from profiles where id = nullif(current_setting('app.user_id', true), '') and role in ('admin','owner') and not suspended));--> statement-breakpoint
CREATE POLICY "user_report_author_insert" ON "user_reports" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("user_reports"."reporter_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "user_report_staff_review" ON "user_reports" AS PERMISSIVE FOR UPDATE TO public USING (exists (select 1 from profiles where id = nullif(current_setting('app.user_id', true), '') and role in ('admin','owner') and not suspended)) WITH CHECK (exists (select 1 from profiles where id = nullif(current_setting('app.user_id', true), '') and role in ('admin','owner') and not suspended));
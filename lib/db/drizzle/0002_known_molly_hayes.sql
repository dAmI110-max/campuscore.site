CREATE TABLE "access_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"requester_id" text NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_reason" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "access_request_action" CHECK ("access_requests"."action" in ('promote','demote')),
	CONSTRAINT "access_request_status" CHECK ("access_requests"."status" in ('pending','approved','rejected','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT "profile_role";--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requester_id_profiles_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_target_id_profiles_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_access_request" ON "access_requests" USING btree ("requester_id","target_id","action") WHERE "access_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "one_platform_owner" ON "profiles" USING btree ("role") WHERE "profiles"."role" = 'owner';--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profile_role" CHECK ("profiles"."role" in ('student','admin','owner'));
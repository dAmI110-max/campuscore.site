CREATE TABLE "academic_directory" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"source_url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "directory_kind" CHECK ("academic_directory"."kind" in ('country','university','faculty','department'))
);
--> statement-breakpoint
CREATE TABLE "institution_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"source_url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"username" text,
	"country_id" integer,
	"university_id" integer,
	"faculty_id" integer,
	"department_id" integer,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_path" text,
	"show_academics" boolean DEFAULT true NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_unique" UNIQUE("username"),
	CONSTRAINT "username_normalized" CHECK ("profiles"."username" is null or ("profiles"."username" = lower("profiles"."username") and "profiles"."username" ~ '^[a-z][a-z0-9_]{2,23}$')),
	CONSTRAINT "profile_role" CHECK ("profiles"."role" in ('student','admin'))
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"price" double precision,
	"location" text DEFAULT '' NOT NULL,
	"university_id" integer NOT NULL,
	"condition" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"closes_at" date,
	"resource_url" text DEFAULT '' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_kind" CHECK ("listings"."kind" in ('marketplace','accommodation','services','opportunities','study','communities','events')),
	CONSTRAINT "listing_status" CHECK ("listings"."status" in ('draft','published','unavailable')),
	CONSTRAINT "listing_nonnegative_price" CHECK ("listings"."price" is null or ("listings"."price" >= 0 and "listings"."price" <= 1000000000))
);
--> statement-breakpoint
CREATE TABLE "saved_listings" (
	"user_id" text NOT NULL,
	"listing_id" integer NOT NULL,
	CONSTRAINT "saved_listings_user_id_listing_id_pk" PRIMARY KEY("user_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"listing_id" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"object_path" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"finalized_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_directory" ADD CONSTRAINT "academic_directory_parent_id_academic_directory_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."academic_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_requests" ADD CONSTRAINT "institution_requests_parent_id_academic_directory_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."academic_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_country_id_academic_directory_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."academic_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_university_id_academic_directory_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."academic_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_faculty_id_academic_directory_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."academic_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_department_id_academic_directory_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."academic_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_university_id_academic_directory_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."academic_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_parent_name" ON "academic_directory" USING btree ("kind","parent_id","name");--> statement-breakpoint
CREATE INDEX "listing_browse" ON "listings" USING btree ("kind","status","university_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_owner" ON "listings" USING btree ("owner_id");
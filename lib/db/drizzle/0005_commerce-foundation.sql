CREATE TABLE "commerce_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commerce_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"buyer_id" text NOT NULL,
	"seller_id" text,
	"listing_id" integer,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text,
	"provider_reference" text,
	"processing_fee_minor" bigint,
	"platform_fee_minor" bigint,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_order_kind" CHECK ("commerce_orders"."kind" in ('marketplace','premium')),
	CONSTRAINT "commerce_order_status" CHECK ("commerce_orders"."status" in ('pending','paid','failed','cancelled','refunded','partially_refunded','disputed')),
	CONSTRAINT "commerce_order_currency" CHECK ("commerce_orders"."currency" = 'NGN'),
	CONSTRAINT "commerce_order_amount" CHECK ("commerce_orders"."amount_minor" > 0 and "commerce_orders"."amount_minor" <= 9007199254740991 and "commerce_orders"."refunded_minor" >= 0 and "commerce_orders"."refunded_minor" <= "commerce_orders"."amount_minor"),
	CONSTRAINT "commerce_known_fees" CHECK (("commerce_orders"."platform_fee_minor" is null or "commerce_orders"."platform_fee_minor" between 0 and "commerce_orders"."amount_minor") and ("commerce_orders"."processing_fee_minor" is null or "commerce_orders"."processing_fee_minor" between 0 and "commerce_orders"."amount_minor")),
	CONSTRAINT "commerce_verified_status" CHECK ("commerce_orders"."status" not in ('paid','refunded','partially_refunded','disputed') or ("commerce_orders"."verified_at" is not null and "commerce_orders"."provider_reference" is not null and "commerce_orders"."provider" is not null)),
	CONSTRAINT "commerce_premium_price" CHECK ("commerce_orders"."kind" <> 'premium' or "commerce_orders"."amount_minor" = 200000),
	CONSTRAINT "commerce_marketplace_parties" CHECK ("commerce_orders"."kind" <> 'marketplace' or ("commerce_orders"."seller_id" is not null and "commerce_orders"."listing_id" is not null and "commerce_orders"."seller_id" <> "commerce_orders"."buyer_id"))
);
--> statement-breakpoint
ALTER TABLE "commerce_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_commerce" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"public_launch_at" timestamp with time zone,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "singleton_commerce_settings" CHECK ("platform_commerce"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "platform_commerce" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "commerce_role" text DEFAULT 'buyer' NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_events" ADD CONSTRAINT "commerce_events_order_id_commerce_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_buyer_id_profiles_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_seller_id_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_commerce" ADD CONSTRAINT "platform_commerce_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_event_idempotency" ON "commerce_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_provider_reference" ON "commerce_orders" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "commerce_buyer_orders" ON "commerce_orders" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "commerce_seller_orders" ON "commerce_orders" USING btree ("seller_id","created_at");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profile_commerce_role" CHECK ("profiles"."commerce_role" in ('buyer','seller'));
--> statement-breakpoint
-- Preserve existing marketplace creators' ability to manage their listings.
-- This is a one-time migration, not repeated on startup or profile fetch.
UPDATE "profiles" SET "commerce_role" = 'seller'
WHERE EXISTS (SELECT 1 FROM "listings" WHERE "listings"."owner_id" = "profiles"."id"
 AND "listings"."kind" = 'marketplace' AND "listings"."deleted_at" IS NULL);
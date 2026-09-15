CREATE TYPE "public"."credit_role" AS ENUM('director', 'creator', 'writer', 'cast', 'author', 'developer');--> statement-breakpoint
CREATE TABLE "media_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "credit_role" NOT NULL,
	"character" text,
	"billing" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_credits" ADD CONSTRAINT "media_credits_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_credits" ADD CONSTRAINT "media_credits_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_credits_unique_idx" ON "media_credits" USING btree ("media_id","person_id","role");--> statement-breakpoint
CREATE INDEX "media_credits_media_idx" ON "media_credits" USING btree ("media_id","role","billing");--> statement-breakpoint
CREATE INDEX "media_credits_person_idx" ON "media_credits" USING btree ("person_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "people_provider_external_idx" ON "people" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people" USING btree ("name");
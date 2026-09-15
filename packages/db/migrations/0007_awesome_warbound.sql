CREATE TABLE "media_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"language" varchar(8) NOT NULL,
	"title" text,
	"description" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_translations" ADD CONSTRAINT "media_translations_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_translations_unique_idx" ON "media_translations" USING btree ("media_id","language");--> statement-breakpoint
CREATE INDEX "media_translations_lookup_idx" ON "media_translations" USING btree ("language","media_id");
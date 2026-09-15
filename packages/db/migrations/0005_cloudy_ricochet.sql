CREATE TABLE "review_translations" (
	"review_id" uuid NOT NULL,
	"language" varchar(8) NOT NULL,
	"content" text NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language" varchar(8) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "review_translations" ADD CONSTRAINT "review_translations_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_translations_pk" ON "review_translations" USING btree ("review_id","language");
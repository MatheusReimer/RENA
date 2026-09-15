CREATE TABLE "user_taste" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"media_types" "media_type"[] DEFAULT '{}' NOT NULL,
	"mood_keys" text[] DEFAULT '{}' NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_taste" ADD CONSTRAINT "user_taste_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
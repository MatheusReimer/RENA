CREATE TABLE "community_members" (
	"media_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_members_pk" ON "community_members" USING btree ("media_id","user_id");--> statement-breakpoint
CREATE INDEX "community_members_user_idx" ON "community_members" USING btree ("user_id","joined_at");--> statement-breakpoint
CREATE INDEX "community_members_media_idx" ON "community_members" USING btree ("media_id","joined_at");
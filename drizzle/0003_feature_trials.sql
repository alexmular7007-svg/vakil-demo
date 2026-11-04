CREATE TABLE "billing"."feature_trials" (
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "feature_trials_user_id_feature_pk" PRIMARY KEY("user_id","feature")
);
--> statement-breakpoint
ALTER TABLE "billing"."feature_trials" ADD CONSTRAINT "feature_trials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;
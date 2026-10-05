DROP INDEX users_phone_unique;
--> statement-breakpoint
CREATE INDEX users_phone ON users(phone);
--> statement-breakpoint
UPDATE users SET phone=CASE WHEN phone LIKE '01%' AND length(phone)=11 THEN '+2'||phone WHEN phone LIKE '0020%' THEN '+'||substr(phone,3) WHEN phone LIKE '20%' AND length(phone)=12 THEN '+'||phone ELSE phone END;
--> statement-breakpoint
CREATE UNIQUE INDEX users_username ON users(lower(json_extract(details,'$.username'))) WHERE json_extract(details,'$.username') IS NOT NULL;
--> statement-breakpoint
CREATE TABLE phone_tokens(id text PRIMARY KEY NOT NULL,phone text NOT NULL,expires integer NOT NULL,account_id text NOT NULL);
--> statement-breakpoint
CREATE TRIGGER unverified_shared_phone BEFORE INSERT ON users WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.id) AND EXISTS(SELECT 1 FROM users WHERE phone=NEW.phone) AND COALESCE(json_extract(NEW.details,'$.phone_verified'),0)!=1 BEGIN SELECT RAISE(ABORT,'phone_verification_required'); END;

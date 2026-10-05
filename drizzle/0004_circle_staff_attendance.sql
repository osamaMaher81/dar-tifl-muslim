CREATE UNIQUE INDEX one_staff_circle_day ON records(user_id,circle_id,date) WHERE kind='staff_attendance' AND status!='void' AND circle_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER staff_locked_month_insert BEFORE INSERT ON records WHEN NEW.kind='staff_attendance' AND NOT EXISTS(SELECT 1 FROM records WHERE id=NEW.id) AND EXISTS(SELECT 1 FROM records WHERE kind='salary' AND user_id=NEW.user_id AND date=substr(NEW.date,1,7)||'-01') BEGIN SELECT RAISE(ABORT,'staff_salary_locked'); END;
--> statement-breakpoint
CREATE TRIGGER staff_locked_month_update BEFORE UPDATE ON records WHEN OLD.kind='staff_attendance' AND EXISTS(SELECT 1 FROM records WHERE kind='salary' AND user_id=OLD.user_id AND date=substr(OLD.date,1,7)||'-01') BEGIN SELECT RAISE(ABORT,'staff_salary_locked'); END;
--> statement-breakpoint
CREATE TRIGGER salary_open_attendance BEFORE INSERT ON records WHEN NEW.kind='salary' AND EXISTS(SELECT 1 FROM records WHERE kind='staff_attendance' AND user_id=NEW.user_id AND substr(date,1,7)=substr(NEW.date,1,7) AND status='open') BEGIN SELECT RAISE(ABORT,'staff_salary_locked'); END;

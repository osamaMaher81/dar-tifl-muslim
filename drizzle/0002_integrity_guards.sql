CREATE TRIGGER audit_no_update
    BEFORE UPDATE
    ON audit
BEGIN
    SELECT RAISE(ABORT, 'audit_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete
    BEFORE DELETE
    ON audit
BEGIN
    SELECT RAISE(ABORT, 'audit_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER records_no_delete
    BEFORE DELETE
    ON records
BEGIN
    SELECT RAISE(ABORT, 'history_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER financial_record_lock
    BEFORE UPDATE
    ON records WHEN OLD.kind IN ('salary', 'payment')
BEGIN
    SELECT RAISE(ABORT, 'financial_record_locked');
END;
--> statement-breakpoint
CREATE TRIGGER student_capacity_insert
    BEFORE INSERT
    ON students WHEN NEW.circle_id IS NOT NULL AND NEW.status='active' AND (SELECT COUNT (*) FROM students WHERE circle_id= NEW.circle_id AND status='active' AND id!=NEW.id)>=(SELECT capacity FROM circles WHERE id=NEW.circle_id) BEGIN SELECT RAISE(ABORT,'circle_full');
END;
--> statement-breakpoint
CREATE TRIGGER student_capacity_update
    BEFORE UPDATE
    ON students WHEN NEW.circle_id IS NOT NULL AND NEW.status='active' AND (SELECT COUNT (*) FROM students WHERE circle_id= NEW.circle_id AND status='active' AND id!=NEW.id)>=(SELECT capacity FROM circles WHERE id=NEW.circle_id) BEGIN SELECT RAISE(ABORT,'circle_full');
END;
--> statement-breakpoint
CREATE TRIGGER circle_capacity_update
    BEFORE UPDATE
    ON circles WHEN NEW.capacity < (SELECT COUNT(*)
                                    FROM students
                                    WHERE circle_id = NEW.id
                                      AND status = 'active')
BEGIN
    SELECT RAISE(ABORT, 'circle_capacity_below_enrollment');
END;
--> statement-breakpoint
CREATE TRIGGER payment_balance_check
    BEFORE INSERT
    ON records WHEN NEW.kind = 'payment' AND (NEW.amount <= 0 OR NOT EXISTS (SELECT 1
                                                                             FROM records s
                                                                             WHERE s.id = NEW.parent_id
                                                                               AND s.kind = 'subscription'
                                                                               AND s.student_id = NEW.student_id
                                                                               AND s.status!='void') OR
                                              NEW.amount + (SELECT COALESCE(SUM(amount), 0)
                                                            FROM records
                                                            WHERE kind = 'payment'
                                                              AND parent_id = NEW.parent_id
                                                              AND status!='void' AND id!= NEW.id) > (SELECT amount
                                                                                                     FROM records
                                                                                                     WHERE id = NEW.parent_id))
BEGIN
    SELECT RAISE(ABORT, 'invalid_payment_balance');
END;
--> statement-breakpoint
CREATE TRIGGER student_link_single
    BEFORE INSERT
    ON links WHEN (SELECT role
                   FROM users
                   WHERE id = NEW.user_id)='student' AND EXISTS(SELECT 1 FROM links WHERE user_id=NEW.user_id AND student_id!=NEW.student_id) BEGIN
SELECT RAISE(ABORT, 'student_already_linked');
END;

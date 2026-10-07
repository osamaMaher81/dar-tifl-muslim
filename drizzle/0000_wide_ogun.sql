CREATE TABLE `assignments`
(
    `id`        text PRIMARY KEY NOT NULL,
    `circle_id` text             NOT NULL,
    `user_id`   text             NOT NULL,
    FOREIGN KEY (`circle_id`) REFERENCES `circles` (`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_unique` ON `assignments` (`circle_id`, `user_id`);--> statement-breakpoint
CREATE TABLE `attempts`
(
    `id`      text PRIMARY KEY NOT NULL,
    `count`   integer          NOT NULL,
    `expires` integer          NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit`
(
    `id`           text PRIMARY KEY NOT NULL,
    `actor_id`     text             NOT NULL,
    `action`       text             NOT NULL,
    `entity`       text             NOT NULL,
    `before_value` text,
    `after_value`  text,
    `created`      text             NOT NULL,
    FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `circles`
(
    `id`       text PRIMARY KEY  NOT NULL,
    `name`     text              NOT NULL,
    `level`    text              NOT NULL,
    `type`     text              NOT NULL,
    `schedule` text              NOT NULL,
    `capacity` integer           NOT NULL,
    `status`   text              NOT NULL,
    `details`  text DEFAULT '{}' NOT NULL,
    `created`  text              NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files`
(
    `id`       text PRIMARY KEY NOT NULL,
    `owner_id` text             NOT NULL,
    `name`     text             NOT NULL,
    `type`     text             NOT NULL,
    `created`  text             NOT NULL,
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `links`
(
    `id`         text PRIMARY KEY NOT NULL,
    `user_id`    text             NOT NULL,
    `student_id` text             NOT NULL,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `link_unique` ON `links` (`user_id`, `student_id`);--> statement-breakpoint
CREATE TABLE `records`
(
    `id`         text PRIMARY KEY  NOT NULL,
    `kind`       text              NOT NULL,
    `student_id` text,
    `circle_id`  text,
    `user_id`    text,
    `actor_id`   text              NOT NULL,
    `parent_id`  text,
    `date`       text              NOT NULL,
    `status`     text              NOT NULL,
    `amount`     integer DEFAULT 0 NOT NULL,
    `data`       text              NOT NULL,
    `created`    text              NOT NULL,
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`circle_id`) REFERENCES `circles` (`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_student` ON `records` (`student_id`, `kind`);--> statement-breakpoint
CREATE INDEX `records_user` ON `records` (`user_id`, `kind`);--> statement-breakpoint
CREATE INDEX `records_date` ON `records` (`kind`, `date`);--> statement-breakpoint
CREATE TABLE `sessions`
(
    `id`      text PRIMARY KEY NOT NULL,
    `user_id` text             NOT NULL,
    `expires` integer          NOT NULL,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings`
(
    `id`    text PRIMARY KEY NOT NULL,
    `value` text             NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students`
(
    `id`        text PRIMARY KEY  NOT NULL,
    `name`      text              NOT NULL,
    `phone`     text,
    `circle_id` text,
    `level`     text              NOT NULL,
    `status`    text              NOT NULL,
    `details`   text DEFAULT '{}' NOT NULL,
    `created`   text              NOT NULL,
    FOREIGN KEY (`circle_id`) REFERENCES `circles` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users`
(
    `id`          text PRIMARY KEY  NOT NULL,
    `name`        text              NOT NULL,
    `phone`       text              NOT NULL,
    `password`    text              NOT NULL,
    `role`        text              NOT NULL,
    `status`      text              NOT NULL,
    `platform_id` text,
    `details`     text DEFAULT '{}' NOT NULL,
    `created`     text              NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);
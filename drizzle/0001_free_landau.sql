CREATE TABLE `beneficiaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `beneficiaries_owner` ON `beneficiaries` (`owner_id`);--> statement-breakpoint
CREATE TABLE `user_category_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`category_key` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`custom_name` text,
	`activated_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_settings_owner_key` ON `user_category_settings` (`owner_id`,`category_key`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `category_key` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `beneficiary_id` integer REFERENCES beneficiaries(id);
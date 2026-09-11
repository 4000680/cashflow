CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`scope_id` integer NOT NULL,
	`bank_code` text,
	`name` text NOT NULL,
	`masked_number` text,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scope_id`) REFERENCES `scopes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`scope_id` integer,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scope_id`) REFERENCES `scopes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`source` text NOT NULL,
	`bank_code` text,
	`object_key` text,
	`original_name` text,
	`checksum` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_owner_checksum` ON `import_batches` (`owner_id`,`checksum`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`kind` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`local_time` text DEFAULT '22:30' NOT NULL,
	`timezone` text DEFAULT 'Europe/Moscow' NOT NULL,
	`weekdays` text DEFAULT '1,2,3,4,5,6,7' NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_owner_kind` ON `reminders` (`owner_id`,`kind`);--> statement-breakpoint
CREATE TABLE `scopes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scopes_owner_kind` ON `scopes` (`owner_id`,`kind`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`scope_id` integer NOT NULL,
	`account_id` integer,
	`category_id` integer,
	`import_batch_id` integer,
	`direction` text NOT NULL,
	`amount_kopecks` integer NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`occurred_at` integer NOT NULL,
	`merchant` text,
	`description` text,
	`source` text NOT NULL,
	`external_id` text,
	`fingerprint` text NOT NULL,
	`transfer_group` text,
	`review_status` text DEFAULT 'ready' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scope_id`) REFERENCES `scopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_owner_date` ON `transactions` (`owner_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_fingerprint` ON `transactions` (`owner_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `user_bank_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`bank_code` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`preferred_format` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_settings_owner_bank` ON `user_bank_settings` (`owner_id`,`bank_code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_id` text NOT NULL,
	`display_name` text,
	`timezone` text DEFAULT 'Europe/Moscow' NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_id_unique` ON `users` (`telegram_id`);
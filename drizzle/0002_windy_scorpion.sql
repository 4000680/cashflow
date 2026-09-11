CREATE TABLE `user_recognition_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`pattern` text NOT NULL,
	`match_type` text DEFAULT 'contains' NOT NULL,
	`category_key` text NOT NULL,
	`scope` text DEFAULT 'all' NOT NULL,
	`beneficiary_id` integer,
	`priority` integer DEFAULT 100 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`beneficiary_id`) REFERENCES `beneficiaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recognition_rules_owner_pattern_scope` ON `user_recognition_rules` (`owner_id`,`pattern`,`scope`);--> statement-breakpoint
CREATE INDEX `recognition_rules_owner_enabled` ON `user_recognition_rules` (`owner_id`,`enabled`);
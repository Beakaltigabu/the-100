-- THE 100 — grant admin access (run AFTER the account exists in production)
--
-- Flow: deploy → register / log in with beakaltigabu29@gmail.com (name: beakal)
-- → run this file in cPanel phpMyAdmin (chooseyo_the100_prod).
--
-- The app derives admin rights from the `admins` table (server/src/middleware/auth.js),
-- so this single grant makes the account an admin. Safe to run multiple times.

INSERT IGNORE INTO `admins` (`user_id`, `role`)
SELECT `id`, 'owner'
FROM `users`
WHERE `email` = 'beakaltigabu29@gmail.com';

UPDATE `users`
SET `name` = 'beakal'
WHERE `email` = 'beakaltigabu29@gmail.com';
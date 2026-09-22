-- THE 100 — seed the active challenge (run in cPanel phpMyAdmin on chooseyo_the100_prod)
--
-- Fixes "No active challenge found" on any DB provisioned from the schema import,
-- which ships an empty `challenges` table. Idempotent — safe to re-run.

INSERT INTO `challenges` (`name`, `description`, `start_date`, `end_date`, `is_active`)
SELECT 'THE 100', '100 days. Your goal. Your commitment.', '2026-09-23', '2026-12-31', 1
WHERE NOT EXISTS (SELECT 1 FROM `challenges` WHERE `is_active` = 1);
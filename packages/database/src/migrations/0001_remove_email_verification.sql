DROP INDEX IF EXISTS idx_verifications_token;
DROP TABLE IF EXISTS email_verifications;
UPDATE users SET email_verified = 1 WHERE email_verified = 0;
ALTER TABLE users DROP COLUMN email_verified;

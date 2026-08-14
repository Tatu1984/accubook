-- Adds a per-user JWT revocation timestamp. Bumping this past a JWT's
-- issuedAt invalidates that JWT on the next session refresh (NextAuth's
-- jwt callback compares the two and returns null when revoked).
--
-- Lets ops force-logout a user (lost device, deactivation, security
-- incident) without waiting for the 30-day JWT to expire.
ALTER TABLE "users"
  ADD COLUMN "tokensRevokedAt" TIMESTAMP(3);

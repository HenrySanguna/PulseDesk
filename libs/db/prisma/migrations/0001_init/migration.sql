-- Enable case-insensitive text comparisons (used for emails, usernames, etc.)
-- across the schema once domain models land.
CREATE EXTENSION IF NOT EXISTS citext;

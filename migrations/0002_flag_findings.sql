-- What the daily flag job (tools/flags/daily.ts) found on each flag, so a flag is
-- investigated once; pr_url is the pull request that acted on it, if any.
ALTER TABLE flags ADD COLUMN investigated_at TEXT;
ALTER TABLE flags ADD COLUMN finding TEXT;
ALTER TABLE flags ADD COLUMN pr_url TEXT;

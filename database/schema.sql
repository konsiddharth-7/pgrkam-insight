-- PGRKAM Insight schema (synthetic data only)
CREATE SCHEMA IF NOT EXISTS analytics;

-- ========== OPERATIONAL (public) ==========
CREATE TABLE IF NOT EXISTS public.users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'candidate' CHECK (role IN ('candidate','admin','employer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.candidate_profiles (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  education          TEXT,
  experience_years   NUMERIC(4,1) DEFAULT 0,
  location           TEXT,
  preferred_location TEXT,
  preferred_category TEXT,
  bio                TEXT,
  gender             TEXT,
  date_of_birth      DATE,
  district           TEXT,
  profile_completed  BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.skills (
  id         SERIAL PRIMARY KEY,
  skill_name TEXT NOT NULL UNIQUE,
  category   TEXT
);

CREATE TABLE IF NOT EXISTS public.candidate_skills (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  skill_id    INTEGER NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  proficiency INTEGER NOT NULL DEFAULT 3 CHECK (proficiency BETWEEN 1 AND 5),
  UNIQUE (user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id                  SERIAL PRIMARY KEY,
  employer_id         INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  company             TEXT NOT NULL,
  description         TEXT,
  location            TEXT,
  salary_min          INTEGER,
  salary_max          INTEGER,
  experience_required NUMERIC(4,1) DEFAULT 0,
  category            TEXT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_skills (
  id         SERIAL PRIMARY KEY,
  job_id     INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  skill_id   INTEGER NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  UNIQUE (job_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.saved_jobs (
  id       SERIAL PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id   INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS public.recommendations (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id            INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  match_score       NUMERIC(5,2) NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  matched_skills    JSONB NOT NULL DEFAULT '[]',
  missing_skills    JSONB NOT NULL DEFAULT '[]',
  algorithm_version TEXT NOT NULL DEFAULT 'v1-weighted',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.applications (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id            INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  recommendation_id INTEGER REFERENCES public.recommendations(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'Applied'
    CHECK (status IN ('Applied','Under Review','Shortlisted','Rejected','Accepted','Placed')),
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

-- ========== ANALYTICS ==========
CREATE TABLE IF NOT EXISTS analytics.user_events (
  id           BIGSERIAL PRIMARY KEY,
  event_id     UUID NOT NULL UNIQUE,
  user_id      INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  event_name   TEXT NOT NULL,
  source       TEXT,
  campaign     TEXT,
  device       TEXT,
  session_id   TEXT NOT NULL,
  event_time   TIMESTAMPTZ NOT NULL,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  properties   JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_name_time ON analytics.user_events (event_name, event_time);
CREATE INDEX IF NOT EXISTS idx_events_user ON analytics.user_events (user_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON analytics.user_events (event_time);

CREATE TABLE IF NOT EXISTS analytics.acquisition_sources (
  id          SERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  campaign    TEXT NOT NULL DEFAULT '',
  UNIQUE (source_name, campaign)
);

CREATE TABLE IF NOT EXISTS analytics.recommendation_events (
  id                BIGSERIAL PRIMARY KEY,
  recommendation_id INTEGER NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL CHECK (event_type IN ('impression','click','applied','placed')),
  event_time        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recev_rec ON analytics.recommendation_events (recommendation_id);

CREATE TABLE IF NOT EXISTS analytics.daily_metrics (
  id            BIGSERIAL PRIMARY KEY,
  metric_date   DATE NOT NULL,
  metric_name   TEXT NOT NULL,
  metric_value  NUMERIC NOT NULL,
  dimensions    JSONB NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_metrics
  ON analytics.daily_metrics (metric_date, metric_name, dimensions);

CREATE TABLE IF NOT EXISTS analytics.rejected_events (
  id          BIGSERIAL PRIMARY KEY,
  payload     JSONB NOT NULL,
  reason      TEXT NOT NULL,
  rejected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics.etl_runs (
  id             SERIAL PRIMARY KEY,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'running',
  rows_processed INTEGER DEFAULT 0,
  last_event_id  BIGINT DEFAULT 0,
  error          TEXT
);
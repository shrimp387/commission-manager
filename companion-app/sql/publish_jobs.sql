-- ============================================================
-- publish_jobs — Cola de trabajos de publicación para la
-- companion app Electron de Commission Manager.
--
-- Ejecutar en el SQL Editor de Supabase:
--   https://supabase.com/dashboard → SQL Editor → New query
-- ============================================================

CREATE TABLE IF NOT EXISTS publish_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id       UUID,
  task_name     TEXT,
  image_url     TEXT        NOT NULL,
  platforms     TEXT[]      NOT NULL,
  title         TEXT        NOT NULL,
  description   TEXT,
  tags          TEXT[],
  rating        TEXT        DEFAULT 'safe',
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'running', 'completed', 'partial', 'error')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  results       JSONB,        -- [{ platform: string, ok: boolean, url: string|null }]
  errors        JSONB,        -- [{ platform: string, error: string }]
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE publish_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see, create and update their own jobs.
CREATE POLICY "users_own_publish_jobs"
  ON publish_jobs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Optimizes the polling query: WHERE user_id = $1 AND status = 'pending'
CREATE INDEX IF NOT EXISTS idx_publish_jobs_user_status
  ON publish_jobs (user_id, status);

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE publish_jobs IS
  'Jobs de publicación de arte enviados desde la app web y procesados por la companion app Electron.';

COMMENT ON COLUMN publish_jobs.platforms IS
  'Array de plataformas destino: e621, inkbunny, weasyl, bluesky, telegram, discord.';

COMMENT ON COLUMN publish_jobs.status IS
  'pending = esperando companion app | running = en proceso | completed = todo ok | partial = algunos fallaron | error = todos fallaron';

COMMENT ON COLUMN publish_jobs.results IS
  'Resultados por plataforma: [{ platform, ok, url }]';

COMMENT ON COLUMN publish_jobs.errors IS
  'Errores por plataforma: [{ platform, error }]';

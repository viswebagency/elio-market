-- 016: Performance Warning Tracking
-- Aggiunge colonne per tracciare l'ultimo warning di performance inviato,
-- evitando spam con cooldown di 2 ore tra alert dello stesso livello.

ALTER TABLE crypto_paper_sessions
  ADD COLUMN IF NOT EXISTS last_warning_level INTEGER,
  ADD COLUMN IF NOT EXISTS last_warning_at TIMESTAMPTZ;

ALTER TABLE paper_sessions
  ADD COLUMN IF NOT EXISTS last_warning_level INTEGER,
  ADD COLUMN IF NOT EXISTS last_warning_at TIMESTAMPTZ;

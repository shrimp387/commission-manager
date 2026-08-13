-- Agregar columna tagger_type a tag_requests
-- Permite especificar qué tagger usar: 'wd' | 'e621' | 'pawfect'

ALTER TABLE tag_requests
ADD COLUMN IF NOT EXISTS tagger_type text DEFAULT 'wd' CHECK (tagger_type IN ('wd', 'e621', 'pawfect'));

-- Actualizar registros existentes a 'wd'
UPDATE tag_requests SET tagger_type = 'wd' WHERE tagger_type IS NULL;

COMMENT ON COLUMN tag_requests.tagger_type IS 'Tipo de tagger: wd (WD-Tagger), e621 (E621-Tagger), pawfect (P.A.W.F.E.C.T)';

# Estado del Sistema
**Flujo de tags:**
Vercel → Supabase tag_requests → Companion App → JTP PILOT2 (localhost:5621) → Supabase → Vercel

**Para iniciar el tagger:**
cd joint-tagger/JTP_PILOT2
python api_server.py
# Corre en http://localhost:5621

**Companion App:**
cd companion-app
npm start

**Deploy:**
python save.py  (commit local)
python deploy.py  (push a GitHub → Vercel auto-deploya)

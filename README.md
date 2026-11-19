# Accomplish AI

Mobile-friendly Next.js (App Router) web application that turns typed or spoken daily notes into your official **2026 Weekly Accomplishment Report** (`templates/2026-Weekly-Accomplishment-Report.docx`) — preserving all original Word borders, headers, footers, Century Gothic typography, table structure, and signatory blocks (`NIÑO R. GUILLERMO`, wet-ink `Date:` line).

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Auth, Database & Storage:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`) with per-user Row Level Security
- **AI (Free Tier):** Groq SDK (`llama-3.3-70b-versatile` JSON mode + `whisper-large-v3-turbo` voice transcription)
- **DOCX Engine:** `pizzip`, `@xmldom/xmldom`, `docxtemplater`, `docx-preview`, `file-saver`

## Local Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   Copy `.env.example` to `.env.local` and fill in your Supabase and Groq credentials:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   GROQ_API_KEY=gsk_your_groq_api_key
   ```

3. **Run the Supabase database & storage migration**
   Execute `supabase/migrations/0001_init.sql` in the **Supabase SQL Editor** (or via `supabase db push`). This creates:
   - `profiles`, `templates`, and `reports` tables with strict `auth.uid()` RLS policies
   - Auto-profile creation trigger on sign-up
   - Private `templates` Storage bucket scoped to `{user_id}/...`

4. **Test the offline DOCX scanner/tagger/filler pipeline (optional)**
   ```bash
   npx tsx scripts/test-template.ts
   ```

5. **Run locally**
   ```bash
   npm run dev
   ```

## Deploying to Vercel

1. Push the repository to GitHub/GitLab/Bitbucket and import it in Vercel.
2. Add the environment variables from `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GROQ_API_KEY`) in **Project Settings → Environment Variables**.
3. In **Supabase → Authentication → URL Configuration**, add your Vercel domain (`https://your-app.vercel.app`) to Site URL and `https://your-app.vercel.app/auth/callback` to Redirect URLs.
4. Deploy — `next.config.ts` includes `outputFileTracingIncludes` so `templates/2026-Weekly-Accomplishment-Report.docx` is bundled with `/api/scan-template`.

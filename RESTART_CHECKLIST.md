# RESTART_CHECKLIST.md

## Where I stopped
- I was about to deploy and test the qa-runner with real OCR.
- Supabase CLI install/link + secrets may still be needed.
- Last error seen: (paste the one-liner here before you stop)

## Next session — do these in order (PowerShell):
1) Check tools:
   supabase --version
   npm -v
   node -v

2) If needed:
   npm i -g supabase@latest
   supabase login
   supabase link --project-ref hycggwcoczwclmymbeth

3) Verify/set Edge Function secrets (only if not already set):
   supabase secrets list
   # If any missing:
   supabase secrets set OPENAI_API_KEY="***"
   supabase secrets set PDFCO_API_KEY="***"
   supabase secrets set SUPABASE_URL="https://<your>.supabase.co"
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY="***"

4) Deploy:
   supabase functions deploy qa-runner --project-ref hycggwcoczwclmymbeth

5) Test in Dashboard:
   Edge Functions ? qa-runner ? Test (POST)
   Body:
   {
     "analysisId": "8af2f540-db73-44ce-9a70-858e3c56816c",
     "fileUrl": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
     "pages": [1,2]
   }

6) Verify rows:
   SELECT module_id, rule_id, page_number, severity, message, evidence
   FROM public.qa_results
   ORDER BY created_at DESC
   LIMIT 10;

## If deploy/test fails
- Paste the exact error at the top of this file under “Last error seen”.
- Re-run from step 1 next time.
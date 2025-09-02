import { QAModule, QAModuleInput, QAFinding } from './base-module.ts';

// Regex patterns for common sheet numbers: A101, S-201A, M3.12, A-101.1, etc.
const SHEET_NUMBER_PATTERNS = [
  /\b[A-Z]{1,3}-?\d[\dA-Z\.\-]*\b/g,
  /\b[A-Z]\d{3}\b/g, // simple fallback
];

// Revision cues that usually appear in the block
const REVISION_KEYWORDS = /\b(REV|REVISIONS?|REV\.|NO\.)\b/i;

// Heuristic: "Title line" = multi-word, mostly Title Case
function findSheetTitle(text: string): string | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 8);
  const candidate = lines
    .filter(line => {
      const words = line.split(/\s+/);
      if (words.length < 2) return false;
      const capWords = words.filter(w => /^[A-Z]/.test(w));
      return capWords.length >= 2 && capWords.length === words.length;
    })
    .reduce((longest, cur) => (cur.length > longest.length ? cur : longest), '');
  return candidate || null;
}

function extractSheetNumbers(text: string): string[] {
  const found: string[] = [];
  for (const pat of SHEET_NUMBER_PATTERNS) {
    const m = text.match(pat) || [];
    found.push(...m);
  }
  return Array.from(new Set(found));
}

/**
 * Title Block validator (deterministic)
 * TB-001: Missing/invalid sheet number
 * TB-002: Missing sheet title
 * TB-003: No revision block markers (warn)
 */
export const titleBlockValidator: QAModule = {
  id: 'title-block',
  label: 'Title Block Integrity',

  async run(input: QAModuleInput): Promise<QAFinding[]> {
    const findings: QAFinding[] = [];

    // Decide which pages to inspect; if none provided, do first 5 for speed
    const pages = input.pages?.length ? input.pages : [1,2,3,4,5];

    for (const pageNum of pages) {
      try {
        const pageImageUrl = await this.rasterizePage(input.fileUrl, pageNum);
        const pageText = await this.openAiExtractTitleBlock(pageImageUrl);

        const sheetNumbers = extractSheetNumbers(pageText);
        const title = findSheetTitle(pageText);
        const hasRevisions = REVISION_KEYWORDS.test(pageText);

        // TB-001 — Missing/invalid sheet number
        if (sheetNumbers.length === 0) {
          findings.push({
            module_id: this.id,
            rule_id: 'TB-001',
            page_number: pageNum,
            severity: 'error',
            message: 'Missing or invalid sheet number in title block',
            evidence: {
              ocr_engine: 'openai-vision',
              text_sample: pageText.slice(0, 200),
              page_image_url: pageImageUrl,
              bbox: { x: 0.8, y: 0.8, w: 0.2, h: 0.2 }, // bottom-right 20%
              notes: { patterns_tested: SHEET_NUMBER_PATTERNS.map(p => p.source) }
            }
          });
        }

        // TB-002 — Missing title
        if (!title) {
          findings.push({
            module_id: this.id,
            rule_id: 'TB-002',
            page_number: pageNum,
            severity: 'error',
            message: 'Missing sheet title in title block',
            evidence: {
              ocr_engine: 'openai-vision',
              text_sample: pageText.slice(0, 200),
              page_image_url: pageImageUrl,
              bbox: { x: 0.8, y: 0.8, w: 0.2, h: 0.2 }
            }
          });
        }

        // TB-003 — No revision block markers (warn)
        if (!hasRevisions) {
          findings.push({
            module_id: this.id,
            rule_id: 'TB-003',
            page_number: pageNum,
            severity: 'warn',
            message: 'No revision block markers found',
            evidence: {
              ocr_engine: 'openai-vision',
              text_sample: pageText.slice(0, 200),
              page_image_url: pageImageUrl,
              bbox: { x: 0.8, y: 0.8, w: 0.2, h: 0.2 },
              notes: { keywords: ['REV','REVISION','REVISIONS','REV.'] }
            }
          });
        }

      } catch (err) {
        // soft-fail per page; continue other pages
        console.error(`Title-block OCR failed on page ${pageNum}:`, err);
        continue;
      }
    }

    return findings;
  },

  async openAiExtractTitleBlock(pageImageUrl: string): Promise<string> {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENAI_APIKEY') || '';
    if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY in environment');

    const prompt = `
  You are reading a construction drawing page image.
  Extract ONLY the text contained in the title block region (~bottom-right 20% of the page).
  Return raw text lines only (no commentary). Focus on: sheet number (e.g., A101), sheet title, and any revision text.
  `;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: pageImageUrl } }
        ]}],
        max_tokens: 600,
        temperature: 0.1
      })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(()=> '');
      throw new Error(`OpenAI Vision failed (${resp.status}): ${txt}`);
    }
    const json = await resp.json();
    return String(json?.choices?.[0]?.message?.content ?? '');
  },

  async rasterizePage(fileUrl: string, pageNumber: number): Promise<string> {
    const PDFCO_API_KEY = Deno.env.get('PDFCO_API_KEY') || Deno.env.get('PDFCO_APIKEY') || '';
    if (!PDFCO_API_KEY) throw new Error('Missing PDFCO_API_KEY in environment');

    const res = await fetch('https://api.pdf.co/v1/pdf/convert/to/png', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': PDFCO_API_KEY
      },
      body: JSON.stringify({ url: fileUrl, pages: String(pageNumber), dpi: 300 })
    });

    if (!res.ok) {
      const txt = await res.text().catch(()=> '');
      throw new Error(`PDF.co rasterization failed (${res.status}): ${txt}`);
    }
    const data = await res.json();
    const url = data.urls?.[0] || data.url;
    if (!url) throw new Error('PDF.co response missing image URL');
    return url;
  },

  // Simple mock as last-resort safety (same strings you used before)
  mockFallback(pageNumber: number): string {
    const mockTexts: Record<number, string> = {
      1: "ARCHITECTURAL PLANS\nSHEET A101\nFLOOR PLAN - FIRST LEVEL\nREVISIONS\nNO. DATE DESCRIPTION",
      2: "SOME PAGE WITHOUT PROPER TITLE BLOCK\nMissing sheet number"
    };
    return mockTexts[pageNumber] || '';
  }
};

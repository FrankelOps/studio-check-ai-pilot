# StudioCheck Context Appendix

## M1 – Title Block Integrity
- OCR approach: PDF.co rasterize → OpenAI Vision (bottom-right ~20%)
- Evidence contract: { ocr_engine, page_image_url, bbox, text_sample }
- Known quirks: (agent updates as we learn)

## M2 – Discipline & Level Classification
- Derive discipline = first letter of sheet_no; warn if unknown
- Level grouping from numeric portion of sheet_no

## Notes / Decisions Log
- Windows PowerShell: no `&&`; print commands before running
- Use `qa-runner` + `_shared/qa-modules/*` only (no Node CLI)

# StudioCheck Intent

## Goal
Build a construction drawing QC tool that finds coordination errors in architectural/MEP drawings.

## MVP Modules
- Title Block Parser (extract sheet_no + title, flag missing)
- Door Schedule Coverage (tagged items exist in schedule)

## Success Criteria
- Findings reference sheet numbers only (never PDF page numbers)
- Each finding includes: sheet_no + text snippet + suggested remediation
- Output must be actionable for a PM in <5 min review

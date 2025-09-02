# StudioCheck Deterministic QA Module Roadmap

*Phased by complexity & value, explicit discipline coverage*

## Layer 1 – Infrastructure & Universal Consistency (Sprint 1–2)

**Goal**: Prove the set is complete, references resolve, and metadata is sane.

1. **Sheet Quality Gate** – flag low-quality sheets (rotation, DPI < 250, raster-only).
2. **Title Block Integrity** – validate sheet number, discipline code, title, revision block presence.
3. **Discipline & Level Classification** – normalize A/S/M/E/P/T and levels.
4. **Sheet Index Integrity** – cross-check cover sheet index vs. actual sheets (no orphans/duplicates).
5. **Detail Callout Validation** – confirm n/Sheet bubbles resolve to real details.
6. **Broken Reference Notes** – catch "See/Refer to …" text that doesn't resolve.
7. **Keynote Resolution** – every keynote ID resolves to legend; duplicates/unused flagged.
8. **Abbreviation Resolution** – all abbreviations in notes appear in abbreviation legend.
9. **Sheet Naming Consistency** – check sheet titles match index + sheet number.
10. **Duplicate Tag Detection (Universal)** – flag duplicate IDs for doors, windows, fixtures, equipment.

*Why first?* All are string/set/pattern checks. Fast, deterministic, and prevent "junk downstream."

---

## Layer 2 – High-Value Discipline Checks (Sprint 3–4)

**Goal**: Attack the biggest, cleanest RFI generators with deterministic math.

11. **Panel Load Validation (Electrical)** – sum circuit loads ≤ panel capacity; duplicates/spares labeled.
12. **Circuit Tag Consistency (Electrical)** – panel schedules ↔ circuit IDs on plan.
13. **Door Schedule Coverage** – every scheduled door appears on plans.
14. **Door Plan Completeness** – every door tag on plan appears in schedule (exceptions TYP/NIC/BY OTHERS).
15. **Window Schedule Coverage** – every scheduled window appears on plans.
16. **Window Plan Completeness** – every window tag on plan appears in schedule.

*Why here?* Still deterministic, but parsing door/window tags and electrical tables is more work than text lookups. Value per effort is very high.

---

## Layer 3 – Extended Schedule Mapping (Sprint 5–6)

**Goal**: Broaden coverage across remaining discipline schedules.

17. **Finish Token Consistency (Arch)** – finish schedule tokens (PT-3, CT-1) match elevations/notes per room.
18. **Lighting Fixture Schedule Mapping (Elec)** – every fixture type on RCP appears in lighting schedule; unused schedule types flagged.
19. **Plumbing Fixture Schedule Mapping (Plumbing)** – tagged fixtures ↔ plumbing schedule; optional count reconciliation.
20. **Mechanical Equipment Schedule Mapping (Mech)** – equipment tags (AHU-1, FCU-3) ↔ mech equipment schedule.

*Why now?* Logic mirrors doors/windows but tag formats are less consistent, OCR heavier, and exception handling trickier.

---

## Layer 4 – Cross-Discipline Coordination & Symbol Integrity (Sprint 7–8)

**Goal**: Build registration & coordination foundation, enforce symbol/legend discipline.

21. **Grid Registration & Drift Check** – align Arch/Struct/MEP grids; measure drift within tolerance.
22. **Revision Tracking Integrity** – revision clouds ↔ revision index entries.
23. **Symbol Legend Resolution (Text-Bearing)** – any symbol with a text ID (valve tags, damper tags) resolves to legend.
24. **Life-Safety Symbol Compliance** – life-safety symbols (alarms, strobes, extinguishers) resolve to NFPA-170 compliant legend entries.
25. **Legend Coverage Audit** – report used-but-not-in-legend and unused legend entries.

*Why here?* Requires grid alignment infra, symbol inventories, and more robust parsing than earlier phases.

---

## Layer 5 – Technology & Narrow Spec Checks (Sprint 9–10)

**Goal**: Enforce ICT documentation standards and scoped spec validations.

26. **Telecom Label Format Compliance (Tech)** – TIA-606 label patterns enforced (e.g., TR-ID-NNN), duplicates flagged.
27. **TR/IDF Room Presence (Tech)** – floors with outlets must show serving TR/IDF room.
28. **Low-Voltage Device Schedule Mapping (Tech)** – scheduled LV devices appear on plan; unused types flagged.
29. **Finish Token Orthography Check** – PT-3 vs PT3 vs PT-03 consistency across docs.

*Why here?* Technology drawings are highly standardized; checks are deterministic string/format matches. Narrow finish spec checks are cheap string audits.

---

## Layer 6 – Spatial/Code-Level Checks (Sprint 11+)

**Goal**: Once infra is solid, add geometry + code/safety analysis.

30. **Equipment Power Provision Check** – mech equipment has corresponding electrical feeder/disconnect.
31. **Finish/Elevation Consistency** – finishes in schedule match room/elevation callouts.
32. **Grid Line Alignment** – grids consistent across all discipline sheets (post-registration).
33. **RCP Device–Ceiling Coordination** – ceiling devices clear tees/panels.
34. **Viewport Scale Capture** – extract per-viewport scale factors for dimension-based checks.
35. **Code Compliance Hotspots** – corridor widths, door clearances vs ADA/code minimums.
36. **Fire Rating Continuity** – fire-rated walls continuous through penetrations.
37. **Egress Route Validation** – door swings, travel direction, corridor widths.
38. **Fire/Smoke Damper Presence** – verify dampers where ducts cross rated walls.

*Why last?* Highest complexity, dependency-heavy, and liability-sensitive. Requires registration, scale, and reliable room registry to be trusted.

---

## Non-Negotiables (apply across all layers)

- **Evidence Contract**: every finding must include refs, crops, rule_id, confidence; no evidence = abstain.
- **Precision Gate**: ≥0.90 precision required before release; recall ≥0.60 acceptable initially.
- **Gold Set**: 100–150 labeled sheets across A/M/E/P/T; regression suite runs per module.
- **Config Profiles**: Per-firm/project rule sets (symbols, numbering, schedule conventions).
- **Observability**: Structured logs (job_id, module, duration, parse_conf); all crops/overlays archived.

---

## Key Design Principles

- **Checks grouped into Layers = sprints**, not arbitrary "Tiers."
- **All plan consistency/integrity checks are front-loaded** in Layer 1.
- **Panel load/circuit tags stay early** (Layer 2) because of their high value/low complexity.
- **Each discipline has explicit modules** (doors, windows, lighting, plumbing, mech, telecom) rather than generic "schedule coverage."
- **Spatial + code modules explicitly delayed** until infra is solid.

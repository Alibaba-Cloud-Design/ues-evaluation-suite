# Output contract

`review.py init` creates a perception record with one unit per input image. Preserve the original artifact path, SHA-256, pixel dimensions, and unit ID. V0.9 freezes both perception and diagnosis before optional scoring.

## Perception record

Before freeze, complete for each unit:

- `scope`: what visible surface is evaluated and what framing is excluded.
- `context`: purpose known from the user or visible page; keep uncertainty explicit.
- `initial_overall`: all six fields must contain concrete observations.
- `raw_findings`: zero or more open observations. Each requires a unique ID, locator, visible fact, anomaly claim, possible intent, and inspection note.
- `no_findings_reason`: required only when `raw_findings` is empty.

Do not use diagnostic tags or severities in raw findings.

## Evaluation record

`review.py diagnose` preserves the frozen perception record and initializes one disposition per raw finding.

Complete:

- every `finding_disposition`, without changing its `finding_id`;
- `new_findings`, if structured review reveals additional observations;
- `issues`, referencing confirmed or downgraded finding IDs;
- `strengths`, with visible locations and facts;
- `overall_judgment` and evidence limitations;
- `pairwise` only when exactly two units are present.

An issue contains `id`, `source_finding_ids`, `locator`, `visible_fact`, `effect`, `severity`, `diagnosis_tag`, `alternative_explanation`, and `recommendation`. `diagnosis_tag` may be `unclassified`.

Confirmed and downgraded findings must be referenced by at least one issue. Resolved findings must not be referenced by issues. Findings needing evidence may be reported as gaps but not scored as defects.

The script rejects artifact changes, deleted raw findings, unresolved `pending` dispositions, missing explanations, or a pairwise judgment written before both units are complete.

## Scoring record

`score-init` accepts only a valid frozen diagnosis. It preserves the complete diagnostic units and initializes exactly four axes per unit.

Each axis contains `id`, `status=rated/insufficient_evidence`, `rating`, `evidence`, `counterevidence`, and `rationale`. A rated axis requires an integer 0–4 and evidence; an insufficient axis has `rating=null` and explains the missing evidence.

`overall_defining_medium_issue_ids` may contain only IDs of frozen medium issues. Each listed ID requires an explanation in `medium_cap_reason`. High issues are detected automatically. `score-finalize` calculates the raw score and cap; hand-entered totals are ignored.

The final evaluation preserves the diagnosis hash and all diagnostic content. Any later change to the frozen diagnosis invalidates validation.

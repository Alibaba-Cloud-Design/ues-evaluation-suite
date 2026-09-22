---
name: evaluate-visual-quality-v0-9
description: Evaluate screenshots and rendered pages with frozen open-set perception, preserved diagnostic findings, and an optional post-diagnosis holistic score. Use when unexpected visual anomalies and a comparable numeric result both matter. Experimental; not a usability audit, accessibility certification, or trained aesthetic predictor.
metadata:
  version: "0.9.0-experimental"
---

# Visual Quality Evaluation · V0.9 Experimental

Discover first, diagnose second, score last. The numeric layer must never influence what is noticed or which issues survive.

## 1. Open-set perception

View each target at whole-page and original scale. Before reading taxonomies, examples, previous reviews, expected answers, or scoring dimensions:

```bash
python3 <skill-dir>/scripts/review.py init --images <A.png> [<B.png>] --output <run>/perception.json
```

Fill the scope, initial overall impression, and open-language `raw_findings`. Do not assign categories or severity and do not force a problem count. Freeze the record:

```bash
python3 <skill-dir>/scripts/review.py freeze <run>/perception.json --output <run>/perception.frozen.json
```

## 2. Diagnosis with preservation

Only after perception is frozen, read [diagnosis.md](references/diagnosis.md) and [contract.md](references/contract.md), then initialize diagnosis:

```bash
python3 <skill-dir>/scripts/review.py diagnose <run>/perception.frozen.json --output <run>/diagnosis.json
```

Give every raw finding a disposition: `confirmed`, `downgraded`, `resolved`, or `needs_evidence`. Confirmed and downgraded findings become issues. Resolution requires specific visible evidence; generic appeals to intention or common design techniques are insufficient. Keep valid anomalies as `unclassified` when no tag fits.

Complete the qualitative `overall_judgment`, validate it, and freeze it before seeing scoring axes:

```bash
python3 <skill-dir>/scripts/review.py validate <run>/diagnosis.json
python3 <skill-dir>/scripts/review.py freeze-diagnosis <run>/diagnosis.json --output <run>/diagnosis.frozen.json
```

## 3. Optional isolated scoring

Use this stage when the user asks for a numeric result or comparison. Only now read [scoring.md](references/scoring.md).

```bash
python3 <skill-dir>/scripts/review.py score-init <run>/diagnosis.frozen.json --output <run>/scoring.json
```

Rate the four broad outcomes from 0–4 using current visual evidence. These axes summarize the frozen diagnosis; they are not a new checklist and must not create, delete, or rewrite findings. Mark any medium issue that materially defines the overall experience in `overall_defining_medium_issue_ids`.

```bash
python3 <skill-dir>/scripts/review.py score-finalize <run>/scoring.json --output <run>/evaluation.json
python3 <skill-dir>/scripts/review.py report <run>/evaluation.json --output <run>/report.html
```

If no numeric score was requested, render the frozen diagnosis directly with `report` and deliver it without a composite.

## Deliverables

Deliver the frozen perception, frozen diagnosis, final evaluation if scoring was used, and HTML report. Explain the scope, major issues, resolved suspicions, evidence limits, raw score, any cap, and the qualitative judgment. Equal numeric scores do not imply equal findings or equal preference.

## Invariants

- Perception precedes taxonomy, counterargument, cases, and scoring.
- Diagnosis precedes access to scoring dimensions.
- Frozen perception and diagnosis cannot be edited by later stages.
- Every initial finding remains traceable; `unclassified` is valid.
- Scoring summarizes outcomes; it never counts issues or averages checklist passes.
- A high-impact issue caps the composite; a medium issue caps it only when explicitly justified as experience-defining.
- Static screenshots do not prove motion, interaction, responsiveness, sticky behavior, implementation values, or real user outcomes.

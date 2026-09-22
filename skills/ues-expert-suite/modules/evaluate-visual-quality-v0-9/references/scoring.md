# Optional holistic scoring

Read this file only after `diagnosis.frozen.json` exists. The scoring record cannot modify frozen observations, dispositions, issues, strengths, or the qualitative conclusion.

## Four outcome axes

Rate each axis with an integer from 0–4:

- `organization_control`: grouping, hierarchy, composition, spatial allocation, and reading direction work as a whole.
- `expression_coherence`: typography, color, imagery, graphics, and visible tone form a coherent expression suited to the evidenced purpose.
- `local_finish`: edges, seams, clipping, placeholders, spacing transitions, and other execution details appear intentionally resolved.
- `primary_content_presentation`: the primary content and actions have appropriate prominence, legibility, and visual support.

The axes are broad outcome summaries, not prompts for discovering new issues.

## Shared anchors

- `4`: convincingly controlled throughout the supplied scope; the weakest visible region does not materially undermine the outcome.
- `3`: mostly controlled, with a clear but contained weakness.
- `2`: materially mixed; strengths and weaknesses both shape the outcome.
- `1`: a major weakness dominates the outcome despite some functioning structure.
- `0`: the outcome is visibly broken or cannot perform its basic visual role.

For every rating, cite current-image evidence, the relevant frozen issue or strength IDs where available, the strongest counterevidence, and a short rationale. Do not rate from adjectives alone.

## Composite and caps

When all four axes are rated:

```text
raw_score = 25 × mean(axis ratings)
```

Issue counts do not subtract points.

- Any frozen `high` issue caps the final score at 59.
- A frozen `medium` issue caps the final score at 79 only when its ID is listed in `overall_defining_medium_issue_ids` with a concrete explanation of how it materially shapes the overall experience.
- Otherwise the cap is 100.

`final_score = min(raw_score, cap)`. Report raw score and cap separately. A cap is a risk/impact constraint, not a hidden fifth axis.

If any axis has insufficient evidence, do not publish a composite. Preserve the qualitative judgment and explain the missing evidence instead of assigning a neutral midpoint.

The score is an experimental summary of one frozen diagnosis, not a trained preference probability, usability score, accessibility result, or cross-version equivalent.

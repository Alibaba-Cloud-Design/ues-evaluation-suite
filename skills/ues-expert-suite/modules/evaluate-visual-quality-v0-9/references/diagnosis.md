# Diagnostic pass

The diagnostic pass explains observations; it does not search only for predefined failures.

## Dispositions

- `confirmed`: the visible anomaly has a concrete consequence and becomes an issue.
- `downgraded`: the anomaly remains real, but closer inspection or visible function reduces its severity. It still becomes an issue.
- `resolved`: specific visible evidence explains the element and removes the suspected consequence. Record that evidence.
- `needs_evidence`: the screenshot cannot decide the question. State what additional state, scale, interaction, or reference is needed.

To resolve or downgrade a finding, address the exact observation. A generic claim that a visual technique can be useful is insufficient; point to the specific element's visible function, repetition, relationship, and consequence in the current image.

## Optional diagnostic tags

Tags support retrieval and summaries, not applicability or score:

- `structure`: grouping, alignment, boundaries, nesting, seams.
- `composition`: balance, proportion, spatial rhythm, visual weight.
- `hierarchy`: attention priority and reading sequence.
- `typography`: type relationships, reading presentation, detailed setting.
- `color`: palette relationships and visible color roles.
- `imagery`: image quality, crop, material or media relationships.
- `graphics`: icons, diagrams, illustration and graphic finish.
- `expression`: fit for the visible purpose and internal visual voice.
- `finish`: residue, clipping, accidental gaps, placeholder treatment, incomplete states.
- `unclassified`: a valid observation not honestly covered above.

Tags are deliberately broad. Do not expand them for individual examples.

## Severity

Severity describes the consequence in the supplied scope:

- `high`: damages the primary content, primary action, or overall visual organization.
- `medium`: clearly weakens an important region or repeated relationship while the page remains understandable.
- `low`: localized visible imperfection with limited downstream effect.

Do not derive severity from how many tags or rules an issue touches. One anomaly may be decisive; many minor imperfections may remain minor.

## Holistic conclusion

- `strong`: the visible system is convincingly controlled; remaining issues are limited and do not define the experience.
- `mixed`: meaningful strengths coexist with one or more clear weaknesses that materially shape the page.
- `weak`: visible problems dominate the organization, expression, or finish.
- `undetermined`: evidence limits prevent a responsible overall judgment.

These are qualitative review signals, not score bands. Preserve notable strengths so that problem discovery does not become fault counting.

#!/usr/bin/env python3
import argparse
import datetime as dt
import hashlib
import html
import json
import struct
from pathlib import Path

VERSION = "0.9.0-experimental"
SIGNALS = {"strong", "mixed", "weak", "undetermined"}
DISPOSITIONS = {"confirmed", "downgraded", "resolved", "needs_evidence"}
SEVERITIES = {"high", "medium", "low"}
TAGS = {"structure", "composition", "hierarchy", "typography", "color", "imagery", "graphics", "expression", "finish", "unclassified"}
AXIS_IDS = (
    "organization_control",
    "expression_coherence",
    "local_finish",
    "primary_content_presentation",
)
AXIS_STATUSES = {"pending", "rated", "insufficient_evidence"}


def fail(message):
    raise SystemExit(f"error: {message}")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read JSON {path}: {exc}")


def write_json(path, data):
    path = Path(path)
    if path.exists():
        fail(f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def canonical_hash(value):
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def image_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
        if head.startswith(b"\x89PNG\r\n\x1a\n") and len(head) >= 24:
            return list(struct.unpack(">II", head[16:24]))
        fh.seek(0)
        if fh.read(2) == b"\xff\xd8":
            while True:
                byte = fh.read(1)
                if not byte:
                    break
                if byte != b"\xff":
                    continue
                marker = fh.read(1)
                while marker == b"\xff":
                    marker = fh.read(1)
                if marker in {bytes([m]) for m in range(0xC0, 0xC4)} | {bytes([m]) for m in range(0xC5, 0xC8)} | {bytes([m]) for m in range(0xC9, 0xCC)} | {bytes([m]) for m in range(0xCD, 0xD0)}:
                    length = struct.unpack(">H", fh.read(2))[0]
                    data = fh.read(length - 2)
                    return [struct.unpack(">H", data[3:5])[0], struct.unpack(">H", data[1:3])[0]]
                length_bytes = fh.read(2)
                if len(length_bytes) != 2:
                    break
                length = struct.unpack(">H", length_bytes)[0]
                fh.seek(length - 2, 1)
    return [None, None]


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def artifact_ok(artifact):
    path = Path(artifact["path"])
    return path.is_file() and sha256_file(path) == artifact["sha256"]


def perception_payload(record):
    return {
        "version": record["version"],
        "stage": "perception_frozen",
        "units": record["units"],
        "pairing": record.get("pairing"),
    }


def validate_perception(record, require_frozen=False):
    errors = []
    if record.get("version") != VERSION:
        errors.append("unexpected version")
    expected_stage = "perception_frozen" if require_frozen else "perception_draft"
    if record.get("stage") != expected_stage:
        errors.append(f"stage must be {expected_stage}")
    units = record.get("units")
    if not isinstance(units, list) or not units:
        errors.append("units must be a non-empty list")
        return errors
    unit_ids = set()
    for unit in units:
        uid = unit.get("id")
        if not nonempty(uid) or uid in unit_ids:
            errors.append("unit IDs must be unique non-empty strings")
        unit_ids.add(uid)
        artifact = unit.get("artifact", {})
        if not artifact_ok(artifact):
            errors.append(f"{uid}: artifact missing or SHA-256 changed")
        if not nonempty(unit.get("scope")):
            errors.append(f"{uid}: scope is required")
        if not nonempty(unit.get("context")):
            errors.append(f"{uid}: context is required")
        overall = unit.get("initial_overall", {})
        for key in ("first_impression", "visual_center", "spatial_character", "designed_coherence", "accidental_candidates", "uncertainty"):
            if not nonempty(overall.get(key)):
                errors.append(f"{uid}: initial_overall.{key} is required")
        findings = unit.get("raw_findings")
        if not isinstance(findings, list):
            errors.append(f"{uid}: raw_findings must be a list")
            continue
        seen = set()
        for finding in findings:
            fid = finding.get("id")
            if not nonempty(fid) or fid in seen:
                errors.append(f"{uid}: raw finding IDs must be unique")
            seen.add(fid)
            forbidden = {"metric_id", "diagnosis_tag", "severity", "status"} & set(finding)
            if forbidden:
                errors.append(f"{uid}/{fid}: raw finding contains diagnostic fields {sorted(forbidden)}")
            for key in ("locator", "visible_fact", "anomaly_claim", "possible_intent", "inspection_note"):
                if not nonempty(finding.get(key)):
                    errors.append(f"{uid}/{fid}: {key} is required")
        if not findings and not nonempty(unit.get("no_findings_reason")):
            errors.append(f"{uid}: no_findings_reason is required when raw_findings is empty")
    if require_frozen:
        expected = canonical_hash(perception_payload(record))
        if record.get("freeze", {}).get("content_hash") != expected:
            errors.append("frozen perception content hash mismatch")
    return errors


def cmd_init(args):
    units = []
    for index, raw in enumerate(args.images):
        path = Path(raw).expanduser().resolve()
        if not path.is_file():
            fail(f"image not found: {path}")
        width, height = image_size(path)
        units.append({
            "id": chr(ord("A") + index),
            "artifact": {"path": str(path), "sha256": sha256_file(path), "pixel_width": width, "pixel_height": height},
            "scope": "",
            "context": "",
            "initial_overall": {
                "first_impression": "",
                "visual_center": "",
                "spatial_character": "",
                "designed_coherence": "",
                "accidental_candidates": "",
                "uncertainty": ""
            },
            "raw_findings": [],
            "no_findings_reason": ""
        })
    record = {
        "version": VERSION,
        "stage": "perception_draft",
        "created_at": now(),
        "method_constraint": "Unaided open-set perception completed before taxonomy, cases, counterargument, comparison, or scoring.",
        "units": units,
        "pairing": "independent_units_then_pairwise" if len(units) == 2 else None
    }
    write_json(args.output, record)


def cmd_freeze(args):
    record = read_json(args.input)
    errors = validate_perception(record, require_frozen=False)
    if errors:
        fail("perception validation failed:\n- " + "\n- ".join(errors))
    record["stage"] = "perception_frozen"
    record["freeze"] = {"frozen_at": now()}
    record["freeze"]["content_hash"] = canonical_hash(perception_payload(record))
    write_json(args.output, record)


def cmd_diagnose(args):
    source_path = Path(args.input).resolve()
    source = read_json(source_path)
    errors = validate_perception(source, require_frozen=True)
    if errors:
        fail("frozen perception validation failed:\n- " + "\n- ".join(errors))
    units = []
    for unit in source["units"]:
        units.append({
            "id": unit["id"],
            "artifact": unit["artifact"],
            "scope": unit["scope"],
            "context": unit["context"],
            "initial_overall": unit["initial_overall"],
            "raw_findings": unit["raw_findings"],
            "finding_dispositions": [
                {"finding_id": f["id"], "status": "pending", "reason": "", "visible_basis": ""}
                for f in unit["raw_findings"]
            ],
            "new_findings": [],
            "issues": [],
            "strengths": [],
            "evidence_limits": [],
            "overall_judgment": {"signal": "undetermined", "summary": "", "integration": "", "confidence": "", "limitations": ""}
        })
    evaluation = {
        "version": VERSION,
        "stage": "diagnosis",
        "created_at": now(),
        "source_perception": {"path": str(source_path), "sha256": sha256_file(source_path), "content_hash": source["freeze"]["content_hash"]},
        "units": units,
        "pairwise": None
    }
    write_json(args.output, evaluation)


def diagnosis_payload(record):
    return {
        "version": record["version"],
        "stage": "diagnosis_frozen",
        "source_perception": record["source_perception"],
        "units": record["units"],
        "pairwise": record.get("pairwise"),
    }


def validate_evaluation(record, require_frozen=False):
    errors = []
    expected_stage = "diagnosis_frozen" if require_frozen else "diagnosis"
    if record.get("version") != VERSION or record.get("stage") != expected_stage:
        errors.append("evaluation version/stage mismatch")
    source_meta = record.get("source_perception", {})
    source_path = Path(source_meta.get("path", ""))
    if not source_path.is_file() or sha256_file(source_path) != source_meta.get("sha256"):
        errors.append("source perception file missing or changed")
        return errors
    source = read_json(source_path)
    source_errors = validate_perception(source, require_frozen=True)
    errors.extend(f"source: {e}" for e in source_errors)
    if source.get("freeze", {}).get("content_hash") != source_meta.get("content_hash"):
        errors.append("source perception content hash changed")
    source_units = {u["id"]: u for u in source.get("units", [])}
    eval_units = record.get("units", [])
    if {u.get("id") for u in eval_units} != set(source_units):
        errors.append("evaluation units differ from frozen perception")
    for unit in eval_units:
        uid = unit.get("id")
        original = source_units.get(uid, {})
        if canonical_hash(unit.get("artifact")) != canonical_hash(original.get("artifact")):
            errors.append(f"{uid}: artifact metadata changed")
        if canonical_hash(unit.get("raw_findings")) != canonical_hash(original.get("raw_findings")):
            errors.append(f"{uid}: raw findings changed or were deleted")
        raw_ids = {f["id"] for f in original.get("raw_findings", [])}
        dispositions = unit.get("finding_dispositions", [])
        if {d.get("finding_id") for d in dispositions} != raw_ids:
            errors.append(f"{uid}: every raw finding needs exactly one disposition")
        statuses = {}
        for disp in dispositions:
            fid = disp.get("finding_id")
            status = disp.get("status")
            statuses[fid] = status
            if status not in DISPOSITIONS:
                errors.append(f"{uid}/{fid}: invalid or pending disposition")
            if not nonempty(disp.get("reason")) or not nonempty(disp.get("visible_basis")):
                errors.append(f"{uid}/{fid}: disposition reason and visible_basis are required")
        new_findings = unit.get("new_findings", [])
        new_ids = set()
        for finding in new_findings:
            fid = finding.get("id")
            if not nonempty(fid) or fid in raw_ids or fid in new_ids:
                errors.append(f"{uid}: new finding IDs must be unique and distinct")
            new_ids.add(fid)
            if finding.get("provenance") != "diagnostic_pass":
                errors.append(f"{uid}/{fid}: new finding provenance must be diagnostic_pass")
            for key in ("locator", "visible_fact", "anomaly_claim"):
                if not nonempty(finding.get(key)):
                    errors.append(f"{uid}/{fid}: {key} is required")
        issue_sources = set()
        issue_ids = set()
        for issue in unit.get("issues", []):
            iid = issue.get("id")
            if not nonempty(iid) or iid in issue_ids:
                errors.append(f"{uid}: issue IDs must be unique")
            issue_ids.add(iid)
            sources = issue.get("source_finding_ids")
            if not isinstance(sources, list) or not sources or not set(sources) <= raw_ids | new_ids:
                errors.append(f"{uid}/{iid}: invalid source_finding_ids")
            issue_sources.update(sources or [])
            for key in ("locator", "visible_fact", "effect", "alternative_explanation", "recommendation"):
                if not nonempty(issue.get(key)):
                    errors.append(f"{uid}/{iid}: {key} is required")
            if issue.get("severity") not in SEVERITIES:
                errors.append(f"{uid}/{iid}: invalid severity")
            if issue.get("diagnosis_tag") not in TAGS:
                errors.append(f"{uid}/{iid}: invalid diagnosis_tag")
        for fid, status in statuses.items():
            if status in {"confirmed", "downgraded"} and fid not in issue_sources:
                errors.append(f"{uid}/{fid}: confirmed/downgraded finding must feed an issue")
            if status == "resolved" and fid in issue_sources:
                errors.append(f"{uid}/{fid}: resolved finding cannot feed an issue")
        strengths = unit.get("strengths")
        if not isinstance(strengths, list):
            errors.append(f"{uid}: strengths must be a list")
        else:
            for strength in strengths:
                if not nonempty(strength.get("locator")) or not nonempty(strength.get("visible_fact")):
                    errors.append(f"{uid}: every strength needs locator and visible_fact")
        overall = unit.get("overall_judgment", {})
        if overall.get("signal") not in SIGNALS:
            errors.append(f"{uid}: invalid overall signal")
        for key in ("summary", "integration", "confidence", "limitations"):
            if not nonempty(overall.get(key)):
                errors.append(f"{uid}: overall_judgment.{key} is required")
    pairwise = record.get("pairwise")
    if len(eval_units) == 1 and pairwise is not None:
        errors.append("single-unit evaluation requires pairwise=null")
    if len(eval_units) == 2:
        if not isinstance(pairwise, dict):
            errors.append("two-unit evaluation requires pairwise")
        else:
            if pairwise.get("winner") not in {"A", "B", "tie", "unable"}:
                errors.append("invalid pairwise winner")
            for key in ("reason", "evidence", "uncertainty"):
                if not nonempty(pairwise.get(key)):
                    errors.append(f"pairwise.{key} is required")
    if require_frozen:
        expected = canonical_hash(diagnosis_payload(record))
        if record.get("freeze", {}).get("content_hash") != expected:
            errors.append("frozen diagnosis content hash mismatch")
    return errors


def cmd_freeze_diagnosis(args):
    record = read_json(args.input)
    errors = validate_evaluation(record, require_frozen=False)
    if errors:
        fail("diagnosis validation failed:\n- " + "\n- ".join(errors))
    record["stage"] = "diagnosis_frozen"
    record["freeze"] = {"frozen_at": now()}
    record["freeze"]["content_hash"] = canonical_hash(diagnosis_payload(record))
    write_json(args.output, record)


def cmd_score_init(args):
    source_path = Path(args.input).resolve()
    source = read_json(source_path)
    errors = validate_evaluation(source, require_frozen=True)
    if errors:
        fail("frozen diagnosis validation failed:\n- " + "\n- ".join(errors))
    units = []
    for unit in source["units"]:
        units.append({
            "id": unit["id"],
            "diagnosis": unit,
            "scoring": {
                "axes": [
                    {"id": axis_id, "status": "pending", "rating": None, "evidence": [], "counterevidence": "", "rationale": ""}
                    for axis_id in AXIS_IDS
                ],
                "overall_defining_medium_issue_ids": [],
                "medium_cap_reason": "",
            },
        })
    record = {
        "version": VERSION,
        "stage": "scoring_draft",
        "created_at": now(),
        "source_diagnosis": {
            "path": str(source_path),
            "sha256": sha256_file(source_path),
            "content_hash": source["freeze"]["content_hash"],
        },
        "units": units,
        "pairwise": source.get("pairwise"),
    }
    write_json(args.output, record)


def score_for_unit(unit):
    diagnosis = unit["diagnosis"]
    scoring = unit["scoring"]
    axes = scoring["axes"]
    unavailable = [axis["id"] for axis in axes if axis["status"] == "insufficient_evidence"]
    ratings = [axis["rating"] for axis in axes if axis["status"] == "rated"]
    raw_score = None if unavailable else round(25 * (sum(ratings) / len(AXIS_IDS)), 2)
    high_ids = [issue["id"] for issue in diagnosis["issues"] if issue["severity"] == "high"]
    defining_medium_ids = scoring["overall_defining_medium_issue_ids"]
    if high_ids:
        cap = 59
        cap_reason = "One or more frozen high-severity issues constrain the composite."
    elif defining_medium_ids:
        cap = 79
        cap_reason = scoring["medium_cap_reason"]
    else:
        cap = 100
        cap_reason = "No frozen high issue or explicitly justified experience-defining medium issue."
    return {
        "status": "unavailable" if unavailable else "complete",
        "raw_score": raw_score,
        "cap": cap,
        "final_score": None if raw_score is None else min(raw_score, cap),
        "insufficient_axis_ids": unavailable,
        "high_issue_ids": high_ids,
        "overall_defining_medium_issue_ids": defining_medium_ids,
        "cap_reason": cap_reason,
    }


def validate_scoring(record, finalized=False, require_complete=False):
    errors = []
    expected_stage = "scored" if finalized else "scoring_draft"
    if record.get("version") != VERSION or record.get("stage") != expected_stage:
        errors.append("scoring version/stage mismatch")
    source_meta = record.get("source_diagnosis", {})
    source_path = Path(source_meta.get("path", ""))
    if not source_path.is_file() or sha256_file(source_path) != source_meta.get("sha256"):
        errors.append("source diagnosis file missing or changed")
        return errors
    source = read_json(source_path)
    source_errors = validate_evaluation(source, require_frozen=True)
    errors.extend(f"source: {e}" for e in source_errors)
    if source.get("freeze", {}).get("content_hash") != source_meta.get("content_hash"):
        errors.append("source diagnosis content hash changed")
    source_units = {u["id"]: u for u in source.get("units", [])}
    units = record.get("units", [])
    if not isinstance(units, list) or {u.get("id") for u in units} != set(source_units):
        errors.append("scoring units differ from frozen diagnosis")
        return errors
    for unit in units:
        uid = unit.get("id")
        if canonical_hash(unit.get("diagnosis")) != canonical_hash(source_units.get(uid)):
            errors.append(f"{uid}: frozen diagnosis content changed")
        scoring = unit.get("scoring", {})
        axes = scoring.get("axes")
        if not isinstance(axes, list) or [axis.get("id") for axis in axes] != list(AXIS_IDS):
            errors.append(f"{uid}: scoring axes must exactly match the four ordered axes")
            continue
        for axis in axes:
            axis_id = axis.get("id")
            status = axis.get("status")
            if status not in AXIS_STATUSES:
                errors.append(f"{uid}/{axis_id}: invalid axis status")
            if status == "pending":
                if require_complete or finalized:
                    errors.append(f"{uid}/{axis_id}: pending axis cannot be finalized")
                continue
            if status == "rated":
                rating = axis.get("rating")
                if isinstance(rating, bool) or not isinstance(rating, int) or rating < 0 or rating > 4:
                    errors.append(f"{uid}/{axis_id}: rating must be an integer from 0 to 4")
                evidence = axis.get("evidence")
                if not isinstance(evidence, list) or not evidence or not all(nonempty(item) for item in evidence):
                    errors.append(f"{uid}/{axis_id}: rated axis requires evidence")
                if not nonempty(axis.get("counterevidence")) or not nonempty(axis.get("rationale")):
                    errors.append(f"{uid}/{axis_id}: counterevidence and rationale are required")
            if status == "insufficient_evidence":
                if axis.get("rating") is not None:
                    errors.append(f"{uid}/{axis_id}: insufficient evidence requires rating=null")
                if not nonempty(axis.get("rationale")):
                    errors.append(f"{uid}/{axis_id}: explain the missing evidence")
        medium_ids = {issue["id"] for issue in source_units[uid].get("issues", []) if issue.get("severity") == "medium"}
        defining_ids = scoring.get("overall_defining_medium_issue_ids")
        if not isinstance(defining_ids, list) or len(defining_ids) != len(set(defining_ids)) or not set(defining_ids) <= medium_ids:
            errors.append(f"{uid}: defining medium IDs must be unique frozen medium issue IDs")
        elif defining_ids and not nonempty(scoring.get("medium_cap_reason")):
            errors.append(f"{uid}: medium_cap_reason is required for a medium cap")
        if finalized and canonical_hash(unit.get("score_result")) != canonical_hash(score_for_unit(unit)):
            errors.append(f"{uid}: calculated score result mismatch")
    if canonical_hash(record.get("pairwise")) != canonical_hash(source.get("pairwise")):
        errors.append("pairwise diagnosis changed during scoring")
    return errors


def cmd_score_finalize(args):
    record = read_json(args.input)
    errors = validate_scoring(record, finalized=False, require_complete=True)
    if errors:
        fail("scoring validation failed:\n- " + "\n- ".join(errors))
    result = json.loads(json.dumps(record))
    result["stage"] = "scored"
    result["finalized_at"] = now()
    for unit in result["units"]:
        unit["score_result"] = score_for_unit(unit)
    write_json(args.output, result)


def cmd_validate(args):
    record = read_json(args.input)
    stage = record.get("stage")
    if stage == "diagnosis":
        errors = validate_evaluation(record, require_frozen=False)
    elif stage == "diagnosis_frozen":
        errors = validate_evaluation(record, require_frozen=True)
    elif stage == "scoring_draft":
        errors = validate_scoring(record, finalized=False, require_complete=False)
    elif stage == "scored":
        errors = validate_scoring(record, finalized=True, require_complete=True)
    else:
        errors = ["unsupported record stage"]
    if errors:
        fail("record validation failed:\n- " + "\n- ".join(errors))
    print("valid")


def esc(value):
    return html.escape(str(value or ""))


def cmd_report(args):
    record = read_json(args.input)
    scored = record.get("stage") == "scored"
    if scored:
        errors = validate_scoring(record, finalized=True, require_complete=True)
    elif record.get("stage") == "diagnosis_frozen":
        errors = validate_evaluation(record, require_frozen=True)
    elif record.get("stage") == "diagnosis":
        errors = validate_evaluation(record, require_frozen=False)
    else:
        errors = ["report accepts diagnosis, diagnosis_frozen, or scored records"]
    if errors:
        fail("evaluation validation failed:\n- " + "\n- ".join(errors))
    sections = []
    for container in record["units"]:
        unit = container["diagnosis"] if scored else container
        issues = "".join(
            f"<article class='issue {esc(i['severity'])}'><div class='meta'>{esc(i['severity'])} · {esc(i['diagnosis_tag'])} · {esc(i['locator'])}</div><h3>{esc(i['visible_fact'])}</h3><p><b>Effect</b> {esc(i['effect'])}</p><p><b>Alternative checked</b> {esc(i['alternative_explanation'])}</p><p><b>Recommendation</b> {esc(i['recommendation'])}</p></article>"
            for i in unit["issues"]
        ) or "<p class='muted'>No confirmed visible issues in the supplied scope.</p>"
        dispositions = "".join(
            f"<li><code>{esc(d['finding_id'])}</code> <b>{esc(d['status'])}</b> — {esc(d['reason'])}</li>"
            for d in unit["finding_dispositions"]
        ) or "<li>No raw anomaly candidates were recorded.</li>"
        strengths = "".join(f"<li><b>{esc(s['locator'])}</b> — {esc(s['visible_fact'])}</li>" for s in unit["strengths"]) or "<li>None recorded.</li>"
        overall = unit["overall_judgment"]
        score_panel = ""
        if scored:
            result = container["score_result"]
            axis_rows = "".join(
                f"<tr><td>{esc(axis['id'])}</td><td>{esc(axis['rating']) if axis['status'] == 'rated' else 'N/A'}</td><td>{esc(axis['rationale'])}</td></tr>"
                for axis in container["scoring"]["axes"]
            )
            final_label = esc(result["final_score"]) if result["status"] == "complete" else "Unavailable"
            raw_label = esc(result["raw_score"]) if result["status"] == "complete" else "Unavailable"
            score_panel = f"""
              <div class='score'><div><span>Final</span><strong>{final_label}</strong></div><div><span>Raw</span><strong>{raw_label}</strong></div><div><span>Cap</span><strong>{esc(result['cap'])}</strong></div></div>
              <p class='muted'>{esc(result['cap_reason'])}</p>
              <table><thead><tr><th>Holistic axis</th><th>0–4</th><th>Rationale</th></tr></thead><tbody>{axis_rows}</tbody></table>
            """
        sections.append(f"""
        <section>
          <div class='eyebrow'>Unit {esc(unit['id'])} · {esc(unit['artifact']['pixel_width'])}×{esc(unit['artifact']['pixel_height'])}</div>
          <h2>{esc(overall['signal']).upper()}</h2>
          <p class='lede'>{esc(overall['summary'])}</p>
          {score_panel}
          <p><b>Scope</b> {esc(unit['scope'])}</p><p><b>Integration</b> {esc(overall['integration'])}</p>
          <h3>Confirmed issues</h3>{issues}
          <h3>Initial finding dispositions</h3><ul>{dispositions}</ul>
          <h3>Visible strengths</h3><ul>{strengths}</ul>
          <p class='muted'><b>Confidence</b> {esc(overall['confidence'])}<br><b>Limits</b> {esc(overall['limitations'])}</p>
        </section>""")
    pair = ""
    if record.get("pairwise"):
        p = record["pairwise"]
        pair = f"<section><div class='eyebrow'>Pairwise</div><h2>{esc(p['winner'])}</h2><p>{esc(p['reason'])}</p><p class='muted'>{esc(p['uncertainty'])}</p></section>"
    doc = f"""<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Visual Quality V0.9</title><style>
body{{margin:0;background:#f3f3f0;color:#171717;font:15px/1.55 system-ui,sans-serif}}main{{max-width:980px;margin:auto;padding:48px 24px 80px}}h1{{font-size:42px;margin:.1em 0}}h2{{font-size:30px;margin:.2em 0}}h3{{margin-top:28px}}section{{background:white;border:1px solid #d8d8d2;padding:32px;margin:24px 0}}.eyebrow{{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#666}}.lede{{font-size:19px}}.issue{{border-left:4px solid #777;padding:12px 16px;margin:14px 0;background:#fafafa}}.issue.high{{border-color:#b42318}}.issue.medium{{border-color:#d97706}}.issue.low{{border-color:#2563eb}}.meta,.muted{{color:#666;font-size:13px}}code{{background:#eee;padding:2px 5px}}li{{margin:7px 0}}
.score{{display:flex;gap:12px;margin:22px 0}}.score div{{min-width:100px;border:1px solid #ddd;padding:12px}}.score span{{display:block;color:#666;font-size:12px}}.score strong{{display:block;font-size:28px}}table{{border-collapse:collapse;width:100%;margin:18px 0}}th,td{{border-bottom:1px solid #ddd;padding:9px;text-align:left;vertical-align:top}}th{{font-size:12px;color:#666}}
</style><main><div class='eyebrow'>Open-set review · {esc(VERSION)}</div><h1>Visual quality evaluation</h1><p>Perception and diagnosis were frozen before optional holistic scoring.</p>{''.join(sections)}{pair}</main>"""
    output = Path(args.output)
    if output.exists():
        fail(f"refusing to overwrite {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(doc, encoding="utf-8")


def parser():
    root = argparse.ArgumentParser(description="V0.9 open-set visual review with isolated optional scoring")
    subs = root.add_subparsers(dest="command", required=True)
    p = subs.add_parser("init")
    p.add_argument("--images", nargs="+", required=True)
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_init)
    p = subs.add_parser("freeze")
    p.add_argument("input")
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_freeze)
    p = subs.add_parser("diagnose")
    p.add_argument("input")
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_diagnose)
    p = subs.add_parser("freeze-diagnosis")
    p.add_argument("input")
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_freeze_diagnosis)
    p = subs.add_parser("score-init")
    p.add_argument("input")
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_score_init)
    p = subs.add_parser("score-finalize")
    p.add_argument("input")
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_score_finalize)
    p = subs.add_parser("validate")
    p.add_argument("input")
    p.set_defaults(func=cmd_validate)
    p = subs.add_parser("report")
    p.add_argument("input")
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_report)
    return root


if __name__ == "__main__":
    args = parser().parse_args()
    args.func(args)

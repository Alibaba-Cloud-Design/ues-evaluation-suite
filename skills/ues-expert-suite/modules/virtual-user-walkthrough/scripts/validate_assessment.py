#!/usr/bin/env python3
"""Read-only, standard-library structural checks; not a UX or truth validator."""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from persona_contract import validate_persona

DIMENSIONS = {"role", "goals", "knowledge", "skills", "emotional_cognition", "communication_style", "behavioral_randomness"}
OUTCOMES = {
    "runtime": {"completed", "incorrect_result", "stopped", "permission_blocked", "environment_blocked", "tool_blocked", "insufficient_evidence"},
    "scenario": {"not_executed"},
    "replay": {"recorded_completed", "recorded_incorrect_result", "recorded_stopped", "insufficient_evidence"},
}
ACTION_STATES = {"runtime": {"executed", "tool_failed", "not_attempted"}, "scenario": {"hypothetical"}, "replay": {"recorded"}}
STOP = {"completed": {"completed"}, "incorrect_result": {"incorrect_result"}, "stopped": {"product_blocker", "persona_policy", "budget_exhausted"}, "permission_blocked": {"permission_boundary"}, "environment_blocked": {"environment"}, "tool_blocked": {"tool"}, "insufficient_evidence": {"evidence_gap"}, "not_executed": {"not_executed"}, "recorded_completed": {"completed"}, "recorded_incorrect_result": {"incorrect_result"}, "recorded_stopped": {"product_blocker", "persona_policy", "budget_exhausted", "environment", "permission_boundary", "evidence_gap"}}


def validate(data, base_dir=None, check_local=False, require_behavior_check=False):
    errors = []

    def need(condition, message):
        if not condition:
            errors.append(message)

    def text(value):
        return isinstance(value, str) and bool(value.strip())

    def positive(value):
        return type(value) is int and value > 0

    def strings(value):
        return isinstance(value, list) and all(text(x) for x in value)

    def rows(value, where):
        need(isinstance(value, list), where + ": expected array")
        if not isinstance(value, list):
            return []
        need(all(isinstance(x, dict) for x in value), where + ": entries must be objects")
        return [x for x in value if isinstance(x, dict)]

    def indexed(value, where):
        result = {}
        for row in rows(value, where):
            key = row.get("id")
            need(text(key), where + ": missing id")
            if not text(key):
                continue
            need(key not in result, where + ": duplicate id " + key)
            result[key] = row
        return result

    def refs(value, index, where, nonempty=False):
        need(strings(value), where + ": expected string array")
        if not strings(value):
            return set()
        need(len(value) == len(set(value)), where + ": duplicate references")
        need(not nonempty or bool(value), where + ": evidence/reference required")
        for key in value:
            need(key in index, where + ": unknown reference " + key)
        return set(value)

    if not isinstance(data, dict):
        return ["root must be object"], {}
    schema = data.get("schema_version")
    need(schema in {"0.1.0", "0.2.0"}, "schema_version must be 0.1.0 or 0.2.0")
    need(data.get("record_kind") in {"assessment", "example"}, "record_kind must be assessment or example")
    need(data.get("status") in {"planned", "recorded"}, "status must be planned or recorded")
    need(text(data.get("assessment_id")), "assessment_id required")
    product = data.get("product", {})
    need(isinstance(product, dict) and all(text(product.get(k)) for k in ("name", "version", "entry")), "product name/version/entry required")
    need(strings(data.get("limitations")), "limitations must be string array")
    sources = indexed(data.get("sources"), "sources")
    personas = indexed(data.get("personas"), "personas")
    tasks = indexed(data.get("tasks"), "tasks")
    runs = indexed(data.get("runs"), "runs")
    evidence = indexed(data.get("evidence"), "evidence")
    issues = indexed(data.get("issues"), "issues")
    if schema == "0.2.0":
        freeze = data.get("persona_plan", {})
        need(isinstance(freeze, dict), "persona_plan object required")
        if isinstance(freeze, dict):
            need(text(freeze.get("id")) and text(freeze.get("version")), "persona_plan id/version required")
            need(freeze.get("state") in {"draft", "frozen"}, "persona_plan state required")
            if data.get("status") == "recorded":
                need(freeze.get("state") == "frozen", "recorded assessment requires frozen persona plan")
            if freeze.get("state") == "frozen":
                need(text(freeze.get("frozen_at")), "frozen_at required")
    persona_only = (
        schema == "0.2.0" and data.get("status") == "planned"
        and isinstance(data.get("persona_plan"), dict)
        and data["persona_plan"].get("state") == "draft"
        and data.get("tasks") == [] and data.get("allocations") == []
        and data.get("runs") == [] and data.get("issues") == []
    )
    need(bool(personas) and (bool(tasks) or persona_only), "at least one persona and task required")
    for sid, source in sources.items():
        need(source.get("type") in {"user_provided", "research", "behavior_log", "inferred", "unknown"}, sid + ": invalid source type")
        need(text(source.get("ref")) and text(source.get("note")), sid + ": source ref/note required")
    for pid, persona in personas.items():
        need(text(persona.get("label")) and text(persona.get("version")), pid + ": label/version required")
        need(strings(persona.get("hypotheses")), pid + ": hypotheses must be string array")
        if schema == "0.2.0":
            errors.extend(validate_persona(persona, sources))
            continue
        dimensions = persona.get("dimensions", {})
        if not isinstance(dimensions, dict):
            need(False, pid + ": dimensions must be object")
            continue
        need(set(dimensions) == DIMENSIONS, pid + ": exactly seven dimensions required")
        for key, dimension in dimensions.items():
            if not isinstance(dimension, dict):
                need(False, pid + ": invalid dimension " + key)
                continue
            need(text(dimension.get("description")) and strings(dimension.get("rules")), pid + "/" + key + ": description/rules required")
            refs(dimension.get("basis"), sources, pid + "/" + key + "/basis")
    scenarios = {}
    for tid, task in tasks.items():
        need(all(text(task.get(k)) for k in ("goal", "entry", "success_check")), tid + ": goal/entry/success_check required")
        need(strings(task.get("preconditions")), tid + ": preconditions required")
        auth, budget = task.get("authorization", {}), task.get("budget", {})
        need(isinstance(auth, dict) and strings(auth.get("allowed")) and strings(auth.get("prohibited")) and text(auth.get("basis")), tid + ": authorization required")
        need(isinstance(budget, dict) and positive(budget.get("max_actions")) and positive(budget.get("max_no_progress")), tid + ": positive integer budgets required")
        scenarios[tid] = indexed(task.get("scenarios"), tid + "/scenarios")
        need(bool(scenarios[tid]), tid + ": scenario required")
        for sid, scene in scenarios[tid].items():
            need(scene.get("kind") in {"natural", "controlled_probe", "guided"} and text(scene.get("description")), tid + "/" + sid + ": scenario kind/description required")
    allocations = {}
    for row in rows(data.get("allocations"), "allocations"):
        key = tuple(row.get(k) for k in ("persona_id", "task_id", "scenario_id"))
        if not all(text(k) for k in key):
            need(False, "allocation persona/task/scenario string IDs required")
            continue
        pid, tid, sid = key
        need(pid in personas and tid in tasks and sid in scenarios.get(tid, {}), "allocation has unknown persona/task/scenario")
        need(key not in allocations, "duplicate allocation " + str(key))
        need(positive(row.get("repeat_count")) and text(row.get("reason")), "allocation repeat_count/reason required")
        allocations[key] = row.get("repeat_count") if positive(row.get("repeat_count")) else 0
    need(bool(allocations) or persona_only, "at least one allocation required")
    for eid, item in evidence.items():
        need(item.get("kind") in {"screenshot", "dom", "interaction", "log", "content"}, eid + ": invalid evidence kind")
        need(item.get("origin") in {"captured", "supplied", "illustrative"}, eid + ": invalid evidence origin")
        need(all(text(item.get(k)) for k in ("ref", "locator", "summary")), eid + ": ref/locator/summary required")
        need(data.get("record_kind") == "example" or item.get("origin") != "illustrative", eid + ": illustrative evidence cannot support formal assessment")
        if check_local and text(item.get("ref")):
            ref = item["ref"]
            parsed = urlparse(ref)
            if parsed.scheme not in {"http", "https"}:
                need(not parsed.scheme, eid + ": unsupported local evidence URI scheme")
                target = Path(ref.split("#", 1)[0])
                if not target.is_absolute():
                    target = Path(base_dir or ".") / target
                need(target.is_file(), eid + ": local evidence file not found: " + str(target))
    seen, steps_by_run, run_evidence = set(), {}, {}
    for rid, run in runs.items():
        key = tuple(run.get(k) for k in ("persona_id", "task_id", "scenario_id"))
        iteration = run.get("iteration")
        if not all(text(k) for k in key):
            need(False, rid + ": invalid persona/task/scenario IDs")
            continue
        need(key in allocations, rid + ": run not in allocations")
        if schema == "0.2.0":
            need(run.get("persona_version") == personas.get(key[0], {}).get("version") and text(run.get("persona_version")), rid + ": persona_version must match frozen persona")
        valid_iteration = positive(iteration)
        need(valid_iteration and iteration <= allocations.get(key, 0), rid + ": iteration outside allocation")
        if valid_iteration:
            identity = key + (iteration,)
            need(identity not in seen, rid + ": duplicate run tuple")
            seen.add(identity)
        mode, outcome = run.get("mode"), run.get("outcome")
        need(isinstance(mode, str) and mode in OUTCOMES, rid + ": invalid mode")
        if not isinstance(mode, str) or mode not in OUTCOMES:
            continue
        need(isinstance(outcome, str) and outcome in OUTCOMES[mode], rid + ": outcome incompatible with mode")
        if isinstance(outcome, str):
            need(run.get("stop_reason") in STOP.get(outcome, set()), rid + ": stop_reason incompatible with outcome")
        need(run.get("isolation") in {"independent", "partial", "shared_context", "not_applicable"}, rid + ": invalid isolation")
        need(run.get("observation_channel") in {"screenshot", "dom_assisted", "accessibility_tree", "mixed", "document", "log"}, rid + ": invalid observation channel")
        need(text(run.get("initial_state")), rid + ": initial_state required")
        need(strings(run.get("persona_deviations")) and strings(run.get("limitations")), rid + ": deviations/limitations arrays required")
        if run.get("isolation") in {"partial", "shared_context"} or mode == "scenario":
            need(bool(run.get("limitations")), rid + ": isolation/scenario limitations required")
        if mode == "replay":
            need(text(run.get("source_session_id")), rid + ": replay source_session_id required")
        steps = indexed(run.get("steps"), rid + "/steps")
        steps_by_run[rid] = steps
        need(bool(steps), rid + ": recorded run needs steps (including attempted observation)")
        all_refs = set()
        for sid, step in steps.items():
            need(all(text(step.get(k)) for k in ("state", "action", "feedback", "persona_rule")), rid + "/" + sid + ": state/action/feedback/persona_rule required")
            action_status = step.get("action_status")
            need(action_status in ACTION_STATES[mode], rid + "/" + sid + ": action_status incompatible with mode")
            all_refs |= refs(step.get("evidence_ids"), evidence, rid + "/" + sid, action_status in {"executed", "recorded", "hypothetical"})
        if require_behavior_check:
            need(isinstance(run.get("rule_observations"), list) and bool(run["rule_observations"]), rid + ": rule observations required for new runs")
        if "rule_observations" in run:
            rules = personas.get(key[0], {}).get("behavior_rules", [])
            rule_index = {r["id"]: r for r in rules if isinstance(r, dict) and text(r.get("id"))}
            observed_rules = set()
            for observation in rows(run["rule_observations"], rid + "/rule_observations"):
                rule_id = observation.get("rule_id")
                where = rid + "/rule_observations/" + str(rule_id)
                if not text(rule_id):
                    need(False, where + ": rule_id required")
                    continue
                need(rule_id in rule_index, where + ": unknown persona rule")
                need(rule_id not in observed_rules, where + ": duplicate rule observation")
                observed_rules.add(rule_id)
                triggered = observation.get("status") == "triggered"
                need(observation.get("status") in {"triggered", "not_triggered", "undetermined"}, where + ": invalid rule status")
                need(text(observation.get("note")), where + ": observable note required")
                selected_ids = refs(observation.get("step_ids"), steps, where + "/steps", triggered)
                observed_refs = refs(observation.get("evidence_ids"), evidence, where + "/evidence", triggered)
                selected_steps = [steps.get(sid, {}) for sid in selected_ids]
                linked = {e for step in selected_steps for e in step.get("evidence_ids", []) if isinstance(e, str)}
                need(observed_refs <= linked, where + ": evidence not linked to selected steps")
                if triggered:
                    expected_state = {"runtime": "executed", "scenario": "hypothetical", "replay": "recorded"}[mode]
                    supporting = [step for step in selected_steps if step.get("action_status") == expected_state]
                    supporting_refs = {e for step in supporting for e in step.get("evidence_ids", []) if isinstance(e, str)}
                    need(bool(observed_refs & supporting_refs), where + ": triggered rule needs mode-compatible step evidence")
                if require_behavior_check or "behavior_check" in observation:
                    check = observation.get("behavior_check")
                    need(isinstance(check, dict), where + ": behavior_check required")
                    if isinstance(check, dict):
                        verdict = check.get("status")
                        judged = verdict in {"conforms", "deviates"}
                        need(verdict in {"conforms", "deviates", "insufficient_evidence", "not_applicable"}, where + ": invalid behavior status")
                        need(text(check.get("note")), where + ": behavior note required")
                        need(not judged or triggered, where + ": judged behavior requires observed trigger")
                        need(verdict != "not_applicable" or observation.get("status") == "not_triggered", where + ": not_applicable requires not_triggered")
                        ids = refs(check.get("step_ids"), steps, where + "/behavior/steps", judged)
                        evs = refs(check.get("evidence_ids"), evidence, where + "/behavior/evidence", judged)
                        chosen = [steps.get(sid, {}) for sid in ids]
                        links = {e for step in chosen for e in step.get("evidence_ids", []) if isinstance(e, str)}
                        need(evs <= links, where + ": behavior evidence not linked to selected steps")
                        if judged:
                            expected = {"runtime": "executed", "scenario": "hypothetical", "replay": "recorded"}[mode]
                            actual = {e for step in chosen if step.get("action_status") == expected for e in step.get("evidence_ids", []) if isinstance(e, str)}
                            need(bool(evs & actual), where + ": behavior requires mode-compatible action evidence")
                        if verdict == "deviates":
                            need(bool(run.get("persona_deviations")), where + ": deviation must also be disclosed in persona_deviations")
        run_evidence[rid] = all_refs
        terminal = outcome in {"completed", "incorrect_result", "recorded_completed", "recorded_incorrect_result"}
        success = refs(run.get("success_evidence_ids"), evidence, rid + "/success_evidence_ids", terminal)
        need(success <= all_refs, rid + ": success evidence must appear in run steps")
        if mode == "scenario":
            need(not success, rid + ": scenario has no observed success evidence")
        if terminal:
            expected = "executed" if mode == "runtime" else "recorded"
            need(any(s.get("action_status") == expected for s in steps.values()), rid + ": terminal result requires executed/recorded step")
            if data.get("record_kind") == "assessment":
                origins = {"captured"} if mode == "runtime" else {"captured", "supplied"}
                need(any(evidence.get(e, {}).get("origin") in origins for e in success), rid + ": terminal result missing primary evidence")
    for iid, issue in issues.items():
        need(all(text(issue.get(k)) for k in ("title", "fact", "interpretation", "human_impact_hypothesis")), iid + ": three-layer issue text required")
        need(issue.get("claim_type") in {"static_fact", "behavior_observation", "hypothesis"}, iid + ": invalid claim_type")
        need(issue.get("impact") in {"blocks_goal", "wrong_result", "extra_effort", "uncertainty", "risk_exposure"}, iid + ": invalid impact")
        occurrences = rows(issue.get("occurrences"), iid + "/occurrences")
        need(bool(occurrences), iid + ": issue needs occurrence evidence")
        for occurrence in occurrences:
            rid = occurrence.get("run_id")
            if not text(rid):
                need(False, iid + ": occurrence run_id required")
                continue
            need(rid in runs, iid + ": occurrence run unknown")
            step_ids = refs(occurrence.get("step_ids"), steps_by_run.get(rid, {}), iid + "/steps", True)
            evidence_ids = refs(occurrence.get("evidence_ids"), evidence, iid + "/evidence", True)
            selected = [steps_by_run.get(rid, {}).get(s, {}) for s in step_ids]
            linked = {e for s in selected for e in s.get("evidence_ids", []) if isinstance(e, str)}
            need(evidence_ids <= linked, iid + ": occurrence evidence not linked to selected steps")
            if issue.get("claim_type") == "behavior_observation":
                need(runs.get(rid, {}).get("mode") in {"runtime", "replay"}, iid + ": scenario cannot support observed behavior")
                need(any(s.get("action_status") in {"executed", "recorded"} for s in selected), iid + ": tool failure alone is not observed user behavior")
        for exposure in rows(issue.get("exposure"), iid + "/exposure"):
            need(text(exposure.get("run_id")) and exposure.get("run_id") in runs, iid + ": exposure run unknown")
            need(exposure.get("status") in {"encountered", "reached_without_observed_issue", "not_reached", "not_tested"}, iid + ": invalid exposure status")
        for handoff in rows(issue.get("expert_handoffs"), iid + "/expert_handoffs"):
            need(all(text(handoff.get(k)) for k in ("target_skill", "topic", "reference")) and handoff.get("status") in {"pending", "reviewed"}, iid + ": invalid expert handoff")
    need(data.get("status") != "planned" or not runs and not issues, "planned output cannot contain runs or issues")
    need(data.get("status") != "recorded" or bool(runs), "recorded output must contain run records")
    if len(personas) == 1:
        need(bool(data.get("limitations")), "single persona requires limited-scope statement")
    forbidden = {"total_score", "persona_score", "user_satisfaction", "real_completion_rate", "aem_score"}

    def no_scores(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                need(key not in forbidden, "virtual-user bundle must not compute " + key)
                no_scores(value)
        elif isinstance(obj, list):
            for value in obj:
                no_scores(value)

    no_scores(data)
    summary = {"record_kind": data.get("record_kind"), "personas": len(personas), "planned_runs": sum(allocations.values()), "recorded_runs": len(runs), "runtime_runs": sum(r.get("mode") == "runtime" for r in runs.values()), "scenario_runs": sum(r.get("mode") == "scenario" for r in runs.values()), "replay_source_sessions": len({r["source_session_id"] for r in runs.values() if r.get("mode") == "replay" and text(r.get("source_session_id"))}), "issues": len(issues)}
    summary["unrecorded_allocations"] = max(0, summary["planned_runs"] - summary["recorded_runs"])
    summary["run_results"] = [{"run_id": rid, "mode": run.get("mode"), "outcome": run.get("outcome"), "stop_reason": run.get("stop_reason")} for rid, run in runs.items()]
    summary["behavior_checks_missing"] = sum("behavior_check" not in obs for run in runs.values() for obs in run.get("rule_observations", []) if isinstance(obs, dict))
    return errors, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--check-local-evidence", action="store_true")
    parser.add_argument("--require-behavior-check", action="store_true", help="Require separate trigger and behavior records for new runs")
    args = parser.parse_args()
    try:
        data = json.loads(args.input.read_text(encoding="utf-8"))
        errors, summary = validate(data, args.input.parent, args.check_local_evidence, args.require_behavior_check)
    except (OSError, ValueError, TypeError, AttributeError, KeyError) as exc:
        print(json.dumps({"valid": False, "errors": ["Cannot validate input: " + str(exc)]}, ensure_ascii=False))
        return 1
    print(json.dumps({"valid": not errors, "errors": errors, "summary": summary}, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

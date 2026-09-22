"""Offline contract tests using synthetic fixtures, never real UX results."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from validate_assessment import validate

ROOT = Path(__file__).resolve().parents[1]


def plan():
    return json.loads((ROOT / "assets" / "example-plan.json").read_text(encoding="utf-8"))


def recorded(mode="runtime"):
    data = plan()
    data.update(status="recorded", record_kind="assessment")
    data["evidence"] = [{"id": "E1", "kind": "interaction", "origin": "captured", "ref": "synthetic-evidence.txt", "locator": "test-event-1", "summary": "Synthetic fixture only"}]
    outcome = {"runtime": "completed", "scenario": "not_executed", "replay": "recorded_completed"}[mode]
    data["runs"] = [{
        "id": "R1", "persona_id": "P1", "persona_version": "1", "task_id": "T1", "scenario_id": "N1", "iteration": 1,
        "mode": mode, "isolation": "independent", "initial_state": "Synthetic initial state",
        "observation_channel": "mixed", "outcome": outcome,
        "stop_reason": "not_executed" if mode == "scenario" else "completed",
        "success_evidence_ids": [] if mode == "scenario" else ["E1"],
        "source_session_id": "LOG-ORIGINAL-1" if mode == "replay" else "",
        "persona_deviations": [], "limitations": ["Synthetic test fixture"],
        "steps": [{"id": "S1", "state": "Synthetic initial state", "action": "Synthetic action",
                   "feedback": "Synthetic result", "action_status": {"runtime": "executed", "scenario": "hypothetical", "replay": "recorded"}[mode],
                   "evidence_ids": ["E1"], "persona_rule": "B1"}]
    }]
    return data


def add_issue(data):
    data["issues"] = [{"id": "I1", "title": "Synthetic issue", "claim_type": "behavior_observation",
                       "fact": "Synthetic fact", "interpretation": "Synthetic interpretation",
                       "human_impact_hypothesis": "Unverified hypothesis", "impact": "extra_effort",
                       "occurrences": [{"run_id": "R1", "step_ids": ["S1"], "evidence_ids": ["E1"]}],
                       "exposure": [{"run_id": "R1", "status": "encountered"}],
                       "expert_handoffs": [{"target_skill": "usability-suite-47", "topic": "entry clarity", "status": "pending", "reference": "Not reviewed"}]}]
    return data


class ContractTests(unittest.TestCase):
    def assert_valid(self, data):
        errors, summary = validate(data)
        self.assertEqual(errors, [])
        return summary

    def assert_invalid(self, data, fragment):
        errors, _ = validate(data)
        self.assertTrue(any(fragment in e for e in errors), errors)

    def persona_draft(self):
        data = plan()
        data["persona_plan"].update(state="draft", frozen_at=None)
        data["tasks"] = []
        data["allocations"] = []
        return data

    def test_persona_only_draft(self):
        summary = self.assert_valid(self.persona_draft())
        self.assertEqual(summary["planned_runs"], 0)

    def test_frozen_requires_tasks(self):
        data = self.persona_draft()
        data["persona_plan"].update(state="frozen", frozen_at="2026-09-14T00:00:00Z")
        self.assert_invalid(data, "at least one persona and task")

    def test_recorded_cannot_use_draft_exception(self):
        data = self.persona_draft()
        data["status"] = "recorded"
        self.assert_invalid(data, "at least one persona and task")

    def test_draft_task_requires_allocation(self):
        data = self.persona_draft()
        data["tasks"] = plan()["tasks"]
        self.assert_invalid(data, "at least one allocation")

    def test_empty_personas_still_invalid(self):
        data = self.persona_draft()
        data["personas"] = []
        self.assert_invalid(data, "at least one persona and task")

    def test_example_plan(self):
        summary = self.assert_valid(plan())
        self.assertEqual((summary["personas"], summary["planned_runs"], summary["recorded_runs"]), (3, 3, 0))

    def test_runtime(self):
        self.assertEqual(self.assert_valid(add_issue(recorded()))["runtime_runs"], 1)

    def test_scenario(self):
        self.assertEqual(self.assert_valid(recorded("scenario"))["scenario_runs"], 1)

    def test_replay_deduplicates_original_session(self):
        data = recorded("replay")
        second = copy.deepcopy(data["runs"][0])
        second.update(id="R2", persona_id="P2")
        data["runs"].append(second)
        summary = self.assert_valid(data)
        self.assertEqual((summary["recorded_runs"], summary["replay_source_sessions"]), (2, 1))

    def test_missing_dimension(self):
        data = plan()
        del data["personas"][0]["dimensions"]["operating_habits"]
        self.assert_invalid(data, "seven dimensions")

    def test_unknown_source(self):
        data = plan()
        data["personas"][0]["dimensions"]["skills"]["fields"]["proficiency"]["basis"] = ["missing"]
        self.assert_invalid(data, "unknown reference")

    def test_duplicate_persona(self):
        data = plan()
        data["personas"].append(copy.deepcopy(data["personas"][0]))
        self.assert_invalid(data, "duplicate id")

    def test_duplicate_allocation(self):
        data = plan()
        data["allocations"].append(copy.deepcopy(data["allocations"][0]))
        self.assert_invalid(data, "duplicate allocation")

    def test_duplicate_run(self):
        data = recorded()
        second = copy.deepcopy(data["runs"][0])
        second["id"] = "R2"
        data["runs"].append(second)
        self.assert_invalid(data, "duplicate run tuple")

    def test_unknown_task(self):
        data = recorded()
        data["runs"][0]["task_id"] = "UNKNOWN"
        self.assert_invalid(data, "not in allocations")

    def test_repeat_outside_plan(self):
        data = recorded()
        data["runs"][0]["iteration"] = 2
        self.assert_invalid(data, "iteration outside allocation")

    def test_scenario_cannot_complete(self):
        data = recorded("scenario")
        data["runs"][0].update(outcome="completed", stop_reason="completed", success_evidence_ids=["E1"])
        self.assert_invalid(data, "outcome incompatible")

    def test_scenario_cannot_execute(self):
        data = recorded("scenario")
        data["runs"][0]["steps"][0]["action_status"] = "executed"
        self.assert_invalid(data, "action_status incompatible")

    def test_success_requires_evidence(self):
        data = recorded()
        data["runs"][0]["success_evidence_ids"] = []
        self.assert_invalid(data, "evidence/reference required")

    def test_success_must_be_run_evidence(self):
        data = recorded()
        item = copy.deepcopy(data["evidence"][0])
        item["id"] = "E2"
        data["evidence"].append(item)
        data["runs"][0]["success_evidence_ids"] = ["E2"]
        self.assert_invalid(data, "must appear in run steps")

    def test_runtime_requires_captured_terminal_evidence(self):
        data = recorded()
        data["evidence"][0]["origin"] = "supplied"
        self.assert_invalid(data, "missing primary evidence")

    def test_illustration_cannot_support_formal_assessment(self):
        data = recorded()
        data["evidence"][0]["origin"] = "illustrative"
        self.assert_invalid(data, "illustrative evidence cannot")

    def test_tool_blocked_is_not_product_failure(self):
        data = recorded()
        data["runs"][0].update(outcome="tool_blocked", stop_reason="product_blocker", success_evidence_ids=[])
        self.assert_invalid(data, "stop_reason incompatible")

    def test_valid_tool_blocked_run(self):
        data = recorded()
        run = data["runs"][0]
        run.update(outcome="tool_blocked", stop_reason="tool", success_evidence_ids=[])
        run["steps"][0].update(action_status="tool_failed", evidence_ids=[])
        self.assert_valid(data)

    def test_valid_permission_boundary(self):
        data = recorded()
        data["runs"][0].update(outcome="permission_blocked", stop_reason="permission_boundary", success_evidence_ids=[])
        self.assert_valid(data)

    def test_replay_needs_original_session(self):
        data = recorded("replay")
        del data["runs"][0]["source_session_id"]
        self.assert_invalid(data, "source_session_id required")

    def test_issue_cannot_invent_step(self):
        data = add_issue(recorded())
        data["issues"][0]["occurrences"][0]["step_ids"] = ["missing"]
        self.assert_invalid(data, "unknown reference missing")

    def test_scenario_cannot_support_observed_behavior(self):
        self.assert_invalid(add_issue(recorded("scenario")), "scenario cannot support observed behavior")

    def test_scenario_can_support_hypothesis(self):
        data = add_issue(recorded("scenario"))
        data["issues"][0]["claim_type"] = "hypothesis"
        self.assert_valid(data)

    def test_no_fake_unaffected_status(self):
        data = add_issue(recorded())
        data["issues"][0]["exposure"][0]["status"] = "unaffected"
        self.assert_invalid(data, "invalid exposure status")

    def test_shared_context_needs_disclosure(self):
        data = recorded()
        data["runs"][0].update(isolation="shared_context", limitations=[])
        self.assert_invalid(data, "limitations required")

    def test_planned_cannot_have_runs(self):
        data = recorded()
        data["status"] = "planned"
        self.assert_invalid(data, "planned output cannot contain")

    def test_no_synthetic_score(self):
        data = plan()
        data["total_score"] = 9
        self.assert_invalid(data, "must not compute total_score")

    def test_budget_boolean_rejected(self):
        data = plan()
        data["tasks"][0]["budget"]["max_actions"] = True
        self.assert_invalid(data, "positive integer budgets")

    def test_local_file_check(self):
        data = recorded()
        with tempfile.TemporaryDirectory() as temp:
            errors, _ = validate(data, temp, True)
            self.assertTrue(any("file not found" in e for e in errors))
            # Use an existing fixture file, never write a synthetic evidence artifact.
            data["evidence"][0]["ref"] = str(ROOT / "assets" / "example-plan.json")
            errors, _ = validate(data, temp, True)
            self.assertEqual(errors, [])

    def test_root_type(self):
        self.assert_invalid([], "root must be object")

    def test_legacy_plan_still_readable(self):
        legacy = json.loads((ROOT / "scripts" / "legacy-plan.fixture.json").read_text())
        self.assert_valid(legacy)

    def test_legacy_cannot_be_relabelled_new(self):
        legacy = json.loads((ROOT / "scripts" / "legacy-plan.fixture.json").read_text())
        legacy["schema_version"] = "0.2.0"
        self.assert_invalid(legacy, "exact subfields")

    def test_missing_subfield(self):
        data = plan()
        del data["personas"][0]["dimensions"]["role"]["fields"]["mbti"]
        self.assert_invalid(data, "exact subfields")

    def test_unknown_cannot_drive_rule(self):
        data = plan()
        data["personas"][0]["behavior_rules"][0]["field_refs"] = ["role.mbti"]
        self.assert_invalid(data, "rule cannot cite unknown")

    def test_assumed_must_disclose_source(self):
        data = plan()
        data["personas"][0]["dimensions"]["role"]["fields"]["job_role"]["basis"] = ["S2"]
        self.assert_invalid(data, "assumed needs inferred source")

    def test_hypothetical_requires_behavioral_settings(self):
        data = plan()
        p = data["personas"][0]
        removed = p["behavior_rules"].pop(0)
        for ref in removed["field_refs"]:
            p["inactive_fields"][ref] = "Synthetic omission"
        self.assert_invalid(data, "hypothetical persona needs active behavioral setting")

    def test_field_needs_rule_or_exclusion(self):
        data = plan()
        del data["personas"][0]["inactive_fields"]["role.mbti"]
        self.assert_invalid(data, "every field needs a rule")

    def test_rule_needs_observable_check(self):
        data = plan()
        data["personas"][0]["behavior_rules"][0]["check"] = ""
        self.assert_invalid(data, "when/action/check")

    def test_draft_plan_allowed(self):
        data = plan()
        data["persona_plan"] = {"id": "DRAFT", "version": "1", "state": "draft"}
        self.assert_valid(data)

    def test_draft_cannot_have_execution(self):
        data = recorded()
        data["persona_plan"]["state"] = "draft"
        self.assert_invalid(data, "requires frozen persona plan")

    def test_run_must_reference_frozen_version(self):
        data = recorded()
        data["runs"][0]["persona_version"] = "2"
        self.assert_invalid(data, "persona_version must match")

    def test_malformed_persona_returns_error(self):
        for bad in [None, [], "wrong"]:
            data = plan()
            data["personas"][0]["behavior_rules"] = bad
            self.assert_invalid(data, "behavior_rules required")


if __name__ == "__main__":
    unittest.main()

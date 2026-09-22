"""Synthetic regression cases for rule evidence; no browser behavior claimed."""
import copy
import unittest
from test_validate_assessment import recorded
from validate_assessment import validate

class RuleObservationTests(unittest.TestCase):
    def fixture(self, mode="runtime"):
        data = recorded(mode)
        data["runs"][0]["rule_observations"] = [{"rule_id": "B1", "status": "triggered", "step_ids": ["S1"], "evidence_ids": ["E1"], "note": "Synthetic visible condition and action"}]
        return data

    def test_valid_modes_and_legacy(self):
        for mode in ("runtime", "scenario", "replay"):
            self.assertEqual(validate(self.fixture(mode))[0], [])
            self.assertEqual(validate(recorded(mode))[0], [])

    def test_no_trigger_and_unknown_need_no_fabricated_steps(self):
        for status in ("not_triggered", "undetermined"):
            data = self.fixture()
            data["runs"][0]["rule_observations"][0].update(status=status, step_ids=[], evidence_ids=[])
            self.assertEqual(validate(data)[0], [])

    def test_invalid_references_and_missing_evidence(self):
        cases = [("rule_id", "OTHER", "unknown persona rule"), ("step_ids", ["OTHER"], "unknown reference"), ("evidence_ids", [], "evidence/reference required"), ("note", "", "observable note"), ("status", "passed", "invalid rule status")]
        for key, value, fragment in cases:
            data = self.fixture()
            data["runs"][0]["rule_observations"][0][key] = value
            self.assertTrue(any(fragment in e for e in validate(data)[0]))

    def test_rejects_other_step_evidence(self):
        data = self.fixture()
        data["evidence"].append(dict(data["evidence"][0], id="E2"))
        data["runs"][0]["rule_observations"][0]["evidence_ids"] = ["E2"]
        self.assertTrue(any("not linked" in e for e in validate(data)[0]))

    def test_rejects_duplicate_rule(self):
        data = self.fixture()
        data["runs"][0]["rule_observations"] *= 2
        self.assertTrue(any("duplicate rule" in e for e in validate(data)[0]))

    def test_tool_failure_does_not_prove_triggered_behavior(self):
        data = self.fixture()
        run = data["runs"][0]
        run.update(outcome="tool_blocked", stop_reason="tool", success_evidence_ids=[])
        run["steps"][0]["action_status"] = "tool_failed"
        self.assertTrue(any("mode-compatible" in e for e in validate(data)[0]))

if __name__ == "__main__":
    unittest.main()

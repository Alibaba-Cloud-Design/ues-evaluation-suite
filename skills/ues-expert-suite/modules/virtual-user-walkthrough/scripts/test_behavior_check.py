import unittest
import test_rule_observations as rule_tests
from validate_assessment import validate

class BehaviorTests(unittest.TestCase):
    def fixture(self):
        data=rule_tests.RuleObservationTests().fixture()
        data['runs'][0]['rule_observations'][0]['behavior_check']={'status':'conforms','step_ids':['S1'],'evidence_ids':['E1'],'note':'Synthetic observed action matches rule'}
        return data
    def test_valid(self):
        self.assertEqual(validate(self.fixture(),require_behavior_check=True)[0],[])
    def test_trigger_without_behavior_is_compatible_but_not_strict(self):
        data=rule_tests.RuleObservationTests().fixture()
        self.assertEqual(validate(data)[0],[])
        self.assertTrue(validate(data,require_behavior_check=True)[0])
    def test_trigger_can_have_insufficient_behavior_evidence(self):
        data=self.fixture();data['runs'][0]['rule_observations'][0]['behavior_check'].update(status='insufficient_evidence',step_ids=[],evidence_ids=[])
        self.assertEqual(validate(data,require_behavior_check=True)[0],[])
    def test_no_trigger_cannot_conform(self):
        data=self.fixture();data['runs'][0]['rule_observations'][0]['status']='not_triggered'
        self.assertTrue(any('requires observed trigger' in e for e in validate(data)[0]))
    def test_behavior_evidence_must_resolve(self):
        data=self.fixture();data['runs'][0]['rule_observations'][0]['behavior_check']['evidence_ids']=['OTHER']
        self.assertTrue(validate(data)[0])
    def test_deviation_requires_disclosure(self):
        data=self.fixture();data['runs'][0]['rule_observations'][0]['behavior_check']['status']='deviates'
        self.assertTrue(any('deviation must' in e for e in validate(data)[0]))
        data['runs'][0]['persona_deviations']=['Synthetic deviation with E1']
        self.assertEqual(validate(data)[0],[])
    def test_stop_reason_preserved(self):
        for outcome,reason in [('stopped','budget_exhausted'),('stopped','product_blocker'),('insufficient_evidence','evidence_gap')]:
            data=self.fixture();data['runs'][0].update(outcome=outcome,stop_reason=reason,success_evidence_ids=[])
            errors,summary=validate(data);self.assertEqual(errors,[]);self.assertEqual(summary['run_results'][0]['stop_reason'],reason)
        data['runs'][0].update(outcome='completed',stop_reason='budget_exhausted')
        self.assertTrue(validate(data)[0])
if __name__=='__main__':unittest.main()

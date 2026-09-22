#!/usr/bin/env python3
"""Read-only evidence references and comparison structure audit, not semantic proof."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

DECIDED = {'pass', 'partial_pass', 'fail'}
def audit(data, index, base, kind):
    errors = []
    def fail(message): errors.append(message)
    def text(x): return isinstance(x, str) and bool(x.strip())
    entries = index if isinstance(index, list) else index.get('evidence', [])
    evidence = {}
    for row in entries:
        if not isinstance(row, dict) or not text(row.get('id')):
            fail('evidence index requires object entries with IDs'); continue
        if row['id'] in evidence: fail('duplicate evidence ID: ' + row['id'])
        evidence[row['id']] = row
    def resolve(ref):
        if not text(ref): return False
        row = evidence.get(ref)
        target = (row.get('ref') or row.get('original') or row.get('path')) if row else ref
        if not text(target): return False
        if urlparse(target).scheme in {'http', 'https'}:
            return row is not None  # indexed URL is traceable, not verified online
        if urlparse(target).scheme: return False
        return (base / target.split('#', 1)[0]).is_file()
    def references(values, where):
        if not isinstance(values, list) or not values:
            fail(where + ': nonempty evidence_refs required'); return
        for value in values:
            if not resolve(value): fail(where + ': unresolved evidence reference ' + str(value))
    groups = {x.get('comparison_set_id'): x for x in data.get('comparison_sets', []) if isinstance(x, dict)}
    criteria = data.get('criteria')
    if not isinstance(criteria, list) or not criteria: fail('nonempty criteria required'); criteria = []
    for item in criteria:
        if not isinstance(item, dict): fail('criterion must be object'); continue
        cid = str(item.get('id', '?'))
        if item.get('judgment') not in DECIDED: continue
        references(item.get('evidence_refs'), cid)
        if kind == 'consistency':
            group = groups.get(item.get('comparison_set_id'))
            if group is None: fail(cid + ': unknown comparison group')
            observations = item.get('comparison_observations')
            if not isinstance(observations, list) or not observations:
                fail(cid + ': criterion-specific comparison_observations required'); continue
            for obs in observations:
                if not isinstance(obs, dict): fail(cid + ': comparison observation must be object'); continue
                units = obs.get('unit_ids')
                if not isinstance(units, list) or len(units) < 2 or not all(text(x) for x in units):
                    fail(cid + ': at least two comparable unit IDs required')
                elif len(set(units)) != len(units) or not group or any(x not in group.get('unit_ids', []) for x in units):
                    fail(cid + ': comparison units must be distinct members of selected group')
                for key in ['dimension', 'state_and_variant', 'observed', 'basis']:
                    if not text(obs.get(key)): fail(cid + ': comparison ' + key + ' required')
                references(obs.get('evidence_refs'), cid + '/comparison')
    return errors

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--kind', choices=['task', 'consistency'], required=True)
    parser.add_argument('--evidence-index', type=Path, required=True)
    parser.add_argument('--base-dir', type=Path, help='Evidence paths resolve here; default index directory')
    args = parser.parse_args()
    try:
        data=json.loads(args.input.read_text()); index=json.loads(args.evidence_index.read_text())
        errors=audit(data,index,args.base_dir or args.evidence_index.parent,args.kind)
    except (ValueError, OSError, TypeError, AttributeError) as exc: errors=[str(exc)]
    print(json.dumps({'valid':not errors,'errors':errors,'input_sha256':hashlib.sha256(args.input.read_bytes()).hexdigest() if args.input.is_file() else None,'index_sha256':hashlib.sha256(args.evidence_index.read_bytes()).hexdigest() if args.evidence_index.is_file() else None,'scope':'reference_and_comparison_structure_only','limitations':['Does not verify remote URLs, semantic support, task success or human behavior.']},ensure_ascii=False,indent=2))
    return bool(errors)
if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env python3
"""Read-only cross-file score and evidence-check freshness validation."""
import argparse
import hashlib
import json
import math
from pathlib import Path

def read(p): return json.loads(p.read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def pointer(data, ref):
    if not isinstance(ref,str) or not ref.startswith('/'): raise ValueError('JSON pointer required')
    for key in ref[1:].split('/'):
        key=key.replace('~1','/').replace('~0','~')
        data=data[int(key)] if isinstance(data,list) else data[key]
    return data

def validate(assessment, bindings, base):
    errors=[]
    entries=bindings.get('specialists',[])
    by_name={x['name']:x for x in entries}
    if len(by_name)!=len(entries): errors.append('duplicate specialist binding')
    for specialist in assessment['specialists']:
        name=specialist['name'];score=specialist.get('score')
        if score is None: continue
        if isinstance(score,bool) or not isinstance(score,(float,int)) or not math.isfinite(score):
            errors.append(name+': invalid score');continue
        entry=by_name.get(name)
        if not entry: errors.append(name+': missing source score binding');continue
        try:
            source=read(base/entry['score_file'])
            value=pointer(source,entry['score_pointer'])
            # Bind the specialist's displayed baseline score, not a scenario or raw score.
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or abs(value-score)>1e-9:
                errors.append(name+': source score differs from suite score')
            if entry.get('judgment_review')!='reviewed': errors.append(name+': judgment review not recorded')
            if name in {'task-experience-score','consistency-suite-22'}:
                check=read(base/entry['evidence_check'])
                if check.get('valid') is not True: errors.append(name+': evidence check failed')
                if check.get('input_sha256')!=digest(base/entry['input_file']): errors.append(name+': stale evidence input check')
                if check.get('index_sha256')!=digest(base/entry['evidence_index']): errors.append(name+': stale evidence index check')
        except (OSError, ValueError, KeyError, TypeError) as exc: errors.append(name+': '+str(exc))
    return errors

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('assessment',type=Path);parser.add_argument('bindings',type=Path)
    args=parser.parse_args()
    try: errors=validate(read(args.assessment),read(args.bindings),args.bindings.parent)
    except (OSError,ValueError,TypeError,KeyError) as exc: errors=[str(exc)]
    print(json.dumps({'valid':not errors,'errors':errors,'scope':'score_sources_and_evidence_check_freshness','limitations':['Review declarations and source pointers require semantic review; this does not rerun scoring formulas.']},ensure_ascii=False,indent=2))
    return bool(errors)
if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function summarize(criteria){
 const count=v=>criteria.filter(x=>x.verdict===v).length;
 const s={pass_count:count('pass'),fail_count:count('fail'),not_verified_count:count('not_verified'),n_a_count:count('N/A')};
 s.outside_scope_count=criteria.filter(x=>x.verdict==='not_verified'&&x.reason==='outside_declared_scope').length;
 s.in_scope_unverified_count=s.not_verified_count-s.outside_scope_count;
 s.verified_count=s.pass_count+s.fail_count;s.in_scope_count=criteria.length-s.n_a_count-s.outside_scope_count;
 s.coverage=s.in_scope_count?s.verified_count/s.in_scope_count:null;
 const gaps=s.in_scope_unverified_count>0||criteria.some(x=>x.remaining_gaps?.length);
 return {summary:s,findings_status:s.fail_count?'issues_found':s.pass_count?'no_observed_issues':'undetermined',verification_status:!s.in_scope_count||(!s.verified_count&&gaps)?'not_started':gaps?'partial':'complete'};
}
export function validate(d){
 const errors=[];const need=(c,m)=>{if(!c)errors.push(m)};const text=x=>typeof x==='string'&&x.trim().length>0;
 const strings=x=>Array.isArray(x)&&x.every(text);const scopes=['static','runtime_page','full_flow'];
 need(d.schema_version==='0.3.0','schema_version must be 0.3.0; migrate legacy records explicitly');need(scopes.includes(d.scope),'invalid scope');
 for(const k of ['product','version','assessed_at'])need(text(d[k]),`${k} required`);
 need(!('baseline_status' in d)&&!('release_gate_claim' in d),'legacy binary fields forbidden in current assessment');
 const c=Array.isArray(d.criteria)?d.criteria:[];need(c.length===21,'exactly 21 criteria required');
 const ids=new Set(c.map(x=>x.criterion_id));need(ids.size===21,'duplicate/missing criterion IDs');
 const issueIds=new Set((d.issues||[]).map(x=>x.issue_id));
 for(let i=1;i<=21;i++)need(ids.has(`BL-${String(i).padStart(2,'0')}`),'missing BL ID '+i);
 for(const x of c){const p=x.criterion_id;
  need(['pass','fail','not_verified','N/A'].includes(x.verdict),p+' invalid verdict');
  need(text(x.evidence)&&strings(x.evidence_method)&&x.evidence_method.length,p+' evidence required');
  need(strings(x.units)&&strings(x.remaining_gaps)&&strings(x.linked_issue_ids),p+' arrays required');
  if(['pass','fail'].includes(x.verdict))need(x.reason===null&&x.units?.length,p+' verified unit/reason required');
  if(x.verdict==='pass')need(x.remaining_gaps?.length===0,p+' pass cannot have remaining gaps');
  if(x.verdict==='N/A')need(x.reason==='condition_not_present',p+' N/A only condition_not_present');
  if(x.verdict==='not_verified'){need(['evidence_unavailable','authorization_blocked','outside_declared_scope','not_tested'].includes(x.reason),p+' invalid unverified reason');need(!(d.scope==='full_flow'&&x.reason==='outside_declared_scope'),p+' full_flow cannot exclude scope');}
  for(const id of x.linked_issue_ids||[])need(issueIds.has(id),p+' missing issue '+id);
  if(x.verdict==='fail')need(x.linked_issue_ids?.length,p+' failure must link issue');
 }
 for(const parent of c){
  if(!parent.subchecks)continue;
  need(parent.criterion_id==='BL-04','subchecks only supported on BL-04');
  const sub=Array.isArray(parent.subchecks)?parent.subchecks:[];
  need(sub.length===12&&new Set(sub.map(x=>x.id)).size===12,'BL-04 requires 12 unique subchecks');
  for(let i=1;i<=12;i++)need(sub.some(x=>x.id===`BL-04.${String(i).padStart(2,'0')}`),'missing accessibility subcheck '+i);
  for(const x of sub){
   need(!('score' in x)&&!('scoring' in x),'subchecks must not score');
   need(['pass','fail','not_verified','N/A'].includes(x.verdict),'invalid subcheck verdict');
   need(text(x.evidence)&&strings(x.evidence_refs)&&strings(x.issue_ids)&&strings(x.remaining_gaps),'subcheck evidence fields required');
   if(['pass','fail'].includes(x.verdict))need(x.reason===null&&x.evidence_refs?.length,'subcheck verified evidence required');
   if(x.verdict==='fail')need(x.issue_ids?.length&&x.issue_ids.every(id=>issueIds.has(id)),'subcheck failure issue missing');
   if(x.verdict==='pass')need(!x.remaining_gaps?.length,'subcheck pass cannot have gaps');
   if(x.verdict==='N/A')need(x.reason==='condition_not_present','subcheck NA requires absent condition');
   if(x.verdict==='not_verified')need(['evidence_unavailable','authorization_blocked','not_tested'].includes(x.reason),'subcheck unknown reason invalid');
  }
  if(sub.some(x=>x.verdict==='fail'))need(parent.verdict==='fail','BL-04 must preserve known failure');
  else if(sub.some(x=>x.verdict==='not_verified'||x.remaining_gaps?.length))need(parent.verdict==='not_verified','BL-04 must preserve unknowns');
  else need(parent.verdict===(sub.every(x=>x.verdict==='N/A')?'N/A':'pass'),'BL-04 aggregate mismatch');
  if(sub.some(x=>x.verdict==='not_verified'||x.remaining_gaps?.length))need(parent.remaining_gaps?.length,'BL-04 must retain child gaps');
 }
 const calc=summarize(c);
 for(const [k,v] of Object.entries(calc.summary))need(d.summary?.[k]===v,'summary.'+k+' mismatch');
 need(d.findings_status===calc.findings_status,'findings_status mismatch');need(d.verification_status===calc.verification_status,'verification_status mismatch');
 const gate=d.release_gate;need(gate&&['not_assessed','passed','blocked','pending'].includes(gate.status),'release_gate status required');
 need(text(gate?.reason),'release_gate reason required');
 if(gate&&gate.status!=='not_assessed'){
  const p=gate.policy;need(d.scope==='full_flow','release gate requires full_flow');
  need(p&&['id','version','owner','rationale','scope'].every(k=>text(p[k]))&&p.declared_before_assessment===true&&p.scope===d.scope,'predeclared applicable policy required');
  need(strings(p?.criterion_ids)&&p.criterion_ids.length>0&&new Set(p.criterion_ids).size===p.criterion_ids.length,'policy criterion_ids required');
  const selected=c.filter(x=>p?.criterion_ids?.includes(x.criterion_id));need(selected.length===p?.criterion_ids?.length,'unknown policy criterion IDs');
  const status=selected.some(x=>x.verdict==='fail')?'blocked':selected.some(x=>x.verdict==='not_verified'||x.remaining_gaps?.length)?'pending':'passed';need(gate.status===status,'release_gate status mismatch');
 }
 return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const errors=validate(d);console.log(JSON.stringify({valid:!errors.length,errors,...summarize(d.criteria||[])},null,2));process.exitCode=errors.length?1:0;}catch(e){console.error(e.message);process.exitCode=1;}}

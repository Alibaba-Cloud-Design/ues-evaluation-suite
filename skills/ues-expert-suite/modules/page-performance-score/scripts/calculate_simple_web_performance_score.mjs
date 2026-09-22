#!/usr/bin/env node

function fail(message){ console.error(message); process.exit(1); }
const args=process.argv.slice(2);
const i=args.indexOf('--visible-ms');
if(i<0 || i===args.length-1) fail('Usage: node calculate_simple_web_performance_score.mjs --visible-ms <milliseconds>');
const visibleMs=Number(args[i+1]);
if(!Number.isFinite(visibleMs) || visibleMs<0) fail('visible-ms must be a finite non-negative number');
let raw;
let formula;
if(visibleMs<=1000){raw=10;formula='10';}
else if(visibleMs<=1500){raw=10-(visibleMs-1000)/250;formula=`10 - (${visibleMs} - 1000) / 250`;}
else if(visibleMs<=5500){raw=8-(visibleMs-1500)/500;formula=`8 - (${visibleMs} - 1500) / 500`;}
else{raw=0;formula='0';}
raw=Math.max(0,Math.min(10,raw));
const score=Math.round((raw+Number.EPSILON)*10)/10;
const rating=raw<5?'差':raw<7?'中':raw<8.5?'优':'卓越';
process.stdout.write(JSON.stringify({schema_version:'ues.simple-web-performance.v1',metric:'visible_first_view_ms',visible_first_view_ms:visibleMs,score_raw:raw,score,rating,formula,source:'single_controlled_navigation',sample_count:1,official_pcp:false},null,2)+'\n');

# 联合交付的跨文件复核

保留三种结论：算术/结构校验、证据引用校验、判断复核。判断复核检查准则证据是否充分、任务完整终点、评分上限和比较组语义；脚本不能代替它。

联合0.4运行先核对 `run-state.json` 与 `evidence-index.json`。专项评分输入、证据检查与score binding必须引用run-state记录的当前输入、画像、路由、确认和证据版本；任一哈希或版本变化先标stale，再重做受影响检查。共享索引只证明引用目标存在和未被替换，不证明专项解释成立。

对每个数值专项，在score-bindings.json的specialists数组记录：

- name：与assessment的专项名一致。
- score_file、score_pointer：实际计算产物路径和JSON Pointer，例如/scoring/final_score；对应联合表中的基准分，不能误选场景参考分或未封顶原始分。
- judgment_review：复核后为reviewed，否则pending。该声明是审计记录，不是脚本证明。
- 任务与一致性另外记录input_file、evidence_index、evidence_check，指向当前评分输入、证据索引及对应专项validate_evidence.py的输出。

所有路径相对bindings文件，或使用绝对路径。其他未出分专项仍在联合assessment保留状态及原因，不强造绑定。完成后运行：

```bash
python3 scripts/validate_reconciliation.py /absolute/path/assessment.json /absolute/path/score-bindings.json
node scripts/validate_evidence_index.mjs /absolute/path/evidence-index.json --check-local
node scripts/validate_run_state.mjs /absolute/path/run-state.json
node scripts/validate_suite_report.mjs /absolute/path/assessment.json
```

前者核对每个数值专项的来源分数、任务/一致性证据检查有效性与输入/索引哈希；后者继续核对现有联合结构、加权和性能联动。两者均通过仍不等于判断无误。旧记录可按原文件建立绑定来检查，不能编造新的观察或声明已重新运行。

专项输入改变后依次重做证据检查、原评分脚本、判断复核、联合汇总；同步问题来源、完整任务结果、未验证范围、分数与正文。检查失败不能悄悄保留已计算综合分作为最终结果；修复或按原规则标未评分，保留发现和具体缺口。证据不足不等于产品失败，不把检测报告的错误计入产品分数。

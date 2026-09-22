# 联合运行状态合同 0.3

`run-state.json` 是单项、子集和联合评估的编排事实源，只记录输入版本、确认门、路由、诊断、专项进度、依赖与产物新鲜度；它不保存准则判断，不替代专项结果，也不改变计分。校验器继续接受0.1和0.2旧结果；由总控发起的新运行使用0.3。

直接调用单专项且不需要统一报告时不要求本文件。由 `ues-expert-suite` 编排任一单项、子集或完整范围时必须在预览材料前创建，在输入、画像、确认、路由、证据、专项或报告状态改变后更新，并运行校验器。

## 顶层结构

```json
{
  "schema_version": "ues-run-state/0.3",
  "run_id": "RUN-001",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "input_snapshot": {"id": "INPUT-001", "version": 1, "artifacts": ["input/source.png"]},
  "profile": {"version": 1, "status": "frozen", "artifact_path": "product-profile.json"},
  "confirmations": {
    "paradigm": {"status": "confirmed", "version": 1, "artifact_path": "paradigm.json", "basis": "用户确认"},
    "task_contract": {"status": "pending", "version": null, "artifact_path": null, "basis": "等待用户确认"}
  },
  "routing": {"version": 1, "status": "frozen", "artifact_path": "routing-plan.json"},
  "evidence_index": {"version": 1, "path": "evidence-index.json", "sha256": "64位小写SHA-256"},
  "diagnosis": {"version": 1, "status": "validated", "artifact_path": "diagnosis.json"},
  "specialists": [],
  "report": {"status": "not_started", "artifact_paths": [], "depends_on": null, "reason": "专项尚未完成"}
}
```

所有相对路径以 `run-state.json` 所在目录为基准。`input_snapshot.id` 在材料内容、产品版本或承诺范围实质变化时生成新值；只补充描述而未改变输入事实时可增加version并说明。

## 确认门

确认状态只能是 `not_required | pending | confirmed`。`confirmed` 必须有正整数version、非空artifact_path与明确basis；`pending` 不得被当作默认同意。当前路由没有依赖该确认的专项时使用 `not_required`。

任务链或范式实质变化时创建新版本，不覆盖旧确认依据。依赖旧版本的专项结果必须进入 `stale`，不能只修改报告文字。

## 专项状态

每项结构：

```json
{
  "name": "task-experience-score",
  "execution_status": "validated",
  "result_status": "executed",
  "artifact_paths": ["task/assessment.json"],
  "depends_on": {
    "input_snapshot_id": "INPUT-001",
    "profile_version": 1,
    "routing_version": 1,
    "evidence_index_version": 1,
    "diagnosis_version": 1,
    "task_contract_version": 1
  },
  "validation": {"status": "valid", "artifact_path": "task/validation.json"},
  "stale_reasons": []
}
```

- `execution_status`：`pending | waiting_confirmation | ready | running | blocked | completed | validated | stale | failed`。
- `result_status`：完成后使用联合报告既有的 `executed | limited | deferred | not_applicable | unavailable | not_selected`；尚无结果时为null。
- `validation.status`：`not_run | not_required | valid | invalid`。没有专项产物和计分的合法路由终态可用not_required；只有确定性校验已通过才写valid；脚本通过不代表专家判断正确。
- `depends_on` 保存专项实际读取的版本。专项不依赖任务合同时省略 `task_contract_version`，不得填假版本。
- 使用开放诊断结论或排除记录的专项必须填写 `diagnosis_version`；性能专项仅消费测量证据时可省略。
- 当前输入、画像、路由、证据索引或任务合同版本与depends_on不一致时，专项必须为stale并列出具体 `stale_reasons`。
- `validated` 要求至少一个真实产物、validation.status=valid且依赖未过期。`blocked` 与 `failed` 保留原因产物或状态说明，但不伪造结果。

各专项独立写自己的结果和状态片段；总控负责合并 `run-state.json`。不要让多个执行者同时覆盖整份状态文件。

## 报告新鲜度

报告状态：`not_started | draft | stale | current | failed`。

`report.depends_on` 在draft/current/stale时记录：

```json
{
  "input_snapshot_id": "INPUT-001",
  "profile_version": 1,
  "routing_version": 1,
    "evidence_index_version": 1,
    "diagnosis_version": 1,
  "specialist_validations": {
    "ues-baseline-gate": "valid",
    "ease-of-use-suite-47": "valid"
  }
}
```

以下任一情况使报告stale：依赖版本不一致、已选专项stale/failed、专项结果或分数改变、证据索引改变、诊断版本改变、确认版本改变。`current` 必须有实际报告路径，且所有参与结论的专项已完成相应校验。未执行专项可以保留合法终态，不要求伪造产物。

## 诊断状态

0.2及以上运行必须记录 `diagnosis`：状态使用 `draft | validated | stale | failed`，版本为正整数，`artifact_path` 指向 `diagnosis.json`。`validated` 只表示 `validate_diagnosis.mjs` 结构校验通过，不证明洞察正确。

输入快照、任务决策合同或共享证据变化后，受影响的诊断版本必须更新；依赖旧版本的专项和报告进入stale。

## 视觉专项状态

0.3冻结路由时必须包含`evaluate-visual-quality-v0-9`。结果为executed或limited且执行状态为validated时，artifact_paths至少包含basename为`perception.frozen.json`与`diagnosis.frozen.json`的文件；产生数值评分时再包含`evaluation.json`。validation必须核对冻结链和联合摘要，不得只检查文件存在。

## 校验

```bash
node scripts/validate_run_state.mjs /absolute/path/run-state.json
```

校验器核对状态、版本、依赖、路径、证据索引哈希与报告新鲜度；不证明用户真的确认、页面真的运行或专家判断正确。

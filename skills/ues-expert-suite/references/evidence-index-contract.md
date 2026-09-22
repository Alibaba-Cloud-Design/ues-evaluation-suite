# 共享证据索引合同 0.1

`evidence-index.json` 是联合评估的原始证据登记表。统一的是证据身份、来源、定位、版本和可观察事实，不统一各专项对证据的解释。准则判断、严重度、分数、用户后果和建议必须留在专项结果或联合问题中。

单专项独立运行可继续使用原合同；由总控编排时，各专项优先复用共享ID，并在自己的判断中说明该证据具体支持什么。

## 结构

```json
{
  "schema_version": "ues-evidence-index/0.1",
  "run_id": "RUN-001",
  "version": 1,
  "generated_at": "ISO-8601",
  "input_snapshot_id": "INPUT-001",
  "evidence": [
    {
      "id": "E-001",
      "kind": "screenshot",
      "origin": "captured",
      "ref": "evidence/E-001.png",
      "sha256": "可选的64位小写SHA-256",
      "recorded_at": "ISO-8601",
      "subjects": {"page_ids": ["P-01"], "state_ids": ["S-01"], "task_ids": ["T-01"], "run_ids": []},
      "locator": "1440×900，首屏右侧操作区",
      "observable_fact": "同层级并列显示两个蓝色操作按钮",
      "authorization_scope": "read_only",
      "sensitivity": "internal",
      "derivative_of": null,
      "supersedes": null
    }
  ]
}
```

## 字段规则

- `kind`：`screenshot | dom | interaction | log | content | design_source | filmstrip | metric | other`。
- `origin`：`captured | supplied | generated_annotation | illustrative`。正式结论不得只引用illustrative证据。
- `ref` 指向原始文件或精确可访问来源；本地路径相对索引目录。不要把凭据写入URL。
- `observable_fact` 只写可观察事实，不写“易用性差”“违反某准则”等判断。
- `subjects` 的四类ID数组用于跨专项复用；未知时用空数组，不虚构关联。
- `sensitivity`：`public | internal | confidential | restricted | unknown`。交付前按用户范围脱敏；索引不得扩大读取授权。
- `generated_annotation` 必须通过 `derivative_of` 指向原始证据。红框图是定位衍生物，不成为新的产品事实。
- 证据被更正或替换时新增条目并用 `supersedes` 指向旧ID；不要原地改写已被评分引用的证据。
- 对本地原始证据建议保存sha256。完整DOM、录像和日志保存在文件中，索引只保存路径、定位与摘要，避免上下文膨胀。

## 专项解释

同一证据可被多个专项引用，但每个pass、partial/fail或任务结果都必须在专项结果中保留自己的 `evidence_interpretation`、比较对象、步骤或完成真值。共享摘要不能代替专项证据门槛。

性能的计时锚点、完成帧与稳定帧仍服从 `performance-capture.json`；虚拟用户的run/step关联仍服从其数据合同；基础、易用性、任务和一致性的逐条判断仍服从各自合同。共享索引不降低任何专项要求。

## 并发与版本

采集者可以先写独立fragment，总控去重后生成新version。相同文件、时刻和定位可复用已有ID；只有来源或可观察状态不同才新增证据。合并不得靠相似文案把不同状态当成同一证据。

索引version或input_snapshot_id变化后，引用旧版本的专项结果进入stale。只有追加与既有专项完全无关的证据时，才可由总控复核后声明专项仍current，并记录依据；不得默认所有旧结果继续有效。

## 校验

```bash
node scripts/validate_evidence_index.mjs /absolute/path/evidence-index.json --check-local
```

校验器检查结构、ID唯一性、引用关系、时间、可选文件与哈希；它不判断observable_fact是否真实，也不证明证据足以支持某条准则。

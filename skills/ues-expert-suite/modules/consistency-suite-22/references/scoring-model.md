# 一致性评分模型

本模型融合旧UES/Xconsole“不达标率与缺陷严重性同等重要”的思想与22条新准则的pass / partial_pass / fail rubric。本文是分数、档位、风险上限和发布结论的唯一依据。

## 数据集

将当前报告声称的评分范围记为 `scope`。只有该范围内的条目参与分数计算：

- 局部/跨页静态分：只使用当前材料能支持的page条目。
- 状态序列分：使用已证实页面与状态关系支持的page/flow条目。
- Demo、完整或受限实测：使用实际采集和操作支持的page/flow条目。

`not_applicable` 不进入分数或证据不足比例。`insufficient_evidence` 不直接扣分，但影响是否允许出分。

## 量级与判断约束

| judgment | defect_level | 含义 |
|---|---:|---|
| pass | 0 | 未发现缺陷 |
| partial_pass | 1 | 孤立、低显著、低风险偏差 |
| partial_pass | 2 | 重复但不显著，或少量但明显 |
| fail | 3 | 大范围出现，或明显改变用户预期 |
| fail | 4 | 几乎全部错误、系统性失配或关键模式彻底不统一 |
| insufficient_evidence | null | 命题适用，但当前证据不能完成rubric |
| not_applicable | null | 适用条件明确不成立 |

不得在pass上使用非0量级，不得在partial_pass上使用3/4，不得在fail上使用1/2。

## 去重与主计分条目

新准则中存在page/flow层的关联命题，一个系统根因也可能同时影响多个视觉条目。如果发现已按SKILL.md的四问法合并为一个问题：

- 选择一个最能表达主根因和用户后果的条目作为 `score_included: true`。
- 其他受影响条目仍保留判断和覆盖，但设 `score_included: false` 且填写 `linked_to`。
- 被关联条目不进入不达标率和加权严重性的分子或分母。
- 只有判断为partial_pass或fail的条目可以作为关联非计分项；pass应正常参与当前范围分母。

不得为提高分数而随意将独立问题设为关联非计分项。

## 原始分

对当前范围内 `score_included: true` 且判断为pass、partial_pass或fail的条目：

```text
J = 参与计分的已判断条目数
n = J中 defect_level > 0 的条目数
w_i = 条目重要性（1、2或3）
b_i = 条目缺陷量级（0–4）

不达标率 R = n / J
加权缺陷严重性 S = Σ[w_i × (b_i / 4)] / Σw_i
原始分 raw_score = 10 × [1 - 0.5R - 0.5S]
```

`R`、`S`范围均为0–1，因此原始分始终位于0–10。报告展示 `J`、`n`、权重和两部分中间值，不只显示最终大分。

## 证据门槛

对当前声称的评分范围：

```text
judged = pass + partial_pass + fail（包含关联非计分项）
insufficient = insufficient_evidence
evidence_gap_rate = insufficient / (judged + insufficient)
```

只有同时满足以下条件才允许输出数值分：

- `judged >= 3`；
- `evidence_gap_rate <= 0.40`；
- 至少有3个条目实际进入计分公式；
- 评分名称与证据能力匹配。

未达门槛时，`raw_score`、`final_score`和档位均为 `unscored`，但仍输出问题严重度、已验证覆盖、风险和限制。

## 风险上限

风险上限不修改 `raw_score`，只生成 `final_score = min(raw_score, risk_cap)`。

| 触发条件 | 上限 | 发布结论 |
|---|---:|---|
| 2个及以上独立核心Gate，或一个Gate可造成不可恢复、生产、权限、付费、隐私或外发损失 | 3.9 | 不通过 |
| 1个影响核心任务的Gate | 4.9 | 不通过 |
| 无Gate，但有影响核心命名、对象/状态识别、主要行动区、核心交互模式或恢复的Major | 6.4 | 整改后复审 |
| 无上述风险 | 无 | 结合分数与覆盖判定 |

同一根因合并的Gate只算一个独立Gate。

## 参考档位

为保留旧一致性报告的可读性，输出以下“历史参考档位”：

- `[0, 7)`：差
- `[7, 8)`：中
- `[8, 9)`：优
- `[9, 10]`：卓越

边界按左闭右开执行，10分包含在卓越。在完成新模型的样本标定前，报告必须显示“历史参考档位”，不得宣称为已重新校准的新UES绝对档位。

## 发布结论

完整或Demo实测：

- 有核心Gate：不通过。
- 无Gate但有核心Major：整改后复审。
- 无核心Gate/Major但 `final_score < 7.0`：整改后复审。
- 无核心Gate/Major、`final_score >= 7.0`且证据门槛满足：通过。
- 证据门槛不满足：未判定。

截图、设计稿、状态序列或受限URL/Demo：

- 已坐实核心Gate：可判不通过。
- 已坐实核心Major：可判整改后复审。
- 其他情况：“未判定，需补充流程或受阻范围验证”，不得仅凭已见静态状态判定发布通过。

## 规范与内部基准分解

总分只计算一次，不把“规范符合分”和“内部自洽分”再做二次平均。报告另外分解：

- 规范覆盖条目数、已判断数与符合率；
- 内部基准条目数、已判断数与收敛率；
- 暂定基准数与低置信判断；
- 规范缺口、冲突、过期与已批准例外。

一条准则只有一个主基准和一个最终判断。

## 计算输入格式

`scripts/calculate_consistency_score.mjs` 接受JSON：

```json
{
  "assessment_name": "示例产品完整一致性实测",
  "assessment_type": "full_runtime",
  "criteria": [
    {
      "id": "B04.01",
      "level": "page",
      "importance": 2,
      "judgment": "partial_pass",
      "defect_level": 2,
      "baseline_type": "specification",
      "score_included": true
    },
    {
      "id": "B04.09",
      "level": "page",
      "importance": 2,
      "judgment": "partial_pass",
      "defect_level": 2,
      "baseline_type": "specification",
      "score_included": false,
      "linked_to": "B04.01"
    }
  ],
  "risks": {
    "core_gate_count": 0,
    "irreversible_gate": false,
    "core_major_count": 1
  }
}
```

`assessment_type` 可选：`full_runtime`、`demo_runtime`、`limited_runtime`、`design_review`、`state_sequence`、`cross_page_static`、`local_static`。

`baseline_type` 可选：`specification`、`approved_component`、`approved_exception`、`product_pattern`、`provisional_pattern`、`conflicted`。

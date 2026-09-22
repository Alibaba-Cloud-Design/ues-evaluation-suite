# 易用性数字计分与场景策略

准则、取证、问题合并和原严重度规则继续以 SKILL.md 与 canon-47.md 为准。本文规定新增计算脚本的数据输入；现有证据字段可以原样保留，脚本不读写截图或导出文件。

## 输入

在最终 assessment 上提供计算所需字段；报告原有的 evidence、screenshots、tasks 等字段无需改名。

```json
{
  "assessment_name": "示例静态评估",
  "assessment_type": "static",
  "scoring_mode": "dual",
  "context": {
    "id": "example-r1", "frozen": true,
    "paradigm_selection": {
      "primary": {"paradigm": "exploration", "share": 0.6},
      "secondary": {"paradigm": "task_system", "share": 0.4},
      "confirmation": {"source": "user_reply", "user_statement": "合成示例：按探索60%、任务系统40%评估。"}
    },
    "scenarios": [{
      "id": "S1", "task_id": "T1", "goal": "定位异常资源",
      "basis": "用户任务与可见资源列表",
      "primary_task": "diagnose", "secondary_tasks": []
    }]
  },
  "criteria": [
    {"id": "A01.01", "judgment": "pass"},
    {"id": "A01.02", "judgment": "partial_pass"},
    {"id": "A02.02", "judgment": "pass"},
    {"id": "A01.03", "judgment": "pass"},
    {"id": "A01.04", "judgment": "pass"},
    {"id": "A01.06", "judgment": "pass"}
  ],
  "issues": [{
    "id": "I01", "title": "资源范围需要上下文推断",
    "primary_dimension": "易见", "criterion_ids": ["A01.02"],
    "severity": "Minor",
    "scenario_links": [{"criterion_id": "A01.02", "scenario_id": "S1"}]
  }]
}
```

这只是计算样例，实际评估应完整记录所有适用或疑似适用项与原有证据；不得用该六项样例冒充完整审查。

`assessment_type`：`static`、`state_sequence`、`demo_runtime`、`full_runtime`、`limited_runtime`。静态评估只用 page 条目计分，提供的 flow 记录仍保留在覆盖统计中。运行评估只有已冻结核心任务正常与适用边界路径全部完成时，才能设置 `runtime_scope_complete: true`。这是执行者声明，脚本不替代取证校验。

criteria 至少需 id、judgment；level、importance、主维度从当前 canon 对应的注册数据读取。若传入 level/importance，必须与 canon 一致。

issues 使用既有 `criterion_ids`，也兼容旧导出脚本的 `criteria` 字段；本轮不改写导出契约。`primary_dimension` 支持易见/易学/易操作及带“性”名称。每个失败或部分通过条目必须归属至少一个独立问题；一个根因跨条目仍按原四问法合并。

新增 `scenario_links` 仅供计分，绑定问题已实际影响的准则与场景。dual 模式每个问题必须填写；不能引用未受影响条目、未计划场景或重复组合。一个问题可以有多个组合，但只选择最大系数扣一次，不按截图或任务数量重复扣分。

## 问题严重级别

严重级别从“基础重要性 × 判断”推导，合并问题取最高；High（高）、Major（较高）、Minor（一般）、Advisory（建议）仅用于扣分与整改排序。输入级别不得低于该值；有证据支持升级时填写 severity_reason。

不要求 core_impact 或 irreversible_loss，不依据这些旧字段调整分数。旧 severity=Gate 仅作为 High 的输入别名兼容；新报告与新输入使用 High，没有否决语义。

## 公式

```text
p(High/Major/Minor/Advisory) = 3 / 1.5 / 0.75 / 0.25
基准维度分 = max(0, 10 − Σp_j)

m_j = 先混合已确认主辅范式，再从问题 scenario_links 的准则/任务场景组合中取最大系数
场景维度分 = max(0, 10 − Σ[p_j × m_j])
```

重要性不再乘一次，避免与严重度重复加权。维度等权，保留内部计算精度；先对可评分维度平均，再将总分四舍五入到一位小数，直接作为最终分。维度返回未四舍五入数值，报告显示分可保留一位小数，扣分算式应保留准确值。

每个维度至少三条已判断，原始证据不足率不超过 40%；少于两个维度可评分不出总分。dual 模式还计算以准则 aggregate_multiplier 加权的缺口率，超过 40% 则该场景维度未评分。如果因此造成场景与基准可评分维度集合不同，不计算场景总分，避免比较不同分母。

静态 page 缺口超过 20% 时，基准结果标 provisional，不给确定评级。场景参考分始终不赋正式档位。

## 输出与质量评价

```bash
node scripts/calculate_ease_of_use_score.mjs assessment.json > score-result.json
```

输出 `dimensions`、`scoring` 为基准结果；dual 另输出 `scenario_profile`、`scenario_dimensions`、`scenario_scoring`。每条问题扣分包含基础扣分、场景系数与具体贡献来源，所有严重级别使用同一套场景系数规则。

输出评分、质量评级、问题扣分与覆盖限制，不再输出 risk、risk_cap 或 release_decision。旧 runtime_scope_complete、core_impact、irreversible_loss 字段不影响数值和评级；实际取证完整性仍按 SKILL.md 声明。

兼容模式 `baseline` 完全不计算场景系数。后续更换场景公式只需替换 scenario_scoring 与版本化策略，不改变证据记录。

本版 dual 输入必须在 context.paradigm_selection 记录已确认的一个主范式及最多一个辅助范式和比例，格式与确认交互见 [scenario-weighting.md](scenario-weighting.md)。所有实际任务场景继承该配置，不能逐场景覆盖；任务份额不替代范式比例。

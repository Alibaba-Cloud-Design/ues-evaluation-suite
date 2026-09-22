# 计划与结果数据合同 v0.2.0

`plan.json` 与 `assessment.json` 使用同一结构。计划为 `status=planned`，`runs/evidence/issues` 可为空；实际执行、推演或复盘产生记录后为 `status=recorded`，不代表实测或已完成。以每run的mode/outcome为准。

## 顶层字段

| 字段 | 内容 |
|---|---|
| `schema_version` | 新建固定 `0.2.0`；校验器兼容历史 `0.1.0`，通过旧合同不代表新版画像完整 |
| `persona_plan` | `{id, version, state: draft或frozen, frozen_at}`；frozen_at为实际冻结时间，执行前保存plan.json，recorded必须frozen |
| `record_kind` | `assessment` 正式记录；`example` 虚构示例，报告必须标注 |
| `status` | `planned` / `recorded` |
| `assessment_id` | 稳定ID |
| `product` | `{name, version, entry}`；未知版本写 `unknown` |
| `sources` | `[{id, type, ref, note}]`；type取user_provided/research/behavior_log/inferred/unknown |
| `personas` | 画像数组，见下 |
| `tasks` | 任务数组，见下 |
| `allocations` | 计划运行组合与重复数，见下 |
| `runs` | 已有记录，不为未执行组合填造run |
| `evidence` | 脱敏证据索引，见下 |
| `issues` | 可核验事实或待验证假设，见下 |
| `limitations` | 非空字符串数组，可为空数组，但如单画像、共享上下文、推演必须声明相应限制 |

## Persona

```text
id, label, version, kind: hypothetical|evidence_based
dimensions: 七维key，完整字段表见persona-model.md
  每维: {fields: {细项key: {value, status, basis: [source_id], reason}}}
  status: provided|evidenced|assumed|unknown|not_applicable
context: {
  need, product_experience,
  known_concepts: [文字], unknown_concepts: [文字], conditions: [文字]
}
behavior_rules: [{id, field_refs: ["operating_habits.navigation_preference"], when, action, check}]
inactive_fields: {"role.mbti": "未知，不参与本轮行为推导", ...}
hypotheses: [待验证的预测]
```

22项均须保留，字段必须有值、状态、原因和来源数组。provided需要用户来源，evidenced需要材料来源，assumed需要inferred来源；unknown/不适用可无来源，但须说明原因。假设用户积极构建与任务有关的具体偏好，不把无真实材料等同于无法设定。

规则只引用有设定的细项，每个细项必须被规则使用或在inactive_fields解释为何不驱动本轮，二者不能重叠。假设角色至少有操作习惯、目标导向及恢复/认知方面的有效规则。不把MBTI或随机比例当作能力或真实人群事实。

历史0.1.0保留原合同（role/goals/knowledge/skills/emotional_cognition/communication_style/behavioral_randomness的description/basis/rules）。不得仅改schema_version升级旧结果；需要重新构建并冻结画像，原运行仍为旧版受限记录。

仅构建角色：使用0.2.0、`status=planned`、`persona_plan.state=draft`，`tasks/allocations/runs/issues`为空数组；产品与情境可标待定。不得为满足校验创建占位任务。任务明确并冻结后，仍要求有效任务与分配；已有运行不能使用这个例外。

## Task与分配

```text
task: {
  id, goal, entry, preconditions: [文字],
  success_check: 验证侧判定规则（不是给执行者的正确路径）,
  authorization: {allowed: [文字], prohibited: [文字], basis: 真实授权依据或只读默认},
  budget: {max_actions: 正整数, max_no_progress: 正整数},
  scenarios: [{id, kind: natural|controlled_probe|guided, description}]
}
allocation: {persona_id, task_id, scenario_id, repeat_count: 正整数, reason}
```

不给未授权提交默填“allowed”。受控探查的环境注入另外确认。分配中不适用的组合不添加，报告说明原因；若用户要求全组合，可另加 `excluded_allocations` 记录排除依据。额外字段允许，但不能放模拟用户分数。

## Run

```text
id, persona_id, persona_version（须匹配冻结画像）, task_id, scenario_id, iteration: 正整数
mode: runtime|scenario|replay
isolation: independent|partial|shared_context|not_applicable
initial_state: 实际起点或推演材料范围
observation_channel: screenshot|dom_assisted|accessibility_tree|mixed|document|log
outcome: 按模式选择，见execution.md
stop_reason: completed|incorrect_result|product_blocker|persona_policy|
             budget_exhausted|permission_boundary|environment|tool|
             evidence_gap|not_executed
success_evidence_ids: [证据ID]（完成或错误结果必须非空）
source_session_id: replay必填；同一原始会话复用相同值
source_actor_id: replay可选；不把解读画像当成原会话真实身份
persona_deviations: [约束偏离及证据说明]
limitations: [本run限制]
steps: [{
  id, state, action, feedback,
  action_status: executed|hypothetical|recorded|tool_failed|not_attempted,
  evidence_ids: [证据ID],
  persona_rule: 引用维度/规则或说明无特定关联
}]
```

step ID只需在run内唯一。runtime可含未尝试或工具失败动作，不能含hypothetical/recorded；scenario全部hypothetical；replay全部recorded。计划阶段不建立虚假steps。

成功证据必须也绑定到该run至少一个step；业务终态核验可作为最后一个只读检查step。每个实际执行或原记录step至少有一条证据。结果真值无法观察时用insufficient_evidence，不靠动作文字宣称成功。

## Evidence

```text
id
kind: screenshot|dom|interaction|log|content
origin: captured|supplied|illustrative
ref: 本地证据文件或可访问的原始来源
locator: 页码/时间区间/事件ID/selector/区域
summary: 脱敏可观察事实
```

formal assessment不能引用illustrative证据。runtime完成/错误结果至少一条captured成功证据；replay至少一条supplied/captured证据。这只是结构约束，并不能自动证明证据真实。

本地ref相对JSON所在目录，URL引用精确页面/事件定位。需检查本地文件存在时加 `--check-local-evidence`；远程URL此脚本不联网验证。不要把凭据写进URL查询参数。

## Issue

```text
id, title
claim_type: static_fact|behavior_observation|hypothesis
fact, interpretation, human_impact_hypothesis
impact: blocks_goal|wrong_result|extra_effort|uncertainty|risk_exposure
occurrences: [{run_id, step_ids: [本run step_id], evidence_ids: [证据ID]}]
exposure: [{run_id, status: encountered|reached_without_observed_issue|not_reached|not_tested}]
expert_handoffs: [{target_skill, topic, status: pending|reviewed, reference}]
```

行为事实不能引用scenario或只有tool_failed的step。hypothesis不能省略依据：引用支持推测的截图/文档或实际状态。材料不足时保留为计划中的角色假设，不强建issue。根因合并、曝光是否正确以及事实能否支持后果仍需人工/专家核验。

handoff在专家未调用或未获得结论前保持pending，reference明确“待核验”。Skill不存在不阻塞本包交付。专家的正式评分放在其独立报告中，以reference链接，不放进本数据包计算。

## 校验与计数

```bash
python3 scripts/validate_assessment.py plan.json
python3 scripts/validate_assessment.py assessment.json --check-local-evidence
```

校验器只读JSON，输出画像数、计划run数、已有记录数、实际走查/推演数、唯一复盘原会话数、问题数，不写文件、不访问网页、不运行任务。重复run组合或悬空证据引用会失败。planned禁止已有run/issues；recorded允许部分计划未执行，摘要显示缺口。

正确结构不等于通过方法验收。正文中的百分比、情绪描述、专家结论和材料真实性必须另行核对。

## 行为规则观察（兼容0.2.0的扩展）

新运行在run内保存 `rule_observations`，覆盖该次角色包中的任务相关规则；旧记录缺少本字段仍可校验，不倒填历史行为。

```text
rule_observations: [{
  rule_id: 当前run角色的behavior_rules ID,
  status: triggered|not_triggered|undetermined,
  step_ids: [本run步骤ID],
  evidence_ids: [所选步骤关联的证据ID],
  note: 可观察触发情况、动作是否符合规则或无法判断的原因
}]
```

同一run每条规则最多一行。triggered需要非空步骤和证据，runtime至少有已执行步骤，replay至少有原记录步骤；scenario只能表示假设触发。其他状态可无引用但必须说明原因。不把规则触发计数换算为画像真实性、忠实度总分或真实人群结论。结构校验检查引用与模式，不能判定语义因果和行为忠实性。

### behavior_check：实际行为与规则是否相符

每个新rule_observation增加：

```text
behavior_check: {
  status: conforms|deviates|insufficient_evidence|not_applicable,
  step_ids: [本run步骤ID], evidence_ids: [所选步骤证据ID],
  note: 行为如何符合或偏离action/check，或缺少什么依据
}
```

原status仅判断when是否出现。conforms/deviates要求triggered及非空、模式匹配的行为证据；deviates同时在persona_deviations披露。not_triggered用not_applicable，触发未知或没有足够行为证据用insufficient_evidence。未触发也可以因观察不全保留insufficient_evidence。不要把“没有证据”当偏离。

触发与行为可引用同一步，但必须分别说明其支持什么；无需人为制造两套证据。scenario仍为假设符合/偏离，replay仍为原记录解读。不得由模型生成的报告文字反证角色实际表达过疑点。结构脚本不能判断语义上的符合，只检查字段、引用和状态约束。

新run运行 `python3 scripts/validate_assessment.py assessment.json --check-local-evidence --require-behavior-check`。旧数据省略严格参数仍兼容，摘要列出缺少行为判断的条数，不把旧triggered转换为conforms。计划没有run，不需要编造行为记录。

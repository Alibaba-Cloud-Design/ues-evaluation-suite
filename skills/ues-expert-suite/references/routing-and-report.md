# 专项路由与联合报告契约

本文件用于决定默认六项常规全量评估、明确要求的自适应评估、视觉按需评估或用户指定子集应运行哪些UES专项，并约束单项、子集和联合报告的数据结构。实际准则、证据门槛和计分始终以本Skill的各专项内嵌 `MODULE.md` 为准。

## 范围请求

`routing-plan.json`必须包含：

```json
{"scope_request":{"mode":"auto|full|only","requested_specialists":[],"include_visual":false,"basis":"用户请求或路由依据"}}
```

- `full`是未明确限定专项时的默认值，让六项常规专项进入适用性判断，不代表全部必须出分；
- `auto`只在用户明确要求自适应范围时按证据与风险路由，仍不得自动加入视觉；
- `only`允许七个专项中的任意一个或任意组合，数组必须非空，未指定项一律`not_selected`。

视觉质量采用显式加入规则。只有用户明确说需要视觉检测、视觉效果评估、审美检查、视觉质量，或在专项清单中列出视觉时，`include_visual=true`或`requested_specialists`包含`evaluate-visual-quality-v0-9`。仅提供截图、设计稿、URL，或泛称“完整评估”“全量评估”，都不构成视觉授权。未加入时，视觉专项在路由和结果中保留`not_selected`，不读取视觉模块、不创建视觉产物，HTML不渲染`data-ues-visual-quality`。

## 研发阶段与材料能力

| 阶段/材料 | 基线 | 易用性 | 一致性 | 任务分 | 性能 | 虚拟用户 | 视觉质量 |
|---|---|---|---|---|---|---|---|
| 概念、PRD | 仅审查文字直接支持的风险条件 | 通常不正式评分 | 有明确规范和多处可比定义时可审查 | 可建立候选任务，不形成产品实测分 | 不适用 | 可做计划或假设推演 | 无视觉表面时不适用 |
| 单张截图/单画板 | static范围 | 静态或局部范围 | 画面内有足够重复对象时局部检查 | 通常不评分 | 不适用 | scenario推演 | whole-page与original-scale诊断，可选评分 |
| 无序多图 | 各画面static范围 | 按独立静态画面，不虚构流程 | 有跨页可比对象时执行静态一致性 | 不能仅凭无序图证明任务链 | 不适用 | scenario推演 | 各unit先独立观察；两图时可做pairwise |
| 有序状态图/可交互原型 | 按实际能力选择static或runtime范围 | 可评价有证据的状态序列 | 比较页面、状态和flow | 能冻结任务链且覆盖足够步骤时执行 | 原型阶段通常不评分 | 按实际控制能力选择scenario或runtime | 对稳定渲染状态执行，不推断未展示动效 |
| 开发中Demo | runtime_page或可达flow | 实际操作核心路径 | 静态与可达flow | 确认任务链后执行简易任务分 | 早于预上线不评分 | runtime | 先捕获稳定页面截图再开放观察 |
| 预上线 | runtime_page/full_flow | 完整或受限实测 | 静态与flow | 简易任务分；有AEM数据则按专项切换 | 满足PCP条件时执行合成测量；否则满足回退合同时自动测简易性能 | runtime | 先捕获稳定页面截图再开放观察 |
| 已上线URL | runtime_page/full_flow | 完整或受限实测 | 静态与flow | 简易或AEM模式 | 优先正式监控或页面reporter；正式PCP不适用时自动测简易性能 | runtime | 先捕获稳定页面截图再开放观察 |
| 日志/录像/监控 | 只判断材料能证明的条目 | 按记录范围 | 有对照状态时执行 | AEM或记录支持的模式 | 符合数据合同时执行 | replay | 只有稳定可见帧时执行静态视觉诊断 |

表中“可执行”不等于必然可评分。专项的最小条目数、证据缺口、任务确认、产品适用性和数据合同仍然有效。

## 产品类型修正

- 展示叙事型产品通常以可见内容、理解和静态基线为主；没有明确任务链时不强行任务评分。
- 平台探索型产品通常适合易用性与跨页面一致性；任务分应围绕搜索、比较、筛选或消费内容等可验证目标。
- 任务系统型产品通常适合基线、易用性、一致性和任务分；达到预上线且属于性能专项服务范围时再加入性能。
- 同一产品可有主辅范式。若现行专项要求确认比例，总入口只向用户确认一次并复用相同上下文。
- `page-performance-score` 的PCP是阿里云控制台类产品的特化指标。其他产品不能为了凑齐UES综合分而套用该指标；对满足运行条件的网页自动改用套件的简易网页性能回退，并保留正式PCP为N/A。

## 专项状态

每个已知专项必须出现一次，状态只能取：

- `executed`：已按现行专项完成；
- `limited`：已执行，但因证据、权限、数据或工具形成受限结论；
- `deferred`：当前材料不足，补充指定证据后可执行；
- `not_applicable`：产品、阶段或任务不适用；
- `unavailable`：当前环境没有对应专项；
- `not_selected`：证据允许，但本次请求和风险不足以支持增加该专项。

不要用 `not_selected` 逃避宽泛请求中明显适用的基线或易用性。

## routing-plan.json

新运行在正式执行前冻结路由计划。至少包含 `schema_version="ues-routing-plan/0.2"`、scope_request、run_id、version、input_snapshot_id、profile_version、generated_at和七个专项。每个专项记录name、result_status、reason、evidence_basis、required_confirmations、dependencies及planned_outputs。这里的result_status是范围选择，不表示已经执行；实际进度只写入run-state的execution_status。校验器继续读取旧0.1结果。

输入、阶段、核心任务或授权边界实质变化时创建新路由版本。未受影响专项是否仍可沿用必须逐项复核，不默认全部重跑，也不默认全部有效。

## 联合问题优先级

联合报告不重新计算专项严重度。排序时依次考虑：

1. 有证据的不可恢复、安全、付费、权限、生产或外发严重后果；不能仅因基础检查fail自动升级所有问题；
2. 阻断核心任务或使结果不可确认的问题；
3. 跨多个角色、任务、页面或状态反复出现的问题；
4. 影响理解、效率或一致性的局部问题；
5. 建议性改善。

联合优先级只决定整改顺序，不回写专项分数。合并问题时保留 `source_issue_ids` 与 `source_specialists`。

## assessment.json最小契约

```json
{
  "schema_version": "ues-expert-suite/0.6",
  "generated_at": "ISO-8601",
  "run_id": "与run-state一致",
  "run_state_path": "run-state.json",
  "evidence_index_path": "evidence-index.json",
  "diagnosis_path": "diagnosis.json",
  "routing_plan_path": "routing-plan.json",
  "product": {
    "name": "产品名或unknown",
    "version": "版本或unknown",
    "platform": "web|mobile|desktop|other|unknown",
    "product_type": ["narrative|exploration|task_system|unknown"],
    "development_stage": "concept|wireframe|visual_design|interactive_prototype|development_demo|pre_release|production|unknown",
    "stage_basis": "用户陈述或证据",
    "target_users": ["用户群"],
    "core_tasks": [{"task_id": "T01", "goal": "目标", "success": "成功结果"}]
  },
  "scope": {
    "request_mode": "auto|full|only",
    "inputs": ["输入类型和标识"],
    "routes_or_screens": ["范围"],
    "authorization_limits": ["边界"],
    "assumptions": ["推断"],
    "evidence_limitations": ["限制"]
  },
  "specialists": [
    {
      "name": "ues-baseline-gate",
      "status": "executed|limited|deferred|not_applicable|unavailable|not_selected",
      "reason": "选择理由",
      "evidence_level": "专项自己的范围名称",
      "score": null,
      "result": "发现问题/验证不完整/未评分/摘要",
      "artifact_paths": []
    }
  ],
  "basic_risk": {"findings_status": "issues_found|no_observed_issues|undetermined|not_assessed", "verification_status": "complete|partial|not_started|not_assessed", "scope": "static|runtime_page|full_flow|not_assessed", "artifact_path": "basic-risk-result.json"},
  "release_gate": {"status": "not_assessed", "reason": "没有事前发布规则"},
  "ues_score": {
    "status": "calculated|not_calculated",
    "value": null,
    "weights": {"ease_of_use": 0.4, "task": 0.3, "consistency": 0.2, "performance": 0.1},
    "reason": "计算链或缺失原因"
  },
  "visual_quality": {
    "schema_version": "ues-visual-quality-summary/0.1",
    "status": "diagnosed|scored|limited|not_assessed",
    "overall_judgment": "strong|mixed|weak|undetermined|null",
    "score": {"status": "calculated|not_requested|insufficient_evidence|per_unit|not_assessed", "scale": 100, "raw": null, "cap": null, "final": null, "experimental": true},
    "units": [{"id": "A", "overall_judgment": "mixed", "score": {"status": "not_requested", "raw": null, "cap": null, "final": null}, "axes": []}],
    "counts": {"raw_findings": 0, "confirmed": 0, "downgraded": 0, "resolved": 0, "needs_evidence": 0, "issues": 0, "strengths": 0},
    "perception_path": null,
    "diagnosis_path": null,
    "evaluation_path": null,
    "perception_sha256": null,
    "diagnosis_sha256": null,
    "evidence_limitations": []
  },
  "issues": [
    {
      "issue_id": "UES-001",
      "title": "问题",
      "priority": "P0|P1|P2|P3",
      "source_specialists": ["专项名"],
      "source_issue_ids": ["原问题ID"],
      "diagnosis_refs": ["D-01"],
      "visual_finding_refs": ["VQ-F01"],
      "evidence_refs": ["证据ID或路径"],
      "affected_users_tasks": ["用户/任务"],
      "impact": "后果",
      "recommendation": "整改动作",
      "acceptance": "可复验条件"
    }
  ],
  "next_evidence": ["补证动作"]
}
```

`specialists`必须包含七个专项（基础检查含无障碍、易用性、一致性、任务、性能、虚拟用户、视觉质量），即使未执行。常规数值专项的`score`为0–10；视觉专项的`score`始终为`null`，其0–100实验结果只进入`visual_quality`。`ues_score.value`只在`status=calculated`时为数字，权重仍仅含易用性、任务、一致性和性能。

## report.md建议顺序

1. 体验结论：范围化的一句话结论、基础风险与无障碍状态、UES综合分或未计算原因。
2. 最优先动作：3–5项，指向具体对象和验收结果。
3. 产品与评估画像：阶段、类型、用户、任务、材料与关键推断。
4. 专项仪表板：每个专项的状态、证据范围、分数/结论及限制。
5. 联合问题清单：去重问题及来源映射。
6. 专项摘要：保留各自算法、覆盖与报告链接。
7. 未覆盖和下一步补证。

生成可视化主报告时，不把上述Markdown顺序直接复制成多个独立页面；统一使用 [visual-report-system.md](visual-report-system.md) 的三标签壳层、术语和组件。单项、子集和完整运行都输出同款`report.html`。视觉专项专属内容只进入“范围与方法”，去重问题与其证据统一进入“整改优先级”。

如果只有静态材料，标题和结论必须出现“静态”或“局部”；如果运行受阻，必须出现“受限”。

## 无障碍归入基础检查

当前不路由accessibility-experience-score，不输出顶层accessibility字段或无障碍分。BL-04在basic_risk.artifact_path所引用的基础检查JSON中保留subchecks和统一问题ID。七个专项都进入路由表，基础检查仍为21条；12个细项只在BL-04内部展开。

联合schema为ues-expert-suite/0.6；校验器继续兼容旧0.3、0.4与0.5记录，但新运行必须引用run-state、共享证据索引、诊断产物与路由计划。只有开放诊断确认的问题填写 `diagnosis_refs`；视觉来源问题按需填写`visual_finding_refs`。基础结果合同仍为0.3.0（增加可选subchecks）。旧独立无障碍产物只保存历史，不用于新版仪表盘。

---
name: ues-expert-suite
description: 当用户提供产品链接、截图、设计稿、Demo或产品材料并询问体验、要求UES评估，或指定基础、易用性、一致性、任务、性能、虚拟用户、视觉质量中的任一专项或组合时，默认运行六项常规度量；只有明确要求视觉检测时才启用视觉模块，并生成统一HTML与可追溯结果。
metadata:
  version: 0.8.0
---

# UES 专家套件

把模糊的产品体验审查请求转成有范围、有证据、可复核的联合评估。未明确限定专项时默认进行六项常规全量度量；视觉质量严格按需启用，只有用户明确要求包括或执行视觉检测时才运行。先判断当前材料能够证明什么，再分别执行或标记受限、暂缓、不适用，不得为凑齐全量结果强造证据或分数。

联合运行使用 `run-state.json` 保存编排事实，使用 `evidence-index.json` 复用原始证据，并以 `diagnosis.json` 保存任务决策、候选问题、验证与反证。它们加强发现、执行、恢复与追溯，不改变专项准则、判断标尺、严重度或计分。用户只要某个专项且不需要统一报告时可以直接运行该专项；用户通过本套件指定一个或多个专项时，使用同一编排和HTML合同。

## 适用的专项

这是一个单体Skill。总控负责画像、路由、协同与汇总，七个专项以内嵌模块随本Skill分发。正式执行某个专项前，必须完整读取并遵守对应的 `MODULE.md`：

- [modules/ues-baseline-gate/MODULE.md](modules/ues-baseline-gate/MODULE.md)：基础体验与风险检查；
- [modules/ease-of-use-suite-47/MODULE.md](modules/ease-of-use-suite-47/MODULE.md)：易用性；
- [modules/consistency-suite-22/MODULE.md](modules/consistency-suite-22/MODULE.md)：一致性；
- [modules/task-experience-score/MODULE.md](modules/task-experience-score/MODULE.md)：任务分；
- [modules/page-performance-score/MODULE.md](modules/page-performance-score/MODULE.md)：页面性能分；
- [modules/virtual-user-walkthrough/MODULE.md](modules/virtual-user-walkthrough/MODULE.md)：多虚拟用户任务走查与角色化证据；
- [modules/evaluate-visual-quality-v0-9/MODULE.md](modules/evaluate-visual-quality-v0-9/MODULE.md)：冻结开放观察、诊断与可选0–100实验性视觉质量评分。

内嵌模块文件损坏或执行环境缺少其必要能力时，继续执行其他适用专项，在范围表中写明 `unavailable`。专项指令之间发生冲突时，专项内部判断和计分服从对应模块；总控只决定范围以及如何合并呈现。

## 范围模式

把用户意图记录为 `scope_request`，模式只能是：

- `full`：默认模式。只要用户没有明确限定专项，基础检查、易用性、一致性、任务分、性能、虚拟用户六项进入路由与度量；视觉质量只有明确要求时才加入；证据不足时仍可为limited、deferred、not_applicable或unavailable，不强造结果；
- `only`：用户明确指定只检查一个或多个专项。七个专项均可单独运行或任意组合，未指定项标记`not_selected`并写明“用户限定范围”；
- `auto`：仅当用户明确要求“自动选择适用专项”“按现有材料决定范围”等自适应范围时使用，不作为宽泛体验审查的默认值。

`only`只决定范围，不绕过专项输入、确认、授权或计分门槛。只跑一致性仍需要合法比较组；只跑任务分仍需要冻结任务链和结果证据；只跑性能仍需要合法测量合同；只跑视觉质量仍需截图或稳定渲染页面。完整读取 [references/routing-and-report.md](references/routing-and-report.md) 获取模式与专项矩阵。

将识别出的用户范围意图写成`explicit_scope`、`requested_specialists`和`include_visual`后，运行 `node scripts/resolve_scope.mjs /absolute/path/to/scope-input.json` 固化范围。用户没有范围限定且没有明确要求视觉时，输入`{"explicit_scope":"unspecified","requested_specialists":[],"include_visual":false}`，结果必须为六项常规`full`；不要凭材料中存在截图、页面精美或材料充足自行启用视觉，也不要因材料不全自行降为`auto`。只有用户文字明确要求视觉、审美、视觉效果、视觉质量或把视觉列入范围时，`include_visual`才可为`true`。

## 0. 初始化联合运行

宽泛审查、完整UES评估或由本套件编排的指定子集开始时，完整读取 [references/run-state-contract.md](references/run-state-contract.md) 和 [references/evidence-index-contract.md](references/evidence-index-contract.md)。在预览材料前创建 `run-state.json`，登记稳定run ID与输入快照；创建空的 `evidence-index.json`，把用户提供材料作为supplied证据登记。后续新增截图、DOM、交互、日志、性能帧和标注图时复用共享证据ID。

输入、画像、确认、路由、共享证据、专项结果或报告变化后更新run-state。上游版本改变时，依赖旧版本的专项与报告必须标记stale并重做必要检查；不能只修改正文或沿用旧分。各专项写独立产物和状态片段，总控合并状态，避免并行覆盖同一文件。

共享证据索引只保存来源、定位与可观察事实。每个专项仍需独立说明证据如何支持自己的判断；不得把共享摘要当成pass/fail、任务成功或完成帧判定。

### 视觉开放观察前置门

只有`include_visual=true`或`only`明确包含视觉质量时，才完整读取 [references/visual-quality-integration.md](references/visual-quality-integration.md) 和视觉模块。先登记文件和截图，不读取UES准则、历史评审、预期答案或视觉评分轴；按视觉专项完成whole-page与original-scale开放观察并冻结`perception.frozen.json`。只有冻结后才能继续产品画像、UES开放诊断和任何taxonomy。视觉诊断冻结后才可读取视觉评分规则；不允许联合报告反写冻结产物。未明确要求视觉时，不读取视觉模块、不运行视觉脚本、不生成视觉冻结文件、评分或报告折叠块。

## 1. 建立评估画像

预览用户提供的全部材料，记录可见事实与推断，形成一份供所有专项共用的上下文，并保存带版本的 `product-profile.json`：

- 产品、版本、平台与主要用户；
- 产品类型与页面范式：展示叙事型、平台探索型、任务系统型，或有比例的主辅组合；
- 研发阶段：概念/线框、视觉设计、可交互原型、开发中Demo、预上线、已上线；
- 1–3个核心任务、用户必须作出的判断、必要信息及成功结果；
- 输入能力：单张截图、无序多图、有序状态图、设计文件、可运行Demo、URL、日志或监控数据；
- 登录、权限、测试数据、视口和高风险操作边界。

研发阶段优先取用户陈述、环境标识、版本信息或可运行状态。仅凭界面精致程度不能断言已上线；证据不足时记录“推定阶段”和依据。缺失信息只影响部分专项时，先完成不依赖该信息的预览和范围设计。

如果选中的现行专项要求用户确认任务链、页面范式或比例，将多个专项的共同问题合并成一次确认。确认前可以整理候选任务和推荐值，但不得把推荐写成用户已确认，也不得开始依赖该确认的正式计分。确认状态、版本、依据和合同路径写入run-state；实质变化创建新版本并使依赖旧确认的结果stale。

## 2. 选择评估范围

完整读取 [references/routing-and-report.md](references/routing-and-report.md)，按其中的证据—专项矩阵输出“执行 / 暂不执行 / 不适用 / 不可用”及理由。

把选择结果保存为带版本的 `routing-plan.json`，记录`scope_request`，七个已知专项各出现一次。路由结果状态与执行进度分开：前者描述评估结论范围，后者记录pending、waiting_confirmation、ready、running、blocked、completed、validated、stale或failed。

选择原则：

1. 宽泛的体验审查默认使用六项常规`full`；当前材料只能验证其中一部分时，分别标记limited、deferred或not_applicable，而不是静默删减范围。视觉质量保持`not_selected`，理由为“用户未明确要求视觉检测”。
2. 只有存在可比较的页面、组件、状态或明确规范时，才运行一致性专项。
3. 只有能够冻结任务链并观察或可靠重建结果时，才运行任务分；静态材料可以准备候选任务，但不能冒充已完成的运行证据。
4. 可运行网页达到预上线或线上阶段时，性能默认进入自动路由：先按现行性能专项判断正式PCP是否适用。不得用主观等待感、FCP或LCP补造PCP分。
5. 正式PCP不适用或缺少合法数据，但网页满足受控导航和可复核首屏完成状态时，自动读取并执行 [references/simple-web-performance.md](references/simple-web-performance.md)，生成简易性能分；不等待用户提出性能问题，也不为该回退单独请求确认。
6. 虚拟用户走查用于用户群差异会影响路径、理解、权限或恢复的场景，或用户明确要求多角色体验；它是证据来源，不是计分维度。
7. 视觉质量不因full、auto、截图、设计稿或稳定渲染页面自动进入范围；只有用户明确要求时才路由。启用后，它的0–100实验分可选且不进入UES综合分。
8. only模式严格执行用户指定集合；未指定专项不得因默认路由自行加入。
9. 不因“完整评估”而强行给每个专项出分。没有证据的专项必须显示未评分或不适用。

在正式执行前向用户简短说明画像、建议范围和关键限制。若现行专项存在必须确认的输入门，集中请求一次；否则直接执行。简易性能回退和简易UES综合分属于默认评估步骤，不列为额外确认项。

## 3. 发现与定向验证

正式逐项判断前完整读取 [references/diagnosis-and-validation.md](references/diagnosis-and-validation.md)，按“任务决策合同 → 开放诊断 → 定向验证 → 准则查漏”的顺序执行并保存 `diagnosis.json`。

开放诊断先观察页面和任务，不按准则顺序填表。重点寻找：用户目标与产品流程错位、作出决定所需信息缺失、操作完成但业务目标未闭环，以及中断、返回、相似对象、外部变化、错误恢复或角色交接时才出现的问题。随后为重要候选设计能区分真假的验证动作，并检查合理替代解释。

每轮优先验证最多三个高价值候选，再决定是否继续；这不是问题数或必要测试的上限。只有带任务依据、可定位观察、验证证据和反证记录的候选才能标记confirmed并转入实证缺陷。无法验证的保留pending/blocked；被合理解释推翻的保留rejected，避免各专项重复提出同一误报。

场景相关性用于安排验证和计算参考分，不能证明缺陷存在。确认问题无法合法映射现有准则时，可作为不计分建议进入报告，不强行扣分。开放诊断完成后，各专项继续按自己的canon检查所有适用项，只补现有证据不能满足的部分。

运行 `node scripts/validate_diagnosis.mjs /absolute/path/to/diagnosis.json` 校验结构。分别记录场景建模、侦察、正式取证、开放诊断、定向验证、准则映射、计算校验和报告生成的活动耗时；能区分时另记用户等待或外部等待，不把等待时间当执行耗时。

## 4. 协同执行

**运行网页的性能取证必须前置。** 在首轮正式运行走查前读取 [references/performance-capture-preflight.md](references/performance-capture-preflight.md)，完成能力预检并保存 `performance-capture.json`。需要新采样时，先冻结完成条件、确认采集已启动，再执行正式导航；导航结束立即验收样本。纯侦察可以先做，但不能冒充计时。能力不足必须在此时告知并记录blocked，不能到交付时才发现缺证据。当前交互式浏览器缺少连续帧能力、但本机可执行 Chrome 时，优先运行 `scripts/capture_simple_web_performance.mjs` 建立受控取证通道；完成帧仍须人工视觉复核后才能计分。

性能样本终结后必须立即运行 `scripts/validate_performance_capture.mjs`。若结果从 blocked/failed 改为 measured，同一轮必须同步更新：性能专项状态与分数、UES综合分、基线 BL-06、联合问题、限制说明、总览卡片、方法说明和证据链接。禁止只改 `performance-capture.json`，让报告继续显示“未评分”或沿用旧统计。


为页面、状态、任务和证据建立稳定ID，在专项间复用原始证据。采集前先查共享索引：同一文件、时刻、状态和定位复用已有ID；新证据先写专项fragment，再由总控合并成新的索引版本。完整DOM、录像和日志只保存文件与精确定位，不内嵌到索引。

先执行能产生其他专项输入的工作：必要时先做虚拟用户走查和开放诊断，再做基线和评分专项。性能采集与导航存在上述时序依赖；其余无依赖专项可并行判断，但不得并行覆盖run-state、evidence-index或diagnosis。正式导航已经产生合格证据时复用，不为不同专项重复执行同一路径。

每个专项必须保留自己的：

- 评估范围、模式、证据等级与覆盖率；
- 原始判断、计算链、分数名称和评级；
- 未评分、N/A、阻断与授权边界；
- 脚本校验结果与专项产物路径（如有）。

同一证据可以支持多个专项，但不能因此制造重复事实。跨专项共用问题必须先保留各专项原始判断，再在联合问题清单中按“同一直接原因、同一对象、同一用户后果、可由同一修改完整修复”合并。联合报告列出全部来源，不改写专项分数，也不重复累计问题数。

线上评估默认只读。浏览、安全输入、打开确认界面和取消返回可在授权范围内执行；付费、删除、发布、权限变更、生产写入、敏感上传和对外发送等最终动作需要用户明确授权。未执行的高风险终点按对应专项规则记录，不推断成功。

## 5. 汇总分数与独立检查

基础体验与风险检查无分数，日常输出实证缺陷与验证完整性；发布门禁只有事前明确规则时才启用。无障碍包含在BL-04内，不设独立专项或分数。虚拟用户走查不产生分数。

视觉质量使用自己的0–100实验性摘要或定性判断。`specialists[].score`对视觉专项保持`null`，视觉原始分、上限和最终分只写入`visual_quality`扩展对象；不得除以10伪装成可比较的UES专项分，也不得加入UES权重。

易用性、任务、一致性和性能四个专项都按各自现行规则输出可比的0–10基准分时，计算：

`UES综合分 = 易用性×40% + 任务分×30% + 一致性×20% + 性能×10%`

若正式性能专项不适用，但已按明确测量合同得到0–10的简易性能分，仍用相同权重计算并显示`简易 UES 综合分`。必须同时标明性能来源、样本数、误差或限制，并保留正式性能专项为N/A；不得把简易综合分或简易性能分写成正式线上分。

使用各专项的基准分；试行场景参考分、受限推演值、局部未达计分门槛的结果不得进入综合分。保留内部精度，最终四舍五入到一位小数。

除上述由简易性能分补位并生成简易 UES 综合分的情况外，任一用于加权的维度未评分、不适用或不可用时，不输出综合分，也不对剩余权重重新归一化。可以并列展示已有专项分和缺失原因。基础检查发现问题不改变合法UES数值；总览分别披露实证缺陷和验证缺口，不使用全站通过/不通过标签。明确的发布阻断仍独立显示，不被分数掩盖。

BL-04按内部无障碍细项记录证据，不额外路由专项、生成分数或增加总准则数。

## 6. 交付联合报告

本套件编排的单项、子集和完整运行默认交付同一设计系统的`report.html`，同时保留`report.md`。还要交付 `run-state.json`、`evidence-index.json`、`diagnosis.json`、`routing-plan.json` 和 `product-profile.json`；产生结构化专项结果时交付 `assessment.json`，按 [references/routing-and-report.md](references/routing-and-report.md) 的最小契约组织。用户明确只要Markdown/JSON时服从；环境确实无法生成HTML时回退Markdown并说明。先运行：

```bash
node scripts/validate_evidence_index.mjs /absolute/path/to/evidence-index.json --check-local
node scripts/validate_diagnosis.mjs /absolute/path/to/diagnosis.json
node scripts/validate_run_state.mjs /absolute/path/to/run-state.json
```

再运行：

```bash
node scripts/validate_suite_report.mjs /absolute/path/to/assessment.json
```

视觉专项被执行或受限执行时还必须运行：

```bash
node scripts/validate_visual_quality_integration.mjs /absolute/path/to/assessment.json
```

有简易性能产物时还必须运行：

```bash
node scripts/validate_performance_capture.mjs /absolute/path/to/performance-capture.json
```

报告先回答“当前证据下体验怎样、最该先改什么”，再展示计算与明细。至少包含：

1. 一句话结论与评估范围；
2. 产品画像、研发阶段、核心任务及推断；
3. 专项选择表：状态、理由、证据等级、分数/结论；
4. UES综合分或不能计算的明确原因，及基础检查（含无障碍）与可选发布规则的状态；
5. 去重后的Top问题：证据、影响用户/任务、来源专项、优先级和验收条件；标明开放诊断确认的问题与不计分建议，不展示已拒绝候选；
6. 各专项摘要与原始产物链接；
7. 未覆盖、阻断、授权边界与下一步补证建议；适用性能时引用已终结状态的 `performance-capture.json`，保留能力预检与样本验收结果；引用run-state与共享证据索引版本，使报告可以检查是否过期。

截图可定位的问题沿用专项的原图与红框编号标注规则。联合问题ID与专项问题ID建立映射，不覆盖原编号。

### 统一可视化报告

用户要求可视化、环境支持HTML交付，或完整联合评估需要决策者主报告时，完整读取 [references/visual-report-system.md](references/visual-report-system.md)。使用 `assets/report-kit/` 的统一壳层、样式令牌和灯箱交互；各专项只向规定插槽提供数据和专属组件，不得各自重建页面样式。

HTML 是结构化结果的规定视图，不是可自由删减的摘要。生成前还必须读取 [references/report-content-contract.md](references/report-content-contract.md)，直接复制 `assets/report-kit/report-shell.html`、`ues-report.css`、`detail-layout.css`、`ues-report.js` 与 `detail-layout.js` 后填充插槽。不得从空白 HTML 起稿，不得用临时卡片替代模板，不得只保留总分、问题数和结论。

每个专项分必须在同一页面用普通用户能理解的语言解释“哪里没做好、怎样影响分数、为什么得到当前分数”；算法公式、内部变量和完整计算链放在“范围与方法”，不挤进总览。没有扣分时明确写“本次没有确认扣分”，覆盖不足单独显示，不能伪装成扣分。被排除候选只在“范围与方法”逐项展示假设、验证动作、排除依据与剩余不确定性；首页不显示排除数量。确认问题、被排除候选与未验证项必须使用不同语义，不能混成问题数。

单项、子集和联合报告都保留“总览 / 整改优先级 · N / 范围与方法”三个主标签页。单项只渲染该专项内容；子集只渲染所选专项，未选项不生成空卡，只在范围表记录`not_selected`。证据必须与对应问题、任务或测量结论放在一起，不创建独立证据页。合成或单次PCP在联合视图中显示为“简易性能分”，并保留具体来源标签。

视觉质量不在总览增加专项卡，也不进入四个加权子指标。它的专项状态、定性判断、可选0–100实验分、四轴、强项、原始发现disposition、已解决怀疑与证据限制全部进入“范围与方法”的`data-ues-visual-quality`折叠块。confirmed或downgraded且需要整改的视觉issue仍可作为普通联合问题进入“整改优先级”，但完整finding lineage只放在“范围与方法”。只跑视觉时，总览仅显示范围与一句话结论，并提供跳转；不得复制视觉评分卡到总览。

场景影响优先使用总览中的增量卡片，展示核心任务、经验证的关键发现、基准分、场景参考分和主要扣分贡献。只有这些内容形成独立阅读任务且卡片会明显破坏总览层级时，才新增“场景影响”标签页；不得删除、合并或改名既有标签页。新增组件必须复用报告kit的颜色、字号、间距、网格、折叠和证据灯箱规则，并同步更新报告规范与校验器。

HTML 完成后必须运行：

```bash
node scripts/validate_html_report.mjs /absolute/path/to/report.html /absolute/path/to/assessment.json /absolute/path/to/diagnosis.json
```

校验失败时继续补齐报告，不得交付简化版本或把失败解释为“可选呈现”。

## 禁止事项

- 不把“没有发现”写成已验证通过。
- 不用单张截图推断点击反馈、流程完成、恢复能力或真实性能。
- 不擅自修改专项准则、严重度、评分公式、适用门槛或评级。
- 不把不同范围、不同证据等级或不同版本的分数直接加权。
- 不用专项分的平均值、问题数量或虚拟用户表现代替UES综合分公式。
- 不隐藏被排除专项；用户应能看到为什么没测、缺什么才能测。
- 不把执行状态和专项结果状态混为一项，不用文件存在代替validated。
- 不在共享证据索引中写准则结论、严重度、分数或建议。
- 不因统一证据结构降低专项自己的比较组、任务真值、动态证据或性能帧要求。
- 不把诊断假设、场景高权重或听起来严重的后果当成已确认问题。
- 不让已拒绝候选进入问题数、扣分或整改列表。
- 不把视觉质量分除以10、加入UES权重或映射为其他专项评级。
- 不在总览新增视觉质量卡；视觉专项专属内容只进入“范围与方法”。

### 看板式报告呈现

HTML 报告默认采用 UES 看板布局：浅灰背景、白色横向卡片、左侧大分数与分段标尺、右侧结论及关键指标，下接可筛选明细。保留总览、整改优先级、范围与方法的内容层级。完整读取本技能的 `references/dashboard-report.md`，复制本技能的 `assets/report-kit/`；单独安装本专项时也能生成同样外观。现行评估规则与计分不变。

报告固定使用浅色模式，不随系统主题切换；页头采用蓝色渐变、扇形报告卡、悬浮圆环和底部波浪，复用 `assets/report-kit/ues-banner-art.png`。装饰图不承载实际分数。

首页参考布局：综合分与趋势区旁独立放子指标概览；易用性、任务、一致性为白色横卡，底部较小模块双列。综合分区域按分数档位使用浅色渐变，普通专项分数区保持白色，不统一染绿。Banner直接使用用户提供的PNG原图，通过CSS定位适配透明留白，不重绘。

生成 HTML 时落实统一规范中的渐进展开规则，并使用同版明细资源：方法一级折叠、任务合组、BL-04行内细项、范围与公式分层，以及统一标题样式。

## 汇总前的证据与分数复核

专项评分前完成各自证据检查；汇总时读取 [references/evidence-reconciliation.md](references/evidence-reconciliation.md)。引用校验、公式计算与判断复核分开展示，不用“脚本通过”概括全部验收。专项输入、结论或分数修订后，先将对应专项与报告标记stale，更新依赖版本，重新校验并同步联合状态、问题来源、覆盖声明与综合分；关键评分依据未补齐时保留问题事实和未评分原因，不把旧分数作为已验收结果。只有共享证据、专项校验与联合报告均为当前版本时，报告才可标记current。

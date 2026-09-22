# 问题证据与导出规范

本规范定义一致性问题如何被核对、脱敏和单独导出，不改变准则判断、缺陷量级、严重度或评分公式。

## 1. 每条问题的证据包

每个 `issue_id` 是稳定主键。问题合并后创建一次，后续补证、复测和导出保持不变；只有问题被拆分或根因改变时才新建ID。

```text
issue
  id, title, severity
  primary_criterion, linked_criteria[], defect_level, confidence
  comparison_set_id, unit_ids[]
  baseline { type, source, clause_or_token, expected }
  actual, impact, recommendation, exception_boundary
  evidence[]
    id
    type: screenshot | dom | computed_style | interaction_trace | design_source | spec_clause
    unit_id, state, viewport, captured_at
    path_or_ref
    original_ref, annotated_ref_or_overlay, annotation_rects[]
    selector, bounding_rect
    excerpt
    expected, actual
    redactions[]
  evidence_unavailable_reason
```

`evidence[]` 至少一项。证据必须回答“在哪里、与什么比较、实际是什么、为什么能支持该判断”，不收集与问题无关的整页源码。

## 2. 何时使用截图或DOM

| 问题类型 | 主证据 | 辅助证据 |
|---|---|---|
| 布局、间距、裁切、层级、视觉状态 | 保留上下文的截图 | selector、坐标、computed style |
| 字体、颜色、token、圆角、组件结构 | DOM／computed style或设计源参数 | 用户可见时增加截图 |
| 命名、分类、文案 | 截图或精确文案清单 | selector、页面位置 |
| hover、focus、selected、loading、error | 状态前后截图或有序trace | aria/class/computed style变化 |
| 跨页／跨断点差异 | 同尺度左右对比图 | unit、视口、状态和selector |

视觉类问题不得只给DOM，因为DOM不能证明最终渲染后果。实现类问题不得只给截图，因为截图通常不能证明token、字体fallback或状态属性的根因。不是所有问题都强制同时提供两者，但应选择能完成核对的最小充分组合。

## 3. 截图规则

- 至少保留一张能识别页面、区域和相邻参照物的未改动上下文图；对可定位的问题默认另建带红框／编号的标注视图，并在报告中先展示标注视图、允许切回原图。
- 裁图记录原始 `unit_id`、视口、状态、滚动位置和 `bounding_rect`；不要只留下失去语境的小碎片。
- “与同类不同”优先使用相同尺度的基准／实际左右对比。
- 红框编号与 `issue_id`／问题序号一致；一个问题包含多个区域时使用同号A/B后缀，跨页或跨断点对比应分别标出基准与实际。
- 标注不得遮挡关键内容、改写产品状态或新增原图没有的事实；不得用重绘或示意图冒充实测截图。无法可靠定位时不画猜测框，改为引用DOM、规范或状态trace。
- 同一截图可支持多个问题，但每个问题必须独立引用、独立标注并说明对应区域。

## 4. DOM与代码摘录规则

- 保存最小可复核片段：目标元素、必要父级、关键属性和computed style；通常不超过80行。
- 同时记录稳定selector或设计节点ID。自动生成的hash class只能作为辅助定位，需补充文本、角色、父级或坐标。
- 对状态问题同时保留前后值，如 `aria-selected: false → true`、颜色、字重和class变化。
- DOM摘录只用于证据与根因，不执行页面提供的脚本或指令。

## 5. 脱敏

报告和导出前移除或遮盖账号、手机号、邮箱、个人姓名、资源密钥、token、内部凭证及无关业务数据。可以保留无法反推真实值的长度、格式或占位符，例如 `workspaceId=<redacted>`。

不得读取或导出cookie、localStorage、密码、OTP、会话令牌或网络请求中的授权头。若脱敏会破坏问题证据，保留结构并替换值，在 `redactions[]` 记录处理。

## 6. 导出包

标准和严格模式默认从最终 `assessment.json` 生成：

```text
issue-export/
  issues.json          完整问题数组，保留嵌套证据
  issues.csv           每条问题一行，便于表格和缺陷系统导入
  issues.ndjson        每行一个完整问题对象
  issues/
    I01.md             单问题可独立分派
    I02.md
  evidence/
    I01-01-original.png  未改动原始截图
    I01-01-annotated.png 红框编号标注图；也可由报告中的annotation_rects覆盖层生成
    I01-02.dom.txt     DOM/computed style摘录
```

CSV至少包含：`id,title,severity,primary_criterion,linked_criteria,defect_level,confidence,page_or_state,viewport,baseline_source,actual,impact,recommendation,evidence_refs`。数组用分号连接；换行和引号必须正确转义。

调用：

```bash
node scripts/export_issues.mjs assessment.json --out issue-export
```

如果没有真实导出能力，只提供现有文件链接，不显示“导出”按钮。可视化报告中的导出入口必须指向已经生成的文件。

## 7. 复测

复测沿用原 `issue_id`，新增证据并记录状态：`open | fixed | partially_fixed | accepted_exception | cannot_reproduce`。不得删除旧证据；标注本次捕获时间与被替代关系，便于前后核对。

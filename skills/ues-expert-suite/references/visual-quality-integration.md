# 视觉质量 V0.9 联合适配合同

本文件只规定 `evaluate-visual-quality-v0-9` 与 UES 总控之间的时序、数据映射和报告位置。视觉观察、诊断、严重度和评分始终服从 [视觉质量内嵌模块](../modules/evaluate-visual-quality-v0-9/MODULE.md) 及其 `references/contract.md`、`references/diagnosis.md` 与 `references/scoring.md`。

## 时序

1. 总控只登记输入路径、哈希、媒体类型和稳定截图，不作视觉判断。
2. 在读取 UES 准则、历史评审、预期答案或视觉评分轴之前，运行视觉 `review.py init`，完成whole-page与original-scale开放观察并冻结 `perception.frozen.json`。
3. 冻结后才读取视觉诊断参考，完成全部disposition、issue、strength和overall judgment，校验并冻结 `diagnosis.frozen.json`。
4. 只有用户要求数值/比较，或full模式明确要求实验性数值摘要时，才读取视觉评分参考并生成 `evaluation.json`。
5. 后续UES诊断与报告只能读取冻结产物，不得修改、重写或删除视觉原始发现。

若代理已经在观察图像前读过taxonomy、旧评审或评分轴，不得声称本轮满足V0.9开放观察合同。记录阻断原因；需要合法视觉结果时用未被污染的新执行上下文重新运行。

## 共享证据

- 每个视觉unit的原始图像必须登记为共享evidence，路径和SHA-256与视觉artifact一致。
- 联合问题可以引用共享evidence ID、视觉issue ID与原始finding ID。
- 共享索引只保存可观察事实；visual tag、severity、disposition和score保留在视觉产物或联合摘要中。
- 同一视觉问题与易用性/一致性问题只有在直接原因、对象、用户后果和完整修复动作均相同时才合并。合并不删除任一专项的原始issue。

## assessment映射

`specialists`中增加：

```json
{
  "name": "evaluate-visual-quality-v0-9",
  "status": "executed",
  "reason": "存在可评估截图",
  "evidence_level": "static_whole_page_and_original_scale",
  "score": null,
  "result": "mixed",
  "artifact_paths": [
    "visual-quality/perception.frozen.json",
    "visual-quality/diagnosis.frozen.json",
    "visual-quality/evaluation.json"
  ]
}
```

视觉0–100结果不得写入`specialists[].score`。顶层扩展对象：

```json
{
  "visual_quality": {
    "schema_version": "ues-visual-quality-summary/0.1",
    "status": "diagnosed",
    "overall_judgment": "mixed",
    "score": {
      "status": "not_requested",
      "scale": 100,
      "raw": null,
      "cap": null,
      "final": null,
      "experimental": true
    },
    "units": [
      {
        "id": "A",
        "overall_judgment": "mixed",
        "score": {"status": "not_requested", "raw": null, "cap": null, "final": null},
        "axes": []
      }
    ],
    "counts": {
      "raw_findings": 4,
      "confirmed": 2,
      "downgraded": 0,
      "resolved": 1,
      "needs_evidence": 1,
      "issues": 2,
      "strengths": 2
    },
    "perception_path": "visual-quality/perception.frozen.json",
    "diagnosis_path": "visual-quality/diagnosis.frozen.json",
    "evaluation_path": null,
    "perception_sha256": "64位小写SHA-256",
    "diagnosis_sha256": "64位小写SHA-256",
    "evidence_limitations": ["静态截图不能证明动效和响应式行为"]
  }
}
```

`visual_quality.status`只能是`diagnosed | scored | limited | not_assessed`。未执行或路由终态不是executed/limited时使用`not_assessed`，路径、哈希与score值均为空。每个视觉unit都必须在`units`中出现一次。

评分时四轴使用视觉专项的原始0–4整数；unit的`score.raw/cap/final`使用0–100。raw等于四轴均值乘25，final等于`min(raw, cap)`。高影响issue触发59上限；被明确列为overall-defining的中影响issue才触发79上限。联合适配器不重新判断上限，只核对视觉evaluation中的结果。

单unit时顶层`overall_judgment`与`score`复制该unit，便于模板读取。多unit时不得平均：顶层`overall_judgment=null`，顶层`score.status="per_unit"`且raw/cap/final均为null；报告逐unit展示，并保留视觉专项的pairwise判断。

## 联合问题

confirmed或downgraded视觉finding转成联合问题时，保留：

```json
{
  "source_specialists": ["evaluate-visual-quality-v0-9"],
  "source_issue_ids": ["VQ-I01"],
  "visual_finding_refs": ["VQ-F01"]
}
```

resolved不得进入联合问题。needs_evidence只进入证据限制或`next_evidence`。联合priority只用于整改排序，不回写视觉severity。

## HTML位置

视觉专项专属内容只进入“范围与方法”的`data-ues-visual-quality`一级折叠块：

- 定性整体判断；
- 可选实验分、raw/cap/final与四轴；
- 单元、原图哈希、像素尺寸和范围；
- raw finding → disposition → issue追溯；
- strengths、resolved suspicions、needs_evidence和静态边界；
- 冻结产物链接。

总览不显示视觉质量卡、四轴、分数或finding数量。需要整改的视觉issue沿用普通联合问题组件；整改页不新增视觉专属分区。视觉专项没有固定checklist，不生成通过率或伪造准则行。

# 逐条证据检查

每个pass、partial_pass、fail准则保留非空 evidence_refs，使用证据索引中的精确ID或可定位的实际文件路径。索引为数组或 {"evidence": [...]}；每条含id与ref（也兼容原索引的original/path）。路径相对索引目录，可用--base-dir指定证据根目录。远程来源须先在索引中登记URL；脚本不联网，不证明URL可访问。

正文的证据简称不能代替结构化引用；E16–E30之类范围不是可解析ID。允许多条准则复用原图，但每条必须说明该图的哪一对象或状态支持哪一判断。未验证与不适用保留理由，不强制补造运行证据。

```bash
python3 scripts/validate_evidence.py /absolute/path/input.json --kind task --evidence-index /absolute/path/trace.json > /absolute/path/evidence-check.json
```

先修复引用；若实际观察不足，应补充授权范围内检查或改为insufficient_evidence，再由原计分脚本决定评分资格与分数。不可仅调整文字以通过校验。输出包含输入与索引SHA-256供联合报告识别过期检查。

## 完整任务与子场景

正常、边界、恢复场景可以分别判断；完整任务是否成功仍按冻结success_truth独立核验。把刷新列为单独场景时，明确正常子场景的终点，不将刷新前通过写成含持久保存的完整任务成功。E_lite仅是冻结场景代理。场景划分和权重在执行前确定，之后改变须创建新版本并说明，不为改善分数事后拆分失败任务。

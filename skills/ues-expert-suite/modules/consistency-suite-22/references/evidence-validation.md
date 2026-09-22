# 逐条证据检查

每个pass、partial_pass、fail准则保留非空 evidence_refs，使用证据索引中的精确ID或可定位的实际文件路径。索引为数组或 {"evidence": [...]}；每条含id与ref（也兼容原索引的original/path）。路径相对索引目录，可用--base-dir指定证据根目录。远程来源须先在索引中登记URL；脚本不联网，不证明URL可访问。

正文的证据简称不能代替结构化引用；E16–E30之类范围不是可解析ID。允许多条准则复用原图，但每条必须说明该图的哪一对象或状态支持哪一判断。未验证与不适用保留理由，不强制补造运行证据。

```bash
python3 scripts/validate_evidence.py /absolute/path/input.json --kind consistency --evidence-index /absolute/path/trace.json > /absolute/path/evidence-check.json
```

先修复引用；若实际观察不足，应补充授权范围内检查或改为insufficient_evidence，再由原计分脚本决定评分资格与分数。不可仅调整文字以通过校验。输出包含输入与索引SHA-256供联合报告识别过期检查。

## 每条比较观察

每个已判断准则补充comparison_observations数组，每项包含：unit_ids（所选comparison_set中的至少两个可比实例ID）、dimension（本准则检查属性）、state_and_variant（状态、尺寸和风险条件）、observed（实际相同点或差异）、basis（规范、稳定模式或例外依据）、evidence_refs（精确引用）。状态前后也可作为两个实例；规范对齐时记录规范基准与被测实例，并将两者纳入比较组。

同一图片可支撑不同属性，不能因此用同一句“整体一致”判定多个pass。不要把相同证据文案本身视为产品缺陷；它提示需复核观察是否充分。含多个子要求的准则若只检查其中一部分，不自动整条pass。字段齐全仍需核对语义可比性和观察内容。

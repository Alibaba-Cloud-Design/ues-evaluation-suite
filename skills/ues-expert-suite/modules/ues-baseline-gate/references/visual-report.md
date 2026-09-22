# 基础体验与风险检查可视化

生成HTML时读取环境中ues-expert-suite的references/visual-report-system.md与dashboard-report.md并复用report-kit。若总入口不可用，生成清晰Markdown和结构化结果，不猜共享路径。

卡片主结果为findings_status（发现问题/已检查范围未发现问题/尚无可判定结果），副结果为verification_status。显示通过、缺陷、范围内未验证、范围外和不适用数量；完整21条可筛选。不能用fail条数作为分数，不能把未验证显示为失败。

BL-04内展开无障碍细项和证据，无独立专项卡或分数。问题旁放原图、红框开关、DOM/轨迹和验收。发布门禁只在有明确事前规则时独立展示。默认不显示全站不通过。

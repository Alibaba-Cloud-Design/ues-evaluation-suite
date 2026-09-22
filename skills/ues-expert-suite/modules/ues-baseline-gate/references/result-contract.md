# 基础体验与风险结果合同 0.3.0

顶层：schema_version="0.3.0"，product/version/assessed_at，scope=static|runtime_page|full_flow，criteria(完整21条)，issues，limitations。

每条保留 criterion_id=BL-01～BL-21、title、units、evidence_method、evidence、linked_issue_ids；新增 remaining_gaps 数组。verdict=pass|fail|not_verified|N/A。
- pass/fail：reason=null；有非空units、evidence_method和证据；fail至少绑定一个有效issue_id。
- not_verified：reason=evidence_unavailable|authorization_blocked|outside_declared_scope|not_tested。说明具体缺口；full_flow不得用outside_declared_scope。
- N/A：reason=condition_not_present，必须有确认业务条件不存在的依据。
- remaining_gaps：未检查的适用子要求；pass不允许存在缺口。fail可与未验证子要求共存。

summary：pass_count、fail_count、not_verified_count、n_a_count合计21；另有in_scope_unverified_count、outside_scope_count、verified_count、in_scope_count及coverage。verified_count=pass+fail；in_scope_count=21-N/A-范围外；coverage=verified_count/in_scope_count（分母0时null）。覆盖不是通过率，fail表示已发现违反而非全部子要求验证完毕；存在remaining_gaps时完整性仍为partial。

findings_status：fail_count>0为issues_found；否则pass_count>0为no_observed_issues；否则undetermined。
verification_status：当前范围无可判定条目且有缺口为not_started；当前范围存在not_verified或remaining_gaps为partial；其余为complete。空范围为not_started，不得宣称完整。

release_gate默认仅`{"status":"not_assessed","reason":"未要求发布门禁或未提供事前规则"}`。这是与日常检查分开的用途，不是附加评分。

确需发布门禁时：scope必须full_flow；release_gate含policy={id,version,owner,declared_before_assessment:true,scope,criterion_ids:[明确整体作为门禁的BL编号],rationale}。policy.scope必须等于本次scope；必须是事前授权的规则，不得只因“基线”名称自动开启。指定条目有fail为blocked；无fail但有not_verified/remaining_gaps为pending；其余为passed。N/A仅允许正面确认业务条件不存在。此粗粒度合同仅支持整条规则，若需按具体严重后果门禁，应另存业务规则评审，不在此工具硬推。禁止靠分数或未测状态批准发布。

问题字段至少 issue_id/title/impact/reproduction/evidence/fix_acceptance；严重度使用已有专项结果或带证据的业务影响解释，不自动给所有问题P1。原图证据本地路径相对结果文件。

0.1.0仅可作为历史产物。新校验器只接受0.3.0，避免旧二元结论悄悄混入当前报告。旧文件迁移时保留原文；新增reason替代n_a_reason，移除baseline_status与release_gate_claim；不改写事实。

## BL-04内嵌明细（可选）

BL-04可保存subchecks数组，id=BL-04.01～BL-04.12，含title/verdict/reason/evidence/evidence_refs/issue_ids/remaining_gaps。保存时完整列12组，未测保留not_verified。禁止score或scoring字段。细项不计入顶层summary。

内嵌细项有fail时父项必须fail；无fail但存在not_verified或remaining_gaps时父项不得pass；全部N/A才父项N/A，其余完整证据可pass。子项缺口必须在父项remaining_gaps列明，使验证完整性反映真实缺口。没有子表的历史记录仍可保留既有BL-04事实，不能自动宣称详细检查完成。

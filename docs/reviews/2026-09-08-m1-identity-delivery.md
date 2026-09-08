# M1 身份闭环本批交付记录 — 2026-09-08

范围为 M1.2–M1.4，推进 G1/G2；沿用 M1.1 已验证成果。当前工作树基于 `6797215`，尚未提交、合入、部署或实机验收。记录实际结果，不将本地回归等同产品指标达成。

## M1.2：原子确认并建档（本地定向验证通过）

新增 `202609080002_identity_profile_completion.sql`，复合 RPC 在一次事务内确认新猫、建档并关联报告。新猫提案仍保持 proposed_animal_id 为空；独立 completion 记录保存结果和稳定重试。旧 review 入口兼容原有仅确认语义；历史 confirmed 提案可在来源仍有效时补建档，不追加重复审核。

并发审核只生成一个档案；关联失败整笔回滚。隐藏或非普通风险来源生成隐藏档案。动物删除保留已删除 completion 标记，重试不能复活档案。锁后重读来源及媒体/任务证据，拒绝失效来源和关联替换。M1.4 已将当前来源资格统一用于按 ID、feed、本人公开引用及手工候选。

验证：本地应用迁移后，`supabase test db supabase/tests/011_identity_review_control_plane.sql supabase/tests/023_identity_profile_completion.sql` 通过 2 files / 103 assertions（旧契约 70、新切片 33）。覆盖实际双会话建档、重试冲突、回避、事务回滚、已删除结果不重建、已确认来源删除/证据失效。新增接口在旧数据库上先因缺少函数失败；测试数据的权限、枚举和并发 DDL 问题已纠正，未放宽应用授权。

一次独立 scoped review 发现并修复来源重验和删除后重建问题，后续仅复核这些修复。共享 helper 对已有猫的 creator 重读/可见性检查已在 M1.3 补齐；M1.2 公开入口只接受 new_animal。

迁移/SQL/deployment inventory 定向检查通过（pilot unit 18 files / 200 tests，输入契约 15 pass / 1 Windows symlink skip）。整批稳定后统一执行完整 SQL 与根 verify，不重复执行未改变的检查。

## M1.3：审核工作台与可恢复结果（本地已验证）

`/identity` 提供有区域/回避限制的分页队列、固定安全摘要及受保护来源照片；普通平台管理权限保持独立。媒体 GET 在下载前后重验授权和相同素材绑定，以 no-store 返回 JPEG，客户端无 Storage 路径或 service key。部署 Admin 时需单独提供服务端 `SUPABASE_SERVICE_ROLE_KEY`，配置说明见 README；本轮没有部署。

工作台确认在同一事务内锁定来源与材料并派发原审核/新猫建档，防止打开详情后素材失效仍确认。缺素材可拒绝或请求补证，不能确认；拒绝/补证无需新猫名称。稳定请求记录支持响应丢失重试；仅有旧 review 记录不能绕过工作台材料要求。明确使用既有独立审核及来源照片，不新增强制目标参考照片或第二层人工批准。

本人回执使用五字段 owner-only 结果，返回原提交 requestId；拒绝后仅清理同 owner/sighting/request 的持久化身份意图，保留媒体和新尝试。远端回执无本地草稿也可重提；重提之前再次读取当前决定，换账户或过期响应不能覆盖状态。内部 rationale 不公开给贡献者。

024：46 断言；Admin 全套 8 files / 56 tests 的定向验证，以及实际 Server Action、媒体 GET、分页页面；移动端 owner 结果、回执和原生 CAS 定向验证。一次合并独立评审及相关修复复核已关闭，未重复全项目审计。

## M1.4：按 ID 档案与新/旧猫旅程（本地已验证）

新增四字段 `get_public_cat_summary`，解除“最近 50 条 feed”限制。旧公开档案无可见活动时返回明确空活动。新建档案保留来源必需标记与 FK；在来源延迟未过、被隐藏/删除、目标隐藏/归档或双向屏蔽时不公开，来源删除后不会退化成可见旧空档案。feed、本人可打开的引用和手工候选共用资格规则。

回执的“打开猫档案”先重新查询公开资格并检查当前账户；目标撤回或账户变化不导航。CatRoute 直接查询摘要，失效/换账户丢弃旧结果；保留 owner-aware 新报告创建和身份意图。

025：34 断言。C02 经实际服务报告入口→本人新猫提案→有素材的独立工作台确认→延迟前不可见→符合策略后可发现；没有 seed 待验证目标猫。C01 对已有猫先拒绝并保持原报告未关联，再为同报告重提和独立确认，最终活动出现在档案。C04 用 51 条较新记录证明目标不在首屏仍可直接打开，并覆盖空活动、隐藏、归档、删除与屏蔽。移动端保留真实 CatRoute→草稿恢复→NewReport 提交断言；实际 CatRoute/回执及 adapter 定向 4 files / 38 tests 通过。一次 M1.4 scoped 独立评审无实质阻塞。

## 本批最终验证与边界

- `pnpm test:product-core`：mobile 16 files / 225 tests（14.512 秒），Admin 5 files / 17 tests（0.812 秒），通过。无新增重复 CI job。
- 本地 `supabase test db --local`：25 files / 1,319 assertions，通过；023 的双会话合成请求与审计记录显式清理，其他新增旅程事务回滚。
- 本地 `supabase db lint --local --level warning`：exit 0；输出仍有原 PostGIS 静态分析诊断、旧 AI 函数警告，以及 confirm_new_animal_identity 的未读取 review_row 警告。未把“exit 0”写成零警告。
- 根 `pnpm verify`：exit 0；lint/typecheck、所有工作区测试及 7 个构建任务通过，其中 mobile 74 suites / 901 tests，Admin 8 files / 56 tests。Python 使用本地 3.12 环境，未改变工作区使用缓存结果。构建有既存 pilot-gate-2b 无输出文件配置警告。迁移与测试精确清单已同步到 004 / 025。
- `git diff --check`：按 Windows CRLF 规则检查通过。

当前是工作树本地交付，未 commit/push/merge、未部署、未远端 CI 或实机/真实 Storage 验收。合成数据证明功能路径，不证明真实审核人员到位或处理能力。真实身份闭环完成率、审核时长、目标猫查找成功率仍未测；不把测试数量当产品效果。

M2 已具备本地开工依赖。下一批按 M2.1 已完成照护写入、M2.2 延迟历史、M2.3 本人更正/撤回连续执行，以 C05 更新 G3；不先建设推送、派单或额外审计平台。A0 的有界许可数据盘点仍待安排，不虚报 AI 效果。

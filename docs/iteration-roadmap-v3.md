# Iteration roadmap v3 — 2026-09-07

收口更新：2026-09-08。文件日期保留本轮评审开始日期；产品目标与回归实施状态以文内实际证据为准。

**目标：先交付“报告 → 人工确认猫身份 → 安全档案 → 完成照护 → 回访”的内部合成数据版本，同时验证 AI 是否值得接入。** 本路线替代 [v2](iteration-roadmap-v2.md) 的功能执行顺序；v2 的 R0/R1 发布技术约束仍可引用，不能把旧 R2a 第一优先与本文并行当成两套指令。

依据：[功能评审 F01–F10](reviews/2026-09-07-product-delivery-review.md)、[产品章程](product-charter.md)、[产品目标台账](product-goals.md)。M0 已落地；M1.1 已实现并完成本地核心回归，详见 [本次交付](reviews/2026-09-08-m1-1-delivery.md)。M1.2–M1.4 已完成本地身份闭环与定向回归；M2 已完成本地照护闭环；M3 已完成本地回访/发现；M4 已完成本地受理/处理/删除分层验证，实际外部联系条件仍待落实。A0 离线工具、M5 双平台脚本打包和 R0A 本地修复已交付；真实 AI 效果/A1、验签新产物及原生安装仍待输入。未提交、合入、部署或实机验收，见 [本批交付记录](reviews/2026-09-08-m3-m4-a0-m5-delivery.md)。

## 产品边界与交付节奏

产品重心是可信的社区猫连续记录，AI 为可选识别助手。近期内部版本先走人工选择/确认；这不是未经批准把正式 AI MVP 改成人工版试点。免费访问、独立身份审核、位置延迟/粗化、私有媒体、训练单独同意、可删除/更正等章程约束继续有效。

默认一个实现者，同一工作树最多一个写入者；读评审可独立进行。每个下述任务尽量形成 1–3 日内可演示或可执行的变更，完成一个再拉下一个；涉及迁移和原生能力时按实际反馈重估，不用拆成几十个签收步骤。外部等待不计工程日，等待时推进无依赖功能。发布支线只在明确需要安装/演示候选时插入。

| 里程碑 | 用户看得见的结果 | 单实现者粗估 | 依赖 / 目标 |
| --- | --- | --- | --- |
| M0 回归基础（本轮落地） | 开发者一个命令快速获得已有核心行为反馈 | 快捷组合现为 mobile 24 files + Admin 7 files；最新测量见回归手册 | G6；合入状态仍未完成 |
| M1 身份闭环 | 新/旧猫报告都能续办、独立确认后打开安全档案 | 6–10 日 | 现有 Report/SQL 基础、本地合成栈；G1/G2 |
| M2 照护账本 | 记录已完成照护，看历史和更正来源 | 3–5 日 | M1 档案/权限；G3 |
| M3 回访与账户 | 猫关注、可遍历发现、退出与账号隔离 | 4–6 日 | M1；照护更新视图依赖 M2；G2/G4 |
| M4 安全与权利入口 | 举报/屏蔽、更正请求、真实删除申请与结果 | 4–7 日 | M1/M3，既有 moderation/erasure；G5 |
| M5 可安装内部候选 | 在目标设备跑通 C01–C10 的适用场景 | 2–4 日集成 + R0B 根因修复/外部设备时间 | M1 可首次触发；最终候选汇总已完成切片；G6 |
| A0 AI 有界可行性 | 有许可数据的离线结果或明确的数据获取阻碍 | 2–3 日上限，不含获取数据等待 | 不等待 M2–M5；G7 |
| A1 AI 可选建议 | 上传后获得候选，人工选择/审核仍为权威 | A0 通过后按适配器细化，预估 5–8 日 | M1 + 有效数据/模型/媒体授权；G7 |

M1–M4 粗估合计 17–28 工程日，未计 AI、候选、外部等待；不是整项目完工承诺。第一交付里程碑是 M1，不是“所有页面完整”。A0 在 M1 的外部等待空档或 M1 后立即安排；单实现者不假装同时开发两条主线。已有历史整改继续记账，不能无限优先挤占功能。

## M1：让一份贡献真正成为猫档案

### M1.1 报告身份意图与续办（1–2 日，F01/F06）

**文件：**修改 `apps/mobile/app/report/new.tsx`、`app/cat/[id].tsx`、`src/report/report-draft.ts`、`src/report/report-submission.ts`、`src/report/MyReportsScreen.tsx`、`src/report/ReportReceipt.tsx`；新增 `apps/mobile/src/api/identity.ts`、`src/report/IdentityContinuation.tsx` 及对应测试。所有路径在 mobile 下；扩展草稿需同时覆盖其校验、旧版本读取和原生存储测试。

**接口决定：**新增草稿身份意图 `{ kind: 'existing'; animalId: string } | { kind: 'new' } | null`，随本人加密草稿持久化。它是待核对意图，不是已经关联的事实。既有 `submit_identity_proposal(p_sighting_id,p_proposed_animal_id,p_source,p_request_id)` 继续负责提交 proposal；source 仅用 manual_search/new_animal。保存稳定 requestId，恢复时重用；不能从路由参数直接写 sighting.animal_id。

- [x] C01 回归：猫详情传入合法 ID → 草稿恢复仍保留选择 → 文本只创建一次 → proposal 针对同一 sighting/animal；换账户、隐藏目标、非法 ID 不创建 proposal。
- [x] 文本提交和媒体处理保持现有恢复规则；身份提交失败时报告仍成功，回执显示“身份待续办”并可重试，不重复发报告或悄悄丢意图。skip 保留未关联报告，稍后可继续。
- [x] My Reports 行可打开本人回执；新增 owner-bound `get_my_sighting_summary(p_sighting_id)` 窄 RPC 与 parser，用现有 summary 字段加可续办状态，替换单条回执遍历最多 100 页的查询。本人之外/不存在返回同一不可用结果。
- [x] 独立选择页支持已有猫、新猫和暂不选择。已有猫来源仅为已打开档案的合法 ID，或复用 `listPublicSightings` 的延迟公开分页（每页 20、按 animalId 去重）；不新增全库检索或读 animals 表。无可见目标时可选新猫/暂不选；提交时服务端再次校验可见性。目的性说明不暗示 AI 已运行。成年确认不覆盖显式公共名称；去掉邮箱前缀默认值，错误使用固定中英文。
- [x] C01/C03 的 M1.1 范围通过本地自动化接线与 SQL 验证：报告→历史→回执→续办（未宣称实机演示或完整独立审核闭环）；此时可标“提案可提交”，不能标“猫档案已生成”。

### M1.2 新猫确认与建档原子化（1–3 日，F02）

**文件：**计划新增 `supabase/migrations/202609080002_identity_profile_completion.sql`、`supabase/tests/023_identity_profile_completion.sql`；开工时如编号已被占用，同次更新此映射及现有 SQL/deployment/remote inventory。参考最终 `202608310005_identity_assistance_erasure_locking.sql`，保留账户删除锁顺序与回避规则，不改历史迁移。

**接口决定：**新增 `confirm_new_animal_identity(p_proposal_id,p_primary_alias,p_rationale,p_request_id)` 复合 RPC，返回 `{ proposalId, status: 'confirmed', animalId }`。在同一事务中执行独立 review 和显式建档；已有 `review_identity_proposal` 的新猫“仅确认、不建档”语义继续兼容，客户端新建档动作统一走复合入口。把建档结果单独持久化为 resolved animal 引用并施加 proposal 唯一约束，不能把 new_animal 的 proposed_animal_id 改成非空破坏旧契约。

- [x] 先补 C02 红测：非预置新猫报告 → 新猫 proposal → 合资格独立 reviewer 确认 → 恰好一个 animal、一个有效关联、稳定重放结果。
- [x] RPC 复用最终 review 的受保护内部逻辑，在同一事务重验鉴权、回避、账户锁及完整证据有效性：媒体未删、upload finalized、job/media/selection/provenance 绑定及 new_animal 一致性均不得遗漏。不能以 UI 隐藏按钮替代服务端检查。别名 trim 后 1–80 字；记录确认来源。建档/关联任一步失败则整个复合动作回滚；并发 reviewer 不能创建重复档案。
- [x] 新猫默认 lifecycle unknown；公开可见性由受信策略根据来源风险/隐藏状态决定，不能因为“确认身份”就公开敏感报告或媒体。feed 保留自己的时间/风险/可见性检查。
- [x] 已经由旧入口 confirmed 的 new_animal 提案允许受信幂等补建档；重验权限、来源仍有效且未关联，不再追加第二个人工审批。拒绝已删除/失效来源；账户/猫删除后的结果引用遵循现有 erasure 语义。
- [x] 保留 `011_identity_review_control_plane.sql` 对旧接口的测试；新增复合接口、并发、回滚、回避和删除联动测试，不能只把“仍无档案”的旧期望改成绿色。

### M1.3 审核员能看到材料并给出结果（2–3 日，F03）

**文件：**新增 `apps/admin/src/lib/identity-api.ts`、`apps/admin/src/app/identity/page.tsx` 及 action/测试；新增 `supabase/migrations/202609080003_identity_review_workbench.sql`、`supabase/tests/024_identity_review_workbench.sql`，提供 reviewer queue/detail 窄 RPC 和私有媒体读取 handler；复用 `apps/admin/src/lib/supabase/server.ts`、既有角色/回避策略。写 Admin 代码前按其 AGENTS.md 阅读本地 Next 文档。

**接口决定：**队列仅返回授权 proposal 的 opaque ID、状态和必要摘要；详情通过 proposalId 校验审核者、区域、回避及材料有效性后读取。私有证据经受信 server handler 返回，禁止缓存到公共 CDN/日志，不把存储路径、service key 或永久 URL 放进客户端数据。工作台统一调用 decide_identity_review_workbench，在同一事务中重验材料并分派既有 review / M1.2 建档；重复请求使用同一 requestId。只请求补证或拒绝不要求填写新猫名称。

- [x] 本地用固定合成贡献者/独立 reviewer/stranger 角色验证提交、排队、查看、确认/拒绝；角色与素材可用性作为此任务输入，不依赖 AI worker。
- [x] 被回避、角色撤回、源媒体删除或证据不够时，服务端拒绝读取/决定或保持待处理。无照片报告仍可保存，不虚构有足够证据完成身份确认。
- [x] 贡献者回执能读到 tentative/confirmed/rejected 及可执行下一步；审核者内部理由须映射成可公开给本人的安全说明。
- [x] 特权材料读取/决定留业务审计日志；审核列表有分页、空态、失败重试。独立安全 diff 评审一次，后续只复核改动。

### M1.4 安全猫档案与完整链验收（1–2 日，F05）

**文件：**新增 `apps/mobile/src/api/cats.ts` 及测试；修改 `app/cat/[id].tsx`、回执及其路由，复用既有 `CatDetailScreen` 渲染明确空活动文案；新增 `202609080004_public_cat_summary.sql` 和 `supabase/tests/025_product_identity_journeys.sql`。

**接口决定：**`get_public_cat_summary(p_animal_id)` 按 ID 返回 alias、verification、延迟活动桶等最小字段或不可用；复用 feed 的安全资格，不受最新 50 条窗口限制。无近期可公开活动时返回可公开档案的空活动状态；如果档案自身不满足公开资格则不可用。不为了长期可访问而保留隐藏/删除内容或精确时间。

- [x] C02 本地真实 SQL 链：只 seed 账户/角色/合成素材，不 seed 待验证猫档案；经过用户路径生成新猫，在未过延迟/敏感时不可见，符合策略后可发现。
- [x] C01 已有猫链：提案确认前 sighting 不关联，确认后出现在对应猫的安全摘要；拒绝时不得关联。
- [x] C04：超过 50 条的可见猫仍可按 ID 打开；hidden/deleted/stranger 和无活动状态各有明确结果。
- [x] 至少一条移动端真实路由接线测试加一条本地 RPC/DB 旅程，不以只 mock 导航参数代替后续提交断言。

**M1 完成定义：**在合成数据环境演示新猫、已有猫、拒绝/恢复三条路线，产出可访问的猫档案和可追踪结果；必需 CI 通过后才记已合入。未实机/hosted 的边界单独记录，M2 不为它们停工。

## M2：最小照护账本（3–5 日，F04）

**文件：**新增 `apps/mobile/src/api/care.ts`、`src/care/CareEntry.tsx`、`src/care/CareTimeline.tsx` 及测试；CatDetailScreen 接入口；新增 care 命令/投影迁移及 `supabase/tests/026_care_journey.sql`。沿用 care_events，通过 `202609080005_completed_care.sql` 提供安全入口。已完成本地 C05，详见 [M2 交付](reviews/2026-09-08-m2-care-delivery.md)。

**接口决定：**`record_completed_care(p_animal_id,p_activity,p_completed_at,p_public_cell_id,p_request_id)` 支持现有 feed/water/cleanup/observe/companionship，返回稳定 careEventId；首版不允许自由文本公开。用户手动选粗略区域，服务端校验 H3-9/支持范围；不能把历史目击位置推定为本次照护位置。新增 care 可见时间/更正关系字段以实施延迟与有效事实投影，风险隐藏按受信策略处理。`list_public_care_history(p_animal_id,p_cursor,p_limit)` 返回完成类型、粗略时间桶和 provenance，不返回照护者私人身份、精确时间/坐标。

- [x] 首先写 C05 红测：本人已完成照护只记一次 → 另一查看者读到延迟摘要；无权限/未来异常时间/隐藏猫不能写或泄露。
- [x] 页面明确“已完成”，不是预约或救援请求；急需帮助不自动变成任务已派单。照护历史缺失表示“暂无记录”，不能推导“无人照护”。
- [x] 提供本人撤回/更正入口，追加更正关系并在投影排除失效事实，不静默覆盖已发布来源。修改涉及角色/删除联动时覆盖相应 SQL 测试。
- [x] 验收一位贡献者记录、一位查看者读到、错误记录更正后三步；不接推送、复杂派单和兽医建议。

### M2 的开工条件与连续执行切片

M1 提供稳定动物 ID、安全按 ID 档案、本人报告与独立审核能力；本地 SQL 已验证，可开始 M2。M2 不等待远端/实机发布证据，也不以暂无真实 AI 数据阻塞。当前分支尚未合入，下一轮沿用该工作树，或在集成时包含 M1 依赖；不得从缺少这些迁移的旧基线直接实现。

| 顺序 | 本次交付结果 | 具体实施与必要回归 | 转入下一步条件 |
| --- | --- | --- | --- |
| M2.1 已完成照护写入 | 从猫档案记录一次 feed/water/cleanup/observe/companionship，失败可用同一 requestId 重试 | 先写 026 的真实命令红测；新增窄 RPC、care.ts、CareEntry 与路由；成年人、目标资格、手选支持范围的 H3-9、完成时间和固定枚举在服务端校验；重复/冲突/换账户各覆盖一次 | 本人写入成功、同 ID 不重复、无权/隐藏目标无副作用；无需先写公开自由文本、预约或派单 |
| M2.2 延迟照护历史 | 第二位查看者在策略允许后读到完成类型、粗略时间和来源状态；空态不暗示无人照护 | 实现窄分页投影和 CareTimeline，沿用 M1 的公开猫资格；026 覆盖延迟前后、双向屏蔽、隐藏/删除、分页；实际页面读取接线测试 | C05 前两步通过；页面区分正在加载、无记录、失败重试 |
| M2.3 本人更正/撤回 | 写错可修正，第二人不再把失效事实当有效记录 | 追加更正关系和幂等命令、本人入口、投影排除失效事实；补充 026 的 owner/重试/更正后读取链；敏感 diff 合并评审一次 | C05 三步闭环、本次受影响测试通过；批末跑根 verify 与完整 SQL，再更新 G3 |

每个切片完成后直接进入下一片，遇到明确阻碍只修受影响行为。单片不重复全仓审计、hosted 整套检查或构建候选。A0 仍须在下一批安排有界数据盘点；无许可数据记缺口，先推进 M2，不宣称 AI 效果。

## M3：回访、发现与账户（4–6 日，F05/F07）

**文件：**沿用 v2 R2a 的 follows adapter/屏幕入口，修改 Nearby、Map、Profile；新增 follows 迁移和 `supabase/tests/027_following_journey.sql`，编号有冲突时在开工记录统一调整。

- [x] 先实现猫关注/取消/分页列表：auth.uid owner、目标资格、直接写绕过、重试幂等、隐藏/删除目标安全失效。C06 走猫详情→关注→重开→读照护→取消；不先做未读或通知队列。
- [x] Nearby 展示多猫并连接 cursor，支持加载更多、去重、刷新/重试；区域和身份筛选由窄服务端参数完成，不能只筛当前页冒充全量。
- [x] Profile 显示匿名/登录/成年状态，退出、My Reports/草稿入口可用；C07 验证换账户立即清私有视图、旧异步响应不能回写。退出失败有真实状态，待删除媒体引用不丢失。
- [x] 复用现有 theme、图标、布局；中英、44pt/48dp 触控、读屏/大字、减弱动态/透明和地图 fallback 随改动交付。
- [ ] 区域关注是扩展项 R2b，只有猫回访价值验证后再做，另估 2–3 日；不影响 M3 猫回访完成。

### M3 连续执行顺序

M1 档案与 M2 照护已在本地交付，M3 可沿当前工作树开始，不等待 hosted/设备或 AI 数据。尚未合入时必须包含此前迁移，不能从旧基线遗漏依赖。

1. **M3.1 猫关注闭环：**从 CatDetail 关注/取消，独立 Following 分页列表可重开猫档案并读 M2 历史。新增窄 follows 命令/owner 投影、`027_following_journey.sql`；覆盖幂等、陌生 owner、隐藏/删除、刷新和账户变化，先完成 C06。
2. **M3.2 发现可遍历：**Nearby 多猫列表接 cursor、去重、加载更多与失败重试；区域/身份筛选服务端执行并重置游标，不能仅过滤已加载页面。复用 M1 的公开资格，C04 验证首屏之外可发现和打开。
3. **M3.3 账户会话闭环：**Profile 展示真实登录/成年状态并提供退出；C07 覆盖失效 token、退出失败、换账户立即清私有视图及迟到请求，保留本人待确认照护/媒体恢复。更新 G2/G4；批末统一必要回归和一次适用 diff 评审。

区域关注、推送与未读计数继续后置。下一批不重复 A0 盘点；只有收到可评测数据才进入真实效果试验。

## M4：安全、纠错和删除入口（4–7 日，F08/G5）

**文件：**接通 `apps/mobile/src/api/safety.ts`，新增内容安全/隐私页面和账户请求 adapter；扩展 server handler/SQL、复用 moderation action、erasure hooks/outbox；新增 `supabase/tests/028_user_rights_journey.sql`。

- [x] C08：用户从 sighting 发起内容举报，已有 moderation queue 真实收到并处理，本人看到固定结果。公共投影不提供任意作者 UUID；需要屏蔽作者时新增 owner-bound `block_sighting_author(p_sighting_id,p_request_id)`，服务端验证内容资格再按既有屏蔽语义执行，返回固定成功结果而非作者身份。
- [x] 更正身份/重复猫先复用 proposal/人工审核反馈；M1 的创建和 M2 的照护更正不能冒充完整合并/申诉系统。争议/申诉先有真实受理与状态，自动化规则按案例扩展。
- [x] C09：owner-bound `request_account_erasure(p_request_id)` 持久化幂等接收 → 受信服务执行 Auth 删除 → erasure/outbox 收敛。显示接收、处理中和待重试；清理未完成不显示全量完成。
- [ ] 状态读取限本人；Auth 失效后不继续用旧 token 查询，保留无私密字段的本地回执及实际受理联系渠道。不新开匿名请求详情 oracle，不把 service key 交给 mobile。
- [ ] 访问/更正/撤回先落实真实受理联系渠道，训练默认关闭；不存在的流程不伪装成功按钮。M4 的 hosted 双用户、撤权与清理证据留待候选复用。

本地实现与分层回归已覆盖前三项，详见 [M3/M4/A0/M5 本批证据](reviews/2026-09-08-m3-m4-a0-m5-delivery.md)。C09 的 Auth HTTP 调用由实际 Admin processor/action 单测覆盖，数据库测试删除真实合成 Auth 行并推进既有两类清理 RPC；尚未取得 hosted Auth/Storage HTTP 与设备端到端证据。管理员需实际点击处理/重试；没有宣称后台自动处理或所有请求都已完成。

最后两项保持未勾选：用户内置受理与本人状态已可用，旧 Auth 会话被拒绝并清理本地登录；但实际外部联系地址及负责人/SLA 未提供。`EXPO_PUBLIC_RIGHTS_CONTACT_URL` 留空时页面明确显示渠道未配置、删除后本地回执不证明清理完成。提供真实 HTTPS/mailto 受理地址后配置并验证，不能用占位地址签收。

## A0 / A1：让 AI 卖点尽早可证伪

A0 在第一轮安排，不能无限后置，也不阻塞人工闭环。输入是许可/同意范围明确、可撤回、有猫身份标注且与 holdout 分离的素材；只有合成图片时仅验证接口，明确模型效果未测。

- [x] 第 1 日仓库盘点完成：[现有输入、缺口与取数计划](reviews/2026-09-08-a0-data-readiness.md)。未提供适用真实猫多图/标签/用途清单；具体经办人尚未落实。已确定划分和简单 baseline 方案，不继续写 broker/ANN；真实评测仍未完成。
- [x] A0 工具切片：本地 RGB 颜色/布局基线、许可 manifest 校验、防划分泄漏、候选/unknown/指标报告 CLI 已交付；空输入正确返回 incomplete/null，未启用 AI。
- [ ] 第 2–3 日真实效果试验：输入许可图片与独立标注，报告 Recall@3、unknown rejection、unknown false match、样本数和划分；比较人工查找耗时。真实样本和人工基线仍未提供，不宣称效果或上线资格。
- [ ] A1 仅在数据与实用性证据支持时接已有 owner request/status/cancel/select、lease-bound broker/worker 和严格 callback；保持 submit 不等待 AI、选择只是 tentative、独立 reviewer 决定事实。复用 M1 UI/事务，不另建身份确认系统。
- [ ] 正式模型门槛仍为 Recall@3 ≥85%、unknown rejection ≥80%、unknown false match ≤5%；许可、撤回、评测与人工审核能力都满足后才能开放相应 AI 功能。

## M5 与真实用户准入：只在对应边界验一次

M1 后如需设备演示即可触发内部候选，不等待全部产品扩展。沿用 v2 R0/R1 的签名、来源、hash、readiness 时效、受控构建和清理要求。旧 readiness 到期点是 2026-09-06T17:27:06.285Z；本次不把它当成 9 月 7 日仍有效的准入证据，消费时仍由 validator 读实际时钟。

R0A issuer/source-inventory 已做本地修复与负向验证，真实消费 smoke 因最新产物过保留期仍待补；R0B iOS 工具链、R0C 适用清理风险按需要处理；性能报告真实性不再成为所有 UI 前置。真 token 到期、实机照片处理/后台恢复、hosted 两会话只在媒体/权限/候选适用边界验证；文档或无关页面不自动刷新远端。

真实用户仍使用 [launch checklist](singapore-launch-checklist.md)，包括运营责任、设备、隐私权利、事故/审核 SLA、公开媒体 residual validation 和既有模型门槛；人工内部增量不能自动获得试点资格。独立安全 review、特权业务审计和真实发布授权各有作用，不能相互替代，也不在每个小任务再复制一套。

## 回归、目标追踪与范围控制

- 采用 [回归手册](regression-playbook.md)：开发跑受影响行为，合入跑既有必需 CI；候选复用适用证据。不增加全局审计门，也不先建设自动化选择平台。
- 每个里程碑只维护 [目标台账](product-goals.md) 的对应行，记录演示结果、失败场景、证据和下一步。未测指标不填 0，不用测试总数当作产品达成率。
- 暂缓：推送/未读、聊天、募款/商业化、精确导航、整体视觉改版、复杂任务调度、自动身份确认、无数据的 ANN/训练平台。
- 新任务进入队列必须说明它解除哪个 F 缺口、推进哪个 G 目标；不能对应者放后续列表，不打断当前实现。
- 下一动作按实际输入推进：M4 配置真实受理渠道并验删除后联系路径；M5 将已验证增量纳入实际候选源码，获得新 correctness 产物后运行 consumer smoke，随后在目标工具链编译/安装并跑适用 C01–C10；A0 收到许可数据后运行现有离线工具和人工对照。A1 仅在效果支持时开始，不做占位 AI 功能。
- M5 当前本地可行结果：Android/iOS Hermes bundle export 成功，固定 EAS 22.6.0 能识别配置项目；没有 Java/adb/Android SDK/xcodebuild，未提交云构建，未获得 APK/IPA 或真机结果。来源、readiness、工具链问题各只阻塞对应候选，不回头阻塞已通过的 M3/M4 本地功能。

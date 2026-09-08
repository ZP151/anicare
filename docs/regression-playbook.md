# 快速回归与交付手册 — 2026-09-07

目标是尽早发现破坏用户旅程的变化，避免同一结果重复证明。根快捷入口已落地；跨层身份及完成照护回归已纳入，不为不存在的功能写“通过”占位测试。

## 现在可执行

在当前工作树根目录执行：

```powershell
pnpm test:product-core
```

这是 mobile 24 个 Jest 文件与 Admin 7 个 Vitest 文件的固定组合，无网络、外部数据库或设备依赖；原生存储语句在 Node 24 内置内存 SQLite 中执行，不用 `--passWithNoTests`。2026-09-08 本批首次运行 mobile 252 项通过（17.898 秒）、Admin 24 项通过（0.975 秒）；这是一次本地测量，不是长期性能承诺。随后新增跨页面 pending CAS 回归定向通过，当前组合 mobile 共 253 项；不将旧耗时冒充新增用例后的测量。已有依赖环境下可直接运行，干净环境先按仓库要求安装 frozen 依赖。

| 文件（均在 apps/mobile/src 下） | 保护的行为 | 证明不到的边界 |
| --- | --- | --- |
| report/report-submission.test.ts | 文本提交幂等、owner、媒体失败恢复 | 不验证从猫路由传入身份或真实 SQL |
| report/ReportWizard.test.tsx | 五步表单、权限拒绝/手工区域、单次提交、背景失效 | 原生 OS 权限和照片处理仍需设备 |
| report/ReportReceipt.test.tsx | 本人回执、远端/本地恢复、换账户不泄露 | SQL / Storage 与设备的真实交互另验 |
| report/MyReportsScreen.test.tsx | 分页/刷新、离线、换账户迟到响应 | 不代替真实设备/远端身份流程 |
| api/feed-screens.test.tsx | 已有发现/地图状态和导航 | mock feed 不证明真实冷启动可发现 |
| auth/profile-report-return.test.ts | 登录返回草稿与 owner 隔离 | 不执行 Apple/Google 真实回跳 |
| media/media-upload-runtime.test.ts | 私有媒体 CAS/恢复调度与账户边界 | 不验证相机像素、Storage 真到期 |
| api/safety.test.ts | 举报/屏蔽 adapter 校验 | 不证明页面入口已经接入 |

本批另纳入 identity-route-journey、IdentityContinuation、profile-contribution、draft-store.native、identity / identity-result / cats adapter 和 cat-route；Admin 组合执行 identity-api、identity-media、实际媒体 GET、Server Action 及工作台页面测试。测试保留真实路由→草稿→提交接线，不只断言导航参数。文件清单以根 `package.json` 为准。

SQL 使用本地已运行的 Supabase：`supabase migration up --local` 后执行 `supabase test db --local`；M4 后为 28 文件 / 1,451 断言通过。开发中可只跑受影响的 023–028 或受影响旧契约，不为重新验收重置数据库。025 用真实服务报告入口、本人 proposal、独立 workbench 完成 C01/C02，使用合成媒体元数据并回滚测试数据；不等价于 Storage 像素或实机测试。

快捷组合不是另一道 CI 门。根 `pnpm verify` 已运行 mobile 全套，CI 不再额外跑一遍 product-core。新增业务成熟后把其关键行为文件加入此命令，删除被新实现替代的旧测试须说明替代证据；不以用例数维持门槛。

## 三层执行，只有实际依赖才升级

| 层级 | 何时跑 | 命令 / 验收 | 失败处理 |
| --- | --- | --- | --- |
| L0 开发反馈 | 每个有意义功能变更；不必每次敲字 | 受影响 Jest/Vitest 文件；完成一段旅程跑 product-core；类型变化跑对应 workspace typecheck | 修复当前回归，只重跑受影响测试；不自动刷新 hosted |
| L1 合入 | 每个拟合入代码变更 | 既有 `pnpm verify`、CI 的 Python/peers 检查、独立 database-contracts、diff 检查 | 失败阻塞合入；本地一次通过直接引用，不为文档验收重跑 |
| L2 候选/发布 | 首次候选或相关行为/环境/时效变化 | hosted 真实正确性、适用双会话、媒体到期/清理、构建/实机及运营检查 | 只阻塞受影响候选/功能准入；其他本地切片可继续 |

L0 快捷组合目标在依赖就绪时 ≤60 秒；L1 时长先记录真实运行再定优化目标。不能把本次 20 秒外推为所有 CI 或设备耗时，也不为达时间目标跳过失败。

新增身份路由、续办交互、身份 API、公共名称及原生 SQL 行为文件随 M1.1 加入同一快捷入口，详见 [交付记录](reviews/2026-09-08-m1-1-delivery.md)。`node:sqlite` 验证 SQL 语义，不替代实机 SQLCipher 加密验证。

本轮只移除了 verify job 的 policy/root/hosted-workflow 三条重复前置；根命令仍包含它们。database-contracts 是独立执行环境，保留其前置、SQL 精确清单、pgTAP 和 lint，不当成重复删掉。根契约从“必须重复预跑”改为“完整覆盖一次、不可有条件跳过、不可忽略失败”；job 和 step 两层均检查。

## 按改动选回归，不建立新调度平台

以下命令均使用既有脚本/测试。选择后不要再无变化地执行每一行；未知影响先扩大到相应 workspace。

| 变更范围 | L0 入口 | 必须补的行为 |
| --- | --- | --- |
| Report/回执/草稿/账户 | `pnpm test:product-core`；`pnpm --filter @animalhelper/mobile typecheck` | 稳定 ID、重试、换账户、异步迟到、导航恢复 |
| 照片遮挡/原生存储/transport | `pnpm --filter @animalhelper/mobile exec jest --runInBand --runTestsByPath src/media/redaction-review.test.tsx src/offline/draft-store.native.test.ts src/media/reviewed-draft.test.ts src/api/media-transport.test.ts` | canonical JPEG、元数据去除、journal/删除恢复；候选补真机 |
| 公开投影/地图/详情 | `pnpm --filter @animalhelper/mobile exec jest --runInBand --runTestsByPath src/api/feed.test.ts src/api/feed-screens.test.tsx src/components/CatDetailScreen.test.tsx src/maps/public-map-policy.test.ts` | 隐藏/删除、非首 50 条、无 key/无权限；SQL 变更加 DB |
| SQL/RPC/RLS/Edge | `node --test scripts/pilot-gate-inputs.test.mjs`；`supabase test db supabase/tests/<受影响文件>.sql` | 本地增量迁移、pgTAP、原子/回避/删除/多用户；完整 SQL 在批末跑一次，hosted 仅相关 L2 边界触发 |
| Admin 行为/授权 | `pnpm --filter @animalhelper/admin test`；`pnpm --filter @animalhelper/admin typecheck` | session/角色/回避、材料撤权、固定错误，不只断言源码含函数名 |
| AI 离线契约 | `pnpm --filter @animalhelper/ai test` | request/callback/unknown 契约；效果评估另用许可 holdout，不冒充单测 |
| CI/证据脚本 | `node --test scripts/root-verify-contract.test.mjs scripts/ios-device-lab-workflow-contract.test.mjs scripts/hosted-gate-2b-workflow-contract.test.mjs`；改 consumer 时跑 `pnpm test:pilot-gate-2b-promotion` | 来源、摘要、fail-closed、负向场景；真实验签只在该消费能力改变时验证 |
| 仅文档 | 相对链接/路径、状态事实、`git diff --check` | 依赖和状态不矛盾；不启动 Docker/远端样本 |

## C01–C10 核心旅程索引

每项独立可复现，只有一份主场景说明；本地、hosted、native 的结果挂在同一编号下。已有 isolated coverage 与完整端到端结果明确分列。

| ID | 用户旅程与失败断言 | 当前覆盖 | 补齐任务 |
| --- | --- | --- | --- |
| C01 | 已有猫→报告→tentative→独立确认→同猫档案；拒绝不关联、重试不重复 | 本地路由/提交接线与 025 真实 SQL 独立审核→同猫档案通过 | M5 的 hosted/设备交互 |
| C02 | 新猫报告→审核→显式建档→安全发现；并发一次、失败全回滚、延迟前不可见 | 023/025 真实新猫报告→独立复合建档→公开档案；原子/并发/回滚通过 | M5 的真实素材与设备 |
| C03 | 文本成功/媒体失败→历史→回执→恢复；旧账户不可读 | 快捷入口已覆盖回执续办、远端历史首次选择、丢失响应同请求重试、账户中断和真实本地 SQL 清理 | 本地 M1.1 已覆盖；设备在 M5 |
| C04 | 打开旧猫→无近期活动/分页/筛选；隐藏删除不可见 | 025 旧猫按 ID 可达，027 发现去重/分页/筛选；实际页面接线通过 | M5 的设备展示 |
| C05 | 完成照护→另一人读历史→更正；不能把请求当完成 | 026 完成→第二人延迟读取→更正/撤回通过；实际照护路由/恢复通过 | M5 的设备存储 |
| C06 | 猫关注→重开→读记录→取消；越权写/失效目标 | 027 关注→重开→M2 历史→取消；页面/API 与越权/失效目标通过 | M5 的设备回访 |
| C07 | 登录/成年/退出/换账户/返回草稿；迟到响应不回写 | Profile 登录/成年/退出与迟到响应通过；M4 旧会话错误不能退出新会话 | M5 的真实 OAuth 回跳 |
| C08 | 内容举报/屏蔽→审核→用户结果；权限撤回 | 028 真实举报→独立 Admin 处理→本人结果；Sighting 屏蔽与页面调用通过 | M5 的 hosted 双会话/撤权 |
| C09 | 删除申请→Auth/DB/Storage 清理→真实完成；失败可重试 | 实际页面→请求、Admin action→Auth API 调用单测；028 Auth 行删除→两类清理账本→完成通过 | 实际联系渠道及 L2 Auth/Storage HTTP/设备；本地分层验证不冒充实网端到端 |
| C10 | 相机/位置拒绝、手工区域、遮挡上传、杀进程/重开、地图降级 | mock/原生组件局部覆盖，实机未验 | M5/L2 |

M1 首批新增本地 SQL 旅程文件在路线中给定。账户/角色/合成素材可 seed；C02 不得先 seed 猫再宣称验证“新猫建档”。真实客户端旅程必须消费业务 API，不能只断言 router.push 参数；单测可以 mock 外部 IO，但不能把正要验证的接线层整个 mock 掉。

## 测试维护与证据复用

1. 每个用户可见 bug 先补最小失败行为，再修复。SQL 最终状态、屏幕操作结果、请求次数/稳定 ID 都应有具体断言；不为每次文案或可逆布局修改新增测试。
2. 配置/schema 合约在确实保护发布身份或权限时保留。源码字符串断言不能代替业务旅程；旧占位页退出主流程后，测试随其替代物一起更新，不能把“仍是空壳”当产品验收。
3. CI 的跨 push/PR、workspace lint/typecheck 或 compileall 重复可能仍存在。先测耗时再收敛，保持必需 check 名称和覆盖；本轮不修改分支保护、不添加复杂 path selector。
4. 证据记录最少为 scenario、源码 SHA/工作树 diff 范围、环境、命令/结果、时间与未验证边界。仅行为/环境受影响、测试失败、部署 hash/来源或 validator 时效要求才重验相应部分。
5. flaky 先分类基础设施与业务失败，有原因才定点重试一次；不能循环到绿或修改预期掩盖失败。持续失败回到当前切片，不另开无边界审计。
6. 安全敏感 diff 一次独立审查，后续修复只复核相关变化；跨切片的用户场景验收复用记录，不再重复进行全项目评审。

M2 组合增加 care adapter、CareEntry、真实 Cat→care 路由及 pending 存储测试。026 执行本人写入→第二人延迟读取→更正/撤回，并含一次双会话同请求回归。真实设备 SecureStore、前后台与断网行为仍在对应候选验收；不因普通页面改动重复跑设备或完整 hosted 门禁。

M3/M4 已加入 follows、following-journey、rights-journey、rights 会话保护与 Admin erasure/action 回归。027 保护回访/发现，028 保护受理/删除与清理收敛；006 的精确触发器清单同步新增两个 M4 回执关联触发器，原删除行为断言保留。空 AI manifest 仅验证“不足数据不产出效果指标”，真实效果另验。

# 项目验收与路线评审 — 2026-09-05

## 范围与结论

基线：`codex/hosted-gate-2b`，`6797215dadd02f51ed0d94befb7185dd5989b742`。评审为源代码、契约、真实 GitHub 结果与证据消费者的审计；不是视觉审计、渗透测试、原生实机验收或全项目逐行审计。主工作区的未提交地图配置不属于本次基线。

**结论：Hosted 正确性与清理子项通过；可靠性整改有条件验收；证据交付、分支集成和试点发布暂不通过。** 一次绿色执行不代表所有后续执行必然成功。

**2026-09-05 路线复验修订：**撤销“全部 P1/P2 关闭后才继续产品迭代”的统一前置。下述缺陷发现及历史证据保留；P1-01 阻塞规范证据消费，P1-02 阻塞 iOS 编译/安装，清理风险阻塞相应环境使用/readiness 声明，性能报告偏差阻塞相应性能结论。Following/账户等本地合成数据功能按 [修订路线](../iteration-roadmap-v2.md) 推进，合入仍需适用测试与必需 CI；此调整不是发布放行。本轮仅核对本地源码/计划/CI 并修改文档，未重跑下述远端和实机证据。

## 可复核证据

| 项目 | 结果 | 证据与边界 |
| --- | --- | --- |
| Hosted 正确性、清理、证据生成、签发 | 通过 | [33784288981](https://github.com/ZP151/anicare/actions/runs/33784288981)，与基线 SHA 相同；清理标记 `hosted_cleanup_passed` |
| Push / PR CI | 通过 | [33784288793](https://github.com/ZP151/anicare/actions/runs/33784288793)、[33784293333](https://github.com/ZP151/anicare/actions/runs/33784293333)，verify 与 database-contracts 成功 |
| 性能样本 | 有限通过 | [33782507119](https://github.com/ZP151/anicare/actions/runs/33782507119)，较早 SHA `0ab41ce`，20/20 成功，P50 2792 ms、P95 3220 ms、max 3424 ms；1×1 合成 JPEG 场景，不是实际照片负载、最终 SHA 持续 SLO 或低于 1% 错误率证明 |
| 本次重跑单元/契约 | 通过 | 主审：Gate 2B 18 文件 / 200 测试；另一次 targeted 清单/promotion/workflow 共 11 测试。独立评审：Gate 2B CI 36 通过 / 1 skip，workflow 2/2；这些运行有重叠，不相加。mock 不证明真实签发体系兼容性 |
| 本轮之前的完整本地验证 | 历史通过 | `pnpm verify`、pgTAP 21 文件 / 1192 测试，来自前轮执行记录；本轮没有重启 Docker 重跑它们 |
| 证据消费 | 阻塞 | 实际 `acquireVerifiedPilotGate2BArtifact` 下载成功，真实 `gh attestation verify` 失败，见 P1-01 |
| iOS PR 编译 | 阻塞 | [33784293368](https://github.com/ZP151/anicare/actions/runs/33784293368)，pod install 的 pathname null-byte 异常；device_candidate / lock_bootstrap 均 skipped |
| 合并、证据入库、真机 | 未完成 | PR #5 仍 Draft，base 为 `codex/ios-device-lab`；PR #4 仍 Draft，base 为 main；规范 readiness JSON 不在 Git 中 |

实际证据（诊断验签成功后读取）创建于 `2026-09-03T17:27:06.285Z`，到期于 `2026-09-06T17:27:06.285Z`，即新加坡时间 **2026-09-07 01:27:06.285**。本次读取时有效；以后执行必须再次检查时钟，不能根据本文认定有效。签名的历史有效性和 readiness 的 72 小时业务有效期是不同判断。

## 发现与处置

### P1-01：签发成功，但实际消费者拒绝签发体系

位置：`scripts/promote-pilot-gate-2b-evidence.mjs:95`；测试对应 `scripts/promote-pilot-gate-2b-evidence.test.mjs:127`。

公开仓库 `ZP151/anicare` 的真实证明使用 Sigstore public good instance，而消费者固定附带 `--no-public-good`。实际错误是 `detected public good instance but requested verification without public good instance`。这是既有消费者缺陷，不是本次超时整改引入，但会阻断整改产物被 Device Lab 使用。

只读 A/B 诊断：通过已存在的 `processAdapter` 注入，仅去掉这个参数；保持 repo、signer-workflow、signer-digest、source-digest、source-ref、predicate-type、deny-self-hosted-runners 全部不变。相同产物验签成功。没有修改源码、提升证据或绕过签名验证；临时下载目录由消费者清理。

修复方向：移除不适用于该仓库的 issuer 排除选项，保留全部身份/摘要/来源检查；增加真实消费 smoke 验收和失败不落盘测试。参见 [GitHub CLI 官方参数定义](https://cli.github.com/manual/gh_attestation_verify)：该选项明确排除 Sigstore public good 签名。

### P1-02：iOS 编译未通过，且工具链检查未证明 pod 使用同一 Ruby

位置：`.github/workflows/ios-device-lab.yml:116` 与 `apps/mobile/scripts/build-unsigned-ios.sh:264`。

workflow 检查 Ruby 3.3.12，但 CocoaPods 失败报告实际显示 Ruby **3.4.10**，调用栈位于 Homebrew `gems/3.4.0`。这证明版本一致性存在缺口；**不能据此断言它就是 null-byte 的根因，也不能把异常直接归咎于上游 CocoaPods**。

下一步记录 Ruby/pod 可执行路径、pod 解释器、Gem 环境，在同一受控 Ruby 下固定依赖后执行 frozen Pod 安装与完整 compile probe。只有可重复诊断支持时才改依赖/路径；禁止通过吞异常或删 lock 验收。

### P2-01：性能报告把配置区域写成了实测区域

位置：`tests/pilot-gate-2b/src/characterize-hosted.ts:156`。`edgeRegion` 和 `projectRegion` 都是常量，不能证明请求实际运行区域。报告必须区分配置目标与可信观测；无法验证时写 unknown，不得宣称 region confirmed。20 个成功样本及耗时统计本身仍可作为该次客户端观测结果。

### P2-02：性能准备阶段失败分类会失真

位置：`tests/pilot-gate-2b/src/characterize-hosted.ts:121`；`tests/pilot-gate-2a/src/actors.ts:264`。reserve 的 catch 一律加 `transport_error`，PUT 也把 timeout 化为 network_error；计数包含 reserve/upload/finalize，但 latency 只测 finalize。后续应使用固定阶段与错误枚举，明确分母；成功样本分位数不等于全请求分位数。保留失败计数，不循环直到得到好看的结果。

### P2-03：本地 verify 不涵盖全部 CI 前置清单

位置：`package.json` 的 verify 与 `.github/workflows/ci.yml:59`。上轮本地全绿但 CI 因 SQL 数量 20→21 失败，是命令集合覆盖缺口；修正数量后并未消除机制问题。将轻量 source inventory 合约纳入本地根验证，数据库集成仍由独立 Gate 2A 承担。

### 项目状态与路线偏差

- Following 仍是单一空态，见 `apps/mobile/app/(tabs)/following.tsx`；不是已完成的关注产品。现有 follows 表/RLS 不等于完整目标可见性、列表投影、账户切换与离线契约。
- Profile 已有登录和成年确认，但缺少完整账户退出/删除/隐私中心。`profile.tsx` 用邮箱前缀生成 `public_name`，应在账户切片改为显式输入或不含邮箱的默认名称，并验证重复确认不会覆盖用户选择；公开暴露范围仍需专项核验。
- Nearby 已有 `list_public_sighting_feed` 真实 RPC 接入，不能再笼统描述“所有 UI 都只是静态”。存在 RPC 接入也不代表 hosted 产品旅程已经验收。
- Admin 已有服务端 session/角色检查、审核队列和 decision action；`docs/architecture.md` 的“static console only”过时。受审媒体读取与完整运营闭环仍未完成。
- AI 为关闭的模型无关契约与数据库基础；旧 service proposal bridge 已永久禁用，worker 不能直接写成身份事实。产品章程的 AI 差异化目标未改变，实施顺序应后移到真实数据/人工审核基础成熟之后。

### 独立评审补充与主审裁定

独立高风险评审覆盖 `1b310b4`→`6797215`，确认祖先关系，未发现本次 diff 新增的明确越权；认可 restricted preflight、SHA/JPEG/atomic finalize、signal 传播和 workflow 分阶段设计。另重跑 Gate 2B CI：36 通过、1 个 Windows symlink 跳过。

- **P2-04（独立评审建议 P1，主审暂按 P2 可靠性风险）**：`cleanup-runner.ts:28` 单次 absence 成功就写 marker，`cleanup-hosted.ts:25` 随后删 ledger。客户端取消不保证服务器已接受的请求停止，迟到提交尚无专项证明。主审降级理由：未复现迟到残留，而且 workflow 在 correctness 失败时仍禁止 readiness，不能直接推断该问题导致虚假 readiness。风险继续阻断“所有取消恢复已验证”的完整验收。须用迟到提交测试及服务端收敛/屏障依据解决；两次空快照不是充分证明。
- **P2-05**：`cleanup-runner.ts:18` 的 timeout 是 absence 尝试耗尽，真正 3 分钟墙钟超时靠 workflow 强杀，规范错误可能来不及产生。未来在外层 hard timeout 前设进程内预算和固定诊断，同时不留下继续写入的未等待任务。
- **P3-01**：`write-evidence.ts:18` 未按原计划使用原子写或成功后消费 markers。专属 run 目录、后续 validate 和最终清理降低了当前影响；作为明确设计偏差记录，后续落实或通过设计更新说明取舍，不宣称全部计划逐项完成。

## 后续验收定义

“已实现”要求源码与针对性测试；“已验证”另需对应环境的真实场景；“已集成”要求目标分支包含变更且 CI 通过；“可试点”还需设备、真实 token 到期、安全运营与合规门槛。各状态独立记录，不用一个 Done 覆盖全部。

本次输出只更新评审、路线和计划。后续代码修复、证据入库、PR 合并与设备候选各自以对应范围和验收条件执行；本轮未执行这些发布动作。


## 2026-09-08 后续功能与按需发布修复

历史发现保留。M3/M4 用户功能与 A0 离线工具已继续交付；M5 按需修复了 R0A 的 issuer 排除、acquisition 内部 source/run 绑定及根 source-inventory 漏接。单次独立 diff 评审与负向回归通过；最新成功 run 的 artifact 已过保留期，真实消费 smoke 仍待新产物，不能把本地修复当全部发布条件关闭。详见 [本批证据](2026-09-08-m3-m4-a0-m5-delivery.md)。

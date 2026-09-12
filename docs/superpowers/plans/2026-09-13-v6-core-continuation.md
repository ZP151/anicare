# v6 连续核心迭代 Implementation Plan

> 执行：父会话在现有隔离工作树逐批实现，使用 TDD 与独立只读评审；同一工作树仅一名实现者。用户已授权继续多轮，不以逐轮真机验收作为开发前置条件。

**Goal:** 打通帖子互动、带上下文的评论续聊及自动到期媒体清理，统一交付 0.4.13（21）。
**Architecture:** 复用现有真实帖子/反应/作者/媒体接口，新增最小单评论读取投影；数据库调度使用 pg_cron/pg_net 和 Vault，保持旧客户端契约。服务端清理沿用既有租约、到期与精确对象路径验证。
**Tech Stack:** Expo/React Native/TypeScript、Supabase Postgres/Edge、Vitest/Jest/pgTAP。
**Spec:** docs/plans/2026-09-11-social-v6-iteration.md（P01/P02/N03/R4），docs/plans/2026-09-12-v6-r4-profile-media.md。

## Global Constraints

- 已通过地图与单行原生玻璃导航不改；0.4.11–0.4.12 合并到本包真机验收。
- 英文/简体中文、系统字号、44pt 触控、键盘安全区；沿用钴蓝/暖白、图片优先布局。
- 不显示虚假统计，不暴露私密报告/精确位置，不新增视频或 Bot 空壳。
- RPC 从 auth.uid() 判定可见性；旧九字段帖子/六字段回复契约保留。
- 每批相关回归和独立评审；最终完整 verify、SQL、Hosted Gate、CI 和一次原生构建。

## Batch 1 — 帖子详情与互动

Files: apps/mobile/app/community/[id].tsx；apps/mobile/src/community/PostContext.tsx、CommunityAuthorSheet.tsx（新）；apps/mobile/src/api/community-thread.test.tsx。
Interfaces: 复用 getCommunityReactions([id]) / CommunityLike；getCommunityAuthor 返回公开名字/头像及真实私信能力；getPublicCatSummary 只读公开猫名，getCommunityPostExtras 提供标题/媒体。

- [ ] RED：新增详情测试，验证真实点赞数和切换、猫卡/邻里、作者资料入口；保留键盘输入区和失败发送幂等测试。
- [ ] GREEN：作者紧凑头部、正文下猫/邻里一行、点赞/评论入口；头像资料可关闭并真实发私信。文字帖不补造猫照片为帖子附件。读取失败可重试、刷新保留内容、换账号/帖子丢弃旧响应。
- [ ] TEST：pnpm --filter @animalhelper/mobile exec jest --runInBand --runTestsByPath src/api/community-thread.test.tsx src/community/PostGallery.test.tsx。
- [ ] REVIEW/COMMIT：独立评审后单独提交此批。

## Batch 2 — 评论上下文与通知定位

Files: supabase/migrations/202609130021_community_reply_detail.sql、supabase/tests/043_community_reply_detail.sql（新）；apps/mobile/src/api/community-reply-detail.ts/.test.ts（新）；CommunityCommentThread.tsx/.test.tsx；ActivityInbox.tsx/.test.tsx。
Interfaces: get_public_community_reply(p_reply_id uuid) 返回旧六字段 CommunityReply 单行，使用 private.community_reply_available；客户端 getCommunityReply(id) 对空结果抛 community_reply_hidden；既有 getCommunityCommentContext 保持三字段。

- [ ] RED：SQL 验证匿名/本人公开读取、屏蔽/删除/隐藏父帖或父评论拒绝、无内部字段；API 严格字段/ID解析。
- [ ] GREEN：回复页顶部显示原帖摘要与父评论；通知中的顶级评论也进入该评论线程，子回复直接读取定位且校验属于当前父评论。不可见目标给短提示与可用返回路径。
- [ ] TEST：线程测试覆盖目标在第二页以后、重复页去重、分页失败保留、切账号迟到请求、发回复失败重试。通知读取失败不阻止可见内容打开，已隐藏目标不跳转。
- [ ] REVIEW/COMMIT：更新迁移/SQL清单并独立评审，单独提交。

## Batch 3 — 无人值守媒体清理

Files: supabase/migrations/202609130022_community_media_schedule.sql、supabase/tests/044_community_media_schedule.sql（新）；supabase/functions/cleanup-community-media/index.ts、_shared 中可测试请求处理器；scripts/ 下部署调度配置与测试；Hosted Gate 受保护部署集成。
Interfaces: private 调度函数从 Vault 读取单用途凭据，调用固定 cleanup-community-media 地址；cron 每15分钟触发，禁用时无请求。配置由受保护部署使用现有服务端凭据一次幂等写入；不在普通 API/日志/cron command 内存明文密钥。

- [ ] RED：请求仅接受受信认证和空体/精确空JSON，拒绝用户/异常头；SQL 权限与重复配置不创建多任务。按 Supabase 官方 pg_cron/pg_net/Vault 接口实现并核对现有扩展。
- [ ] GREEN：配置调度与短期非敏感运行状态；仅处理现有到期队列，失败保持可重试，上传凭据期内不清除最终有效对象。
- [ ] TEST：本地 SQL/Edge 单测及云端精确对象读回，覆盖到期/未到期/失败重试。不能把 HTTP200 当作对象已消失，不能仅安装 cron 就宣称运行通过。
- [ ] REVIEW/COMMIT：独立高风险审阅、云端部署验证、凭据提升。

## 合并交付

- [ ] 更新版本为 0.4.13（21）、三批完成记录与合并真机清单。
- [ ] pnpm verify；完整 SQL；CI / Hosted Gate 均通过。
- [ ] 推送最终来源 main，构建 IPA；核验来源、哈希、锁文件、图标、版本与 arm64。
- [ ] 创建不覆盖旧文件的 Downloads 安装副本；汇报真实完成范围和待真机验收项。

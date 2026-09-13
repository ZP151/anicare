# C1 · 猫主页与共同贡献实施计划

> 按 superpowers:executing-plans 逐任务执行；每任务先失败测试，再实现、定向检查和独立只读审查。同一工作树仅一个实现者。用户已授权按 v4 推进；具体检查点不自动记为验收通过。

**Goal:** 同一只猫汇集不同贡献者的可见故事；从猫主页分享、未知分享和本人更正均能完成，并保留原帖身份。
**Spec:** [猫主体设计基线](../specs/2026-09-13-cat-centered-product-design.md)；[路线 v4](../../iteration-roadmap-v4.md)。
**Visual target:** [C0 三页与边界状态](../../design/cat-centered-c0/index.html)。
**Status:** Task 1–3 已实现并通过定向与独立审查；Task 4 统一验证与 0.4.15（23）候选交付进行中，真机验收保留待测。

## 当前源码与兼容依据

基线 c046822 / 0.4.13（21）；最近几轮用户已通过。本轮另修帖子进入时的残留刷新标记。

- `CommunityPost` 为严格九字段；`get_public_community_post` / `list_public_community_posts` 不能添加字段破坏旧客户端。现有按猫过滤可用，但 UUID 锚点依赖锚帖当前可见，不适合更正／删除后的稳定分页。
- `community_post_available(post, auth.uid())` 已统一帖子、猫、双向屏蔽、隐藏与删除权限。所有新摘要继续使用这一谓词；客户端不传 actor。猫身份另用 `get_public_cat_summary`。
- `get_public_community_post_extras` 和 `getCommunityAvatars` 为批量能力；私密报告素材不得进入聚合。新接口可一次返回页内文本与附件标识，头像仍按本页全部 ID 批量读取，不在卡片内发 RPC。
- `SocialDraft.schemaVersion=1` 已有 catId/communitySlug；不必为选猫另起草稿版本。`publishSocialDraft` 的冻结阶段及 requestId 用于失联重试；当前 `SocialComposer` 发布后直接 replace 原帖，新增结果页不能破坏该幂等链路。
- 服务端 `create_community_post_with_media` 保持参数和 UUID 返回；旧正文帖与 0–6 图均可发布。旧单猫字段不迁移或猜测身份。现有实现先校验猫可见性再查 requestId，必须通过下述前向迁移改正重放顺序。

## 契约 A · 猫故事读取（新增）

文件：`apps/mobile/src/api/cat-stories.ts`、`apps/mobile/src/cat-story/CatStoryList.tsx`。
SQL：计划新增 `supabase/migrations/202609130023_cat_stories.sql`，测试 `supabase/tests/045_cat_stories.sql`。编号在实际开始时再检查，不能覆盖已部署文件。

RPC `list_public_cat_stories(p_cat_id uuid, p_cursor jsonb default null, p_limit integer default 12)` 返回单个 JSON 对象：

```ts
type StoryCursor = { v: 1; catId: string; createdAt: string; postId: string };
type Story = {
  postId: string; catId: string; communitySlug: string | null;
  body: string; title: string | null; publishedAt: string;
  author: { name: string; avatarKey: string };
  replyCount: number; canEditLink: boolean;
  media: { mediaId: string; width: number; height: number }[];
};
type StoryPage = { items: Story[]; nextCursor: StoryCursor | null };
```

- created_at DESC、id DESC 复合 keyset；cursor 四字段严格校验，包含请求猫 ID、版本、合法时间和 UUID；不依赖锚帖仍可见。limit 1–30；读取 limit+1 后计算 nextCursor，不靠客户端猜是否还有页。错误 cursor 不返回任何隐藏锚点信息。
- 参数猫不可见／不存在统一 `cat_unavailable`，空故事成功返回 items=[]。其余 `invalid_cat_story_request` / `cat_stories_unavailable` 分开映射；网络错不返回空成功。
- page 中的每帖在同一次 SQL 快照用现有可见性谓词筛选；媒体只从 attached 且属于该帖的公开附件投影，最多六个，顺序按 position。保留现有媒体 resolver 的每次访问检查。正文、作者和附件同一可见性边界。
- 不返回 authorId、精确猫位置、私图路径、下载凭证、私密身份判断或精确实际目击时间。publishedAt 只是帖子发布时间；UI 明确写“发布”。不生成目击。
- 未登录可按现有公开规则读；登录后双向屏蔽生效。SECURITY DEFINER 固定 search_path，私表拒绝直接访问；只给必要的函数执行权限。
- 翻页期间客户端去重 postId；首屏刷新替换本页集合。改关联可能改变成员，返回猫主页强制重新读取首屏，不承诺跨事务的历史快照。
- 作者头像使用 `getCommunityAvatars('community_post', pageIDs)` 一批请求；缺头像回原有默认头像，缺附件显示正文及重试，不用猫肖像替代帖子图。未知字段、错误 catId、重复 ID、超长媒体数组解析拒绝。
- 新 RPC 独立命名，旧九字段完全不变；本接口无写幂等键，读请求按账户、猫 ID、generation 防迟到覆盖。

## 契约 B · 选猫与发布回流（复用＋新增客户端）

文件：`CatPicker.tsx`、`SocialComposer.tsx`、`post-transport.ts`、`post-publisher.ts`、`post-draft.ts`；新增 `apps/mobile/app/community/published.tsx`、`src/community/PublicationResult.tsx`。

- `CatPicker` 输入 `{selectedCatId, communitySlug, owner, onConfirm, onCancel}`；只在确认时返回 `string|null`，取消不修改。由 `listFollowedCats` 及 `listDiscoveredCats` 获取候选，沿用 UUID cursor、最多20一页；地图粗区域用现有 REPORT_AREAS，不能将社区 slug 直接冒充 publicCellId。无法映射时展示全部候选并明确筛选范围，不假装已按邻里筛选。
- 第一片不引入最近浏览缓存。已关注列表在登录时可用；空关注给发现入口。搜索先明确为已加载候选的名字筛选，若要全库搜索必须单独 SQL 合同，不暗示未加载名字不存在。
- 猫名、身份来自 public summary；照片通过批量 `getCatPresentations`。临时签名失败保持默认猫图标与名字，不能自动取消用户选中项。
- 打开已有草稿，先恢复全部输入再验证 catId；猫隐藏时展示“已选猫暂不可用”，允许改猫或以已有／新选邻里取消关联。隐藏期间不读该猫的缓存信息。已有错误不得抹掉照片或正文。
- 在新增 024 迁移中兼容替换 `create_community_post_with_media` 的内部顺序：验证不可变参数形状及当前账户资格 → 锁用户与请求键 → 查询旧请求并比较完整载荷 hash → 同键同载荷返回存储的原 postId → 只有新请求再检查猫当前可见性、媒体时效并创建。历史纯文字创建 RPC 同步检查并采用同一规则；签名/返回值不变，不能编辑已部署 010/015。重放只找回已有 ID，绝不再次创建；若原帖已删除，给终态 `community_post_deleted`，不恢复 editing 或换键重发。原帖仅因关联猫不可见时仍返回本人既有 ID，但结果页的公开读取必须显示不可用，不泄露旧成功摘要。
- 发布目标预检只能改善提示，服务端仍是最终判定。`community_cat_not_available` 保留为可恢复的明确错误，不全部压成通用失败。
- `phase=publishing` 的失联请求不能就地改 payload。必须先以相同 requestId/原载荷对账，得到既有 postId 后去原帖更正；确定未创建的目标拒绝才允许恢复 editing 并创建新 requestId。不能通过另发创建请求绕开不确定结果。
- 结果页参数仅 `postId`；重新取实际原帖的当前 catId，不信路由携带猫身份，更不能显示私人草稿数据。已关联时主动作猫主页、次动作原帖；未知时主动作原帖、次动作补关联。帖子已不可见时给可用返回，不显示旧成功摘要。结果页刷新不重新发布。
- 未知分享保留“猫或邻里至少一个”；取消关联时缺邻里即要求先选，既有六图/草稿结构原样兼容。不要求用户必须虚构猫身份。

## 契约 C · 本人关联更正（新增）

计划迁移 `supabase/migrations/202609130024_story_cat_links.sql`；测试 `supabase/tests/046_story_cat_links.sql`。客户端 `api/story-cat-link.ts`、`cat-story/StoryCatLinkEditor.tsx`，原帖更多菜单添加本人动作。

RPC `get_my_story_cat_link(p_post_id uuid)` 返回 `{postId, catId, communitySlug, revision}` 单行；只允许当前作者读取，其他情况统一 `story_link_unavailable`。四个键精确为 `postId: UUID`、`catId: UUID|null`、`communitySlug: string|null`、`revision: number`；revision 为非负安全整数，所有历史帖默认0。严格拒绝额外键、错误 UUID/slug、负数及超安全整数。旧帖子读取接口不增加字段；历史未知帖的 null catId 是合法值。

RPC `change_my_story_cat_link(p_post_id uuid, p_cat_id uuid|null, p_community_slug text|null, p_expected_revision bigint, p_request_id uuid)` 返回 `{postId, catId, communitySlug, revision}`。p_community_slug 仅可为原值，或原值为空时为取消关联补齐一个合法邻里；不顺便做任意地点改写。

- `auth.uid()` 为作者且成年参与资格有效、无删除中的账户；帖未删除、未隐藏；新猫当前可见。旧猫不可用时，允许作者通过自己的管理入口取消／改选，不能因旧猫不可见锁死修复。此管理读取不向他人或聚合暴露旧猫信息。
- 事务内锁顺序对齐既有创建／删除（先当前用户，再帖子；审核、删除和更正争用同一帖行）。检测当前 revision 与 expected 完全一致后改 cat_id 并加1；同值 no-op 不加1。增加私有审计表，记录 actor、post、old/new cat、revision、requestId；账户删除时按既有删除规则清除／匿名化，不公开审计详情。
- `(actor,requestId)` 唯一、完整载荷指纹含 expectedRevision 和邻里；同键同载荷重放返回原操作结果但不再次写，客户端随后重读当前状态；同键异载荷 `idempotency_conflict`。不同键过期版本 `story_link_conflict`，重读并要求用户确认新意图，不能自动覆盖。
- 明确事务校验顺序：当前账户资格/作者/帖未删除未隐藏 → 用户、帖及请求锁 → 同 requestId 完整载荷比较并重放已有结果 → 仅对新操作检查新猫当前可见及 expectedRevision。若成功更正后的猫随后不可用，重放仍返回原结果并立即重读当前管理状态，不再次写；客户端不得将旧结果覆盖较新 revision。相反，帖已删除或隐藏时先拒绝，即使是同键重放也不返回旧可见摘要。删除后的旧请求不得复活关联。并发删除/隐藏/新猫失效的事务行为用 dblink 测试，不以单线程 mock 替代。具体用例独立放在 `047_story_link_concurrency.sql`，避免远端事务夹杂在 046 单会话回滚中。
- `cat_unavailable`、`neighbourhood_required`、`story_link_conflict`、`idempotency_conflict` 为可识别错误；无权限和不存在统一 `story_link_unavailable`；网络错保留同 requestId 供重试。禁止从客户端提交 actor。
- 不复制帖子、不换 postId、不改变作者/评论/附件，也不调用身份审核、报告或照护写接口。初始故事按现有 created_at 排序；C2 会通过服务器变更事件处理“新关联可见”的回访更新，不能把旧帖 created_at 当新关联事件时间。
- 改关联后旧/新猫主页及原帖焦点刷新，缓存按账户隔离。未完成 C2 前不伪造更新徽章。第三方继续 `reportCommunityContent`；身份资料纠错使用已有身份流程，两者不能混淆。

### 实施补充 · 旧猫不可见后的管理可达性

新增 `list_my_story_link_repairs(p_cursor uuid|null, p_limit integer)`，返回最多 20 项本人尚未删除／隐藏且旧猫不可见的帖子：四个关联管理字段加本人 `title`（最多120字）和 `createdAt`。游标使用本人帖的 `(created_at,id)`；只给 authenticated，资格和注销中状态与管理接口一致。它不修改既有公开九字段列表，也不向他人暴露旧猫信息。“我的”帖子页显示紧凑的待更正入口，修复后焦点刷新移除。

## 任务顺序及 TDD

### Task 1 · 只读投影与猫主页

- [x] 在 045 SQL 和 `api/cat-stories.test.ts` 写失败用例：两作者同猫、不同猫、相同时间分页、删除锚点续页、双向屏蔽、猫失效、私图排除、缺附件、错误返回。
- [x] 实现契约 A；`CatStoryList.test.tsx` 覆盖加载/空/错误/重试/分页/账户与猫切换迟到响应，以及作者/原帖各自入口。
- [x] 修改 `CatDetailScreen.tsx` 与 `app/cat/[id].tsx`，按 C0 主次与公开信息实现；保留 `CatCommunityContext` 的足迹、报告、照护、关注和纠错入口，去掉重复的整页“讨论这只猫”入口。运行现有 cat-route/CatDetailScreen 回归。
- [x] 独立只读权限审查，修复后小提交。不能单独把 Task1 叫做 C1 完成。

### Task 2 · 选猫、已发布回流、失败恢复

- [x] `CatPicker.test.tsx` / `SocialComposer.test.tsx`：预选、改选、取消、未知邻里、空关注、候选失败重试、隐藏目标、旧草稿、账户切换。
- [x] `post-publisher.test.ts` / 新 `post-transport.test.ts`：最终目标拒绝可恢复、失联不生成新帖、旧请求对账后更正、媒体到期保留输入；不得弱化原有上传验证。新增 SQL/传输回归必须覆盖：创建成功但响应丢失 → 猫隐藏 → 原键原载荷重放得到同一 postId → 结果页显示不可用且数据库仍只有一帖；删除后的重放为终态。
- [x] `PublicationResult.test.tsx`：已知/未知路由、隐藏原帖、猫关联已更正、换账户、刷新不写。
- [x] 实现契约 B；重跑六格、编辑、排序、加密恢复用例；独立只读审查后小提交。

### Task 3 · 更正及并发一致性

- [x] 046 SQL：未知→A→B→null；同键重试、异载荷冲突、两设备版本竞争、成功更正后新猫失效再重放、非作者、旧猫失效、新猫失效、删除/隐藏竞争、缺邻里、账户删除清理。
- [x] `story-cat-link.test.ts` 严格解析/错误映射；`StoryCatLinkEditor.test.tsx` 覆盖预览/选择/确认/取消/迟到/冲突；`community-thread.test.tsx` 覆盖更正后上下文和真实帖子身份。
- [x] 实现契约 C，隐藏/删除/更正后的两个猫主页均重新校验，不返回旧摘要；独立并发与权限审查后小提交。

### Task 4 · 统一交付

- [ ] 两位标注演示作者的一只演示猫走读；不新增虚假真实互动、关注或照护。C3 才整理四猫连续样本。
- [x] 更新迁移清单 `scripts/pilot-gate-2b-inputs.mjs` 及相关 inventory / evidence 测试，不修改已部署迁移。运行新增 pgTAP + 既有数据库全套、`pnpm verify` 和必要 CI。
- [ ] 后端部署验证、证据晋升、原生构建及 IPA 来源检查；版本在真实候选时确定。一次集中设备测试：两账户同猫贡献、更正删除、未知分享、旧草稿恢复、换账户、浅深色/中英/大字/断网。
- [ ] 台账逐项记录，未测真机就写待测；C2/C3 和研究价值均不因 C1 通过而完成。

定向入口（在对应文件实际创建后运行）：

```powershell
pnpm --filter @animalhelper/mobile exec jest --runInBand --runTestsByPath src/api/cat-stories.test.ts src/cat-story/CatStoryList.test.tsx src/api/cat-route.test.tsx
pnpm --filter @animalhelper/mobile exec jest --runInBand --runTestsByPath src/cat-story/CatPicker.test.tsx src/community/SocialComposer.test.tsx src/community/post-publisher.test.ts src/community/PublicationResult.test.tsx
pnpm --filter @animalhelper/mobile exec jest --runInBand --runTestsByPath src/api/story-cat-link.test.ts src/cat-story/StoryCatLinkEditor.test.tsx src/api/community-thread.test.tsx
pnpm --filter @animalhelper/mobile typecheck
```

运行数据库按 [回归手册](../../regression-playbook.md)，检查 TAP 断言与计划数，不能只看 psql 退出码。数据库端锁和可见性是后续独立审查重点。

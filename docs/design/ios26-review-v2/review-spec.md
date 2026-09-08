# Whisker Commons — iOS 26 全界面设计 v2

2026-09-08 · 状态：**等待用户审核，未批准实施**。

## 审阅入口与真实性

打开 `index.html` 按组查看、点击放大。`screens/` 是每页 804 × 1748 的 2× PNG；`overview-A.png` 至 `overview-G.png` 是分组总览；`all-screens.pdf` 每页一张稿，可直接打印。压缩包同时包含可修改的 HTML/CSS 图稿源文件、页面索引和素材许可证。

这些是按 402 × 874 pt 设计的**高保真静态图稿**，不是 Expo Web 截图、iPhone 运行截图，也不是可提交真实数据的原型。没有修改本轮生产应用代码。图稿中的昵称、猫、日期、回执、状态和账户均为合成示例；示意地图不代表真实地理位置。以 A01–G05 的确定性图稿为准。

设计方向已由用户选择：iOS 原生精致风，系统图标、分组列表和克制的 Liquid Glass。完整布局已获用户初步认可；本轮重点审核毛玻璃的材质表现，不重复要求选择方向或先批准文字计划。

## v2 材质修订和下一版样本

保留布局、导航数量和功能范围。导航透出背景颜色和模糊轮廓，地图浮层增加细边缘高光，照片控制增强磨砂效果和图标对比；内容与表单仍使用清晰的实色表面。深色匹配同一层级，减少透明度时关闭模糊。

查看 [材质对比与交互预览](material-review.html)。CSS 是材质意图示例，不能替代 iOS 原生折射、触感或帧率验收。渲染使用完整 Chromium，避免当前 headless shell 在多个背景模糊层上的截图差异。

下一次测试版需要可操作的猫样本，具体范围、照片缺口和同机回归见 [样本交付计划](test-samples-release.md)。尚未导入或发布，线上已有公开猫的数量尚未核实。

## 产品中心与布局取舍

核心任务是“看到社区猫 → 留下有用观察 → 了解贡献结果 → 持续关注和照护”。附近让用户记住猫；地图解释活动区域；报告提供创建与恢复；关注建立连续性；我的集中管理本人资料与活动。

主页面不重复展示审核机制、训练政策、存储实现、精确坐标保护的长段说明。必要的信息出现在对应选择处：位置页解释区域保护，照片页解释人工遮挡，身份页解释独立确认，删除页解释账户与媒体清理差异。贡献资格只确认一次。

保留五个一级导航。87 张图包含状态与拆分后的子视图，**不是新增 87 个业务模块，也不是 87 个发布门禁**。退出、删除、撤回的确认只用于有实际影响的动作；关注/取消关注、普通保存、浏览与返回不增加确认。

## 组件、开源参考与落地选择

| 参考/套件 | 本次采用的模式 | 落地选择与边界 |
| --- | --- | --- |
| [iNaturalist React Native](https://github.com/inaturalist/iNaturalistReactNative)，[AddObsBottomSheet](https://github.com/inaturalist/iNaturalistReactNative/blob/main/src/components/AddObsBottomSheet/AddObsBottomSheet.tsx) | 相机/相册入口、无照片观察路径、媒体与观察任务分层 | MIT。参考任务组织，不复制品牌、用户图片或 AI 能力；本项目继续使用现有 Expo 拍照和草稿组件 |
| [Bluesky SettingsList](https://github.com/bluesky-social/social-app/blob/main/src/screens/Settings/components/SettingsList.tsx) | Group、Item、ItemIcon、ItemText 的对齐关系，账号与设置拆分 | [MIT](https://github.com/bluesky-social/social-app/blob/main/LICENSE)。重建符合本产品的分组组件，不整包移植社交应用 |
| [Apple Design Resources](https://developer.apple.com/design/resources/) / [Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass) | 原生导航、返回层级、内容与控制分层、系统表单 | Apple 资源受其许可约束，不作为开源素材重新分发。目标是用户的 iOS 26，不引入 iOS 27 专属设计能力 |
| [Expo NativeTabs](https://docs.expo.dev/router/advanced/native-tabs/) | 原生五栏导航和 SF Symbols | 使用项目已有组件；文档标记 API 仍在演进，固定项目已锁定版本，不另加第三方 Tab 实现 |
| [Expo GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/) | 小面积浮层与图片上的控制 | 现有依赖；iOS 26 走原生材质，旧系统或减少透明度走实色。CSS 图稿只表达视觉意图，不冒充原生折射效果 |
| [Expo UI](https://docs.expo.dev/versions/latest/sdk/ui/) | SwiftUI 原生表单、日期和时间选择 | 审核后的实施候选。先用一张表单验证 SDK 57 兼容与键盘，不为全应用替换框架 |
| [Lucide](https://lucide.dev/license) | 本次图稿实际嵌入的 56 枚一致 SVG 图标 | 固定提交 ba95e4c988b1e1b39cf5544e73b25a74b76816ee；ISC 及继承图标的 MIT 许可全文随附。无 emoji 或字符代替图标 |
| [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc) | Windows 上可复现的中文图稿排版 | SIL OFL 许可随附；iOS 实施使用系统 SF / 苹方及 Dynamic Type |

不购买闭源套件，不混用多套毛玻璃、底部导航或整套 UI 框架。Memmy 等其他应用只作研究背景，不复制 AGPL 代码进入当前实现。此次引用的是成熟的组件与布局模式，并未声称已经把第三方业务组件装入手机应用。

## 视觉规范

| 项目 | 规范 |
| --- | --- |
| 内容背景 | 浅色 #F5F6F3，深色 #141A17；分组表面 #FFFFFF / #202923 |
| 主动作 | 玉绿色 #176B56；深色 #97D8B6；错误使用独立红色且带文字 |
| 文字层级 | 一级标题 34；页面段落 17；分组行 16–17；辅助说明 13–15；徽标仅承载短状态 |
| 间距 | 页面左右 24；组间 24；相关字段 8–12；图标与文本 12–13 |
| 触控 | iOS 命中区域至少 44 × 44；列表至少 58 高；主按钮 52 高；图标视觉尺寸 20–24 |
| 圆角 | 分组 16；照片 19；仅导航、主按钮和小控件使用胶囊形 |
| 玻璃 | 原生 Tab、图片上的返回/关注控件、地图工具；长文本、照片、表单、照护时间线为内容层，不铺玻璃 |
| 返回与弹层 | 所有子页有可见返回；短选择用 Sheet；长表单为完整页；底部动作避让 Home indicator 和键盘 |
| 照片 | 不叠长文字；不美化或读取用户私有原图。照片为空时有完整图标布局，不能用合成猫替代真实档案 |
| 运动 | 跟随系统转场、可中断的 Sheet；不加每页入场动画。遵守减少动态效果和减少透明度 |
| 状态 | 实心/描边、图标和文案共同表达选中/错误，不仅靠颜色；加载不编造百分比 |

主图和列表的玻璃表现随背景内容而变化。最终材质、滑动、触感、键盘、SF Symbols 具体字重都必须在 iPhone 上验收，静态图稿不能证明这些已生效。大字号示例 F07 展示更高行距与实色表面，实际屏幕允许滚动；不通过缩小文字硬塞内容。

## 组件对应表

| 设计组件 | 图稿示例 | 实施承载 / 系统符号意图 |
| --- | --- | --- |
| 主导航 | A01–A05 / G01–G05 | NativeTabs；safari / map / plus / heart / person.crop.circle |
| 导航返回与动作 | 全部子页 | Native Stack；chevron.left / ellipsis |
| 猫的内容卡、紧凑行、缺图 | A01、A04、B03、B05 | CatCard / CatList；pawprint、heart / heart.fill；不引入第二套卡片库 |
| 分组列表 | A05、E01、E07 | SettingsGroup；doc.text、hands.sparkles 或 heart、globe、lock.shield |
| 区域浮层 | B01、B02、C06 | 原生 presentation / 现有地图组件；map、location；范围面而非精确图钉 |
| 五步报告 | C01、C03–C07 | ReportWizard 与持久化阶段保持兼容；camera、photo、checkmark |
| 私有照片编辑 | C02、C17、C18 | 当前 MaskEditorOverlay / opaque masks；crop、arrow.uturn.backward、trash |
| 状态与续办 | C08–C20、F12–F16 | ReportReceipt / IdentityContinuation / PendingCareNotice / RequestNotice |
| 照护表单 | D02、D04 | CareEntry；drop、fork.knife、sparkles、eye、heart |
| 单一恢复状态 | F01–F21 | 共用状态组件，传入真实对象、文案、重试与安全返回，不为每种错误写一页业务代码 |

符号为语义映射意图，实施时核验目标系统支持情况。Apple/Google 品牌登录按钮采用各自正式规范，E19 仅审阅位置与排序；通用开源图标不冒充品牌标志。

## 15 个路由的覆盖关系

| 现有路由 | 主图与子视图 | 关键状态 |
| --- | --- | --- |
| `(tabs)/index` | A01、B01；与 B03 相连 | F01、F05、F10；G01 |
| `(tabs)/map` | A02、B02、B06；回到全区域、地图/列表 | G02；服务不可用时保留可用区域列表，不伪造数据 |
| `(tabs)/report` | A03、C15、C21 | F08、F09、F12；G03 |
| `(tabs)/following` | A04、B08 | F02；账户未登录复用 E18/E02；失败复用 F05；G04 |
| `(tabs)/profile` | A05、E01–E06、E16、E18、E19 | F07、F11、F17、F22；G05 |
| `cat/[id]` | B03–B05、B07、B08 | F21；图片缺失 B05 是当前真实可用基线 |
| `report/new` | C01、C03–C08、C16、C06 | F04、F09、F12；表单校验局部呈现 |
| `report/redaction-review` | C02、C17、C18 | 权限拒绝、处理失败、落盘待确认复用 F04/F06 的恢复组件 |
| `report/receipt` | C09–C13、C19、C20 | F12、F13、F14、F23；媒体失败 C10 |
| `report/my-reports` | C14 | F03、F18；登录 E02；加载/失败复用 F10/F05 的列表版本 |
| `care/[id]` | D01、D02、D06 | F06；资格 E05；空时间线用 F19 的照护语义 |
| `care/my-care` | D03–D05 | F19；待确认重试 F06/F16，停止不等于撤回 |
| `privacy` | E07–E12、E17 | F16、F20；退出后本机回执 E12 |
| `safety/[id]` | E13–E15 | E05、E02；空活动/加载/重试复用通用状态 |
| `auth/callback` | E04、F15 | 成功确认后回到原任务；失效回到重新登录 |

同一恢复组件在不同页面需要替换对象、理由和下一步，不复制同样文案到所有错误。系统相机、相册、权限警告、日期时间选择由 iOS 系统绘制，本包设计其调用入口、返回与拒绝后的恢复，不伪造系统 UI 或重新实现相机。

## 主流程与返回规则

1. **发现与关注**：A01 筛选 → B01 → B03/B05 → 爱心关注/取消。A02 ↔ B06 → B02 → 猫档案或 C05。区域不会触发精确导航；尚未支持的区域关注入口不展示。
2. **记录与恢复**：A03/F08 → C01 → 有照片走 C02/C17/C18 → C03 → C04 → C05/C06 → C07 → C08 → C09 或 C10。无照片从 C01 直接到 C03。保存退出返回 A03；继续草稿恢复原阶段，不重走整条链。
3. **登录返回**：需要贡献时 C16 → E02/E19 → E03 → F15 → 已确认会话后返回原草稿；尚无成年确认时 E05。取消和失败均保留本机草稿，不自动归给另一个账户。
4. **身份续办**：C09 → C11 → 选已有档案或 C12 新猫提案 → C13；失败 F14；没有档案 F13；可随时跳过。后续服务确认 C19；需要重新选择 C20。这里是人工身份提案，不是 AI 匹配。
5. **照护闭环**：B03/B05 → D01 → D02 → D06；A05 → D03 → D04 更正 / D05 撤回；结果不明确 F06，沿用同一请求，必要时查看本人记录后停止本机重试。
6. **个人资料与权利**：A05 → E01/E06/E07；E07 → E08/E17 → E09/E10；删除 E11 → E12；内容问题由 B07 → E13 → E14/E15，统一从 E09 看结果。

## 对现状的功能约束与需要明确的改动

- **照片是最重要的视觉依赖。** 当前公开档案没有可用公开照片字段时使用 B05。A01/B03 中照片方案只在有经过单独发布流程的公开媒体时启用，不能借设计改版读取私有图片。公开照片能力应作为后续功能优先项，否则不要用大图版承诺交付效果。
- B04 是建议把现有可读公开活动摘要组织成独立历史页；它不是当前已存在的独立路由。E 系列多数也是现有内联功能的拆页方案，不是后端新能力。
- 现有报告契约是五步；本稿没有为了减少界面数量而丢弃毛色、标记、健康状态、位置风险等字段。后续可在用户同意后单独评估合并步骤，不在纯改版中悄悄改数据契约。
- C14 的服务摘要有限，默认显示“目击报告”与生命周期；不能从不可用字段编造猫昵称、私有观察笔记或区域。
- C10/C14 的显式“重试照片”是待实施的恢复入口，不是当前已具备按钮；只在能找到原草稿与可恢复私有副本时提供稳定重试，否则进入现有媒体状态/恢复路径。C19 的照片状态按真实回执绑定，文本报告显示“未添加照片”，清理中或已移除等状态不能统一写成“已收到”。
- C06 展示三个可验证区域作为共同基线；原生报告地图可保留已支持的新加坡范围内选区/H3 转换，但不能让公共地图变成精确猫位置。
- Apple/Google 的代码入口已有，服务配置与本设备可用性未在本轮验证；E19 是有条件显示方案。未配置就隐藏，不留能点却一直失败的按钮。
- AI、自动隐私检测、区域关注、推送偏好、预约救助、付款/捐赠均不作为当前可用功能出现在图稿中。产品文档提及但未实现的推送/帮助不冒充已经具备；先确保当前核心闭环。
- 当前缺少站外隐私受理渠道；E11/E12 如实说明删除后查询限制，没有凭空创建联系邮箱。

## 审核后的实施顺序与高效回归

用户批准完整图稿后再开始这轮全界面改版，按三个可交付批次推进：

| 批次 | 实施重点 | 交付证据 |
| --- | --- | --- |
| U1 | 统一原生导航/图标/分组/语义色；A/B/E01–E06；验证缺图基线与可公开照片方案 | 本人 iPhone 浅色/深色实拍；附近→档案→关注与资料保存成功 |
| U2 | C/D 报告与照护；保存退出、登录返回、部分成功、重试 | 同一份草稿中断后恢复；文字报告成功、媒体失败不丢文本；照护新增/更正/撤回 |
| U3 | 其余 E/F 请求与状态；大字号、键盘、减少透明度；包更新 | 真实回执、空数据/拒绝权限/切换账户验证；一份新 IPA 安装验收 |

每批仅运行受影响模块测试、类型检查和一条核心操作链。触及请求归属、数据提交和媒体处理时才运行对应已有安全/恢复测试。发布前跑现有全量检查一次，不为纯间距、字号、图标修改新建镜像实现的测试或重复审计文档。

真机短回归围绕用户可见目标：匿名浏览和打开猫档案；首次贡献登录返回草稿；有照片/无照片各一条；照片失败仍看到文字回执；身份稍后续办；关注刷新；照护新增、更正与撤回；个人昵称保存；请求回执；大字号与键盘下主按钮可达。破坏性账户删除只用专门测试账户，不拿用户常用账户做验收。

产品追踪采用任务完成情况，不以审计数量度量：能否找到猫、能否提交观察、草稿是否恢复、能否理解结果、能否持续照护。时间目标与满意度需真机记录后再设基线；本次没有编造成功率或“已通过审美验收”。

## 当前交付检查

- 15/15 现有路由有对应图稿；子步骤、浮层和关键状态共 87 张。
- 批量渲染为 2× PNG，统一编号与尺寸；页内边界与底部操作区检查结果见 `layout-findings.json`。
- 人工查看分组总览和代表性完整尺寸页面，修正暗色地图对比度、部分内容超出底部操作栏、无交互说明行的错误箭头。
- 静态图稿没有运行真实权限、网络、登录或数据库操作；真机视觉与功能验收仍待后续实施。

用户可按图号反馈，例如“A01 照片比例通过，C04 还需简化，E01 资料格式通过”。局部通过不自动意味着其余全部页面获批。


## 逐页索引

| 图号 | 页面 | 对应路径 |
| --- | --- | --- |
| A01 | [附近 / 内容发现](screens/A01.png) | `/(tabs)/index` |
| A02 | [地图 / 区域概览](screens/A02.png) | `/(tabs)/map` |
| A03 | [报告 / 创建与恢复](screens/A03.png) | `/(tabs)/report` |
| A04 | [关注 / 持续照护](screens/A04.png) | `/(tabs)/following` |
| A05 | [我的 / 分组个人中心](screens/A05.png) | `/(tabs)/profile` |
| B01 | [附近筛选 / 底部浮层](screens/B01.png) | `/(tabs)/index · filters` |
| B02 | [区域详情 / 地图浮层](screens/B02.png) | `/(tabs)/map · CoarseAreaDetailSheet` |
| B03 | [猫档案 / 核心详情](screens/B03.png) | `/cat/[id]` |
| B04 | [猫的公开活动 / 历史](screens/B04.png) | `/cat/[id] · public activity` |
| B05 | [缺少公开照片 / 真实基线](screens/B05.png) | `/cat/[id] · no public media` |
| B06 | [地图 / 区域列表](screens/B06.png) | `/(tabs)/map · list` |
| B07 | [猫档案 / 更多操作](screens/B07.png) | `/cat/[id] · more` |
| B08 | [猫档案 / 已关注](screens/B08.png) | `/cat/[id] · followed` |
| C01 | [添加照片 / 第一步](screens/C01.png) | `/report/new` |
| C02 | [照片检查 / 手动遮挡](screens/C02.png) | `/report/redaction-review` |
| C03 | [描述这只猫 / 第二步](screens/C03.png) | `/report/new` |
| C04 | [状态与保护 / 第三步](screens/C04.png) | `/report/new` |
| C05 | [选择大致区域 / 第四步](screens/C05.png) | `/report/new` |
| C06 | [手动选区 / 区域选择器](screens/C06.png) | `/report/new · ReportAreaPicker` |
| C07 | [确认报告 / 第五步](screens/C07.png) | `/report/new` |
| C08 | [提交报告 / 正在发送](screens/C08.png) | `/report/new · submitting` |
| C09 | [提交回执 / 完整成功](screens/C09.png) | `/report/receipt` |
| C10 | [提交回执 / 仅文字成功](screens/C10.png) | `/report/receipt · media pending` |
| C11 | [选择身份 / 已有猫](screens/C11.png) | `/report/receipt · IdentityContinuation` |
| C12 | [新猫提案 / 确认选择](screens/C12.png) | `/report/receipt · new identity` |
| C13 | [身份提案 / 已提交](screens/C13.png) | `/report/receipt · tentative` |
| C14 | [我的报告 / 状态列表](screens/C14.png) | `/report/my-reports` |
| C15 | [草稿操作 / 继续或删除](screens/C15.png) | `/(tabs)/report · draft actions` |
| C16 | [报告归属 / 登录后继续](screens/C16.png) | `/report/new · auth continuation` |
| C17 | [遮挡编辑 / 辅助操作](screens/C17.png) | `/report/redaction-review · accessible controls` |
| C18 | [照片检查 / 使用确认](screens/C18.png) | `/report/redaction-review · confirm` |
| C19 | [报告结果 / 已关联档案](screens/C19.png) | `/report/receipt · linked` |
| C20 | [身份结果 / 需要重新选择](screens/C20.png) | `/report/receipt · rejected` |
| C21 | [删除草稿 / 确认](screens/C21.png) | `/(tabs)/report · delete draft` |
| D01 | [照护记录 / 公共时间线](screens/D01.png) | `/care/[id]` |
| D02 | [记录照护 / 完成表单](screens/D02.png) | `/care/[id] · CareEntry` |
| D03 | [我的照护 / 管理列表](screens/D03.png) | `/care/my-care` |
| D04 | [更正照护 / 编辑表单](screens/D04.png) | `/care/my-care · correction` |
| D05 | [撤回照护 / 破坏性确认](screens/D05.png) | `/care/my-care · withdraw` |
| D06 | [照护保存 / 成功结果](screens/D06.png) | `/care/[id] · recorded` |
| E01 | [编辑个人资料 / 统一表单](screens/E01.png) | `/(tabs)/profile · edit` |
| E02 | [登录 / 邮箱链接](screens/E02.png) | `/(tabs)/profile · sign in` |
| E03 | [登录链接 / 查看邮箱](screens/E03.png) | `/(tabs)/profile · link sent` |
| E04 | [登录回调 / 链接失效](screens/E04.png) | `/auth/callback` |
| E05 | [贡献资格 / 一次确认](screens/E05.png) | `/(tabs)/profile · adult eligibility` |
| E06 | [语言 / 系统分组选择](screens/E06.png) | `/(tabs)/profile · language` |
| E07 | [隐私与请求 / 入口页](screens/E07.png) | `/privacy` |
| E08 | [资料请求 / 选择与说明](screens/E08.png) | `/privacy · rights form` |
| E09 | [我的请求 / 状态列表](screens/E09.png) | `/privacy · requests` |
| E10 | [请求详情 / 回执与进度](screens/E10.png) | `/privacy · request detail` |
| E11 | [删除账户 / 明确后果](screens/E11.png) | `/privacy · erase confirmation` |
| E12 | [删除回执 / 退出后保留](screens/E12.png) | `/privacy · local erasure receipt` |
| E13 | [内容安全 / 选择活动](screens/E13.png) | `/safety/[id]` |
| E14 | [内容举报 / 理由选择](screens/E14.png) | `/safety/[id] · report` |
| E15 | [屏蔽贡献者 / 确认](screens/E15.png) | `/safety/[id] · block` |
| E16 | [退出账户 / 账户操作](screens/E16.png) | `/(tabs)/profile · sign out` |
| E17 | [身份纠错 / 档案请求](screens/E17.png) | `/privacy · identity rights` |
| E18 | [个人中心 / 未登录](screens/E18.png) | `/(tabs)/profile · signed out` |
| E19 | [其他登录方式 / 配置后展示](screens/E19.png) | `/(tabs)/profile · providers` |
| F01 | [附近 / 没有活动](screens/F01.png) | `/(tabs)/index · empty` |
| F02 | [关注 / 尚未关注](screens/F02.png) | `/(tabs)/following · empty` |
| F03 | [我的报告 / 离线快照](screens/F03.png) | `/report/my-reports · offline snapshot` |
| F04 | [定位权限 / 拒绝后恢复](screens/F04.png) | `/report/new · location denied` |
| F05 | [加载失败 / 可以恢复](screens/F05.png) | `/(tabs)/index · unavailable` |
| F06 | [照护保存 / 结果未确认](screens/F06.png) | `/care/[id] · retryable` |
| F07 | [个人中心 / 大字号](screens/F07.png) | `/(tabs)/profile · Dynamic Type` |
| F08 | [报告 / 没有草稿](screens/F08.png) | `/(tabs)/report · empty` |
| F09 | [报告 / 本机存储不可用](screens/F09.png) | `/(tabs)/report · storage unavailable` |
| F10 | [附近 / 骨架加载](screens/F10.png) | `/(tabs)/index · loading` |
| F11 | [登录表单 / 键盘展开](screens/F11.png) | `/(tabs)/profile · keyboard` |
| F12 | [不可用的报告 / 无权限或失效](screens/F12.png) | `/report/new · ReportRouteShell` |
| F13 | [身份续办 / 暂无可选档案](screens/F13.png) | `/report/receipt · no candidates` |
| F14 | [身份续办 / 提案发送失败](screens/F14.png) | `/report/receipt · proposal retry` |
| F15 | [登录回调 / 恢复任务](screens/F15.png) | `/auth/callback · processing` |
| F16 | [待确认请求 / 重试管理](screens/F16.png) | `/privacy · RequestNotice` |
| F17 | [个人资料 / 保存失败](screens/F17.png) | `/(tabs)/profile · name error` |
| F18 | [我的报告 / 暂无记录](screens/F18.png) | `/report/my-reports · empty` |
| F19 | [我的照护 / 暂无记录](screens/F19.png) | `/care/my-care · empty` |
| F20 | [我的请求 / 暂无请求](screens/F20.png) | `/privacy · requests empty` |
| F21 | [猫档案 / 不可用](screens/F21.png) | `/cat/[id] · unavailable` |
| F22 | [个人资料 / 读取失败](screens/F22.png) | `/(tabs)/profile · name load error` |
| F23 | [身份续办 / 档案读取失败](screens/F23.png) | `/report/receipt · candidates load error` |
| G01 | [附近 / 深色](screens/G01.png) | `/(tabs)/index` |
| G02 | [地图 / 深色](screens/G02.png) | `/(tabs)/map` |
| G03 | [报告 / 深色](screens/G03.png) | `/(tabs)/report` |
| G04 | [关注 / 深色](screens/G04.png) | `/(tabs)/following` |
| G05 | [我的 / 深色](screens/G05.png) | `/(tabs)/profile` |

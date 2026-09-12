# 0.4.4（12）设备反馈修正与个人页增量

## 本批行为

- iOS 26 恢复系统 NativeTabs 的滑动选中与 Liquid Glass；四个页面在原生胶囊内，右侧同排独立圆形加号打开创建短面板。使用原生 prevented-selection 事件，关闭后仍留在原标签，不再使用 BottomAccessory 第二行。旧 iOS / Android 保留单行自定义栏。
- 默认及“显示全岛”拟合范围相对 0.4.3 收紧为 1 / 1.3，视觉比例约放大 30%；官方边界、猫位置不改变。Apple Maps 使用 150–120,000 米 cameraZoomRange，避免缩到大范围周边国家；原生标签栏不再叠加自定义栏的底部占位。
- 主帖子底部 Write a reply 与发送键保留在滚动内容之外，键盘避让容器移到 SafeArea 外层，使用完整屏幕坐标。仍需真机检查键盘、多行和收起过程，单元测试不能代替原生视觉验收。
- 已确认邮箱为真实 Supabase PKCE 登录，安全存储会话；不是模拟账户。2026-09-12 只读检查服务端 settings：email=true、apple=false、google=false；两种 OAuth 的 400 均为 Unsupported provider: provider is not enabled。应用读取可用状态，对未启用方式明确提示，保留邮箱登录。Apple / Google 并未因此上线。
- 共用一次性 PKCE code 交换，避免系统 URL 与浏览器返回同时消费同一 code；失败允许重试。
- 个人页显示本人公开昵称、紧凑标题和版本号，加入本人帖子／照片网格。基于现有本人帖子分页，只读取已发布帖附件；每张照片可回到原帖。切账号立即卸载旧网格，迟到请求不能填回。它是 R4 第一个切片，尚非独立全库相册；所属社区编辑与到期媒体调度仍待后续。
- 消息沿用 0.4.3 的三个明确标注示例；需完成邮箱登录、读取到真实空列表后显示。示例试写不发送给真实用户，不把示例当成活跃社区或真实私信。

## 回归与交付

相关测试按失败再修复运行；独立审查核对了安装依赖中的原生 tabPress 和 MapKit 距离接口。完整本地回归通过，原生超时接口兼容修正后再次通过相关测试及类型检查；最终源码 CI 的完整 pnpm verify 与数据库契约通过，移动端 124 组、1081 项测试通过。

- [安装 0.4.4（12）](C:/Users/15492/Downloads/WhiskerCommons-0.4.4-build12.ipa)。Sideloadly 使用原 Apple ID 覆盖安装。版本也显示在“我的”底部。
- 包内源码 `6c017af410cf8acde93e2ef24bcf564b67895437`；[CI 34680370646](https://github.com/ZP151/anicare/actions/runs/34680370646) 和 [iOS 34680370662](https://github.com/ZP151/anicare/actions/runs/34680370662) 均成功。
- 包内版本 0.4.4 / 12，标识 sg.animalhelper.app；arm64 主程序、图标资源、三项权限说明正常。两张 AppIcon PNG 与 0.4.3 相同，未引入空白图标。
- 来源证明、manifest、SHA-256、两份源码锁文件摘要均核对通过；清楚命名的下载副本与构建产物逐字节一致。
- 大小 21791637 bytes；SHA-256 `ae101ea5fbe45b95735a0a97230e393884de2521275ab0de0bd6eb36f5db20db`。
- 实际玻璃滑动、键盘交互和地图比例仍待用户在 iPhone 上确认；本记录不将自动检查标为真机通过。

## 本次真机只需关注

1. “我的”下方版本为 0.4.4（12）；四页与加号同一行，滑动选中有系统玻璃效果，取消创建留在原页。
2. 地图默认／全岛比 0.4.3 近约 30%，缩小受限；搜索、定位仍正常。
3. 长帖点击 Write a reply 后输入框、发送键均在键盘上方；输入多行，收起后内容保留。
4. 邮箱登录真实完成；Apple / Google 显示尚未开通，消息真实空列表出现示例；本人帖子／照片可打开原帖。

## 后续配置

Google 需 OAuth web client ID / secret 及 Supabase callback 配置；Apple 需开发者账户、Services ID 与签名 key。不得将凭据写入聊天或移动包。当前普通 Apple ID 不能代替这些服务配置。

# iPhone 内部安装候选：2026-09-08

状态：**IPA 已生成并在 Windows 验证；手机安装与功能验收待用户操作。**

- 版本：WhiskerCommons 0.1.0（1），最低 iOS 16.4；iOS 使用 Apple Maps。
- 源码：`267acc5fade67726059dcc346b09be153745053a`，包含 M1–M4/A0 工具与 Apple Maps 适配。
- [受控候选构建 34217109488 / attempt 1](https://github.com/ZP151/anicare/actions/runs/34217109488)：成功，2026-09-08T11:00:03Z 完成。
- IPA：`whiskercommons-unsigned-267acc5fade67726059dcc346b09be153745053a.ipa`，22,443,634 bytes。
- SHA-256：`aee5dcc3290e61827a2329eb487c59869020c0bb39d5b4032e6dc4b777fdb98b`。
- 来源验签：PASS。GitHub-hosted runner、指定 workflow、main ref、以上源码 SHA 和本次 run/attempt 匹配。
- 三文件产物清单、manifest 字段/工具链、大小、checksum 和实际 Apple Pod 锁比对：PASS。
- IPA Info.plist：`sg.animalhelper.app`，版本 0.1.0 / build 1。
- 同源码 [CI 34217106875](https://github.com/ZP151/anicare/actions/runs/34217106875) 成功；Apple 原生编译探针 34215933703 成功。此次只补候选验证，未重复部署无变化的后端。

手机准备观察：一台 USB 设备已配对；ProductType `iPhone18,2`，iOS 26.6.1（23G83），观察时开发者模式未开启。Windows 已安装 iTunes 12.13.10.3、iCloud 7.21.0.23、AltServer 1.7.4。未记录设备唯一标识或 Apple 账户信息。

本机下载目录：`C:\Users\15492\Downloads\WhiskerCommons-iPhone-34217109488`。使用 [AltServer 直接安装步骤](../runbooks/ios-free-account-device-test.md#2-install-directly-with-altserver-on-windows)，无需先装 AltStore；普通 Apple ID 由用户在本机签名，每七天需重新安装。

## 下一次交付由手机结果驱动

| 顺序 | 目标 | 本次状态 / 下一动作 |
| --- | --- | --- |
| 1 | G6：安装、启动、登录、地图 | NOT RUN；用户完成本机签名，反馈首次启动和登录结果 |
| 2 | G1/G2：报告→回执→重开 | NOT RUN；拒绝定位也能手选区域，提交合成报告，重开后找到同一回执 |
| 3 | G3/G4：档案、照护、关注回访 | NOT RUN；存在合资格独立审核和公开测试档案后，验证照护更正及关注后重开 |
| 4 | G5：恢复、举报与权利 | NOT RUN；断网重试与退出隔离；删除仅使用可丢弃测试账户 |

先修阻塞安装、登录、报告提交和恢复的故障；其余问题记录后继续独立场景。下一功能切片依据这些结果选取，不新增审计平台、重复候选审批或无数据 AI 功能。外部权利联系渠道尚未配置；AI 真实效果及所有产品指标未测。本记录不声明上机成功、真实用户试点或 App Store 发布。

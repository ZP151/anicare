# iPhone 合成测试样本

这一组数据用于内部功能测试，不代表真实流浪猫的位置、真实居民或实际照护。样本通过正常公开接口显示，保持位置延迟、身份状态、照片权限与屏蔽规则。真实记录不被覆盖，样本不进入产品活跃或 AI 效果指标。

0.4.1 已实际导入 32 只猫，覆盖新加坡五个规划区域。30 条档案带照片，Echo／Amber 两条保留缺图及旧活动回归；Willow／Biscuit 补齐照片。新增 8 张自然场景与 2 张虚构成年邻居头像，部分素材适度复用，32 个样本 ID 不代表 32 个独立照片身份。图片来源与摘要见 `asset-provenance.json`，也可查看 [新素材预览](gallery-v6.html)。[实际回执](deployed-34612060562.json)对应成功工作流 34612060562，匿名逐图读回通过；此前 34610731859 在上传回执时超时，不能记为成功工作流。

社区配置为 24 条持久化测试帖、24 条示例回复，包含 7 组真实附件相册；旧 C01–C08 的 ID 与正文保持，西海岸旧文字样本也补充图片。新的场景覆盖侧面、背影、运动模糊、远处遮挡和多猫；多猫照片不用于单猫档案。固定样本角色使用两张合成人物照片或人物预设，主帖和回复分别显示不同模拟角色，不创建 Auth 用户或虚构活跃人数。

| 样本 | 名称 | 社区 | 建筑场景 |
| --- | --- | --- | --- |
| S01–S02 | Marmalade 阿橘 / Cloud 小白 | Jurong West | Demo HDB / Condo |
| S03 | Tiger 狸花 | MacRitchie 周边所属规划区 | 未填写 |
| S04–S05 | Oreo 小墨 / Echo 无图样本 | Tampines | 未填写 |
| S06 | Amber 旧活动样本 | MacRitchie 周边所属规划区 | 未填写 |
| S07–S08 | Mochi 麻糬 / Oliver 奥利 | Woodlands / Yishun | Demo HDB / Condo |
| S09–S10 | Luna 露娜 / Pepper 胡椒 | Punggol / Sengkang | Demo HDB / Condo |
| S11–S12 | Sunny 小阳 / Coco 可可 | Toa Payoh / Queenstown | Demo HDB / Condo |
| S13–S14 | Snowy 小雪 / Midnight 午夜 | Bedok / Pasir Ris | Demo HDB / 公园 |
| S15–S16 | Biscuit 饼干 / Willow 柳柳 | Choa Chu Kang / Bukit Batok | Demo HDB / Condo |

建筑名称均以 Demo 标记。它们不是地址核验结果。社区由公开粗略区域与 URA 规划区边界匹配；公园或街道名不被当作行政规划区。

导入器位于 `tests/test-samples-provisioner/src/`。固定 fixture key、动物 ID 与图片摘要保证重跑不重复建猫；只升级原样本未被用户修改的名称，修复已知错误编码时也不覆盖用户修改。每次导入后实际检查匿名档案、照片内容、照护、发现、社区足迹和楼栋信息。正式面向公众发布前应移除或隔离内部样本。

本次实际导入结果与 IPA 统一记录在 [iPhone 测试记录](../../ios-next-device-test.md)。设计稿中的讨论仅用于排版，没有发布为真实社区内容。

2026-09-09 已完成导入：[运行 34259350195](https://github.com/ZP151/anicare/actions/runs/34259350195)成功，回执见 [deployed-34259350195.json](deployed-34259350195.json)。16 个稳定样本 ID、12 条照片档案，以及匿名读取的照片内容、照护、发现、社区足迹和楼栋字段均通过校验。

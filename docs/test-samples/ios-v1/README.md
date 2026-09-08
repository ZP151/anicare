# iPhone 合成测试样本

这一组数据用于内部功能测试，不代表真实流浪猫的位置、真实居民或实际照护。样本通过正常公开接口显示，保持位置延迟、身份状态、照片权限与屏蔽规则。真实记录不被覆盖，样本不进入产品活跃或 AI 效果指标。

当前配置为 16 只猫，覆盖新加坡五个规划区域。12 条档案带照片，复用 `assets/` 中四张已标记来源的合成图；其余四条用于缺图状态。图片来源与摘要见 `asset-provenance.json`。S01–S06 保留原有 ID，增加英文别名；S07–S16 是本轮增量。

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

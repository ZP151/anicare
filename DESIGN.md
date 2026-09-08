# Whisker Commons · iOS 26 design baseline

2026-09-09：根据首轮真机反馈继续实施新加坡地图、报告恢复、默认头像与社区讨论。[v3 增量设计稿](docs/design/ios26-review-v3/index.html)归档本轮 8 个变化页面；v2 的 87 张稿保持原样。[本轮实施计划](docs/plans/2026-09-09-singapore-community-v3.md)记录功能、回归和产品目标。公开楼栋 / 住宅项目名称由用户明确选择；名称是报告者提供的地点上下文，猫活动继续延迟显示。

2026-09-08：用户确认按现有逐页案例持续实施，直到下一次真机测试。视觉基准是 [iOS 26 v2](docs/design/ios26-review-v2/index.html)，不是旧安装包。

- [87 张逐页 PNG 与路由索引](docs/design/ios26-review-v2/screen-manifest.json)
- [组件、页面覆盖与交互规范](docs/design/ios26-review-v2/review-spec.md)
- [毛玻璃材质对比](docs/design/ios26-review-v2/material-comparison.png)
- [下一版猫样本要求](docs/design/ios26-review-v2/test-samples-release.md)
- [实施与真机交付进度](docs/plans/2026-09-08-ios26-design-delivery.md)

## 固定视觉方向

原生精致、温暖克制、照片优先。系统 SF Symbols、五个原生 Tab、34pt 大标题、24pt 页边距、统一分组列表与玉绿色主动作。内容保持实色清晰；Liquid Glass 用于导航、地图浮层、照片上的返回/关注。内容必须能经过导航下方，不能用不透明底板遮住玻璃。遵守深色、大字号、减少透明度和系统安全区。

## 产品真实性

现有五步目击、草稿恢复、部分上传成功、本人记录、关注、已完成照护和请求状态必须保留。图稿中的示例不是生产内容；照片必须来自实际允许公开的服务结果，缺图时使用统一缺图布局。明确标注合成测试猫，不伪造真实社区活动或审核结果。

## 参考与变更

v2 作为不可覆盖的参考快照，保存全部 87 张页面图片、HTML/CSS、生成脚本、字体和图标许可证。PDF、ZIP、分组总览可从源码重新导出，避免重复大文件进入 Git。设计发生实质变化时创建 v3，并说明对应页面编号；日常实现进度写入交付计划，不改写基准截图来掩盖实现差异。

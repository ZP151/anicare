# 素材与生成方式

- `assets/cat-portrait.png`：复制自项目现有 `apps/mobile/assets/plates/cat-portrait.png`。产品上下文将其定义为合成/演示素材，仅用于设计示例；本轮没有处理任何真实用户照片。
- `assets/icons.json`：56 枚 Lucide SVG，来自上游固定提交 `ba95e4c988b1e1b39cf5544e73b25a74b76816ee`，抓取脚本 `prepare-assets.mjs`。上游 `trash-2` / `circle-help` 的内部别名映射到 `trash` / `circle-question-mark`。许可证全文 `assets/LUCIDE-LICENSE.txt`。
- `assets/NotoSansSC.ttf`：Google Fonts 上游 Noto Sans SC 可变字体，[源文件](https://github.com/google/fonts/tree/main/ofl/notosanssc)。SIL OFL 全文 `assets/NOTO-OFL.txt`。
- 地图：由 `build-design.mjs` 绘制的自有 SVG 示意区域，没有使用 Google 或 Apple 地图截图、瓦片或真实定位数据。
- A01–G05：`build-design.mjs` + `design.css` 原创静态 UI 图稿，Playwright/Chromium 以 402 × 874 CSS px / 2× 导出 PNG。网页模拟材质不是 UIKit / SwiftUI 原生 Liquid Glass 实测。

## v2 对比素材

`assets/reference-v1-map.png` 是本项目自己的上一版地图设计渲染，用于材质前后对比。v2 不包含早期生成式方向草图，也不包含真实社区猫上传记录。没有复制参考项目的品牌、用户图片或生产业务代码。

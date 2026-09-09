# Feed 图标来源

2026-09-10 从 iOS XmaxSDK 的以下目录复制 SVG 原件：

`Examples/XLab/XLab/Resources/Assets.xcassets/api_key_{visible,hidden}.imageset/`

PNG 是同一 SVG 的透明栅格版本，逻辑尺寸 20 × 20，提供 1× / 2× / 3×，供 RN Image 根据屏幕密度加载。颜色、路径和描边未修改。品牌菱形按 FeedBrandMarkView 用 RN 渐变与旋转实现。

转换使用临时目录安装的 `@resvg/resvg-js@2.6.2`，不是应用依赖；构建只读取本目录的 PNG。若更新 SVG，可在独立工具目录安装该工具后，使用以下参数重新导出各倍率：

```js
new Resvg(svg, { fitTo: { mode: 'width', value: 20 * scale } })
  .render()
  .asPng();
```

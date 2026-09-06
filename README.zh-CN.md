<p align="center">
  <img src="extension/icons/icon-128.png" width="96" height="96" alt="Yifan Ad Skipper：盾牌与跳过播放标志">
</p>

# Yifan Ad Skipper

[English](README.md) · **简体中文**

**v1.0** · Chrome 111+ · Manifest V3 · [MIT 许可证](LICENSE)

适用于 **https://www.yifan.tv/** 的 Chrome 扩展。过滤已识别的视频广告，阻止已知的广告计时器启动，并隐藏暂停广告和播放器周围的横幅广告。同时过滤带有广告标记的推广弹幕，保留普通弹幕。

## 功能

| | 功能 | 说明 |
| --- | --- | --- |
| <img src="extension/icons/skip-video.svg" width="32" alt="跳过视频广告"> | 跳过视频广告 | 过滤带有广告标记的片头、插播广告条目，并阻止已知的广告计时器启动。 |
| <img src="extension/icons/hide-overlays.svg" width="32" alt="隐藏广告浮层"> | 简洁的播放界面 | 隐藏已识别的暂停广告和播放器周围的横幅广告。 |
| <img src="extension/icons/filter-comments.svg" width="32" alt="过滤推广弹幕"> | 过滤推广弹幕 | 过滤带有广告标记的弹幕，保留普通观众评论。 |
| <img src="extension/icons/local-control.svg" width="32" alt="本地开关"> | 本地控制 | 提供启用开关、播放器连接状态和当前页面的过滤计数。 |

产品图标将盾牌与“跳过播放”符号结合，表达视频播放保护。可编辑的图标文件和设计说明见[图标设计文档](docs/ICONS.md)（英文）。扩展弹窗目前使用英文界面。

## 安装到 Chrome

1. [下载 v1.0](https://github.com/CharryLee0426/yifan-ad-skipper/archive/refs/tags/v1.0.zip) 并解压，或克隆本仓库。
2. 打开 `chrome://extensions`，启用右上角的**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择解压后的 **`extension`** 文件夹，也就是包含 `manifest.json` 的文件夹。
4. 刷新已经打开的 yifan.tv 页面，然后开始播放视频。
5. 在 Chrome 的扩展程序菜单中固定 **Yifan Ad Skipper**，方便查看开关和状态。

使用扩展不需要构建项目、安装 npm 依赖、注册账号或配置 API Key。本地打包生成的 `dist/yifan-ad-skipper.zip` 使用相同的目录结构：解压后，加载其中的 **`extension`** 文件夹。目前通过“加载已解压的扩展程序”安装，尚未上架 Chrome 应用商店。

## 使用与排查

广告保护默认**开启**。点击扩展图标，可以查看播放器过滤功能是否已连接，以及本次页面加载期间过滤的广告条目数。这里统计的是处理过的条目，不是去重后的广告展示次数或网络请求数；切换视频或清晰度时，同一条目可能被再次处理。

修改开关后，请刷新页面。关闭保护会立即停止对后续调用的过滤，并禁用网络拦截规则；已经过滤掉的广告列表需要刷新页面后才能恢复。

如果弹窗提示播放器过滤功能尚未连接，请先刷新页面。如果播放仍然异常或提示持续出现，请关闭保护并刷新；网站可能已调整播放器实现。扩展无法修复视频资源本身不可用或内容 CDN 故障的问题。

**适用范围：** 当前桌面版 yifan.tv 播放器及已识别的广告流程。直接嵌入视频画面的广告、没有标记的服务端插播广告、新的广告实现，以及其他嵌入式播放器中的广告可能仍会出现，无法保证永久去除所有广告。移动端布局和其他域名别名尚未验证。

## 实现方式

- 页面开始加载时，在页面主执行环境中运行脚本，观察 Webpack 模块注册和 Angular 组件定义，通过方法特征定位播放器逻辑，不依赖固定的打包文件名或混淆后的类名。
- 过滤网站明确使用的广告字段：`startData`、`pauseData`、`barrageData`，以及 `flvPathList` 中带有广告链接的条目；同时处理 `isAd` / `isAds` 标记。另一层保护会阻止已知的广告调度和暂停广告注册。
- 隔离环境中的内容脚本通过 CSS 隐藏已确认的广告专用元素：`.dabf`、`vg-pause-f` 和 `.vg-vvk-p`。
- Chrome 声明式网络规则仅在请求由 yifan.tv 发起时，拦截三个 Google 广告域名系列。内容 CDN 和视频播放列表仍可正常加载。部分被隐藏的站内横幅仍可能被网站下载。

扩展保留网站原有的登录要求、内容购买状态、可用清晰度、字幕和续播位置，不会修改账号权益、加速正片或对所有短视频盲目执行快进。

## 权限与隐私

- `storage`：在本地保存启用开关。
- `declarativeNetRequest`：拦截符合规则的广告请求。虽然 Chrome 对此权限的描述较宽泛，项目内置规则要求请求发起方为 yifan.tv。
- `https://*.yifan.tv/*`：允许播放器脚本在目标网站运行，并让弹窗识别支持的标签页。

扩展不包含统计分析、外部服务、远程代码下载或观看历史收集。诊断计数仅保留在当前页面中，关闭或刷新页面后重置。页面脚本与隔离脚本之间只传递设置和计数，不会将任意页面消息转发给扩展 API。

## 开发与验证

以下命令需在源码仓库中运行，开发工具要求 Node.js 20+：

```sh
npm ci --registry=https://registry.npmjs.org
npx playwright install chromium
npm run icons
npm test
npm run test:browser
npm run research:live
npm run research:live -- --baseline
npm run research:live -- --spa
npm run package
```

`npm test` 验证播放列表过滤、广告调度拦截、普通内容保留、未知数据结构、关闭保护后的行为、懒加载模块、继承关系和清单约束。`test:browser` 会在 Chromium 中加载实际扩展，验证 CSP 环境下的主执行环境与隔离环境通信、Angular 私有组件、真实网络规则匹配、弹窗开关以及刷新后的设置保留。

在线研究使用临时浏览器配置，并将观测结果和截图写入 `artifacts/`。该流程需要联网，会改变视频播放位置，属于观测实验而非确定性测试。可以通过 `YIFAN_TEST_URL` 指定其他公开视频页面。日志仅保留网络主机名和请求类型，不记录带签名的媒体路径、查询参数、Cookie 或响应正文。

所检查的来源与实际播放观测结果见 [RESEARCH.md](RESEARCH.md)（英文）。`npm run package` 使用系统 `zip` 命令生成 `dist/yifan-ad-skipper.zip`。

## v1.0 验证结果

九项自动化测试和 Chromium 集成检查均已通过。在两个公开视频上的短时测试确认：原播放器在越过视频中点时切换到约 20 秒广告，而开启扩展后正片继续播放；暂停广告保持隐藏；在不刷新页面的情况下切换到另一视频，过滤功能仍然有效。这些是短时播放实验，并非完整观看整部视频的测试。

## 许可证

Copyright © 2026 Charlie Li (CharryLee0426)。项目及原创图标均采用 [MIT 许可证](LICENSE)。本项目独立开发，与 yifan.tv 无隶属关系。

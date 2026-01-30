# NotebookLM Clipper

一键提取网页内容并导入到 Google NotebookLM 的 Chrome 扩展。

## ✨ 功能特点

- **智能内容提取**：使用 Readability 算法提取网页正文，自动过滤广告和导航
- **一键导入**：直接通过 API 导入到 NotebookLM，无需手动复制粘贴
- **笔记本管理**：支持选择现有笔记本或创建新笔记本
- **标题保留**：自动使用网页标题作为来源名称
- **离线工作**：不依赖 NotebookLM 页面是否打开，只要浏览器登录了 Google 账号即可

## 📦 安装

1. 下载本仓库代码
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本项目文件夹

## 🚀 使用方法

1. 在任意网页点击扩展图标
2. 预览提取的内容
3. 选择目标笔记本（或创建新的）
4. 点击「一键导入到 NotebookLM」

## 🔧 技术实现

- 使用 Mozilla Readability 提取网页正文
- 通过 NotebookLM 内部 batchexecute API 直接导入内容
- 支持 Manifest V3

## 📝 注意事项

- 需要先在浏览器中登录 Google 账号
- 首次使用需要访问一次 NotebookLM 以建立登录态

## 🙏 致谢

灵感来源：[nicobytes/youtube-to-notebooklm](https://github.com/nicobytes/youtube-to-notebooklm)

## 📄 License

MIT

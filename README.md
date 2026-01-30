# NotebookLM Clipper 📚

一键提取网页内容并**直接导入**到 NotebookLM 的 Chrome 扩展。

## ✨ 功能特点

- 🚀 **一键导入**：无需手动复制粘贴，直接导入到 NotebookLM
- 🔍 **智能提取**：自动识别网页主要内容，过滤导航、广告等干扰
- 🐦 **支持 X/Twitter**：专门优化了 Twitter 等动态加载页面的内容提取
- 📝 **Markdown 转换**：保留标题、列表、代码块等格式
- 📁 **笔记本管理**：选择现有笔记本或创建新的

## 🔧 工作原理

```
网页内容 → 提取转换 → 注入脚本到 NotebookLM → 模拟用户操作 → 自动添加来源
```

通过在 NotebookLM 页面注入脚本，模拟用户操作来实现真正的"一键导入"。

## 📦 安装

### 1. 下载扩展

```bash
git clone <repo-url>
# 或直接下载 ZIP 解压
```

### 2. 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」（右上角）
3. 点击「加载已解压的扩展程序」
4. 选择 `notebooklm-clipper` 文件夹

## 🎯 使用方法

### 首次使用

1. 先打开 [NotebookLM](https://notebooklm.google.com/) 并登录
2. 创建或打开一个笔记本

### 日常使用

1. 📄 在想要保存的网页上，点击扩展图标
2. 📋 查看提取的内容预览
3. 📁 选择目标笔记本（或勾选创建新的）
4. 🚀 点击「一键导入到 NotebookLM」
5. ✅ 扩展会自动切换到 NotebookLM 并添加内容

### 备用方案

如果自动导入失败：
1. 点击「复制内容」按钮
2. 在 NotebookLM 中手动添加来源 → 粘贴文本

## ⚙️ 配置选项

| 选项 | 说明 |
|------|------|
| 包含图片描述 | 将图片的 alt 文本以 `[图片: xxx]` 形式保留 |
| 保留链接 | 将链接转换为 Markdown 格式 |
| 简洁模式 | 仅提取纯文本，不保留格式 |

## 📁 文件结构

```
notebooklm-clipper/
├── manifest.json           # 扩展配置
├── icons/                  # 图标文件
├── src/
│   ├── popup.html          # 弹出窗口
│   ├── popup.css           # 样式
│   ├── popup.js            # 弹窗逻辑
│   ├── content.js          # 网页内容提取
│   ├── notebooklm-injector.js  # NotebookLM 页面注入脚本
│   └── background.js       # 后台服务
└── README.md
```

## 🛠 技术细节

### 内容提取 (content.js)
- 使用多种选择器定位主要内容区域
- 智能过滤导航、广告、评论等无关元素
- 将 HTML 转换为结构化的 Markdown

### NotebookLM 注入 (notebooklm-injector.js)
- 注入到 NotebookLM 页面
- 模拟点击「添加来源」→「粘贴文本」
- 自动填入内容并提交

### 通信流程
```
Popup → Background (保存待导入内容)
     → 打开/切换到 NotebookLM Tab
     → 注入脚本
     → 执行导入操作
```

## ❓ 常见问题

### Q: 为什么需要先打开 NotebookLM？
A: 扩展通过在 NotebookLM 页面注入脚本来操作，需要页面已加载。

### Q: 导入失败怎么办？
A: NotebookLM 的 UI 可能会更新，导致选择器失效。可以：
1. 使用「复制内容」按钮手动粘贴
2. 等待扩展更新
3. 提交 Issue 报告问题

### Q: 支持哪些网站？
A: 理论上支持所有网站。特别优化了：
- X/Twitter（动态加载）
- Medium、博客文章
- 新闻网站
- 文档类网站

### Q: 内容提取不完整？
A: 对于动态加载的页面，请先滚动加载完整内容，再进行提取。

## 📝 更新日志

### v1.1.0
- 🚀 支持直接导入到 NotebookLM（无需手动粘贴）
- 📁 支持选择目标笔记本
- 🆕 支持创建新笔记本

### v1.0.0
- 初始版本
- 网页内容提取
- 复制到剪贴板

## 📄 许可证

MIT License

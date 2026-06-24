# MindMap MCP 使用说明

思绪思维导图桌面版，内置 MCP 服务。两种用法：

- **当普通脑图编辑器用**（图形界面）
- **让 AI Agent（Claude 等）通过 MCP 直接读写 / 生成脑图**

> 面向开发者的架构、构建、打包、CI 与签名说明见 [README.md](README.md)。

---

## 一、安装

1. 运行安装包 `MindMap MCP Setup x.y.z.exe`。
2. 按向导选择安装目录（可更改），完成后有开始菜单 / 桌面快捷方式。

要求：**Windows 10 / 11 64 位**。打包版自带运行时，**无需另装 Node**。

> 当前安装包未签名，首次运行若弹出 Windows SmartScreen，点 **“更多信息 → 仍要运行”** 即可。后续若做了代码签名则不再提示。

---

## 二、两种使用模式

### 1. 图形界面（手动编辑）
双击快捷方式打开，就是完整的脑图编辑器。布局、主题、导出、快捷键等通用脑图功能见上游文档 [README_MORE_ZH.md](../README_MORE_ZH.md)。

顶部原生菜单栏支持多语言：**语言 / Language** 菜单可在 简体中文 / 繁體中文 / English / Tiếng Việt 间切换，切换后界面语言同步并自动重载。首次启动跟随系统语言（无法识别时回退 **简体中文**）。

菜单栏还有 **MCP** 菜单：顶部一行显示当前状态（`● MCP 服务运行中` / `○ 图形模式` + 端口），**MCP 状态…** 查看 Agent 连接情况，**连接 / 注册…** 一键生成配置（复制到剪贴板，可写入 Claude Desktop），**复制连接配置** 直接拷贝。

### 2. MCP 模式（给 Agent 用）
由 MCP 客户端自动以 `--mcp` 参数拉起，Agent 通过 15 个工具控制脑图。
**默认会弹出一个实时窗口**（标题“MindMap MCP — Agent 实时视图”），你能直接看着 Agent 增删改节点、换布局/主题，窗口不抢占焦点。
若想后台静默运行（不弹窗），在注册配置的 `env` 里加 `"MCP_HEADLESS": "1"`，再用 `get_mindmap` / `export_mindmap` 取结果。

---

## 三、把它注册给你的 AI 客户端

任选一种。注册后**重启客户端**生效；Claude Code 里可用 `/mcp` 确认 `mind-map` 已连接。

### 方式 A：注册助手（最简单）
在安装目录里**双击 `register.cmd`**：
- 弹窗显示配置，并**自动复制到剪贴板**；
- 若检测到 Claude Desktop，可**一键写入**其配置（会先备份为 `.bak`）。

等价命令：`"MindMap MCP.exe" --register`。

### 方式 B：写进指定配置文件（适合 Claude Code）
Claude Code 用项目级 `.mcp.json` 或全局 `~/.claude.json`。命令会按当前安装路径自动生成正确配置并合并（保留已有项、自动 `.bak`）：

```bat
set ELECTRON_RUN_AS_NODE=1
"C:\<安装目录>\MindMap MCP.exe" "C:\<安装目录>\resources\app\register-mcp.js" --merge "C:\path\to\.mcp.json"
```

不带 `--merge` 则打印片段；`--out <file>` 写一个独立 `.mcp.json`。源码开发态用 `npm run register`。

### 方式 C：手动粘贴
**打包版**（自包含，无需 Node）：

```json
{
  "mcpServers": {
    "mind-map": {
      "command": "C:\\<安装目录>\\MindMap MCP.exe",
      "args": ["C:\\<安装目录>\\resources\\app\\mcp-wrapper.js", "--mcp"],
      "env": { "ELECTRON_RUN_AS_NODE": "1", "MCP_WS_PORT": "19527" }
    }
  }
}
```

**源码开发版**（需本机有 Node）：

```json
{
  "mcpServers": {
    "mind-map": {
      "command": "node",
      "args": ["electron/mcp-wrapper.js", "--mcp"],
      "env": { "MCP_WS_PORT": "19527" }
    }
  }
}
```

---

## 四、在 Agent 里怎么用

直接用自然语言，Agent 会自动选择并调用工具。例如：

- “生成一张『2025 产品路线图』的脑图，要 4 个一级分支” → `set_mindmap`
- “给根节点加三个子节点：调研、设计、开发” → `add_node`
- “把布局换成鱼骨图，主题换成 avocado” → `set_layout` / `set_theme`
- “把这张脑图导出成 markdown 给我” → `export_mindmap`
- “搜索包含『预算』的节点” → `search_nodes`
- “刚才那步撤销” → `undo`

精细编辑前，让 Agent 先 `get_mindmap` 拿到结构和各节点 **UID**，再按 UID 改。

---

## 五、工具一览（15 个）

| 类别 | 工具 | 说明 |
|---|---|---|
| 读取 | `get_mindmap` | 取整张脑图（json 或 markdown） |
| | `get_node_detail` | 按 UID 取单个节点详情 |
| | `search_nodes` | 按关键词搜索节点 |
| 写入 | `set_mindmap` | 用新数据**替换整张**脑图 |
| | `add_node` | 给某节点加子节点 |
| | `add_sibling_node` | 在某节点后插入兄弟节点 |
| | `edit_node` | 改节点文本 / 样式 / 数据（超链接、备注、图标、标签等） |
| | `delete_node` | 删除一个或多个节点 |
| | `move_node` | 把节点移动到新父节点下 |
| 样式/布局 | `set_theme` | 切换主题（default / avocado / classic… ） |
| | `set_layout` | 切换布局（逻辑结构图 / 思维导图 / 鱼骨图 / 时间轴…） |
| | `set_node_style` | 设置单节点样式（颜色、字号、边框、形状…） |
| 导出/历史 | `export_mindmap` | 导出 markdown / json / svg |
| | `undo` / `redo` | 撤销 / 重做 |

---

## 六、常见问题

- **首次启动慢**：MCP 模式要等内部 Electron 实例起来并连上 WebSocket（最多约 30 秒），之后调用即时。
- **端口冲突**：默认 WebSocket 端口 `19527`。被占用就在注册配置的 `env` 里改 `MCP_WS_PORT`（注册值与运行值需一致）。
- **MCP 实时窗口**：MCP 模式默认弹出实时窗口，可直接看 Agent 编辑；不想要就在 `env` 里设 `MCP_HEADLESS=1` 改为后台离屏运行，再用 `get_mindmap` / `export_mindmap` 取结果。
- **SmartScreen 警告**：未签名导致，见第一节；签名方案见 [README.md](README.md)。
- **卸载**：开始菜单的卸载项，或 设置 → 应用 → 卸载。

---

## 七、开发 / 源码构建

克隆源码后：`cd electron && npm install && npm run test:mcp`（端到端自测）、`npm start`（图形界面）、`npm run build:exe`（打包）。详见 [README.md](README.md)。

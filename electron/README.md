# MindMap MCP (Electron desktop + embedded MCP server)

思绪思维导图桌面版，内置 MCP 服务，让 Agent 可直接读写/操控脑图。

## 架构

```
Agent ──stdio JSON-RPC── mcp-wrapper.js ──WebSocket(127.0.0.1:19527)── Electron(main.js)
                          (Node 进程)                                   └─ 注入 preload-bridge.js
                                                                          操控 window.__mindMap 实例
```

- `mcp-wrapper.js` — MCP 入口。启动 WebSocket 服务、拉起 Electron 子进程、在 stdio 上跑 MCP（15 个工具）。
- `main.js` — Electron 主进程。`--mcp` 模式下离屏加载脑图页面，轮询 `window.__mindMap` 就绪后注入桥接脚本。
- `preload-bridge.js` — 注入到页面里的命令处理器，直接操作 MindMap 实例。
- `test-mcp.js` — 端到端测试。

两种运行模式：
- **GUI**：`electron .`（或安装后的 exe 不带参数）——正常脑图编辑界面。
- **MCP**：`node mcp-wrapper.js --mcp`（或安装后的 exe + `--mcp`）——离屏窗口 + stdio MCP 服务。

## 开发

```bash
npm install
npm run test:mcp     # 端到端测试（会离屏拉起 Electron）
npm start            # GUI 模式
npm run start:mcp    # MCP 模式（stdio）
```

开发态注册（项目根 `.mcp.json`，已配置）：

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

## 打包

```bash
npm run build:exe    # = 先构建 web，再 electron-builder --win
# 或跳过 web 重建（dist 已最新）：
./node_modules/.bin/electron-builder --win --config electron-builder.yml
```

产物在 `electron/dist_electron/`（已 gitignore，不会污染提交的 web `../dist`）。

图标：`resources/icon.ico`（256×256，由 `resources/make-icon.js` 生成的 PNG 经 app-builder 转换而来）。想换图标就改 `make-icon.js` 重跑，再用 app-builder 转 ico，或直接替换 `resources/icon.png` 让 electron-builder 自动转换。

### 打包后如何注册 MCP（关键）

打包后整个 app 就是 Electron 二进制。利用 `ELECTRON_RUN_AS_NODE=1` 让该 exe 当作 Node 运行 `mcp-wrapper.js`，wrapper 再以 GUI 模式拉起同一个 exe —— 全程自包含，**无需用户另装 Node**。

安装后在 MCP 客户端里这样注册（路径按实际安装目录替换）：

```json
{
  "mcpServers": {
    "mind-map": {
      "command": "C:\\Program Files\\MindMap MCP\\MindMap MCP.exe",
      "args": ["C:\\Program Files\\MindMap MCP\\resources\\app\\mcp-wrapper.js", "--mcp"],
      "env": { "ELECTRON_RUN_AS_NODE": "1", "MCP_WS_PORT": "19527" }
    }
  }
}
```

> `asar: false`，所以 `mcp-wrapper.js` 以普通文件位于 `resources/app/` 下，可被 `ELECTRON_RUN_AS_NODE` 直接执行。

## MCP 工具（15 个）

读取：`get_mindmap` `get_node_detail` `search_nodes`
写入：`set_mindmap` `add_node` `add_sibling_node` `edit_node` `delete_node` `move_node`
样式/布局：`set_theme` `set_layout` `set_node_style`
导出/历史：`export_mindmap` `undo` `redo`

# MindMap MCP (Electron desktop + embedded MCP server)

思绪思维导图桌面版，内置 MCP 服务，让 Agent 可直接读写/操控脑图。

> 终端用户的安装与使用见 [USAGE.md](USAGE.md)。本文件面向开发者（架构 / 构建 / 打包 / CI / 签名）。

## 架构

```
Agent ──stdio JSON-RPC── mcp-wrapper.js ──WebSocket(127.0.0.1:19527)── Electron(main.js)
                          (Node 进程)                                   └─ 注入 preload-bridge.js
                                                                          操控 window.__mindMap 实例
```

- `mcp-wrapper.js` — MCP 入口。启动 WebSocket 服务、拉起 Electron 子进程、在 stdio 上跑 MCP（15 个工具）。
- `main.js` — Electron 主进程。`--mcp` 模式下加载脑图页面（默认可见实时窗口，`MCP_HEADLESS=1` 则离屏），轮询 `window.__mindMap` 就绪后注入桥接脚本。
- `preload-bridge.js` — 注入到页面里的命令处理器，直接操作 MindMap 实例。
- `menu.js` — 本地原生菜单（多语言：简体 / 繁體 / English / Tiếng Việt，默认简体；语言菜单切换会同步 web 界面语言）。含 **MCP 菜单**：状态显示、连接/注册、复制配置、使用说明（`help.js` 生成各客户端连接配置：Claude Code/Desktop、Cursor、Trae、Codex(TOML)、Windsurf、Cline）。
- `workspace.js` — 工作空间（一个 `.smm` 文件夹）共享模块，**MCP 工具与 GUI 文件树共用同一目录**（`~/MindMaps`，可经 `MCP_WORKSPACE`/`set_workspace` 改，记忆在 `~/.mindmap-mcp/config.json`）。
- `file-panel.js` — 注入式工作区文件树侧边栏（Shadow DOM 隔离），经 `preload-early.js` 暴露的 `window.mmFiles`（IPC 到主进程 fs）读写文件。
- `ai-proxy.js` — 本地 AI 中转（127.0.0.1:3456），主进程**自动启动**，把 web 端的 AI 请求转发到白名单外部服务（火山方舟 / OpenAI / Anthropic），含 SSRF 防护（域名白名单 + 私有 IP 拦截）。让桌面版 AI 开箱可用，无需单独跑 `web/scripts/ai.js`。
- `test-mcp.js` — 端到端测试。

两种运行模式：
- **GUI**：`electron .`（或安装后的 exe 不带参数）——正常脑图编辑界面。
- **MCP**：`node mcp-wrapper.js --mcp`（或安装后的 exe + `--mcp`）——默认弹出实时窗口看 Agent 操作（`MCP_HEADLESS=1` 改为离屏后台）+ stdio MCP 服务。

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

#### 方式一：注册助手（推荐）

安装目录里随包附带了 `register.cmd` 和 `register-mcp.js`，会**按当前安装路径自动生成正确配置**，不用手填路径：

- **双击 `register.cmd`**（在安装目录）：弹窗显示配置、自动复制到剪贴板，若检测到 Claude Desktop 还可一键写入其配置（会先备份 `.bak`）。等价于运行 `"MindMap MCP.exe" --register`。
- **命令行**（写入指定配置文件，适合 Claude Code 的 `.mcp.json` 或 `~/.claude.json`）：
  ```bat
  set ELECTRON_RUN_AS_NODE=1
  "MindMap MCP.exe" "resources\app\register-mcp.js" --merge "C:\path\to\.mcp.json"
  ```
  不带 `--merge` 则打印片段；`--out <file>` 写一个独立的 `.mcp.json`。开发态用 `npm run register`。

#### 方式二：手动填写

在 MCP 客户端里这样注册（路径按实际安装目录替换）：

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

## CI 发布与代码签名

工作流 `.github/workflows/release.yml`：打 tag（`v*`）或在 Actions 里手动触发，即用**已提交的 `dist/`** 构建安装包并附到 GitHub Release。
改了 `web/` 源码要先本地重建并提交 `dist/`（web 是 vue-cli4 / webpack4，Node 17+ 需要 legacy OpenSSL flag）：

```bat
cd web && set NODE_OPTIONS=--openssl-legacy-provider && npm run build
```

或手动触发时勾选 `rebuild_web`（CI 里重建）。

签名**默认关闭**（未签名安装包会触发 Windows SmartScreen）。两条接入路线：

### Azure Trusted Signing（CI 推荐，云签，可首次即无警告）

1. Azure 建 Trusted Signing account + certificate profile；建服务主体（App registration），授予 “Trusted Signing Certificate Profile Signer” 角色。
2. 仓库 Secrets 加 `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`。
3. `electron-builder.yml` 的 `win:` 下加：
   ```yaml
   azureSignOptions:
     publisherName: "你的发布者名"
     endpoint: "https://wus2.codesigning.azure.net/"   # 按你的区域改
     codeSigningAccountName: "你的账户名"
     certificateProfileName: "你的证书配置名"
   ```
4. 取消 `release.yml` 里 `env:` 三行注释，重新跑 → 出**已签名**安装包。

### Certum 开源证书（本地 token 签名）

硬件 token 不适合云 CI，本地签即可：SimplySign 接上卡，`electron-builder.yml` 的 `win:` 下加
`certificateSubjectName: "Open Source Developer, 你的名字"`，本地 `npm run build:exe` 完成签名。
要把 Certum 云签接进 CI（signtool hook）再找我。

> OV 级（含 Certum 开源证书）签名后，SmartScreen 声誉仍需靠下载量积累；想首次即无警告用 EV 或 Azure Trusted Signing。

## MCP 工具（23 个）

读取：`get_mindmap` `get_node_detail` `search_nodes`
写入：`set_mindmap` `add_node` `add_sibling_node` `edit_node` `delete_node` `move_node`
样式/布局：`set_theme` `set_layout` `set_node_style`
导出/历史：`export_mindmap` `undo` `redo`
工作空间：`get_workspace` `set_workspace` `list_files` `open_file` `new_file` `save_file` `rename_file` `delete_file`

工作空间是一个存放 `.smm` 文件的文件夹（默认 `~/MindMaps`，可用 `set_workspace` 或环境变量 `MCP_WORKSPACE` 指定，记忆在 `~/.mindmap-mcp/config.json`）。Agent 可借此管理整库脑图：列出 / 打开 / 新建 / 保存 / 重命名 / 删除 —— `open_file`/`save_file` 复用桥接的 `set_mindmap`/`get_mindmap`，文件名限定在工作空间内（禁止路径穿越）。

/**
 * help.js — builds the "MCP 使用说明" help page (HTML) shown from the MCP menu.
 *
 * Pure (no electron deps) so it can be unit-tested. Generates per-client MCP
 * connection configs filled with THIS install's command/args/env, for both the
 * generic JSON `mcpServers` shape (Claude Code/Desktop, Cursor, Trae, Windsurf,
 * Cline…) and Codex's TOML.
 */

const HELP = {
  zh: {
    title: 'MCP 使用说明',
    intro: '把本应用接入支持 MCP 的工具后，AI 即可直接读写、操控脑图。以下配置已按当前安装路径生成，可直接复制。',
    sec1: '一、通用 JSON 配置（大多数工具）',
    sec1lead: '复制下面这段，放进对应工具的配置文件：',
    locTitle: '放置位置',
    sec2: '二、Codex（TOML 格式）',
    sec2lead: '放进 <code>~/.codex/config.toml</code>：',
    sec3: '三、更省事',
    sec3body: '在安装目录双击 <code>register.cmd</code>，可自动生成配置、复制到剪贴板，检测到 Claude Desktop 时还能一键写入。',
    traeLoc: '设置 → MCP → 手动添加（粘贴 JSON）',
    clineLoc: 'MCP 设置里粘贴 JSON',
    copy: '复制', copied: '已复制',
    note: '默认端口 19527；若被占用，改各处的 MCP_WS_PORT 并保持一致。多个工具可共用同一份配置。'
  },
  zhtw: {
    title: 'MCP 使用說明',
    intro: '把本應用接入支援 MCP 的工具後，AI 即可直接讀寫、操控心智圖。以下設定已依目前安裝路徑產生，可直接複製。',
    sec1: '一、通用 JSON 設定（大多數工具）',
    sec1lead: '複製下面這段，放進對應工具的設定檔：',
    locTitle: '放置位置',
    sec2: '二、Codex（TOML 格式）',
    sec2lead: '放進 <code>~/.codex/config.toml</code>：',
    sec3: '三、更省事',
    sec3body: '在安裝目錄雙擊 <code>register.cmd</code>，可自動產生設定、複製到剪貼簿，偵測到 Claude Desktop 時還能一鍵寫入。',
    traeLoc: '設定 → MCP → 手動新增（貼上 JSON）',
    clineLoc: 'MCP 設定裡貼上 JSON',
    copy: '複製', copied: '已複製',
    note: '預設連接埠 19527；若被占用，修改各處的 MCP_WS_PORT 並保持一致。多個工具可共用同一份設定。'
  },
  en: {
    title: 'MCP Usage',
    intro: 'Connect this app to any MCP-capable tool and the AI can read and edit the mind map directly. The configs below are generated for this install — copy as-is.',
    sec1: '1. Generic JSON config (most tools)',
    sec1lead: 'Copy the block below into the tool’s config file:',
    locTitle: 'Where to put it',
    sec2: '2. Codex (TOML)',
    sec2lead: 'Put this in <code>~/.codex/config.toml</code>:',
    sec3: '3. Even easier',
    sec3body: 'Double-click <code>register.cmd</code> in the install folder to generate the config, copy it to the clipboard, and optionally write it into Claude Desktop.',
    traeLoc: 'Settings → MCP → Add manually (paste JSON)',
    clineLoc: 'Paste JSON in MCP settings',
    copy: 'Copy', copied: 'Copied',
    note: 'Default port 19527; if taken, change MCP_WS_PORT everywhere (keep it consistent). Multiple tools can share one config.'
  },
  vi: {
    title: 'Hướng dẫn MCP',
    intro: 'Kết nối ứng dụng này với công cụ hỗ trợ MCP để AI đọc và chỉnh sửa sơ đồ tư duy trực tiếp. Cấu hình bên dưới đã tạo theo đường dẫn cài đặt hiện tại — sao chép nguyên văn.',
    sec1: '1. Cấu hình JSON chung (hầu hết công cụ)',
    sec1lead: 'Sao chép đoạn dưới vào tệp cấu hình của công cụ:',
    locTitle: 'Đặt ở đâu',
    sec2: '2. Codex (TOML)',
    sec2lead: 'Đặt vào <code>~/.codex/config.toml</code>:',
    sec3: '3. Tiện hơn',
    sec3body: 'Nhấp đúp <code>register.cmd</code> trong thư mục cài đặt để tạo cấu hình, sao chép vào clipboard và có thể ghi vào Claude Desktop.',
    traeLoc: 'Cài đặt → MCP → Thêm thủ công (dán JSON)',
    clineLoc: 'Dán JSON trong cài đặt MCP',
    copy: 'Sao chép', copied: 'Đã sao chép',
    note: 'Cổng mặc định 19527; nếu bị chiếm, đổi MCP_WS_PORT ở mọi nơi (giữ nhất quán). Nhiều công cụ có thể dùng chung một cấu hình.'
  }
}

function getHelpLabels(lang) {
  return HELP[lang] || HELP.zh
}

function jsonConfig(entry) {
  return JSON.stringify({ mcpServers: { 'mind-map': entry } }, null, 2)
}

function tomlConfig(entry) {
  const args = (entry.args || []).map(a => JSON.stringify(a)).join(', ')
  const env = Object.entries(entry.env || {})
    .map(([k, v]) => `${k} = ${JSON.stringify(String(v))}`)
    .join(', ')
  let s = '[mcp_servers.mind-map]\n'
  s += `command = ${JSON.stringify(entry.command)}\n`
  s += `args = [${args}]`
  if (env) s += `\nenv = { ${env} }`
  return s
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHelpHtml({ lang, entry }) {
  const t = getHelpLabels(lang)
  const json = jsonConfig(entry)
  const toml = tomlConfig(entry)

  const locations = [
    ['Claude Code', '<code>.mcp.json</code> / <code>~/.claude.json</code>'],
    ['Claude Desktop', '<code>%APPDATA%\\Claude\\claude_desktop_config.json</code>'],
    ['Cursor', '<code>~/.cursor/mcp.json</code>'],
    ['Trae', esc(t.traeLoc)],
    ['Windsurf', '<code>~/.codeium/windsurf/mcp_config.json</code>'],
    ['Cline', esc(t.clineLoc)]
  ]
  const locRows = locations
    .map(([name, loc]) => `<tr><td class="tool">${esc(name)}</td><td>${loc}</td></tr>`)
    .join('')

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    margin: 0; padding: 22px 26px 36px; line-height: 1.6; color: #1f2328; background: #fff; }
  @media (prefers-color-scheme: dark) { body { color: #e6edf3; background: #0d1117; } }
  h1 { font-size: 20px; margin: 0 0 6px; }
  h2 { font-size: 15px; margin: 26px 0 8px; }
  p { margin: 6px 0; }
  .intro { color: #57606a; }
  @media (prefers-color-scheme: dark) { .intro { color: #8b949e; } }
  code { font-family: "Cascadia Code", Consolas, monospace; font-size: 12.5px;
    background: rgba(127,127,127,.16); padding: 1px 5px; border-radius: 4px; }
  .block { position: relative; margin: 8px 0 4px; }
  pre { margin: 0; padding: 12px 14px; overflow-x: auto; border-radius: 8px;
    background: #f6f8fa; border: 1px solid rgba(127,127,127,.25);
    font-family: "Cascadia Code", Consolas, monospace; font-size: 12.5px; }
  @media (prefers-color-scheme: dark) { pre { background: #161b22; } }
  .copy { position: absolute; top: 8px; right: 8px; cursor: pointer;
    font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(127,127,127,.4);
    background: rgba(127,127,127,.12); color: inherit; }
  .copy:hover { background: rgba(127,127,127,.22); }
  table.loc { border-collapse: collapse; margin: 8px 0; font-size: 13px; }
  table.loc td { padding: 4px 14px 4px 0; vertical-align: top; }
  td.tool { font-weight: 600; white-space: nowrap; }
  .note { margin-top: 22px; font-size: 12.5px; color: #57606a;
    border-top: 1px solid rgba(127,127,127,.25); padding-top: 12px; }
  @media (prefers-color-scheme: dark) { .note { color: #8b949e; } }
</style>
</head>
<body>
  <h1>${esc(t.title)}</h1>
  <p class="intro">${esc(t.intro)}</p>

  <h2>${esc(t.sec1)}</h2>
  <p>${esc(t.sec1lead)}</p>
  <div class="block">
    <button class="copy" onclick="cp('j',this)">${esc(t.copy)}</button>
    <pre id="j">${esc(json)}</pre>
  </div>
  <p><b>${esc(t.locTitle)}</b></p>
  <table class="loc">${locRows}</table>

  <h2>${esc(t.sec2)}</h2>
  <p>${t.sec2lead}</p>
  <div class="block">
    <button class="copy" onclick="cp('t',this)">${esc(t.copy)}</button>
    <pre id="t">${esc(toml)}</pre>
  </div>

  <h2>${esc(t.sec3)}</h2>
  <p>${t.sec3body}</p>

  <p class="note">${esc(t.note)}</p>

  <script>
    var COPIED = ${JSON.stringify(t.copied)};
    function cp(id, btn) {
      var el = document.getElementById(id);
      var r = document.createRange();
      r.selectNodeContents(el);
      var s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
      try { document.execCommand('copy'); } catch (e) {}
      s.removeAllRanges();
      var o = btn.textContent; btn.textContent = COPIED;
      setTimeout(function () { btn.textContent = o; }, 1200);
    }
  </script>
</body>
</html>`
}

module.exports = { buildHelpHtml, getHelpLabels }

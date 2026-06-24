/**
 * menu.js — localized native application menu.
 *
 * Mirrors the web app's languages (zh 简体 / zhtw 繁體 / en / vi, default zh).
 * Uses Electron standard roles so undo/redo/clipboard/zoom/etc. work without
 * custom handlers; only the labels are translated. A Language submenu switches
 * both the menu and the web UI (main.js persists the choice + reloads).
 */
const { Menu } = require('electron')

// Same set/codes as web/src/config (langList) and web/src/lang.
const LANGS = [
  { value: 'zh', name: '简体中文' },
  { value: 'zhtw', name: '繁體中文' },
  { value: 'en', name: 'English' },
  { value: 'vi', name: 'Tiếng Việt' }
]

const LABELS = {
  zh: {
    file: '文件', quit: '退出', edit: '编辑', undo: '撤销', redo: '重做',
    cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选',
    view: '视图', reload: '重新加载', forceReload: '强制重新加载', devtools: '开发者工具',
    resetZoom: '实际大小', zoomIn: '放大', zoomOut: '缩小', fullscreen: '全屏',
    window: '窗口', minimize: '最小化', close: '关闭',
    language: '语言', help: '帮助', about: '关于', version: '版本',
    mcp: 'MCP', mcpRunning: 'MCP 服务运行中', mcpGui: '图形模式（未运行 MCP）',
    mcpStatus: 'MCP 状态', mcpConnect: '连接 / 注册…', mcpCopyConfig: '复制连接配置',
    mcpAgentConnected: 'Agent 已连接', mcpAgentDisconnected: 'Agent 未连接',
    mcpPort: '端口', copied: '已复制到剪贴板', mcpHelp: '使用说明…'
  },
  zhtw: {
    file: '檔案', quit: '結束', edit: '編輯', undo: '復原', redo: '重做',
    cut: '剪下', copy: '複製', paste: '貼上', selectAll: '全選',
    view: '檢視', reload: '重新載入', forceReload: '強制重新載入', devtools: '開發者工具',
    resetZoom: '實際大小', zoomIn: '放大', zoomOut: '縮小', fullscreen: '全螢幕',
    window: '視窗', minimize: '最小化', close: '關閉',
    language: '語言', help: '說明', about: '關於', version: '版本',
    mcp: 'MCP', mcpRunning: 'MCP 服務運行中', mcpGui: '圖形模式（未運行 MCP）',
    mcpStatus: 'MCP 狀態', mcpConnect: '連接 / 註冊…', mcpCopyConfig: '複製連接設定',
    mcpAgentConnected: 'Agent 已連接', mcpAgentDisconnected: 'Agent 未連接',
    mcpPort: '連接埠', copied: '已複製到剪貼簿', mcpHelp: '使用說明…'
  },
  en: {
    file: 'File', quit: 'Quit', edit: 'Edit', undo: 'Undo', redo: 'Redo',
    cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
    view: 'View', reload: 'Reload', forceReload: 'Force Reload', devtools: 'Toggle DevTools',
    resetZoom: 'Actual Size', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', fullscreen: 'Toggle Full Screen',
    window: 'Window', minimize: 'Minimize', close: 'Close',
    language: 'Language', help: 'Help', about: 'About', version: 'Version',
    mcp: 'MCP', mcpRunning: 'MCP server running', mcpGui: 'GUI mode (MCP not running)',
    mcpStatus: 'MCP Status', mcpConnect: 'Connect / Register…', mcpCopyConfig: 'Copy config',
    mcpAgentConnected: 'Agent connected', mcpAgentDisconnected: 'Agent not connected',
    mcpPort: 'Port', copied: 'Copied to clipboard', mcpHelp: 'Usage guide…'
  },
  vi: {
    file: 'Tệp', quit: 'Thoát', edit: 'Chỉnh sửa', undo: 'Hoàn tác', redo: 'Làm lại',
    cut: 'Cắt', copy: 'Sao chép', paste: 'Dán', selectAll: 'Chọn tất cả',
    view: 'Xem', reload: 'Tải lại', forceReload: 'Tải lại bắt buộc', devtools: 'Công cụ phát triển',
    resetZoom: 'Kích thước thực', zoomIn: 'Phóng to', zoomOut: 'Thu nhỏ', fullscreen: 'Toàn màn hình',
    window: 'Cửa sổ', minimize: 'Thu nhỏ', close: 'Đóng',
    language: 'Ngôn ngữ', help: 'Trợ giúp', about: 'Giới thiệu', version: 'Phiên bản',
    mcp: 'MCP', mcpRunning: 'MCP đang chạy', mcpGui: 'Chế độ GUI (MCP chưa chạy)',
    mcpStatus: 'Trạng thái MCP', mcpConnect: 'Kết nối / Đăng ký…', mcpCopyConfig: 'Sao chép cấu hình',
    mcpAgentConnected: 'Agent đã kết nối', mcpAgentDisconnected: 'Agent chưa kết nối',
    mcpPort: 'Cổng', copied: 'Đã sao chép', mcpHelp: 'Hướng dẫn…'
  }
}

function getLabels(lang) {
  return LABELS[lang] || LABELS.zh
}

/**
 * @param {object} o
 * @param {string} o.lang            current language code
 * @param {{mode:'mcp'|'gui',port:number}} [o.mcp]  MCP mode/port for the status line
 * @param {(lang:string)=>void} o.onSelectLang  called when a language is picked
 * @param {()=>void} [o.onMcpStatus]   MCP → Status
 * @param {()=>void} [o.onMcpConnect]  MCP → Connect / Register
 * @param {()=>void} [o.onMcpCopyConfig] MCP → Copy config
 * @param {()=>void} o.onAbout       called for Help → About
 */
function buildAppMenu({ lang, mcp, onSelectLang, onMcpStatus, onMcpConnect, onMcpCopyConfig, onMcpHelp, onAbout }) {
  const t = getLabels(lang)
  const mcpRunning = mcp && mcp.mode === 'mcp'
  const mcpStatusLine = `${mcpRunning ? '● ' + t.mcpRunning : '○ ' + t.mcpGui}  ·  ${t.mcpPort} ${mcp ? mcp.port : ''}`
  const template = [
    { label: t.file, submenu: [{ label: t.quit, role: 'quit' }] },
    {
      label: t.edit,
      submenu: [
        { label: t.undo, role: 'undo' },
        { label: t.redo, role: 'redo' },
        { type: 'separator' },
        { label: t.cut, role: 'cut' },
        { label: t.copy, role: 'copy' },
        { label: t.paste, role: 'paste' },
        { label: t.selectAll, role: 'selectAll' }
      ]
    },
    {
      label: t.view,
      submenu: [
        { label: t.reload, role: 'reload' },
        { label: t.forceReload, role: 'forceReload' },
        { label: t.devtools, role: 'toggleDevTools' },
        { type: 'separator' },
        { label: t.resetZoom, role: 'resetZoom' },
        { label: t.zoomIn, role: 'zoomIn' },
        { label: t.zoomOut, role: 'zoomOut' },
        { type: 'separator' },
        { label: t.fullscreen, role: 'togglefullscreen' }
      ]
    },
    {
      label: t.mcp,
      submenu: [
        { label: mcpStatusLine, enabled: false },
        { label: t.mcpStatus + '…', click: () => onMcpStatus && onMcpStatus() },
        { type: 'separator' },
        { label: t.mcpConnect, click: () => onMcpConnect && onMcpConnect() },
        { label: t.mcpCopyConfig, click: () => onMcpCopyConfig && onMcpCopyConfig() },
        { type: 'separator' },
        { label: t.mcpHelp, click: () => onMcpHelp && onMcpHelp() }
      ]
    },
    {
      label: t.language,
      submenu: LANGS.map(l => ({
        label: l.name,
        type: 'radio',
        checked: l.value === lang,
        click: () => onSelectLang && onSelectLang(l.value)
      }))
    },
    {
      label: t.window,
      submenu: [
        { label: t.minimize, role: 'minimize' },
        { label: t.close, role: 'close' }
      ]
    },
    {
      label: t.help,
      submenu: [{ label: t.about, click: () => onAbout && onAbout() }]
    }
  ]
  return Menu.buildFromTemplate(template)
}

module.exports = { LANGS, getLabels, buildAppMenu }

const { app, BrowserWindow, Menu, dialog, clipboard, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { buildAppMenu, getLabels } = require('./menu')
const { devEntry, packagedEntry, fullConfig } = require('./mcp-config')
const { buildHelpHtml } = require('./help')
const ws = require('./workspace')
const { startAiProxy } = require('./ai-proxy')

// IPC for the GUI file-tree panel — same workspace folder as the MCP tools.
let fileIpcReady = false
function registerFileIpc() {
  if (fileIpcReady) return
  fileIpcReady = true
  ws.init()
  ipcMain.handle('mmfiles:getWorkspace', () => ws.getDir())
  ipcMain.handle('mmfiles:setWorkspace', (e, dir) => ws.setDir(dir))
  ipcMain.handle('mmfiles:pickWorkspace', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    return ws.setDir(r.filePaths[0])
  })
  ipcMain.handle('mmfiles:list', () => ws.list())
  ipcMain.handle('mmfiles:read', (e, name) => ws.read(name))
  ipcMain.handle('mmfiles:write', (e, name, data) => ws.write(name, data))
  ipcMain.handle('mmfiles:create', (e, name, data) => ws.create(name, data))
  ipcMain.handle('mmfiles:rename', (e, from, to) => ws.rename(from, to))
  ipcMain.handle('mmfiles:delete', (e, name) => ws.remove(name))
}

const isMcpMode = process.argv.includes('--mcp')
const isRegisterMode = process.argv.includes('--register')
// MCP mode shows a live window by default so you can watch the Agent edit;
// set MCP_HEADLESS=1 to run off-screen (background / unattended use).
const mcpHeadless = isMcpMode && /^(1|true)$/i.test(process.env.MCP_HEADLESS || '')
const mcpVisible = isMcpMode && !mcpHeadless
const WS_PORT = parseInt(process.env.MCP_WS_PORT || '19527')

function getIndexPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'index.html')
  }
  return path.join(__dirname, '..', 'index.html')
}

let mainWindow = null
let currentLang = 'zh' // UI language for the native menu (synced with the web app)

// Build + install the localized native menu for the current language.
function applyMenu(win) {
  Menu.setApplicationMenu(
    buildAppMenu({
      lang: currentLang,
      mcp: { mode: isMcpMode ? 'mcp' : 'gui', port: WS_PORT },
      onSelectLang: lang => selectLang(win, lang),
      onMcpStatus: () => showMcpStatus(),
      onMcpConnect: () => showRegisterDialog(),
      onMcpCopyConfig: () => copyMcpConfig(),
      onMcpHelp: () => showHelp(),
      onAbout: () => showAbout()
    })
  )
}

// Switch language from the native menu: persist it for the web app and reload
// so the web UI follows (its getLang() reads this on startup), then refresh the
// menu so the radio + labels update.
function selectLang(win, lang) {
  currentLang = lang
  if (win && !win.isDestroyed()) {
    win.webContents
      .executeJavaScript(`try{localStorage.setItem('SIMPLE_MIND_MAP_LANG', ${JSON.stringify(lang)})}catch(e){}`)
      .then(() => { if (!win.isDestroyed()) win.webContents.reload() })
      .catch(() => {})
  }
  applyMenu(win)
}

function showAbout() {
  const t = getLabels(currentLang)
  dialog.showMessageBox({
    type: 'info',
    title: t.about,
    message: 'MindMap MCP',
    detail: `${t.version}: ${app.getVersion()}`,
    noLink: true
  })
}

// The `mind-map` MCP server entry for this install (dev = node; packaged = exe
// via ELECTRON_RUN_AS_NODE).
function mcpEntry() {
  const wrapperPath = path.join(app.getAppPath(), 'mcp-wrapper.js')
  return app.isPackaged
    ? packagedEntry(process.execPath, wrapperPath)
    : devEntry(wrapperPath)
}

// Menu: copy the connect config to the clipboard.
function copyMcpConfig() {
  const t = getLabels(currentLang)
  clipboard.writeText(JSON.stringify(fullConfig(mcpEntry()), null, 2))
  dialog.showMessageBox({ type: 'info', noLink: true, title: 'MCP', message: t.copied })
}

// Menu: open the MCP usage guide (per-client connect configs) in a window.
let helpWindow = null
function showHelp() {
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.focus()
    return
  }
  const html = buildHelpHtml({ lang: currentLang, entry: mcpEntry() })
  helpWindow = new BrowserWindow({
    width: 880,
    height: 760,
    title: getLabels(currentLang).mcpHelp.replace(/[.…]+$/, ''),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }
  })
  helpWindow.removeMenu()
  helpWindow.on('closed', () => { helpWindow = null })
  helpWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

// Menu: show live MCP status (mode / port / agent connection).
async function showMcpStatus() {
  const t = getLabels(currentLang)
  let connected = false
  let port = WS_PORT
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const raw = await mainWindow.webContents.executeJavaScript('JSON.stringify(window.__mcpStatus || null)')
      const s = JSON.parse(raw)
      if (s) {
        connected = !!s.connected
        if (s.port) port = s.port
      }
    } catch (e) {
      // ignore
    }
  }
  const mode = isMcpMode ? t.mcpRunning : t.mcpGui
  const agent = isMcpMode ? `\n${connected ? t.mcpAgentConnected : t.mcpAgentDisconnected}` : ''
  dialog.showMessageBox({
    type: 'info', noLink: true, title: t.mcpStatus, message: 'MindMap MCP',
    detail: `${mode}\n${t.mcpPort}: ${port}${agent}`
  })
}

// Map an OS locale (e.g. from app.getLocale()) to one of the supported UI
// languages; falls back to Simplified Chinese.
function mapLocale(loc) {
  const l = (loc || '').toLowerCase()
  if (l.startsWith('zh')) {
    return /tw|hk|mo|hant/.test(l) ? 'zhtw' : 'zh'
  }
  if (l.startsWith('vi')) return 'vi'
  if (l.startsWith('en')) return 'en'
  return 'zh'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: isMcpMode ? 1100 : 1280,
    height: isMcpMode ? 760 : 800,
    show: false, // shown on ready-to-show (inactive in MCP mode, stays hidden if headless)
    ...(mcpHeadless ? { x: -2000, y: -2000 } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload-early.js')
    }
  })

  if (mcpHeadless) {
    mainWindow.setSkipTaskbar(true)
  } else if (mcpVisible) {
    // Label this window as the Agent-driven live view (and stop the page from
    // overwriting that title).
    mainWindow.on('page-title-updated', (e) => {
      e.preventDefault()
      mainWindow.setTitle('MindMap MCP — Agent 实时视图')
    })
  }

  mainWindow.once('ready-to-show', () => {
    if (mcpHeadless) return
    if (mcpVisible) mainWindow.showInactive() // show without stealing focus
    else mainWindow.show()
  })

  applyMenu(mainWindow) // initial localized menu (default zh; resynced after load)
  registerFileIpc()
  startAiProxy() // 本地 AI 中转（127.0.0.1:3456），让桌面版 AI 功能开箱可用

  const indexPath = getIndexPath()
  console.error(`[electron] Loading: ${indexPath}`)
  mainWindow.loadFile(indexPath)

  // 监听页面 console 消息（用于诊断）
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.error(`[page] ${message}`)
  })

  // 页面加载完成后，轮询等待 MindMap 就绪，然后注入 WebSocket 桥接
  mainWindow.webContents.on('did-finish-load', async () => {
    console.error('[electron] Page loaded, waiting for MindMap...')

    // 首次启动（仅 GUI，不打扰 MCP 流程）：按系统语言初始化界面语言，默认简体中文
    if (!isMcpMode) {
      try {
        const inited = await mainWindow.webContents.executeJavaScript(
          "localStorage.getItem('MINDMAP_MCP_LANG_INIT')"
        )
        if (!inited) {
          const detected = mapLocale(app.getLocale())
          await mainWindow.webContents.executeJavaScript(
            `localStorage.setItem('MINDMAP_MCP_LANG_INIT','1');localStorage.setItem('SIMPLE_MIND_MAP_LANG', ${JSON.stringify(detected)})`
          )
          currentLang = detected
          applyMenu(mainWindow)
          // web 默认已落到 zh；若系统语言不同，重载一次让界面应用新语言
          if (detected !== 'zh') {
            mainWindow.webContents.reload()
            return
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 同步本地菜单语言到 web 端已保存的语言
    try {
      const saved = await mainWindow.webContents.executeJavaScript(
        "localStorage.getItem('SIMPLE_MIND_MAP_LANG') || 'zh'"
      )
      if (saved && saved !== currentLang) {
        currentLang = saved
        applyMenu(mainWindow)
      }
    } catch (e) {
      // ignore
    }

    // 等 MindMap 就绪后注入：MCP 桥接（仅 --mcp）+ 文件树面板（可见窗口）
    const needBridge = isMcpMode
    const needPanel = !mcpHeadless
    if (!needBridge && !needPanel) return
    console.error('[electron] waiting for MindMap...')
    const maxAttempts = 100 // 最多等 20 秒
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const hasMindMap = await mainWindow.webContents.executeJavaScript('!!window.__mindMap')
        if (hasMindMap) {
          if (needBridge) { console.error('[electron] injecting MCP bridge...'); await injectBridge() }
          if (needPanel) { console.error('[electron] injecting file panel...'); await injectFilePanel() }
          return
        }
      } catch (e) {
        // ignore
      }
      await new Promise(r => setTimeout(r, 200))
    }
    console.error('[electron] WARNING: MindMap not found after 20s')
  })
}

async function injectBridge() {
  // 读取 preload-bridge.js 的内容，注入到页面上下文
  const bridgePath = path.join(__dirname, 'preload-bridge.js')
  const bridgeCode = fs.readFileSync(bridgePath, 'utf8')

  // 注入桥接代码并执行（传入 WebSocket 端口）
  const wrappedCode = `
    (function() {
      var WS_PORT = ${WS_PORT};
      ${bridgeCode}
    })();
  `
  try {
    await mainWindow.webContents.executeJavaScript(wrappedCode)
    console.error('[electron] WebSocket bridge injected')
  } catch (e) {
    console.error('[electron] Bridge injection failed:', e.message)
  }
}

// 注入工作区文件树侧边栏（Shadow DOM 隔离，使用 window.mmFiles + window.__mindMap）
async function injectFilePanel() {
  try {
    const code = fs.readFileSync(path.join(__dirname, 'file-panel.js'), 'utf8')
    await mainWindow.webContents.executeJavaScript(`(function(){\n${code}\n})();`)
    console.error('[electron] file panel injected')
  } catch (e) {
    console.error('[electron] File panel injection failed:', e.message)
  }
}

// Show the MCP registration dialog (config + clipboard + optional Claude
// Desktop merge). Shared by the --register CLI flow and the MCP menu.
async function showRegisterDialog() {
  const entry = mcpEntry()
  const json = JSON.stringify(fullConfig(entry), null, 2)

  // Save a standalone snippet next to the exe (fall back to userData).
  let snippetPath = path.join(path.dirname(process.execPath), 'mind-map.mcp.json')
  try {
    fs.writeFileSync(snippetPath, json)
  } catch (e) {
    try {
      snippetPath = path.join(app.getPath('userData'), 'mind-map.mcp.json')
      fs.writeFileSync(snippetPath, json)
    } catch (e2) {
      snippetPath = '(写入文件失败)'
    }
  }
  clipboard.writeText(json)

  // Offer to merge into Claude Desktop's config if that app is present.
  const claudeCfg = path.join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json')
  const hasClaude = fs.existsSync(path.dirname(claudeCfg))
  const buttons = hasClaude
    ? ['写入 Claude Desktop 配置', '仅复制/保存片段', '取消']
    : ['仅复制/保存片段', '取消']

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'MindMap MCP 注册',
    message: 'MCP 配置已复制到剪贴板，并保存到：\n' + snippetPath,
    detail: json,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true
  })

  if (hasClaude && response === 0) {
    try {
      let existing = {}
      if (fs.existsSync(claudeCfg)) {
        existing = JSON.parse(fs.readFileSync(claudeCfg, 'utf8'))
        fs.copyFileSync(claudeCfg, claudeCfg + '.bak')
      } else {
        fs.mkdirSync(path.dirname(claudeCfg), { recursive: true })
      }
      existing.mcpServers = existing.mcpServers || {}
      existing.mcpServers['mind-map'] = entry
      fs.writeFileSync(claudeCfg, JSON.stringify(existing, null, 2))
      await dialog.showMessageBox({
        type: 'info', title: '完成', noLink: true,
        message: '已写入 Claude Desktop 配置：\n' + claudeCfg + '\n\n请重启 Claude Desktop 生效。'
      })
    } catch (e) {
      await dialog.showMessageBox({ type: 'error', title: '写入失败', message: e.message, noLink: true })
    }
  }
}

// --register CLI flow: show the dialog, then quit.
async function runRegister() {
  await showRegisterDialog()
  app.quit()
}

app.whenReady().then(() => {
  if (isRegisterMode) return runRegister()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

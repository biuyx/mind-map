const { app, BrowserWindow, Menu, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { buildAppMenu, getLabels } = require('./menu')

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
      onSelectLang: lang => selectLang(win, lang),
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: isMcpMode ? 1100 : 1280,
    height: isMcpMode ? 760 : 800,
    show: false, // shown on ready-to-show (inactive in MCP mode, stays hidden if headless)
    ...(mcpHeadless ? { x: -2000, y: -2000 } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
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

    // 轮询检测 window.__mindMap
    const maxAttempts = 100 // 最多等 20 秒
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const hasMindMap = await mainWindow.webContents.executeJavaScript('!!window.__mindMap')
        if (hasMindMap) {
          console.error('[electron] MindMap found! Injecting WebSocket bridge...')
          await injectBridge()
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

// ===== --register: write/copy the MCP config for this install, then quit =====
async function runRegister() {
  const { dialog, clipboard } = require('electron')
  const { devEntry, packagedEntry, fullConfig } = require('./mcp-config')

  const wrapperPath = path.join(app.getAppPath(), 'mcp-wrapper.js')
  const entry = app.isPackaged
    ? packagedEntry(process.execPath, wrapperPath)
    : devEntry(wrapperPath)
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
  app.quit()
}

app.whenReady().then(() => {
  if (isRegisterMode) return runRegister()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

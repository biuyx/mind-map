const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const isMcpMode = process.argv.includes('--mcp')
const WS_PORT = parseInt(process.env.MCP_WS_PORT || '19527')

function getIndexPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'index.html')
  }
  return path.join(__dirname, '..', 'index.html')
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: isMcpMode ? 800 : 1280,
    height: isMcpMode ? 600 : 800,
    show: !isMcpMode,
    ...(isMcpMode ? { x: -2000, y: -2000 } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  if (isMcpMode) {
    mainWindow.setSkipTaskbar(true)
  }

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

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

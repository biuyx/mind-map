#!/usr/bin/env node
/**
 * MCP Wrapper - 纯 Node.js 进程
 *
 * 架构：Agent ←stdio→ mcp-wrapper ←WebSocket→ Electron (mindmap)
 *
 * 职责：
 *   1. 在 stdin/stdout 上运行 MCP (JSON-RPC) 服务器
 *   2. 启动 WebSocket 服务器用于与 Electron 通信
 *   3. 当使用 --mcp 参数时，自动启动 Electron 子进程（隐藏窗口）
 *   4. 桥接 MCP 工具调用到 Electron 渲染进程的 MindMap 实例
 */

const { spawn } = require('child_process')
const { WebSocketServer, WebSocket } = require('ws')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')

const isMcpMode = process.argv.includes('--mcp')
const WS_PORT = parseInt(process.env.MCP_WS_PORT || '19527')

// ========== Electron 子进程管理 ==========

let electronProcess = null

function startElectron() {
  // Resolve the Electron GUI binary.
  // - Dev: electron lives in node_modules; run main.js as its entry script.
  // - Packaged: this wrapper itself runs under the app exe via
  //   ELECTRON_RUN_AS_NODE=1, so re-launch the same exe (process.execPath) with
  //   no script arg — the packaged app boots main.js from package.json "main".
  const devBin = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe')
  const isPackaged = !fs.existsSync(devBin)
  const electronBin = isPackaged ? process.execPath : devBin

  const args = isPackaged ? [] : [path.join(__dirname, 'main.js')]
  if (isMcpMode) args.push('--mcp')

  // Strip ELECTRON_RUN_AS_NODE so the child boots as a real Electron app
  // (window + renderer), not in node mode inherited from this wrapper.
  const childEnv = {
    ...process.env,
    MCP_WS_PORT: String(WS_PORT),
    ELECTRON_NO_ATTACH_CONSOLE: '1'
  }
  delete childEnv.ELECTRON_RUN_AS_NODE

  electronProcess = spawn(electronBin, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: childEnv
  })

  electronProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[electron] ${chunk}`)
  })

  electronProcess.on('exit', (code) => {
    process.stderr.write(`[wrapper] Electron exited with code ${code}\n`)
    if (isMcpMode) process.exit(code || 0)
  })

  process.on('exit', () => {
    if (electronProcess && !electronProcess.killed) electronProcess.kill()
  })
}

// ========== WebSocket 桥接 ==========

let wsClient = null
const pendingCommands = new Map()
let wsReady = false
let wsReadyResolve = null
const wsReadyPromise = new Promise(resolve => { wsReadyResolve = resolve })

function startWebSocketServer() {
  const wss = new WebSocketServer({ port: WS_PORT })
  process.stderr.write(`[wrapper] WebSocket server listening on ws://127.0.0.1:${WS_PORT}\n`)

  wss.on('connection', (ws) => {
    wsClient = ws
    wsReady = true
    if (wsReadyResolve) {
      wsReadyResolve()
      wsReadyResolve = null
    }
    process.stderr.write('[wrapper] Electron connected via WebSocket\n')

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'result' && msg.requestId) {
          const pending = pendingCommands.get(msg.requestId)
          if (pending) {
            clearTimeout(pending.timer)
            pendingCommands.delete(msg.requestId)
            if (msg.error) {
              pending.reject(new Error(msg.error))
            } else {
              pending.resolve(msg.result)
            }
          }
        }
      } catch (e) {
        process.stderr.write(`[wrapper] WS parse error: ${e.message}\n`)
      }
    })

    ws.on('close', () => {
      wsClient = null
      wsReady = false
      process.stderr.write('[wrapper] Electron disconnected\n')
    })
  })

  return wss
}

/**
 * 向 Electron 渲染进程发送命令并等待结果
 */
function sendCommand(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
      return reject(new Error('WebSocket not connected'))
    }

    const requestId = randomUUID()
    const timer = setTimeout(() => {
      pendingCommands.delete(requestId)
      reject(new Error(`Command timeout: ${method}`))
    }, 30000)

    pendingCommands.set(requestId, { resolve, reject, timer })

    wsClient.send(JSON.stringify({
      type: 'command',
      requestId,
      method,
      params
    }))
  })
}

// ========== MCP Server ==========

function createMcpServer() {
  const server = new McpServer({
    name: 'mind-map',
    version: '1.0.0'
  })

  function call(method, params = {}) {
    return sendCommand(method, params)
  }

  // ===== 读取类工具 =====

  server.tool(
    'get_mindmap',
    'Get the full mind map data (json or markdown format)',
    { format: z.enum(['json', 'markdown']).default('json').describe('Output format') },
    async ({ format }) => {
      const result = await call('get_mindmap', { format })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )

  server.tool(
    'get_node_detail',
    'Get detailed information about a specific node by UID',
    { uid: z.string().describe('Node UID') },
    async ({ uid }) => {
      const result = await call('get_node_detail', { uid })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )

  server.tool(
    'search_nodes',
    'Search mind map nodes by keyword',
    { keyword: z.string().describe('Search keyword') },
    async ({ keyword }) => {
      const result = await call('search_nodes', { keyword })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )

  // ===== 写入类工具 =====

  server.tool(
    'set_mindmap',
    'Replace the entire mind map with new data',
    {
      data: z.object({
        root: z.any().describe('Root node: { data: { text: string }, children: [...] }'),
        layout: z.string().optional().describe('Layout name'),
        theme: z.object({ template: z.string(), config: z.any() }).optional()
      }).describe('Full mind map data')
    },
    async ({ data }) => {
      const result = await call('set_mindmap', { data })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'add_node',
    'Add a child node to a parent node',
    {
      parentUid: z.string().describe('Parent node UID'),
      text: z.string().default('New Node').describe('Node text content')
    },
    async (params) => {
      const result = await call('add_node', params)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'add_sibling_node',
    'Insert a sibling node after the specified node',
    {
      siblingUid: z.string().describe('UID of the sibling node'),
      text: z.string().default('New Node').describe('Node text content')
    },
    async (params) => {
      const result = await call('add_sibling_node', params)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'edit_node',
    'Edit a node: update text, style, or data fields',
    {
      uid: z.string().describe('Node UID'),
      text: z.string().optional().describe('New text content'),
      style: z.record(z.any()).optional().describe('Style properties'),
      data: z.record(z.any()).optional().describe('Additional data fields')
    },
    async (params) => {
      const result = await call('edit_node', params)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'delete_node',
    'Delete one or more nodes by UID',
    { uids: z.array(z.string()).describe('Array of node UIDs to delete') },
    async ({ uids }) => {
      const result = await call('delete_node', { uids })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'move_node',
    'Move a node to become a child of another node',
    {
      uid: z.string().describe('UID of the node to move'),
      targetParentUid: z.string().describe('UID of the new parent node')
    },
    async (params) => {
      const result = await call('move_node', params)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  // ===== 样式/主题类工具 =====

  server.tool(
    'set_theme',
    'Change the mind map theme',
    { theme: z.string().describe('Theme name (default, avocado, classic, classic2, classic3, classic4)') },
    async ({ theme }) => {
      const result = await call('set_theme', { theme })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'set_layout',
    'Change the mind map layout structure',
    {
      layout: z.enum([
        'logicalStructure', 'logicalStructureLeft', 'mindMap',
        'organizationStructure', 'catalogOrganization',
        'timeline', 'timeline2', 'fishbone', 'fishbone2',
        'verticalTimeline', 'verticalTimeline2', 'verticalTimeline3'
      ]).describe('Layout type')
    },
    async ({ layout }) => {
      const result = await call('set_layout', { layout })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'set_node_style',
    'Set style properties on a specific node',
    {
      uid: z.string().describe('Node UID'),
      style: z.record(z.any()).describe('Style properties')
    },
    async (params) => {
      const result = await call('set_node_style', params)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  // ===== 导出类工具 =====

  server.tool(
    'export_mindmap',
    'Export the mind map to markdown, json, or svg format',
    { format: z.enum(['markdown', 'json', 'svg']).default('json').describe('Export format') },
    async ({ format }) => {
      const result = await call('export_mindmap', { format })
      return { content: [{ type: 'text', text: result.data || JSON.stringify(result) }] }
    }
  )

  // ===== 历史操作工具 =====

  server.tool(
    'undo',
    'Undo the last mind map operation',
    {},
    async () => {
      const result = await call('undo')
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'redo',
    'Redo the last undone operation',
    {},
    async () => {
      const result = await call('redo')
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  return server
}

// ========== 启动流程 ==========

async function main() {
  process.stderr.write(`[wrapper] Starting (mode: ${isMcpMode ? 'MCP' : 'GUI'}, ws-port: ${WS_PORT})\n`)

  // 1. 启动 WebSocket 服务器
  startWebSocketServer()

  // 2. 启动 Electron
  startElectron()

  // 3. 等待 Electron 通过 WebSocket 连接
  process.stderr.write('[wrapper] Waiting for Electron to connect...\n')
  await Promise.race([
    wsReadyPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Electron did not connect within 30s')), 30000))
  ])
  process.stderr.write('[wrapper] Electron connected, MCP tools available\n')

  // 4. 启动 MCP 服务器（stdio）
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[wrapper] MCP server ready on stdio\n')
}

main().catch(e => {
  process.stderr.write(`[wrapper] Fatal error: ${e.message}\n`)
  if (electronProcess) electronProcess.kill()
  process.exit(1)
})

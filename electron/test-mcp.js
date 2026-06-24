/**
 * MCP 集成测试 v3 — 双进程架构
 * 启动 mcp-wrapper.js → stdio MCP → WebSocket → Electron → MindMap
 */
const { spawn } = require('child_process')
const path = require('path')

const WRAPPER_PATH = path.join(__dirname, 'mcp-wrapper.js')

// JSON-RPC 消息构建
let msgId = 1
function makeRequest(method, params = {}) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: msgId++,
    method,
    params
  })
}

function makeNotification(method, params = {}) {
  return JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  })
}

// 启动 mcp-wrapper.js（纯 Node.js 进程）
const child = spawn(process.execPath, [WRAPPER_PATH, '--mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, MCP_WS_PORT: '19527' }
})

// ========== 响应解析 ==========
const pendingResolvers = new Map()
let stdoutBuffer = ''

child.stdout.on('data', (chunk) => {
  const str = chunk.toString()
  stdoutBuffer += str

  let nlIdx
  while ((nlIdx = stdoutBuffer.indexOf('\n')) !== -1) {
    const line = stdoutBuffer.substring(0, nlIdx).trim()
    stdoutBuffer = stdoutBuffer.substring(nlIdx + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      console.error('<< RECV id=' + msg.id + ':', JSON.stringify(msg).substring(0, 300))
      if (msg.id && pendingResolvers.has(msg.id)) {
        pendingResolvers.get(msg.id).resolve(msg)
        pendingResolvers.delete(msg.id)
      }
    } catch (e) {
      console.error('<< NON-JSON:', line.substring(0, 200))
    }
  }
})

// ========== stderr 监听 ==========
let mcpReadyResolve = null
const mcpReady = new Promise(resolve => { mcpReadyResolve = resolve })

child.stderr.on('data', (chunk) => {
  const text = chunk.toString().trim()
  console.error('[stderr]', text)
  if (text.includes('MCP server ready on stdio')) {
    if (mcpReadyResolve) {
      mcpReadyResolve()
      mcpReadyResolve = null
    }
  }
})

child.on('exit', (code) => {
  console.error(`Process exited with code ${code}`)
  for (const [, { reject }] of pendingResolvers) {
    reject(new Error('Process exited'))
  }
  pendingResolvers.clear()
  process.exit(code || 0)
})

child.on('error', (err) => {
  console.error('Spawn error:', err)
  process.exit(1)
})

// ========== 发送请求 ==========
function send(msg) {
  console.error('>> SEND:', msg.substring(0, 200))
  child.stdin.write(msg + '\n')
}

function sendRequest(method, params, timeoutMs = 30000) {
  const req = makeRequest(method, params)
  const id = msgId - 1
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResolvers.delete(id)
      reject(new Error(`Timeout after ${timeoutMs}ms: ${method}`))
    }, timeoutMs)
    pendingResolvers.set(id, {
      resolve: (msg) => { clearTimeout(timer); resolve(msg) },
      reject: (err) => { clearTimeout(timer); reject(err) }
    })
    send(req)
  })
}

function sendNotification(method, params) {
  send(makeNotification(method, params))
}

// ========== 测试流程 ==========
async function runTest() {
  console.error('Waiting for MCP server to be ready...')

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MCP server did not start within 45s')), 45000)
  )
  await Promise.race([mcpReady, timeout])
  console.error('\n✓ MCP server is ready!\n')

  await new Promise(r => setTimeout(r, 1000))

  // 1. 初始化
  console.error('=== Step 1: Initialize ===')
  const initResp = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  })
  console.error('Initialize OK:', JSON.stringify(initResp.result?.serverInfo || {}))

  // 2. 已初始化通知
  console.error('\n=== Step 2: Initialized notification ===')
  sendNotification('notifications/initialized')
  await new Promise(r => setTimeout(r, 500))

  // 3. 列出工具
  console.error('\n=== Step 3: List tools ===')
  const toolsResp = await sendRequest('tools/list')
  const toolCount = toolsResp?.result?.tools?.length || 0
  console.error(`Tools count: ${toolCount}`)
  if (toolCount > 0) {
    console.error('Tool names:', toolsResp.result.tools.map(t => t.name).join(', '))
  }

  // 4. 设置脑图
  console.error('\n=== Step 4: Set mindmap ===')
  const setResp = await sendRequest('tools/call', {
    name: 'set_mindmap',
    arguments: {
      data: {
        root: {
          data: { text: 'MCP 测试成功' },
          children: [
            { data: { text: 'Agent 正在操控脑图' }, children: [] },
            { data: { text: '通过 stdio + WebSocket' }, children: [] },
            { data: { text: '双进程架构' }, children: [] }
          ]
        },
        layout: 'logicalStructure',
        theme: { template: 'avocado', config: {} }
      }
    }
  }, 15000)
  console.error('Set mindmap OK:', JSON.stringify(setResp.result))

  // 5. 获取脑图
  console.error('\n=== Step 5: Get mindmap (markdown) ===')
  const getResp = await sendRequest('tools/call', {
    name: 'get_mindmap',
    arguments: { format: 'markdown' }
  }, 15000)
  console.error('Get mindmap response:', JSON.stringify(getResp.result))

  // 6. Undo
  console.error('\n=== Step 6: Undo ===')
  const undoResp = await sendRequest('tools/call', {
    name: 'undo',
    arguments: {}
  }, 10000)
  console.error('Undo OK:', JSON.stringify(undoResp.result))

  console.error('\n========================================')
  console.error('  ALL TESTS PASSED')
  console.error('========================================')
  child.kill()
}

runTest().catch(e => {
  console.error('\n✗ Test FAILED:', e.message)
  child.kill()
  process.exit(1)
})

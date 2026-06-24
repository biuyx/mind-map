/**
 * Validate the PACKAGED exe as an MCP server, invoked exactly like a real
 * post-install .mcp.json would:
 *   command: <unpacked>/MindMap MCP.exe
 *   env:     ELECTRON_RUN_AS_NODE=1, MCP_WS_PORT=19528
 *   args:    <unpacked>/resources/app/mcp-wrapper.js  --mcp
 */
const { spawn } = require('child_process')
const path = require('path')

const UNPACKED = path.join(__dirname, 'dist_electron', 'win-unpacked')
const EXE = path.join(UNPACKED, 'MindMap MCP.exe')
const WRAPPER = path.join(UNPACKED, 'resources', 'app', 'mcp-wrapper.js')

const child = spawn(EXE, [WRAPPER, '--mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', MCP_WS_PORT: '19528', MCP_HEADLESS: '1' }
})

let id = 1
const pending = new Map()
let buf = ''
child.stdout.on('data', c => {
  buf += c.toString()
  let nl
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
    if (!line) continue
    try { const m = JSON.parse(line); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } } catch {}
  }
})
let ready = null
const readyP = new Promise(r => ready = r)
child.stderr.on('data', c => {
  const t = c.toString()
  if (t.includes('MCP server ready on stdio') && ready) { ready(); ready = null }
})
child.on('exit', code => { console.error('child exit', code) })

function req(method, params, ms = 30000) {
  const m = id++
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: m, method, params }) + '\n')
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout ' + method)), ms)
    pending.set(m, v => { clearTimeout(t); res(v) })
  })
}

;(async () => {
  await Promise.race([readyP, new Promise((_, r) => setTimeout(() => r(new Error('not ready in 45s')), 45000))])
  console.error('packaged MCP server ready')
  const init = await req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } })
  console.error('initialize:', JSON.stringify(init.result.serverInfo))
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')
  const tools = await req('tools/list')
  console.error('tools:', tools.result.tools.length)
  const set = await req('tools/call', { name: 'set_mindmap', arguments: { data: { root: { data: { text: '打包版 MCP 验证' }, children: [{ data: { text: 'ELECTRON_RUN_AS_NODE 自包含' }, children: [] }] }, layout: 'logicalStructure', theme: { template: 'avocado', config: {} } } } }, 15000)
  console.error('set_mindmap:', set.result.content[0].text)
  const get = await req('tools/call', { name: 'get_mindmap', arguments: { format: 'markdown' } }, 15000)
  console.error('get_mindmap:', get.result.content[0].text.replace(/\\n/g, ' '))
  console.error('\n==== PACKAGED EXE MCP TEST PASSED ====')
  child.kill()
  process.exit(0)
})().catch(e => { console.error('PACKAGED TEST FAILED:', e.message); child.kill(); process.exit(1) })

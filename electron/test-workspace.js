/**
 * Workspace file-tools test — drives `node mcp-wrapper.js --mcp` with a temp
 * MCP_WORKSPACE and exercises new/list/open/save/rename/delete + path safety.
 */
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const WS = path.join(os.tmpdir(), 'mm-ws-test-' + Date.now())
fs.mkdirSync(WS, { recursive: true })

const child = spawn(process.execPath, [path.join(__dirname, 'mcp-wrapper.js'), '--mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, MCP_WS_PORT: '19540', MCP_HEADLESS: '1', MCP_WORKSPACE: WS }
})

let id = 1
let buf = ''
let ready = false
const pend = new Map()
child.stdout.on('data', d => {
  buf += d
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const ln = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
    if (!ln) continue
    try { const m = JSON.parse(ln); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } } catch (e) {}
  }
})
child.stderr.on('data', d => { if (d.toString().includes('MCP server ready on stdio') && !ready) { ready = true; run() } })

function rpc(method, params) {
  const i = id++
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n')
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 20000)
    pend.set(i, v => { clearTimeout(t); res(v) })
  })
}
async function tool(name, args) {
  const r = (await rpc('tools/call', { name, arguments: args || {} })).result
  let parsed
  try { parsed = JSON.parse(r.content[0].text) } catch (e) { parsed = r.content[0].text }
  return { parsed, isError: !!r.isError, text: r.content[0].text }
}
function ok(c, m) { if (!c) { console.error('✗ FAIL:', m); child.kill(); process.exit(1) } console.error('  ok -', m) }
const f = n => path.join(WS, n)

async function run() {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')

  const tools = (await rpc('tools/list')).result.tools.map(t => t.name)
  const want = ['get_workspace', 'set_workspace', 'list_files', 'open_file', 'new_file', 'save_file', 'rename_file', 'delete_file']
  ok(want.every(t => tools.includes(t)), 'all 8 workspace tools registered (total ' + tools.length + ')')

  let r = await tool('get_workspace')
  ok(r.parsed.workspaceDir === WS && r.parsed.currentFile === null, 'workspace = temp dir, no current file')

  await tool('new_file', { name: 'alpha', data: { root: { data: { text: 'Alpha' }, children: [] }, layout: 'logicalStructure', theme: { template: 'classic4', config: {} } } })
  ok(fs.existsSync(f('alpha.smm')), 'new_file created alpha.smm on disk')

  r = await tool('list_files')
  ok(r.parsed.files.length === 1 && r.parsed.files[0].name === 'alpha.smm' && r.parsed.files[0].current, 'list_files shows alpha.smm as current')

  await tool('set_mindmap', { data: { root: { data: { text: 'Alpha edited' }, children: [{ data: { text: 'child' }, children: [] }] }, layout: 'logicalStructure', theme: { template: 'avocado', config: {} } } })
  await tool('save_file', {})
  ok(/Alpha edited/.test(fs.readFileSync(f('alpha.smm'), 'utf8')), 'save_file wrote edited content to alpha.smm')

  await tool('new_file', { name: 'beta', open: false })
  ok(fs.existsSync(f('beta.smm')), 'new_file beta.smm (open:false)')

  r = await tool('open_file', { name: 'alpha' })
  ok(r.parsed.opened === 'alpha.smm', 'open_file alpha')
  r = await tool('get_mindmap', { format: 'markdown' })
  ok(/Alpha edited/.test(r.text), 'opened content is the saved alpha')

  await tool('rename_file', { from: 'beta', to: 'gamma' })
  ok(fs.existsSync(f('gamma.smm')) && !fs.existsSync(f('beta.smm')), 'rename_file beta -> gamma')

  await tool('delete_file', { name: 'gamma' })
  ok(!fs.existsSync(f('gamma.smm')), 'delete_file gamma')

  r = await tool('list_files')
  ok(r.parsed.files.length === 1 && r.parsed.files[0].name === 'alpha.smm', 'only alpha remains')

  r = await tool('open_file', { name: '../../evil.smm' })
  ok(r.isError, 'path traversal rejected (' + JSON.stringify(r.text).slice(0, 60) + ')')

  console.error('\n==== WORKSPACE TESTS PASSED ====')
  try { fs.rmSync(WS, { recursive: true, force: true }) } catch (e) {}
  child.kill()
  process.exit(0)
}

setTimeout(() => { console.error('✗ overall timeout'); child.kill(); process.exit(1) }, 70000)

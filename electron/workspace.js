/**
 * workspace.js — shared workspace (a folder of .smm files) used by BOTH the MCP
 * wrapper (Agent tools) and the Electron main process (GUI file tree), so the
 * two operate on the same folder. Pure Node fs; no electron deps.
 *
 * Folder resolution: MCP_WORKSPACE env > ~/.mindmap-mcp/config.json > ~/MindMaps.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const CONFIG = path.join(os.homedir(), '.mindmap-mcp', 'config.json')
let dir = ''

function init() {
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) } catch (e) {}
  dir = process.env.MCP_WORKSPACE || cfg.workspaceDir || path.join(os.homedir(), 'MindMaps')
  try { fs.mkdirSync(dir, { recursive: true }) } catch (e) {}
  return dir
}

function getDir() {
  if (!dir) init()
  return dir
}

function setDir(d) {
  dir = d
  fs.mkdirSync(dir, { recursive: true })
  try {
    fs.mkdirSync(path.dirname(CONFIG), { recursive: true })
    fs.writeFileSync(CONFIG, JSON.stringify({ workspaceDir: dir }, null, 2))
  } catch (e) {}
  return dir
}

// Resolve a user-supplied name safely inside the workspace (no path traversal).
function resolve(name) {
  if (!name || typeof name !== 'string') throw new Error('file name is required')
  let base = name.trim()
  if (base === '' || base === '.' || base === '..') throw new Error('invalid file name')
  if (/[\\/]/.test(base)) throw new Error('use a file name only (no path separators)')
  if (!/\.smm$/i.test(base)) base += '.smm'
  return { name: base, full: path.join(getDir(), base) }
}

function list() {
  let entries = []
  try { entries = fs.readdirSync(getDir(), { withFileTypes: true }) } catch (e) { return [] }
  return entries
    .filter(e => e.isFile() && /\.smm$/i.test(e.name))
    .map(e => {
      const full = path.join(getDir(), e.name)
      let size = 0
      let mtime = null
      try { const st = fs.statSync(full); size = st.size; mtime = st.mtime.toISOString() } catch (e2) {}
      return { name: e.name, size, mtime }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function exists(name) { return fs.existsSync(resolve(name).full) }

function read(name) {
  const { full } = resolve(name)
  return JSON.parse(fs.readFileSync(full, 'utf8'))
}

function write(name, dataObj) {
  const { name: base, full } = resolve(name)
  fs.writeFileSync(full, JSON.stringify(dataObj, null, 2))
  return base
}

function create(name, dataObj) {
  const { name: base, full } = resolve(name)
  if (fs.existsSync(full)) throw new Error('file already exists: ' + base)
  const content = dataObj || {
    root: { data: { text: base.replace(/\.smm$/i, '') }, children: [] },
    layout: 'logicalStructure',
    theme: { template: 'classic4', config: {} }
  }
  fs.writeFileSync(full, JSON.stringify(content, null, 2))
  return { name: base, content }
}

function rename(from, to) {
  const a = resolve(from)
  const b = resolve(to)
  if (!fs.existsSync(a.full)) throw new Error('file not found: ' + a.name)
  if (fs.existsSync(b.full)) throw new Error('target already exists: ' + b.name)
  fs.renameSync(a.full, b.full)
  return { from: a.name, to: b.name }
}

function remove(name) {
  const { name: base, full } = resolve(name)
  if (!fs.existsSync(full)) throw new Error('file not found: ' + base)
  fs.unlinkSync(full)
  return base
}

module.exports = { init, getDir, setDir, resolve, list, exists, read, write, create, rename, remove }

#!/usr/bin/env node
/**
 * register-mcp.js — emit / install the `mind-map` MCP server config.
 *
 * Auto-detects whether it runs in dev (plain `node`) or inside the packaged
 * app (via ELECTRON_RUN_AS_NODE) and resolves absolute paths to *this* install,
 * so the printed/merged config is always correct for the current machine.
 *
 * Usage:
 *   node register-mcp.js                 # print the JSON snippet (default)
 *   node register-mcp.js --out <file>    # write a standalone .mcp.json
 *   node register-mcp.js --merge <file>  # merge mind-map into an existing
 *                                        #   JSON config (e.g. a project
 *                                        #   .mcp.json, ~/.claude.json, or
 *                                        #   Claude Desktop config); backs up
 *                                        #   the original to <file>.bak
 *
 * In the packaged app run it via the exe, e.g.:
 *   set ELECTRON_RUN_AS_NODE=1
 *   "MindMap MCP.exe" resources\app\register-mcp.js --print
 */
const path = require('path')
const fs = require('fs')
const { devEntry, packagedEntry, fullConfig } = require('./mcp-config')

const inElectron = !!process.versions.electron
const hasDevElectron = fs.existsSync(path.join(__dirname, 'node_modules', 'electron'))
const isPackaged = inElectron && !hasDevElectron

const wrapperPath = path.join(__dirname, 'mcp-wrapper.js')
const entry = isPackaged
  ? packagedEntry(process.execPath, wrapperPath)
  : devEntry(wrapperPath)
const json = JSON.stringify(fullConfig(entry), null, 2)

const argv = process.argv.slice(2)
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
const out = opt('--out')
const merge = opt('--merge')

function log(...a) { process.stderr.write(a.join(' ') + '\n') }

if (merge) {
  let existing = {}
  if (fs.existsSync(merge)) {
    try {
      existing = JSON.parse(fs.readFileSync(merge, 'utf8'))
    } catch (e) {
      log('ERROR: cannot parse existing config', merge + ':', e.message)
      process.exit(1)
    }
    fs.copyFileSync(merge, merge + '.bak')
    log('backup written:', merge + '.bak')
  } else {
    fs.mkdirSync(path.dirname(merge), { recursive: true })
  }
  existing.mcpServers = existing.mcpServers || {}
  existing.mcpServers['mind-map'] = entry
  fs.writeFileSync(merge, JSON.stringify(existing, null, 2))
  log('merged `mind-map` MCP server into', merge)
} else if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  fs.writeFileSync(out, json)
  log('wrote', out)
} else {
  process.stdout.write(json + '\n')
  log(isPackaged ? '(packaged mode)' : '(dev mode)', '— paste the above into your MCP client config')
}

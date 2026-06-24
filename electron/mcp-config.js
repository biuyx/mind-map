/**
 * mcp-config.js — shared builder for the `mind-map` MCP server config entry.
 * Used by register-mcp.js (CLI) and main.js (--register GUI launcher) so both
 * emit identical config.
 */
const DEFAULT_PORT = process.env.MCP_WS_PORT || '19527'

// Dev: an external `node` runs the wrapper script directly.
function devEntry(wrapperPath, port = DEFAULT_PORT) {
  return {
    command: 'node',
    args: [wrapperPath, '--mcp'],
    env: { MCP_WS_PORT: String(port) }
  }
}

// Packaged: the installed exe runs the wrapper as Node via ELECTRON_RUN_AS_NODE
// (self-contained — the consumer needs no separate Node install).
function packagedEntry(exePath, wrapperPath, port = DEFAULT_PORT) {
  return {
    command: exePath,
    args: [wrapperPath, '--mcp'],
    env: { ELECTRON_RUN_AS_NODE: '1', MCP_WS_PORT: String(port) }
  }
}

function fullConfig(entry, name = 'mind-map') {
  return { mcpServers: { [name]: entry } }
}

module.exports = { DEFAULT_PORT, devEntry, packagedEntry, fullConfig }

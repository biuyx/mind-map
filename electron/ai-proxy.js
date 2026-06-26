/**
 * ai-proxy.js — local AI relay built into the desktop app.
 *
 * The web app posts AI requests to http://127.0.0.1:3456/ai/chat; this forwards
 * them to the external AI service (whitelisted: Volcano Ark / OpenAI / Anthropic)
 * and streams the response back. It exists to solve browser CORS and to keep the
 * SSRF protection from web/scripts/ai.js — but built on Node's http/https only
 * (no express/axios), bound to 127.0.0.1, and started automatically by main.js,
 * so AI works in the packaged app without a separate dev server.
 */
const http = require('http')
const https = require('https')
const net = require('net')
const { URL } = require('url')

// 仅允许这些域名的 AI 服务接口（与 web/scripts/ai.js 保持一致）
const allowedApiHosts = [
  'ark.cn-beijing.volces.com',
  'api.openai.com',
  'api.anthropic.com'
]

function isPrivateIP(ip) {
  const ranges = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^169\.254\./, /^0\./, /^::1$/, /^fe80:/i, /^fc00:/i, /^fd/i
  ]
  return ranges.some(r => r.test(ip))
}

function validateApiUrl(apiUrl) {
  if (!apiUrl || typeof apiUrl !== 'string') return { valid: false, reason: 'API URL 不能为空' }
  let parsed
  try { parsed = new URL(apiUrl) } catch { return { valid: false, reason: 'API URL 格式无效' } }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, reason: `不允许的协议: ${parsed.protocol}` }
  }
  const hostname = parsed.hostname
  if (!allowedApiHosts.some(host => hostname === host || hostname.endsWith('.' + host))) {
    return { valid: false, reason: `API 域名不在白名单中: ${hostname}` }
  }
  if (net.isIP(hostname) && isPrivateIP(hostname)) {
    return { valid: false, reason: '不允许访问私有 IP 地址' }
  }
  return { valid: true }
}

let started = false

function startAiProxy(port = 3456) {
  if (started) return null
  started = true

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin || '*'
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const path = (req.url || '').split('?')[0]

    if (req.method === 'GET' && path === '/ai/test') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ code: 0, data: null, msg: '连接成功' }))
      return
    }

    if (req.method === 'POST' && path === '/ai/chat') {
      let body = ''
      req.on('data', c => {
        body += c
        if (body.length > 5e6) req.destroy() // 防止超大请求
      })
      req.on('end', () => {
        let parsed
        try { parsed = JSON.parse(body) } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid json' }))
          return
        }
        const { api, method = 'POST', headers = {}, data } = parsed
        const v = validateApiUrl(api)
        if (!v.valid) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: v.reason }))
          return
        }
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        const lib = api.startsWith('https:') ? https : http
        const fwd = lib.request(api, { method, headers }, upstream => {
          res.writeHead(upstream.statusCode || 200)
          upstream.pipe(res)
        })
        fwd.setTimeout(60000, () => fwd.destroy(new Error('upstream timeout')))
        fwd.on('error', e => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: e.message }))
          } else {
            res.end()
          }
        })
        if (data !== undefined) fwd.write(typeof data === 'string' ? data : JSON.stringify(data))
        fwd.end()
      })
      return
    }

    res.writeHead(404)
    res.end('Not Found')
  })

  server.on('error', e => {
    // 端口被占用（例如已有实例在跑代理）等情况，记录但不崩溃
    console.error('[ai-proxy] ' + e.code + ': ' + e.message)
  })
  server.listen(port, '127.0.0.1', () => {
    console.error('[ai-proxy] listening on 127.0.0.1:' + port)
  })
  return server
}

module.exports = { startAiProxy, validateApiUrl }

const express = require('express')
const axios = require('axios')
const net = require('net')
const { URL } = require('url')

const port = 3456

// ========== 安全配置 ==========

// CORS 允许的源（仅本地开发环境）
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:8081',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081'
]

// API URL 白名单：仅允许这些域名的 AI 服务接口
const allowedApiHosts = [
  'ark.cn-beijing.volces.com',
  'api.openai.com',
  'api.anthropic.com'
]

/**
 * 检查 IP 是否为私有/保留地址（防止 SSRF 探测内网）
 */
function isPrivateIP(ip) {
  const ranges = [
    /^127\./,              // loopback
    /^10\./,               // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
    /^192\.168\./,         // 192.168.0.0/16
    /^169\.254\./,         // link-local (云元数据)
    /^0\./,                // current network
    /^::1$/,               // IPv6 loopback
    /^fe80:/i,             // IPv6 link-local
    /^fc00:/i,             // IPv6 unique local
    /^fd/i                 // IPv6 unique local
  ]
  return ranges.some(r => r.test(ip))
}

/**
 * 校验 API URL 是否安全
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateApiUrl(apiUrl) {
  if (!apiUrl || typeof apiUrl !== 'string') {
    return { valid: false, reason: 'API URL 不能为空' }
  }

  let parsed
  try {
    parsed = new URL(apiUrl)
  } catch {
    return { valid: false, reason: 'API URL 格式无效' }
  }

  // 仅允许 http/https 协议
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, reason: `不允许的协议: ${parsed.protocol}` }
  }

  // 检查域名白名单
  const hostname = parsed.hostname
  if (!allowedApiHosts.some(host => hostname === host || hostname.endsWith('.' + host))) {
    return { valid: false, reason: `API 域名不在白名单中: ${hostname}` }
  }

  // 解析 IP 并检查是否为私有地址
  const addressInfo = net.isIP(hostname)
  if (addressInfo && isPrivateIP(hostname)) {
    return { valid: false, reason: '不允许访问私有 IP 地址' }
  }

  return { valid: true }
}

// ========== 服务创建 ==========

const isPortUsed = port => {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        resolve(true)
      } else {
        resolve(false)
      }
    })
    server.once('listening', () => {
      server.close(() => resolve(false))
    })
    server.listen(port, '127.0.0.1')
  })
}

const createServe = () => {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // CORS：仅允许白名单内的本地开发源
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin)
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    // 预检请求直接返回
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }
    next()
  })

  // 连接测试
  app.get('/ai/test', (req, res) => {
    res
      .json({
        code: 0,
        data: null,
        msg: '连接成功'
      })
      .end()
  })

  // AI 对话代理（含 SSRF 防护）
  app.post('/ai/chat', async (req, res, next) => {
    const { api, method = 'POST', headers = {}, data } = req.body

    // 校验目标 URL 安全性
    const validation = validateApiUrl(api)
    if (!validation.valid) {
      res.setHeader('Content-Type', 'application/json')
      res.status(403).json({ error: validation.reason }).end()
      return
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    try {
      const response = await axios({
        url: api,
        method,
        headers,
        data,
        responseType: 'stream',
        timeout: 60000 // 60 秒超时，防止慢连接攻击
      })
      response.data.pipe(res)
    } catch (error) {
      next(error)
    }
  })

  // 仅绑定 127.0.0.1，不对外网暴露
  app.listen(port, '127.0.0.1', () => {
    console.log(`app listening on 127.0.0.1:${port}`)
  })
}

isPortUsed(port).then(isUsed => {
  if (isUsed) {
    console.error('端口被占用')
  } else {
    createServe()
  }
})

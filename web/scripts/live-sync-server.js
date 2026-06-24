const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 3457
const FILE_PATH = path.resolve(__dirname, 'live-edit.smm')

// SSE 客户端列表
let clients = []

// 读取当前文件内容
function readData() {
  try {
    return fs.readFileSync(FILE_PATH, 'utf-8')
  } catch {
    return null
  }
}

// 监听文件变化
fs.watchFile(FILE_PATH, { interval: 500 }, () => {
  const data = readData()
  if (data) {
    console.log(`[${new Date().toLocaleTimeString()}] 文件变更，推送给 ${clients.length} 个客户端`)
    clients.forEach(res => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    })
  }
})

// HTTP 服务
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  if (req.url === '/sse') {
    // SSE 端点
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })
    // 发送当前数据
    const data = readData()
    if (data) res.write(`data: ${JSON.stringify(data)}\n\n`)
    clients.push(res)
    req.on('close', () => {
      clients = clients.filter(c => c !== res)
    })
  } else if (req.url === '/data') {
    // 普通获取当前数据
    const data = readData()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(data || '{}')
  } else {
    res.writeHead(404).end('Not Found')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`实时同步服务已启动: http://127.0.0.1:${PORT}`)
  console.log(`监听文件: ${FILE_PATH}`)
  console.log('编辑该文件后，浏览器中的脑图会自动更新')
})

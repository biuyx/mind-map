/**
 * preload-bridge.js
 *
 * 这段代码通过 executeJavaScript 注入到页面上下文中执行，
 * 直接在页面的 JS 环境中运行，因此可以直接访问 window.__mindMap。
 *
 * 变量 WS_PORT 在注入时由 main.js 定义。
 */

var mindMap = window.__mindMap
if (!mindMap) {
  console.log('[bridge] ERROR: __mindMap not found')
  return
}
console.log('[bridge] MindMap found, connecting WebSocket to ws://127.0.0.1:' + WS_PORT)

// 暴露 MCP 连接状态给主进程（菜单状态显示读取）
window.__mcpStatus = { connected: false, port: WS_PORT }

// ========== 辅助函数 ==========

function findNode(mm, uid) {
  if (!uid) return mm.renderer.root
  var node = mm.renderer.findNodeByUid(uid)
  if (!node) throw new Error('Node not found: ' + uid)
  return node
}

function getUid(node) {
  return (node.nodeData && node.nodeData.data && node.nodeData.data.uid) || null
}

var DEFAULT_VIEW = {
  transform: {
    scaleX: 1, scaleY: 1, shear: 0, rotate: 0,
    translateX: 0, translateY: 0, originX: 0, originY: 0,
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0
  },
  state: { scale: 1, x: 0, y: 0, sx: 0, sy: 0 }
}

// ========== 命令处理器 ==========

var handlers = {
  get_mindmap: function(mm, params) {
    var format = (params && params.format) || 'json'
    var data = mm.getData(true)
    if (format === 'markdown') {
      function toMd(node, depth) {
        depth = depth || 1
        var text = (node.data && node.data.text || '').replace(/<[^>]*>/g, '')
        var prefix = depth <= 6 ? '#'.repeat(depth) + ' ' : '* '
        var md = prefix + text + '\n'
        if (node.children) {
          for (var i = 0; i < node.children.length; i++) {
            md += toMd(node.children[i], depth + 1)
          }
        }
        return md
      }
      return { markdown: toMd(data.root, 1) }
    }
    return data
  },

  set_mindmap: function(mm, params) {
    var data = params && params.data
    if (!data || !data.root) throw new Error('data.root is required')
    if (!data.view) data.view = DEFAULT_VIEW
    if (!data.layout) data.layout = 'logicalStructure'
    if (!data.theme) data.theme = { template: 'classic4', config: {} }
    mm.setFullData(data)
    return { success: true }
  },

  add_node: function(mm, params) {
    var parentUid = params && params.parentUid
    var text = (params && params.text) || 'New Node'
    var parentNode = findNode(mm, parentUid)
    mm.execCommand('INSERT_CHILD_NODE', false, [parentNode], { text: text })
    var children = parentNode.nodeData.children || []
    var newChild = children[children.length - 1]
    return { uid: (newChild && newChild.data && newChild.data.uid) || null, success: true }
  },

  add_sibling_node: function(mm, params) {
    var siblingUid = params && params.siblingUid
    var text = (params && params.text) || 'New Node'
    var siblingNode = findNode(mm, siblingUid)
    mm.execCommand('INSERT_NODE', false, [siblingNode], { text: text })
    var parent = siblingNode.parent
    if (parent) {
      var siblings = parent.nodeData.children || []
      var idx = siblings.indexOf(siblingNode.nodeData)
      var newNode = siblings[idx + 1]
      return { uid: (newNode && newNode.data && newNode.data.uid) || null, success: true }
    }
    return { success: true }
  },

  edit_node: function(mm, params) {
    var uid = params && params.uid
    var node = findNode(mm, uid)
    if (params.text !== undefined) {
      mm.execCommand('SET_NODE_TEXT', node, params.text)
    }
    if (params.data && Object.keys(params.data).length > 0) {
      mm.execCommand('SET_NODE_DATA', node, params.data)
    }
    if (params.style && Object.keys(params.style).length > 0) {
      mm.execCommand('SET_NODE_STYLES', node, params.style)
    }
    return { success: true }
  },

  delete_node: function(mm, params) {
    var uids = params && params.uids
    if (!Array.isArray(uids) || uids.length === 0) throw new Error('uids array is required')
    var nodes = uids.map(function(uid) { return findNode(mm, uid) })
    mm.execCommand('REMOVE_NODE', nodes)
    return { success: true }
  },

  move_node: function(mm, params) {
    var node = findNode(mm, params.uid)
    var targetParent = findNode(mm, params.targetParentUid)
    mm.execCommand('MOVE_NODE_TO', node, targetParent)
    return { success: true }
  },

  search_nodes: function(mm, params) {
    var keyword = params && params.keyword
    if (!mm.search) throw new Error('Search plugin not loaded')
    mm.search.search(keyword)
    var matches = (mm.search.matchNodeList || []).map(function(n) {
      return {
        uid: (n.getData && n.getData('uid')) || (n.nodeData && n.nodeData.data && n.nodeData.data.uid),
        text: (n.getData && n.getData('text')) || (n.nodeData && n.nodeData.data && n.nodeData.data.text)
      }
    })
    return { matches: matches, count: matches.length }
  },

  set_theme: function(mm, params) {
    mm.setTheme(params.theme)
    return { success: true }
  },

  set_layout: function(mm, params) {
    mm.setLayout(params.layout)
    return { success: true }
  },

  set_node_style: function(mm, params) {
    var node = findNode(mm, params.uid)
    mm.execCommand('SET_NODE_STYLES', node, params.style)
    return { success: true }
  },

  export_mindmap: function(mm, params) {
    var format = (params && params.format) || 'json'
    if (format === 'json') {
      return { data: JSON.stringify(mm.getData(true), null, 2) }
    }
    if (format === 'markdown') {
      return handlers.get_mindmap(mm, { format: 'markdown' })
    }
    if (format === 'svg') {
      var svgData = mm.getSvgData()
      return { data: svgData.svgHTML || svgData.svg }
    }
    return { data: 'Export to ' + format + ' not supported' }
  },

  undo: function(mm) {
    mm.execCommand('BACK')
    return { success: true }
  },

  redo: function(mm) {
    mm.execCommand('FORWARD')
    return { success: true }
  },

  get_node_detail: function(mm, params) {
    var node = findNode(mm, params.uid)
    var data = node.getData()
    return {
      uid: data.uid,
      text: data.text,
      parentUid: node.parent ? getUid(node.parent) : null,
      childrenCount: (node.nodeData.children || []).length,
      isRoot: !!node.isRoot,
      data: data
    }
  }
}

// ========== WebSocket 连接 ==========

function connectWebSocket() {
  var url = 'ws://127.0.0.1:' + WS_PORT
  console.log('[bridge] Connecting to ' + url)

  var ws = new WebSocket(url)

  ws.onopen = function() {
    console.log('[bridge] WebSocket connected!')
    if (window.__mcpStatus) window.__mcpStatus.connected = true
  }

  ws.onmessage = function(event) {
    try {
      var msg = JSON.parse(event.data)
      if (msg.type === 'command') {
        var requestId = msg.requestId
        var method = msg.method
        var params = msg.params
        try {
          var handler = handlers[method]
          if (!handler) {
            ws.send(JSON.stringify({ type: 'result', requestId: requestId, error: 'Unknown method: ' + method }))
            return
          }
          var result = handler(mindMap, params || {})
          ws.send(JSON.stringify({ type: 'result', requestId: requestId, result: result }))
        } catch (err) {
          ws.send(JSON.stringify({ type: 'result', requestId: requestId, error: err.message }))
        }
      }
    } catch (e) {
      console.log('[bridge] WS message parse error: ' + e.message)
    }
  }

  ws.onclose = function() {
    if (window.__mcpStatus) window.__mcpStatus.connected = false
    console.log('[bridge] WebSocket closed, reconnecting in 3s...')
    setTimeout(connectWebSocket, 3000)
  }

  ws.onerror = function(err) {
    console.log('[bridge] WebSocket error')
  }
}

connectWebSocket()

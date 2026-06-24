/**
 * file-panel.js — injected workspace file-tree sidebar (desktop GUI).
 *
 * Injected into the editor page by main.js. Runs in the page's main world and
 * uses window.__mindMap (load/save the map) + window.mmFiles (preload IPC to the
 * Node-fs workspace, the SAME folder the MCP tools use). Style-isolated in a
 * Shadow DOM so it can't clash with the Vue app.
 */
if (window.__mmPanelInjected) { return }
window.__mmPanelInjected = true

var mm = window.__mindMap
var api = window.mmFiles
if (!mm || !api) { console.log('[panel] missing __mindMap or mmFiles'); return }

var DEFAULT_VIEW = {
  transform: { scaleX: 1, scaleY: 1, shear: 0, rotate: 0, translateX: 0, translateY: 0, originX: 0, originY: 0, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  state: { scale: 1, x: 0, y: 0, sx: 0, sy: 0 }
}
function loadData(d) {
  d = d || {}
  if (!d.root) throw new Error('invalid file: no root')
  if (!d.view) d.view = DEFAULT_VIEW
  if (!d.layout) d.layout = 'logicalStructure'
  if (!d.theme) d.theme = { template: 'classic4', config: {} }
  mm.setFullData(d)
}

var LANG = (function () { try { return localStorage.getItem('SIMPLE_MIND_MAP_LANG') || 'zh' } catch (e) { return 'zh' } })()
var T = ({
  zh: { title: '工作区', pick: '切换目录', refresh: '刷新', pin: '钉住（不自动收起）', save: '保存当前', empty: '还没有脑图，下方输入名字新建', ph: '新建脑图名…', create: '新建', rename: '重命名', del: '删除', confirmDel: '删除「$」？', saved: '已保存', tip: '点文件名打开 · 改动记得保存' },
  zhtw: { title: '工作區', pick: '切換目錄', refresh: '重新整理', pin: '釘住（不自動收合）', save: '儲存目前', empty: '還沒有心智圖，下方輸入名稱新建', ph: '新建心智圖名…', create: '新建', rename: '重新命名', del: '刪除', confirmDel: '刪除「$」？', saved: '已儲存', tip: '點檔名開啟 · 改動記得儲存' },
  en: { title: 'Workspace', pick: 'Folder', refresh: 'Refresh', pin: 'Pin (keep open)', save: 'Save current', empty: 'No maps yet — type a name below', ph: 'New map name…', create: 'New', rename: 'Rename', del: 'Delete', confirmDel: 'Delete "$"?', saved: 'Saved', tip: 'Click a name to open · save your edits' },
  vi: { title: 'Không gian', pick: 'Thư mục', refresh: 'Làm mới', pin: 'Ghim (giữ mở)', save: 'Lưu hiện tại', empty: 'Chưa có sơ đồ — nhập tên bên dưới', ph: 'Tên sơ đồ mới…', create: 'Tạo', rename: 'Đổi tên', del: 'Xoá', confirmDel: 'Xoá "$"?', saved: 'Đã lưu', tip: 'Bấm tên để mở · nhớ lưu' }
})[LANG] || ({}).zh
if (!T.title) T = { title: '工作区', pick: '切换目录', refresh: '刷新', pin: '钉住（不自动收起）', save: '保存当前', empty: '还没有脑图，下方输入名字新建', ph: '新建脑图名…', create: '新建', rename: '重命名', del: '删除', confirmDel: '删除「$」？', saved: '已保存', tip: '点文件名打开 · 改动记得保存' }

var currentName = null
var pinned = (function () { try { return localStorage.getItem('MINDMAP_PANEL_PINNED') === '1' } catch (e) { return false } })()

var host = document.createElement('div')
host.id = '__mm_file_panel_host'
document.body.appendChild(host)
var sh = host.attachShadow({ mode: 'open' })
sh.innerHTML =
  '<style>' +
  ':host{ all: initial; }' +
  '*{ box-sizing: border-box; font-family: -apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }' +
  '.tab{ position: fixed; left: 0; top: 96px; z-index: 2147483000; cursor: pointer; background: #2f6fed; color: #fff; padding: 9px 7px; border-radius: 0 8px 8px 0; font-size: 13px; writing-mode: vertical-rl; letter-spacing: 2px; box-shadow: 0 2px 8px rgba(0,0,0,.25); user-select: none; }' +
  '.panel{ position: fixed; left: 0; top: 0; height: 100vh; width: 252px; z-index: 2147483001; background: #fff; color: #1f2328; border-right: 1px solid rgba(127,127,127,.25); box-shadow: 2px 0 12px rgba(0,0,0,.12); display: flex; flex-direction: column; transform: translateX(-100%); transition: transform .18s ease; }' +
  '.panel.open{ transform: none; }' +
  '@media (prefers-color-scheme: dark){ .panel{ background: #161b22; color: #e6edf3; } }' +
  '.hd{ display: flex; align-items: center; gap: 6px; padding: 10px 10px 8px; border-bottom: 1px solid rgba(127,127,127,.18); }' +
  '.hd .t{ font-weight: 600; font-size: 14px; flex: 1; }' +
  '.hd button,.foot button,.newrow button{ cursor: pointer; border: 1px solid rgba(127,127,127,.4); background: rgba(127,127,127,.1); color: inherit; border-radius: 6px; font-size: 12px; padding: 3px 8px; }' +
  '.hd button:hover,.foot button:hover{ background: rgba(127,127,127,.2); }' +
  '.pin.on{ background:#2f6fed; color:#fff; border-color:#2f6fed; }' +
  '.dir{ font-size: 11px; color: #8b949e; padding: 0 10px 6px; word-break: break-all; }' +
  '.newrow{ display: flex; gap: 6px; padding: 8px 10px; }' +
  '.newrow input{ flex: 1; min-width: 0; padding: 4px 7px; border: 1px solid rgba(127,127,127,.4); border-radius: 6px; background: transparent; color: inherit; font-size: 12.5px; }' +
  '.list{ flex: 1; overflow-y: auto; padding: 2px 6px 8px; }' +
  '.empty{ color: #8b949e; font-size: 12.5px; padding: 14px 8px; }' +
  '.row{ display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }' +
  '.row:hover{ background: rgba(127,127,127,.12); }' +
  '.row.cur{ background: rgba(47,111,237,.16); }' +
  '.row .nm{ flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
  '.row .acts{ display: none; gap: 2px; }' +
  '.row:hover .acts{ display: flex; }' +
  '.row .acts button{ cursor: pointer; border: none; background: transparent; color: inherit; opacity: .65; font-size: 13px; padding: 0 3px; }' +
  '.row .acts button:hover{ opacity: 1; }' +
  '.row input{ flex: 1; min-width: 0; font-size: 13px; padding: 2px 5px; border: 1px solid #2f6fed; border-radius: 4px; background: transparent; color: inherit; }' +
  '.foot{ padding: 8px 10px; border-top: 1px solid rgba(127,127,127,.18); display: flex; align-items: center; gap: 8px; }' +
  '.foot .save{ background: #2f6fed; color: #fff; border-color: #2f6fed; }' +
  '.foot .tip{ font-size: 11px; color: #8b949e; flex: 1; }' +
  '.close{ cursor: pointer; opacity: .6; font-size: 16px; line-height: 1; border: none; background: transparent; color: inherit; }' +
  '.close:hover{ opacity: 1; }' +
  '</style>' +
  '<div class="tab">' + T.title + '</div>' +
  '<div class="panel">' +
  '  <div class="hd"><span class="t">' + T.title + '</span>' +
  '    <button class="pin" title="' + T.pin + '">📌</button>' +
  '    <button class="pick" title="' + T.pick + '">📁</button>' +
  '    <button class="refresh" title="' + T.refresh + '">⟳</button>' +
  '    <button class="close" title="×">×</button>' +
  '  </div>' +
  '  <div class="dir"></div>' +
  '  <div class="newrow"><input class="newname" placeholder="' + T.ph + '"><button class="create">' + T.create + '</button></div>' +
  '  <div class="list"></div>' +
  '  <div class="foot"><button class="save">' + T.save + '</button><span class="tip">' + T.tip + '</span></div>' +
  '</div>'

var $ = function (s) { return sh.querySelector(s) }
var panel = $('.panel')
var listEl = $('.list')
var dirEl = $('.dir')
var newInput = $('.newname')

function toggle(open) { panel.classList.toggle('open', open === undefined ? !panel.classList.contains('open') : open) }
$('.tab').addEventListener('click', function () { toggle(true) })
$('.close').addEventListener('click', function () { if (pinned) setPinned(false); toggle(false) })
$('.refresh').addEventListener('click', refresh)
$('.pick').addEventListener('click', function () {
  api.pickWorkspace().then(function (dir) { if (dir) { currentName = null; refresh() } }).catch(noop)
})
$('.save').addEventListener('click', saveCurrent)
$('.create').addEventListener('click', createFromInput)
newInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') createFromInput() })

var PANEL_W = 252
var pinBtn = $('.pin')
// Pinned = docked: push the editor's .container right by the panel width so the
// panel sits beside the canvas (not over it), then re-fit the map.
function applyDock() {
  var c = document.querySelector('.container')
  if (c) { c.style.transition = 'left .18s ease'; c.style.left = pinned ? PANEL_W + 'px' : '' }
  try { window.dispatchEvent(new Event('resize')) } catch (e) {}
}
function setPinned(v) {
  pinned = v
  try { localStorage.setItem('MINDMAP_PANEL_PINNED', pinned ? '1' : '0') } catch (e) {}
  pinBtn.classList.toggle('on', pinned)
  if (pinned) toggle(true)
  applyDock()
}
pinBtn.addEventListener('click', function () { setPinned(!pinned) })
pinBtn.classList.toggle('on', pinned)

function noop() {}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

function refresh() {
  Promise.all([api.getWorkspace(), api.list()]).then(function (r) {
    dirEl.textContent = r[0]
    render(r[1] || [])
  }).catch(function (e) { console.log('[panel] refresh failed', e) })
}

function render(files) {
  if (!files.length) { listEl.innerHTML = '<div class="empty">' + esc(T.empty) + '</div>'; return }
  listEl.innerHTML = files.map(function (f) {
    var cur = f.name === currentName ? ' cur' : ''
    return '<div class="row' + cur + '" data-name="' + esc(f.name) + '">' +
      '<span class="nm" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
      '<span class="acts">' +
      '<button data-act="rename" title="' + esc(T.rename) + '">✎</button>' +
      '<button data-act="del" title="' + esc(T.del) + '">🗑</button>' +
      '</span></div>'
  }).join('')
}

listEl.addEventListener('click', function (e) {
  var row = e.target.closest('.row')
  if (!row) return
  var name = row.getAttribute('data-name')
  var btn = e.target.closest('button[data-act]')
  if (btn) {
    e.stopPropagation()
    if (btn.getAttribute('data-act') === 'rename') beginRename(row, name)
    else deleteFile(name)
    return
  }
  if (!row.querySelector('input')) openFile(name)
})

function openFile(name) {
  api.read(name).then(function (data) {
    loadData(data)
    currentName = name
    refresh()
    if (!pinned) toggle(false) // pinned: keep the panel open after selecting
  }).catch(function (e) { alert(String(e && e.message || e)) })
}

function saveCurrent() {
  var data
  try { data = mm.getData(true) } catch (e) { alert(String(e)); return }
  if (!currentName) { newInput.focus(); return }
  api.write(currentName, data).then(function () { flash(T.saved) }).catch(function (e) { alert(String(e && e.message || e)) })
}

function createFromInput() {
  var name = (newInput.value || '').trim()
  if (!name) return
  api.create(name).then(function (res) {
    newInput.value = ''
    openFile(res.name)
  }).catch(function (e) { alert(String(e && e.message || e)) })
}

function beginRename(row, name) {
  var nm = row.querySelector('.nm')
  if (!nm) return
  var base = name.replace(/\.smm$/i, '')
  var input = document.createElement('input')
  input.value = base
  nm.replaceWith(input)
  input.focus(); input.select()
  function commit() {
    var to = (input.value || '').trim()
    if (!to || to + '.smm' === name || to === name) { refresh(); return }
    api.rename(name, to).then(function (r) {
      if (currentName === name) currentName = r.to
      refresh()
    }).catch(function (e) { alert(String(e && e.message || e)); refresh() })
  }
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') refresh() })
  input.addEventListener('blur', commit)
}

function deleteFile(name) {
  if (!window.confirm(T.confirmDel.replace('$', name))) return
  api.remove(name).then(function () {
    if (currentName === name) currentName = null
    refresh()
  }).catch(function (e) { alert(String(e && e.message || e)) })
}

var flashTimer = null
function flash(msg) {
  var tip = $('.foot .tip')
  if (!tip) return
  var prev = T.tip
  tip.textContent = msg
  clearTimeout(flashTimer)
  flashTimer = setTimeout(function () { tip.textContent = prev }, 1400)
}

if (pinned) { toggle(true); applyDock() } // remembered pin state: open + dock on launch
refresh()
console.log('[panel] workspace file panel ready (' + LANG + ')')

/**
 * preload-early.js — runs before the page's own scripts.
 *
 * 1) Pre-set web-only flags so notices that only make sense in the browser
 *    don't appear in the desktop client.
 * 2) Expose a safe workspace file API (window.mmFiles) to the page, backed by
 *    IPC to the main process (which owns the workspace folder via Node fs).
 */
const { contextBridge, ipcRenderer } = require('electron')

try {
  // 上游 webTip()：首次进入弹“网页版已暂停更新…请下载客户端”的「重要提示」。
  // 桌面客户端里这条没意义，预置标记让它跳过。
  window.localStorage.setItem('webUseTip', '1')
  console.log('[preload-early] webUseTip=' + window.localStorage.getItem('webUseTip'))
} catch (e) {
  console.log('[preload-early] localStorage failed: ' + e.message)
}

try {
  contextBridge.exposeInMainWorld('mmFiles', {
    getWorkspace: () => ipcRenderer.invoke('mmfiles:getWorkspace'),
    setWorkspace: dir => ipcRenderer.invoke('mmfiles:setWorkspace', dir),
    pickWorkspace: () => ipcRenderer.invoke('mmfiles:pickWorkspace'),
    list: () => ipcRenderer.invoke('mmfiles:list'),
    read: name => ipcRenderer.invoke('mmfiles:read', name),
    write: (name, data) => ipcRenderer.invoke('mmfiles:write', name, data),
    create: (name, data) => ipcRenderer.invoke('mmfiles:create', name, data),
    rename: (from, to) => ipcRenderer.invoke('mmfiles:rename', from, to),
    remove: name => ipcRenderer.invoke('mmfiles:delete', name)
  })
} catch (e) {
  console.log('[preload-early] mmFiles bridge failed: ' + e.message)
}

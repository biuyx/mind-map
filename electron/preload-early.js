/**
 * preload-early.js — runs before the page's own scripts.
 *
 * Pre-set web-only flags so notices that only make sense in the browser don't
 * appear in the desktop client. localStorage is shared with the page (same
 * origin), so the web app's checks see these values when it mounts.
 */
try {
  // 上游 webTip()：首次进入弹“网页版已暂停更新…请下载客户端”的「重要提示」。
  // 桌面客户端里这条没意义，预置标记让它跳过。
  window.localStorage.setItem('webUseTip', '1')
  console.log('[preload-early] webUseTip=' + window.localStorage.getItem('webUseTip'))
} catch (e) {
  console.log('[preload-early] failed: ' + e.message)
}

## mind-map 项目安全审计报告

审计日期：2026-06-23 | 项目：biuyx/mind-map

---

### 严重问题（需立即修复）

**1. AI 代理服务器存在 SSRF 漏洞**
`web/scripts/ai.js` 第 48-68 行

`/ai/chat` 端点接受客户端传入的任意 URL、method、headers 和 body，然后在服务端发起请求并将响应回传。这意味着任何能访问该服务的网页都可以利用它探测内网（如 `http://169.254.169.254/` 云元数据、Redis、内部服务等）。

```js
// 当前代码 — 完全开放的代理
const { api, method = 'POST', headers = {}, data } = req.body
const response = await axios({ url: api, method, headers, data, responseType: 'stream' })
response.data.pipe(res)
```

建议：对 `api` URL 做白名单校验（仅允许 `ark.cn-beijing.volces.com`），拒绝私有 IP 段，并绑定 `127.0.0.1`。

---

**2. AI 代理服务器 CORS 全开**
`web/scripts/ai.js` 第 31-35 行

```js
res.header('Access-Control-Allow-Origin', '*')
res.header('Access-Control-Allow-Methods', '*')
res.header('Access-Control-Allow-Headers', '*')
```

配合 SSRF 漏洞，互联网上任意网站都可以从用户浏览器向本地 AI 服务发起请求。

建议：限制 `Access-Control-Allow-Origin` 为应用的实际域名。

---

### 高危问题

**3. API 端点使用 HTTP 明文传输（含 API Key）**
`web/src/store.js` 第 31 行 / `web/vue.config.js` 第 45 行

```js
api: 'http://ark.cn-beijing.volces.com/api/v3/chat/completions'
target: 'http://ark.cn-beijing.volces.com'
```

用户配置的 Bearer Token 通过 HTTP 明文传输，存在被中间人截获的风险。

建议：默认使用 `https://`，并在用户配置 `http://` 端点时给出安全警告。

---

**4. Nginx 缺失所有安全响应头**
`nginx.conf`

缺少以下关键安全头：X-Frame-Options（防点击劫持）、X-Content-Type-Options（防 MIME 嗅探）、Content-Security-Policy（防 XSS/注入）、Strict-Transport-Security（HSTS）、Referrer-Policy。

建议添加：
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

---

**5. AI Express 服务绑定 0.0.0.0（所有网卡）**
`web/scripts/ai.js` 第 70 行

`app.listen(port)` 未指定 host，默认监听所有网络接口。结合 SSRF + 全开 CORS，该服务对局域网内所有设备暴露。

建议：改为 `app.listen(port, '127.0.0.1')`。

---

### 中危问题

**6. WebSocket 协作服务器无认证**
`simple-mind-map/bin/wsServer.mjs` 第 139-148 行

认证代码仅有注释占位 `// You may check auth of request here..`，未实现任何鉴权。任意客户端可连接并加入任何协作房间。

**7. 51.la 第三方统计脚本无 SRI 校验**
`web/public/index.html` 第 21 行

使用协议相对 URL（`//sdk.51.la/js-sdk-pro.min.js`）加载统计 SDK，HTTP 页面下存在被中间人注入恶意脚本的风险。且无 `integrity` 属性验证脚本完整性。

**8. 无 Content Security Policy**
整个项目缺少 CSP 定义（HTTP 头和 HTML meta 均无），增大了 XSS 攻击面。

**9. Dockerfile 未固定基础镜像版本**
`Dockerfile` 使用 `FROM nginx`（latest），且容器以 root 运行，缺少 `.dockerignore`。

---

### 低危 / 信息泄露

**10. 51.la 追踪 ID 硬编码**
`web/public/index.html`：`id: 'KRO0WxK8GT66tYCQ'`，所有部署环境共用同一统计账户。

**11. 个人邮箱暴露**
`simple-mind-map/package.json`：`email: "1013335014@qq.com"`

**12. 微信号暴露**
`README_MORE_ZH.md` 第 78 行：`微信：wanglinguanfang`

**13. 百度网盘分享链接含提取码**
源码中硬编码了带 `pwd=` 参数的网盘分享链接。

**14. .gitignore 未排除 .env 文件**
如开发者创建 `.env` 存放敏感信息，可能被意外提交。

---

### 安全亮点（做得好的部分）

- 未发现硬编码的 API Key、密码、私钥或云服务凭据
- `productionSourceMap: false` 正确关闭了生产环境 Source Map
- AI 功能的 `key` 字段默认为空，需用户手动配置
- 未发现数据库连接串、OAuth 密钥或 JWT Secret

---

### 修复优先级建议

| 优先级 | 问题 | 工作量 |
|--------|------|--------|
| P0 立即 | SSRF 漏洞 + CORS 全开 + 绑定 0.0.0.0 | 约 30 分钟 |
| P1 本周 | API 端点改 HTTPS + Nginx 安全头 | 约 1 小时 |
| P2 本月 | WebSocket 认证 + CSP + Docker 加固 | 约半天 |
| P3 可选 | 追踪 ID 环境变量化 + .gitignore 补充 | 约 15 分钟 |

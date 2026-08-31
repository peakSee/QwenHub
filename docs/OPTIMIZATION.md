# QwenHub 稳定性优化清单
> 基于 Qwen2API（Qwen-Proxy）对照分析，按优先级排序。

## 一、高优先级（直接提升稳定性）

### 1. 账户级代理支持（Qwen2API 独有，qwengate 完全没有）⭐⭐⭐⭐⭐
Qwen2API 每个账户可绑定独立出站代理（HTTP/HTTPS/SOCKS5），多账户走不同 IP，规避 `chat.qwen.ai` 基于 IP 的关联风控。
- 现状：qwengate 所有账户共用本机 IP——一个 IP 被风控，全部账户一起完蛋（你就撞过 `RGV587_ERROR` 全池被封）。
- 建议：给 `accounts.json` 加 `proxy` 字段；`wreqFetch.ts`/`browserlessFetch.ts` 按 `account.proxy > 全局 PROXY_URL > 直连` 优先级路由；代理 agent 用 LRU 缓存（Qwen2API 用 `proxyAgents` Map + MAX 50）。
- 收益：这是多账户方案里**最重要的一项**，没有它轮询只是分摊频率，IP 依旧单点。

### 2. 传输层错误重试（独立于账户切换的重试）⭐⭐⭐⭐⭐
Qwen2API 的 `sendChatRequest` 有一层**传输级重试**：`ECONNRESET / ECONNREFUSED / ETIMEDOUT / ECONNABORTED / EAI_AGAIN`、`socket hang up` 这类**没拿到 HTTP 响应**的网络错误，按 `chatRetryCount + jitter backoff` 重试（jitter ±25% 打破机器式节奏）。
- 现状：qwengate 只有"换账户重试"（`MAX_ACCOUNT_RETRIES=5`），没有同账户传输重试。
- 建议：在 `wreqFetch.ts` 外再包一层传输重试 + jitter backoff。
- 收益：消除偶发网络抖动导致的 500。

### 3. 首块超时时间可配置化 ⭐⭐⭐
`chat.ts:311` 的 `FIRST_CHUNK_MS = 60_000` 是硬编码。建议挪进 config（`FIRST_CHUNK_TIMEOUT_MS`），配合 `STREAM_IDLE_TIMEOUT_MS` 一起调。你遇到过 300s 卡死，调小能显著降低最坏等待。

### 4. 流中断时自动无缝重试（客户端无感）⭐⭐⭐
现状：流开始后 idle timeout 只能报错（HTTP 头已发出）。Qwen2API 的做法是**错误帧 + 客户端可检测**（SSE 显式错误帧，绝不伪装成 `finish_reason=stop`）。qwengate 已经这么做（正确），但可以更进一步：**在发首个 content chunk 之前断流的话，自动换账户重开**——现在的 first-chunk 60s 保护已覆盖大半，可以把 idle 判定提前到"收到首块后 10s 内无第二块"的激进模式（可配置）。

## 二、中优先级（增强健壮性）

### 5. 会话健康度主动探测 ⭐⭐⭐
Qwen2API 有 `token-manager` 定时批量刷新（`batchRefreshTokens` + 6h 自动刷新周期 + jitter 延迟）。qwengate 是**被动刷新**（请求失败才发现 token 过期）。
- 建议：加一个后台定时器，每 N 小时主动校验各账户 token 剩余有效期，快过期的提前刷新（qwengate 已有 `tokenRefresh.ts` 的 `needsRefresh`/`tryRefreshToken`，只差一个定时调度器）。

### 6. 账户冷却的策略化 ⭐⭐
- 现状：限流冷却固定 `RATE_LIMIT_COOLDOWN_MS=120000`（2 分钟）。
- Qwen2API 有 **TokenManager 健康统计**（valid/expired/expiringSoon/invalid 四态）+ `getTokenHealthStats`。
- 建议：仪表盘账户页显示四态健康度；冷却时间按"日额度撞墙"（hours 级）与"频率限流"（分钟级）区分处理——现在 qwengate 的 usage 页已经统计了 wall-hit，可以把 cooldown 时长从 usage 数据里动态推导。

### 7. 请求队列 + 优先级 ⭐⭐
Qwen2API 的 `QwenApiClient` 用 `ConcurrentLinkedQueue` 串行化请求（`isRequesting` 锁）。qwengate 用 session pool。建议：给 pool 加"每账户最大并发 1"硬限制，防止 harness 并发打爆同一会话。

## 三、低优先级（锦上添花）

### 8. 图片缓存去重 ⭐
Qwen2API 的 `img-caches.js`：同一张图（按 signature 哈希）重复发送时直接复用已上传的 OSS URL，省 STS token + 上传时间。qwengate 每次都重新上传。

### 9. 精确 token 统计 ⭐
Qwen2API 用 tiktoken 精确计数并在 usage 里返回。qwengate 用估算器。对接 Harness 记账用得上。

### 10. 数据持久化模式 ⭐
Qwen2API 支持 `DATA_SAVE_MODE: none/file/redis`。qwengate 只存本地文件。自用够了，暂不需要。

## 四、qwengate 已经领先的地方（不用动）

| 机制 | 说明 |
|---|---|
| **bx-umidtoken 纯 HTTP 提取**（4h TTL 缓存） | 比 Qwen2API 的指纹模拟更贴近真实风控参数 |
| **bx-ua 纯 Node 生成**（复刻 fireyejs token 格式） | 不依赖浏览器生成风控 token |
| **wreq-js（Rust+BoringSSL）TLS 指纹** | 比 Qwen2API 的 axios（Node TLS）指纹更真 |
| **fireyejs 每 30 分钟用 Playwright 刷 acw_tc** | 主动保活 WAF 会话 cookie |
| **session pool + first-chunk 保护 + 换账户重试** | 架构上比 Qwen2API 的简单轮询更完善 |
| **中文仪表盘 + 用量统计/日额度估算** | 可观测性更强 |

## 建议实施顺序

1. **代理支持**（#1）—— 需要你准备 2-3 个代理（哪怕国内 ADSL 拨号/多个 VPN 出口），这是质变
2. **传输级重试 + jitter**（#2）—— 半小时工作量，立竿见影
3. **FIRST_CHUNK/IDLE 超时可配置 + 调小**（#3/#4）—— 改 config 即可
4. **token 主动刷新调度器**（#5）—— 1 小时工作量
5. 其余按需

---

## 实施记录（本轮已完成）

| 项 | 状态 | 说明 |
|---|---|---|
| #1 代理支持 | ✅ 已实施 | `AccountEntry.proxy` 字段 + `accounts.json` 持久化 + `PROXY_URL` 全局配置 + `wreq-worker` 按 proxy 创建会话 + `browserlessFetch/qwen.ts` 全链路透传。**填代理地址即可生效** |
| #2 传输级重试 | ✅ 已实施 | `wreqFetch` 外层重试（默认 2 次，ECONNRESET/ETIMEDOUT/socket hang up 等，±25% jitter 退避） |
| #3 超时可配置 | ✅ 已实施 | `FIRST_CHUNK_TIMEOUT_MS` 进 config.json（默认 60s）；`STREAM_IDLE_TIMEOUT_MS` 本就可配 |
| #4 主动刷新调度器 | ✅ 已实施 | `refreshScheduler.ts`：每 30 分钟扫全池，快过期的 token 自动提前刷新，boot 后 15s 首扫 |
| Session 池化 | ⛔ 尝试后回退 | wreq-js Session 跨请求复用会"Session has been closed"，保守回退为每请求新建（原作者方案，已验证稳定）。代理支持不依赖池化，不受影响 |

**压测结果**：回退后连续 5 请求 5 成功（7~25s/条），`tsc --noEmit` 零错误。

**使用代理**：`config.json` 全局填 `"PROXY_URL": "http://ip:port"`，或请求 `POST /api/accounts` 时带 `proxy` 字段给单账户绑定。

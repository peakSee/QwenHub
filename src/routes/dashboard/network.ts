import { sidebarHtml } from './sidebar.ts';

export const networkHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QwenHub — 网络调试</title>
  <link rel="stylesheet" href="/dashboard/static/shared.css">
  <link rel="stylesheet" href="/dashboard/static/network.css">


</head>
<body>

<div class="dashboard-layout">
  ${sidebarHtml('network')}
  <main class="main-content">

<div class="page-header">
  <h1>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
    网络调试
    <span class="count-badge" id="entryCount">0</span>
  </h1>
</div>

<div class="controls">
  <label style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);font-weight:500">筛选</label>
  <select class="filter-select" id="methodFilter" onchange="onFilterChange()">
    <option value="">全部方法</option>
    <option value="GET">GET</option>
    <option value="POST">POST</option>
    <option value="PUT">PUT</option>
    <option value="PATCH">PATCH</option>
    <option value="DELETE">DELETE</option>
  </select>
  <select class="filter-select" id="statusFilter" onchange="onFilterChange()">
    <option value="">全部状态</option>
    <option value="2xx">2xx 成功</option>
    <option value="4xx">4xx 客户端错误</option>
    <option value="5xx">5xx 服务器错误</option>
  </select>
  <select class="filter-select" id="categoryFilter" onchange="onFilterChange()">
    <option value="">全部类别</option>
    <option value="chat">聊天</option>
    <option value="auth">认证</option>
    <option value="models">模型</option>
    <option value="session-create">会话创建</option>
    <option value="session-delete">会话删除</option>
    <option value="settings">设置</option>
    <option value="other">其他</option>
  </select>
  <span class="entry-count" id="filteredCount"></span>
</div>

<div class="net-container" id="netContainer">
  <div class="empty-state" id="netEmpty" style="display:none">暂无网络请求记录</div>
  <div class="error-state" id="netError" style="display:none"></div>
</div>

  </main>
</div>


  <script src="/dashboard/static/shared.js"></script>
  <script src="/dashboard/static/network.js"></script>
</body>
</html>`;

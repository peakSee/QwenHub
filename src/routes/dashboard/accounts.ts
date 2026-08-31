import { sidebarHtml } from './sidebar.ts';

export const accountsHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QwenHub — 账户管理</title>
<link rel="stylesheet" href="/dashboard/static/shared.css">
<link rel="stylesheet" href="/dashboard/static/accounts.css">
</head>
<body>
<div class="dashboard-layout">
${sidebarHtml('accounts')}
  <main class="main-content">
    <div class="page-header">
      <h1>账户管理</h1>
    </div>

    <!-- Error Display -->
    <div class="error-box" id="errorBox"></div>

    <!-- Add Account Form -->
    <div class="panel">
      <div class="panel-header open">
        <span class="panel-title">添加账户</span>
      </div>
      <div class="panel-body open">
        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;background:var(--bg-elevated);padding:10px 14px;border-radius:var(--radius-sm)"><strong>⚠️ 最佳实践：</strong>建议配置 <strong>3 个以上账户</strong> 轮询使用，以绕过冷却限制。请<strong>不要</strong>使用个人千问账户 —— 建议创建专用账户。</div>
        <form class="account-form" id="addForm">
          <input type="email" class="account-input" id="emailInput" placeholder="邮箱" required autocomplete="email">
          <input type="password" class="account-input" id="passwordInput" placeholder="密码" required autocomplete="new-password">
          <button type="submit" class="account-btn" id="addBtn">添加账户</button>
        </form>
      </div>
    </div>

    <!-- Accounts Table -->
    <div class="panel">
      <div class="panel-header open">
        <span class="panel-title">账户列表</span>
        <span id="acctCount" style="font-size:0.7rem;color:var(--text-secondary);font-weight:500"></span>
      </div>
      <div class="panel-body open">
        <div class="tbl-wrap">
          <table id="acctTable">
            <thead>
              <tr>
                <th>邮箱</th>
                <th>认证状态</th>
                <th>进行中</th>
                <th>总请求</th>
                <th>限流</th>
                <th>令牌有效期</th>
                <th>禁用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="acctBody"></tbody>
          </table>
        </div>
        <div class="empty-state" id="emptyState">暂无账户，请在上方添加。</div>
      </div>
    </div>

    <!-- Inline Browser Login Panel (hidden until Login clicked) -->
    <div class="browser-panel" id="browserPanel" style="display:none">
      <div class="browser-panel-header">
        <span class="browser-panel-title">🔐 浏览器登录</span>
        <button class="browser-panel-close" id="browserPanelCloseAll" title="关闭所有标签">&times;</button>
      </div>
      <!-- Tab bar -->
      <div class="browser-tab-bar" id="browserTabBar"></div>
      <!-- Viewport: holds one canvas per tab, shown/hidden by active tab -->
      <div class="browser-viewport-inline" id="browserViewportInline"></div>
      <div class="browser-status-inline" id="browserStatusInline">请选择一个标签</div>
    </div>
  </main>
</div>

<!-- Confirmation Modal -->
<div class="modal-overlay" id="confirmOverlay">
  <div class="modal">
    <h3>移除账户</h3>
    <p>确定要移除 <strong id="confirmEmail"></strong> 吗？此操作不可撤销。</p>
    <div class="modal-actions">
      <button class="modal-cancel" id="confirmNo">取消</button>
      <button class="modal-confirm" id="confirmYes">移除</button>
    </div>
  </div>
</div>

<!-- Toast Container -->
<div class="toast-container" id="toastContainer"></div>

  <script src="/dashboard/static/shared.js"></script>
  <script src="/dashboard/static/accounts.js"></script>
</body>
</html>`;

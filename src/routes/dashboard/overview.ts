import { sidebarHtml } from './sidebar.ts';

export const overviewHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QwenHub — 仪表盘总览</title>
  <link rel="stylesheet" href="/dashboard/static/shared.css">
  <link rel="stylesheet" href="/dashboard/static/overview.css">


</head>
<body>
<div class="dashboard-layout">
${sidebarHtml('overview')}
  <main class="main-content">
    <div class="page-header">
      <h1>仪表盘总览</h1>
      <div class="page-header-right">
        <span class="uptime-text">运行时长: <span id="headerUptime">—</span></span>
      </div>
    </div>

    <div class="overview-grid">
      <div class="overview-left">

        <!-- KPI Grid -->
        <div class="kpi-grid" id="kpiGrid">
          <div class="kpi-card"><span class="kpi-label">账户总数</span><span class="kpi-value" id="kpiTotalAccounts">—</span><span class="kpi-sub" id="kpiTotalAccountsSub"></span></div>
          <div class="kpi-card"><span class="kpi-label">已认证</span><span class="kpi-value" id="kpiAuthenticated">—</span><span class="kpi-sub" id="kpiAuthenticatedSub"></span></div>
          <div class="kpi-card"><span class="kpi-label">活跃会话</span><span class="kpi-value" id="kpiActiveSessions">—</span><span class="kpi-sub" id="kpiActiveSessionsSub"></span></div>
          <div class="kpi-card"><span class="kpi-label">排队中</span><span class="kpi-value" id="kpiQueue">—</span><span class="kpi-sub" id="kpiQueueSub"></span></div>
          <div class="kpi-card"><span class="kpi-label">总请求数</span><span class="kpi-value" id="kpiTotalRequests">—</span><span class="kpi-sub" id="kpiTotalRequestsSub"></span></div>
          <div class="kpi-card"><span class="kpi-label">运行时长</span><span class="kpi-value" id="kpiUptime">—</span><span class="kpi-sub" id="kpiUptimeSub"></span></div>
        </div>

        <!-- Session Pool -->
        <div class="panel">
          <div class="panel-header open" onclick="togglePanel(this)"><span class="panel-title">会话池</span><span class="panel-chevron">▼</span></div>
          <div class="panel-body open">
            <div class="panel-content">
              <div class="pool-grid" id="poolGrid">
                <div class="pool-stat"><div class="pool-stat-value" id="poolActive">—</div><div class="pool-stat-label">使用中</div></div>
                <div class="pool-stat"><div class="pool-stat-value" id="poolWaiting">—</div><div class="pool-stat-label">等待中</div></div>
                <div class="pool-stat"><div class="pool-stat-value" id="poolAvailable">—</div><div class="pool-stat-label">可用</div></div>
                <div class="pool-stat"><div class="pool-stat-value" id="poolTotal">—</div><div class="pool-stat-label">总数</div></div>
              </div>
              <div class="pool-bar"><div class="pool-bar-fill" id="poolBarFill" style="width:0%"></div></div>
            </div>
          </div>
        </div>

        <!-- Model Health -->
        <div class="panel">
          <div class="panel-header open" onclick="togglePanel(this)"><span class="panel-title">模型健康度</span><span class="panel-chevron">▼</span></div>
          <div class="panel-body open">
            <div class="panel-content">
              <div class="tbl-wrap">
                <table id="modelTable">
                  <thead><tr><th>模型</th><th>成功</th><th>错误</th><th>成功率</th><th>最近活动</th></tr></thead>
                  <tbody id="modelBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

      </div>
      <div class="overview-right">

        <!-- System Logs -->
        <div class="panel">
          <div class="panel-header open" onclick="togglePanel(this)"><span class="panel-title">系统日志</span><span class="panel-chevron">▼</span></div>
          <div class="panel-body open">
            <div class="panel-content" id="sysLogsContainer">
              <div class="empty-state" id="sysLogsEmpty">暂无系统日志</div>
            </div>
          </div>
        </div>

      </div>
    </div>
</main>

<div id="notifContainer"></div>



  <script src="/dashboard/static/shared.js"></script>
  <script src="/dashboard/static/overview.js"></script>
</body>
</html>`;

import { sidebarHtml } from './sidebar.ts';

export const monitorHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QwenHub — 监控</title>
  <link rel="stylesheet" href="/dashboard/static/shared.css">
  <link rel="stylesheet" href="/dashboard/static/overview.css">
  <link rel="stylesheet" href="/dashboard/static/monitor.css">

</head>
<body>

<div class="dashboard-layout">
  ${sidebarHtml('monitor')}
  <main class="main-content">
    <div class="page-header">
      <h1>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        监控
      </h1>
      <div class="page-header-right">
        <span class="badge badge-accent" id="entryCountBadge">— 条记录</span>
      </div>
    </div>

    <!-- KPI Grid -->
    <div class="monitor-kpi-grid" id="kpiGrid">
      <div class="kpi-card"><span class="kpi-label">总请求数</span><span class="kpi-value" id="kpiTotalReqs">—</span><span class="kpi-sub" id="kpiTotalReqsSub"></span></div>
      <div class="kpi-card"><span class="kpi-label">成功</span><span class="kpi-value" id="kpiSuccess">—</span><span class="kpi-sub" id="kpiSuccessSub"></span></div>
      <div class="kpi-card"><span class="kpi-label">错误</span><span class="kpi-value" id="kpiErrors">—</span><span class="kpi-sub" id="kpiErrorsSub"></span></div>
      <div class="kpi-card"><span class="kpi-label">平均延迟</span><span class="kpi-value" id="kpiAvgLat">—</span><span class="kpi-sub" id="kpiAvgLatSub"></span></div>
      <div class="kpi-card"><span class="kpi-label">P95 延迟</span><span class="kpi-value" id="kpiP95Lat">—</span><span class="kpi-sub" id="kpiP95LatSub"></span></div>
      <div class="kpi-card"><span class="kpi-label">中位数</span><span class="kpi-value" id="kpiMedianLat">—</span><span class="kpi-sub" id="kpiMedianLatSub"></span></div>
    </div>

    <!-- Mode Comparison -->
    <div class="panel">
      <div class="panel-header open" onclick="togglePanel(this)"><span class="panel-title">模式对比</span><span class="panel-chevron">▼</span></div>
      <div class="panel-body open">
        <div class="panel-content">
          <div class="mode-comparison" id="modeComparison">
            <div class="mode-card">
              <h3><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> 流式</h3>
              <div class="mode-stats">
                <div class="mode-stat"><div class="mode-stat-value" id="modeStrReqs">—</div><div class="mode-stat-label">请求数</div></div>
                <div class="mode-stat"><div class="mode-stat-value" id="modeStrErrors">—</div><div class="mode-stat-label">错误数</div></div>
                <div class="mode-stat"><div class="mode-stat-value" id="modeStrLat">—</div><div class="mode-stat-label">平均延迟</div></div>
              </div>
              <div class="mode-bar-row">
                <span class="mode-bar-label">成功率</span>
                <div class="mode-bar-track"><div class="mode-bar-fill success" id="modeStrBar" style="width:0%"></div></div>
                <span class="mode-bar-num" id="modeStrPct">0%</span>
              </div>
            </div>
            <div class="mode-card">
              <h3><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/></svg> 非流式</h3>
              <div class="mode-stats">
                <div class="mode-stat"><div class="mode-stat-value" id="modeNsReqs">—</div><div class="mode-stat-label">请求数</div></div>
                <div class="mode-stat"><div class="mode-stat-value" id="modeNsErrors">—</div><div class="mode-stat-label">错误数</div></div>
                <div class="mode-stat"><div class="mode-stat-value" id="modeNsLat">—</div><div class="mode-stat-label">平均延迟</div></div>
              </div>
              <div class="mode-bar-row">
                <span class="mode-bar-label">成功率</span>
                <div class="mode-bar-track"><div class="mode-bar-fill success" id="modeNsBar" style="width:0%"></div></div>
                <span class="mode-bar-num" id="modeNsPct">0%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Per-Account Monitoring Table -->
    <div class="panel">
      <div class="panel-header open" onclick="togglePanel(this)"><span class="panel-title">账户维度指标</span><span class="panel-chevron">▼</span></div>
      <div class="panel-body open">
        <div class="panel-content">
          <div class="monitor-info-row">
            <span id="timeRange">正在收集数据...</span>
          </div>
          <div class="monitor-table-wrap" id="acctTableWrap">
            <div class="empty-monitor" id="emptyMonitor">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <h3>暂无监控数据</h3>
              <p>账户开始响应请求后，这里会显示数据。<br>每次请求都会记录延迟、模式和成功状态。</p>
            </div>
            <table class="monitor-table" id="monitorTable" style="display:none">
              <thead>
                <tr>
                  <th>账户</th>
                  <th>总数</th>
                  <th>成功</th>
                  <th>错误</th>
                  <th>成功率</th>
                  <th>平均延迟</th>
                  <th>P95</th>
                  <th>中位数</th>
                  <th>模式</th>
                  <th>近期错误</th>
                </tr>
              </thead>
              <tbody id="monitorBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Error Summary -->
    <div class="panel">
      <div class="panel-header open" onclick="togglePanel(this)"><span class="panel-title">高频错误</span><span class="panel-chevron">▼</span></div>
      <div class="panel-body open">
        <div class="panel-content">
          <div id="errorSummaryContainer">
            <div class="empty-state" id="errorSummaryEmpty">暂无错误记录</div>
            <ul class="error-list" id="errorSummaryList" style="display:none"></ul>
          </div>
        </div>
      </div>
    </div>

  </main>
</div>

  <script src="/dashboard/static/shared.js"></script>
  <script src="/dashboard/static/monitor.js"></script>
</body>
</html>`;

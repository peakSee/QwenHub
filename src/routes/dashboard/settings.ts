import { sidebarHtml } from './sidebar.ts';

export const settingsHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QwenHub — 设置</title>
  <link rel="stylesheet" href="/dashboard/static/shared.css">
  <link rel="stylesheet" href="/dashboard/static/settings.css">


</head>
<body>

<div class="dashboard-layout">
  ${sidebarHtml('settings')}
  <main class="main-content">

<div class="settings-header">
  <h1>设置</h1>
  <button class="save-btn" id="settingsSaveBtn" onclick="saveSettings()">保存修改</button>
</div>

<div class="settings-sections" id="settingsSections"></div>
<div id="settingsMessage"></div>

<div class="toast-container" id="toastContainer"></div>

    <div class="modal-overlay hidden" id="confirmModal">
  <div class="modal-box">
    <div class="modal-header" id="modalHeader">警告</div>
    <div class="modal-body" id="modalBody"></div>
    <div class="modal-footer" id="modalFooter"></div>
  </div>
</div>

  </main>
</div>


  <script src="/dashboard/static/shared.js"></script>
  <script src="/dashboard/static/settings.js"></script>
</body>
</html>`;

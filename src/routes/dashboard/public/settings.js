var settingsData = {};
var originalData = {};

var SETTINGS_SECTIONS = [
  {
    title: '服务器',
    desc: '端口、密钥与安全相关设置。',
    fields: [
      { key: 'PORT', label: 'PORT', type: 'number', restartRequired: true },
      { key: 'API_KEY', label: 'API_KEY', type: 'password' },
    ],
  },
  {
    title: '处理管道',
    desc: '输出转换、流式模式与工具调用行为。',
    fields: [
      { key: 'TOOL_CALLING', label: 'TOOL_CALLING', type: 'checkbox' },
      { key: 'CLEAN_OUTPUT', label: 'CLEAN_OUTPUT', type: 'checkbox' },
      {
        key: 'STREAMING_MODE',
        label: 'STREAMING_MODE',
        type: 'select',
        options: [
          { value: 'auto', label: '自动（跟随客户端）' },
          { value: 'stream', label: '始终流式' },
          { value: 'non-stream', label: '从不流式' },
        ],
      },
      { key: 'MAX_TOOL_CALLS_PER_RESPONSE', label: 'MAX_TOOL_CALLS_PER_RESPONSE', type: 'number' },
    ],
  },
  {
    title: '会话与认证',
    desc: '令牌有效期、刷新窗口与会话清理。',
    fields: [
      { key: 'QWEN_FETCH_TIMEOUT_MS', label: 'QWEN_FETCH_TIMEOUT_MS', type: 'number' },
      { key: 'AUTH_TOKEN_MAX_AGE_MS', label: 'AUTH_TOKEN_MAX_AGE_MS', type: 'number' },
      { key: 'AUTH_REFRESH_BEFORE_MS', label: 'AUTH_REFRESH_BEFORE_MS', type: 'number' },
      { key: 'DELETE_SESSION', label: 'DELETE_SESSION', type: 'checkbox' },
    ],
  },
  {
    title: '限流',
    desc: '冷却与限流，防止账户被封。',
    fields: [{ key: 'RATE_LIMIT_COOLDOWN_MS', label: 'RATE_LIMIT_COOLDOWN_MS', type: 'number' }],
  },
  {
    title: '重试与启动',
    desc: '重试逻辑、退避策略与自动打开仪表盘设置。',
    fields: [
      { key: 'RETRY_ENABLED', label: 'RETRY_ENABLED', type: 'checkbox' },
      { key: 'RETRY_MAX_ATTEMPTS', label: 'RETRY_MAX_ATTEMPTS', type: 'number' },
      { key: 'RETRY_BASE_DELAY_MS', label: 'RETRY_BASE_DELAY_MS', type: 'number' },
      { key: 'RETRY_MAX_DELAY_MS', label: 'RETRY_MAX_DELAY_MS', type: 'number' },
      { key: 'RETRY_BACKOFF_MULTIPLIER', label: 'RETRY_BACKOFF_MULTIPLIER', type: 'number', step: '0.1' },
      { key: 'OPEN_DASHBOARD_ON_START', label: 'OPEN_DASHBOARD_ON_START', type: 'checkbox', restartRequired: true },
    ],
  },
  {
    title: '日志',
    desc: '每请求日志的存储与保留数量。',
    fields: [
      { key: 'SAVE_REQUEST_LOGS', label: 'SAVE_REQUEST_LOGS', type: 'checkbox' },
      { key: 'MAX_LOGS', label: 'MAX_LOGS', type: 'number' },
    ],
  },
  {
    title: 'Claude Code',
    desc: '将 qwenhub 自动配置为 Claude Code 代理，在项目根目录创建 .claude/settings.json。',
    fields: [{ key: 'CLAUDE_CODE_PROXY', label: 'CLAUDE_CODE_PROXY', type: 'checkbox' }],
  },
  {
    title: '系统与账户',
    desc: '系统提示词与账户管理操作。',
    fields: [
      { key: 'USE_CUSTOM_INSTRUCTION', label: 'USE_CUSTOM_INSTRUCTION', type: 'checkbox' },
      { key: 'CUSTOM_INSTRUCTION', label: 'CUSTOM_INSTRUCTION', type: 'text' },
    ],
  },
];

/* ── Render ── */
function renderSettingsForm() {
  var container = document.getElementById('settingsSections');
  var html = '';
  for (var s = 0; s < SETTINGS_SECTIONS.length; s++) {
    var section = SETTINGS_SECTIONS[s];
    html +=
      '<fieldset class="settings-section">' +
      '<div class="settings-section-title">' +
      escHtml(section.title) +
      '</div>' +
      '<p class="settings-section-desc">' +
      escHtml(section.desc) +
      '</p>' +
      '<div class="settings-fields">';
    for (var f = 0; f < section.fields.length; f++) {
      var field = section.fields[f];
      var val = settingsData[field.key] !== undefined ? settingsData[field.key] : '';
      html += renderSettingsField(field, val);
    }
    html += '</div></fieldset>';
  }
  container.innerHTML = html + renderDeleteAllChatsSection() + renderClaudeCodeInfo();
}

function renderDeleteAllChatsSection() {
  return (
    '<div class="settings-section" style="border-color:var(--danger);margin-top:24px">' +
    '<div class="settings-section-title" style="color:var(--danger)">Danger Zone</div>' +
    '<p class="settings-section-desc" style="color:var(--text-secondary)">Irreversible account-wide actions. Proceed with caution.</p>' +
    '<button class="delete-all-btn" onclick="handleDeleteAllChats()">Delete All Chats</button></div>'
  );
}

function renderClaudeCodeInfo() {
  if (!settingsData['CLAUDE_CODE_PROXY'] || settingsData['CLAUDE_CODE_PROXY'] !== 'true') return '';
  var host = settingsData['HOST'] || 'localhost';
  var port = settingsData['PORT'] || '26405';
  var baseUrl = 'http://' + host + ':' + port;
  return (
    '<div class="settings-section" style="margin-top:24px">' +
    '<div class="settings-section-title">Claude Code Proxy Active</div>' +
    '<p class="settings-section-desc">qwenhub is configured as a Claude Code proxy. ' +
    'Set these environment variables when running Claude Code, or the <code>.claude/settings.json</code> file has been auto-configured for you.</p>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:8px">' +
    '<code style="display:block;padding:4px 0">ANTHROPIC_BASE_URL=' +
    baseUrl +
    '</code>' +
    '<code style="display:block;padding:4px 0">ANTHROPIC_AUTH_TOKEN=unused</code>' +
    '</div>' +
    '<p style="margin-top:8px;font-size:0.85em;color:var(--text-secondary)">' +
    'The <code>.claude/settings.json</code> file is auto-created in the project root when this toggle is on, ' +
    'and cleaned up when toggled off.' +
    '</p></div>'
  );
}

async function handleDeleteAllChats() {
  var bodyHtml =
    '<p style="margin:0 0 12px">此操作将<strong>永久删除</strong>所有千问账户的全部对话。</p>' +
    '<p style="margin:0;color:var(--danger)"><strong>此操作不可撤销。</strong></p>';
  var footerHtml =
    '<button class="modal-btn modal-btn-secondary" onclick="hideModal()">Cancel</button>' +
    '<button class="modal-btn modal-btn-primary" id="confirmDeleteBtn" onclick="executeDeleteAllChats()">Yes, delete all</button>';
  showModal('删除所有对话', bodyHtml, footerHtml);
}

function renderSettingsField(field, val) {
  var restartBadge = field.restartRequired
    ? '<span class="restart-badge" title="This setting only takes effect after a server restart">Restart required</span>'
    : '';
  if (field.type === 'action') {
    return (
      '<div class="settings-field" style="grid-column:span 2">' +
      '<label>' +
      escHtml(field.label) +
      '</label>' +
      '<p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 8px">' +
      escHtml(field.desc || '') +
      '</p>' +
      '<button class="save-btn" style="background:var(--danger)" onclick="handleSettingsAction(\'' +
      field.action +
      '\')">' +
      escHtml(field.label) +
      '</button></div>'
    );
  }
  if (field.type === 'checkbox') {
    var checked = val === 'true';
    var trackClass = checked ? ' toggle-track active' : ' toggle-track';
    return (
      '<div class="settings-toggle" data-key="' +
      field.key +
      '" onclick="onToggleClick(this)">' +
      '<span class="' +
      trackClass +
      '">' +
      '<span class="toggle-thumb"></span>' +
      '</span>' +
      '<span class="toggle-label">' +
      escHtml(field.label) +
      '</span>' +
      (field.restartRequired ? '<span class="restart-badge-wrap" id="rb-' + field.key + '">' + restartBadge + '</span>' : '') +
      '</div>'
    );
  }
  if (field.key === 'CUSTOM_INSTRUCTION') {
    return (
      '<div class="settings-field" style="grid-column:span 2">' +
      '<label for="cfg-CUSTOM_INSTRUCTION">' +
      escHtml(field.label) +
      '</label>' +
      (field.restartRequired ? '<span class="restart-badge-wrap" id="rb-' + field.key + '">' + restartBadge + '</span>' : '') +
      '<textarea id="cfg-CUSTOM_INSTRUCTION" data-key="CUSTOM_INSTRUCTION" rows="4" oninput="onFieldChange(this)">' +
      escHtml(val) +
      '</textarea></div>'
    );
  }
  if (field.type === 'select') {
    var opts = '';
    for (var o = 0; o < field.options.length; o++) {
      var opt = field.options[o];
      var sel = opt.value === val ? ' selected' : '';
      opts += '<option value="' + escHtml(opt.value) + '"' + sel + '>' + escHtml(opt.label) + '</option>';
    }
    return (
      '<div class="settings-field">' +
      '<label for="cfg-' +
      field.key +
      '">' +
      escHtml(field.label) +
      '</label>' +
      (field.restartRequired ? '<span class="restart-badge-wrap" id="rb-' + field.key + '">' + restartBadge + '</span>' : '') +
      '<select id="cfg-' +
      field.key +
      '" data-key="' +
      field.key +
      '" onchange="onFieldChange(this)">' +
      opts +
      '</select></div>'
    );
  }
  var inputType = field.type || 'text';
  var stepAttr = field.step ? ' step="' + field.step + '"' : '';
  return (
    '<div class="settings-field">' +
    '<label for="cfg-' +
    field.key +
    '">' +
    escHtml(field.label) +
    '</label>' +
    (field.restartRequired ? '<span class="restart-badge-wrap" id="rb-' + field.key + '">' + restartBadge + '</span>' : '') +
    '<input type="' +
    inputType +
    '" id="cfg-' +
    field.key +
    '" data-key="' +
    field.key +
    '" value="' +
    escHtml(val) +
    '"' +
    stepAttr +
    ' oninput="onFieldChange(this)"></div>'
  );
}

/* ── Change tracking ── */
/* ponytail: toggle is a div with inline onclick, no hidden checkbox/label confusion */
function onToggleClick(container) {
  var key = container.getAttribute('data-key');
  var track = container.querySelector('.toggle-track');
  settingsData[key] = track.classList.contains('active') ? 'false' : 'true';
  track.classList.toggle('active');
  updateRestartBadge(key);
}
function onFieldChange(el) {
  settingsData[el.getAttribute('data-key')] = el.value;
  updateRestartBadge(el.getAttribute('data-key'));
}

/* ── Restart badge: only show when value changed AND field requires restart ── */
function updateRestartBadge(key) {
  var wrap = document.getElementById('rb-' + key);
  if (!wrap) return;
  var badge = wrap.querySelector('.restart-badge');
  var changed = String(settingsData[key]) !== String(originalData[key]);
  if (changed) {
    if (!badge) {
      var el = document.createElement('span');
      el.className = 'restart-badge';
      el.title = 'This setting only takes effect after a server restart';
      el.textContent = '需重启生效';
      wrap.appendChild(el);
    }
  } else {
    if (badge) badge.remove();
  }
}

/* ── Load ── */
async function loadSettings() {
  try {
    var res = await fetch('/api/config', { headers: authHeaders() });
    if (res.ok) {
      var data = await res.json();
      if (data && data.config) {
        settingsData = {};
        originalData = {};
        var keys = Object.keys(data.config);
        for (var i = 0; i < keys.length; i++) {
          var v = data.config[keys[i]];
          settingsData[keys[i]] = v;
          originalData[keys[i]] = v;
        }
      }
    }
  } catch (e) {
    console.error('Settings load error:', e);
  }
  renderSettingsForm();
  // Hide restart badges for fields where value hasn't changed
  setTimeout(function () {
    for (var s = 0; s < SETTINGS_SECTIONS.length; s++) {
      var section = SETTINGS_SECTIONS[s];
      for (var f = 0; f < section.fields.length; f++) {
        if (section.fields[f].restartRequired) {
          updateRestartBadge(section.fields[f].key);
        }
      }
    }
  }, 0);
}

/* ── Save ── */
async function saveSettings() {
  var btn = document.getElementById('settingsSaveBtn');
  btn.disabled = true;
  btn.textContent = '保存中...';
  var msgEl = document.getElementById('settingsMessage');
  try {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
    var res = await fetch('/api/config', {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(settingsData),
    });
    var result = await res.json();
    if (!res.ok) {
      msgEl.innerHTML = '<div class="settings-message error">' + escHtml(result.error || 'Save failed (' + res.status + ')') + '</div>';
    } else {
      if (result.config) {
        var keys = Object.keys(result.config);
        for (var i = 0; i < keys.length; i++) {
          settingsData[keys[i]] = result.config[keys[i]];
        }
        renderSettingsForm();
      }
      msgEl.innerHTML = '<div class="settings-message success">Settings saved successfully.</div>';
      setTimeout(function () {
        msgEl.innerHTML = '';
      }, 4000);
    }
  } catch (e) {
    msgEl.innerHTML = '<div class="settings-message error">' + escHtml(e.message) + '</div>';
  }
  btn.disabled = false;
  btn.textContent = '保存修改';
}

/* ── Modal ── */
function showModal(title, bodyHtml, footerHtml) {
  document.getElementById('modalHeader').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('confirmModal').classList.remove('hidden');
}
function hideModal() {
  document.getElementById('confirmModal').classList.add('hidden');
}

/* ── Actions ── */
async function handleSettingsAction(action) {
  if (action === 'deleteAllChats') {
    var bodyHtml =
      '<p style="margin:0 0 12px">此操作将<strong>永久删除</strong>所有千问账户的全部对话。</p>' +
      '<p style="margin:0;color:var(--danger)"><strong>此操作不可撤销。</strong></p>';
    var footerHtml =
      '<button class="modal-btn modal-btn-secondary" onclick="hideModal()">Cancel</button>' +
      '<button class="modal-btn modal-btn-primary" id="confirmDeleteBtn" onclick="executeDeleteAllChats()">Yes, delete all</button>';
    showModal('删除所有对话', bodyHtml, footerHtml);
  }
}

async function executeDeleteAllChats() {
  var btn = document.getElementById('confirmDeleteBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '删除中...';
  }
  document.getElementById('modalFooter').innerHTML = '<span style="font-size:0.8125rem;color:var(--text-secondary)">Processing...</span>';
  var bodyEl = document.getElementById('modalBody');
  bodyEl.innerHTML = '<div id="deleteProgress"></div>';
  var progressEl = document.getElementById('deleteProgress');
  var doneCount = 0;
  var errorCount = 0;
  try {
    var res = await fetch('/dashboard/accounts/delete-all-chats', { method: 'POST', headers: authHeaders() });
    if (!res.ok) {
      var errBody = '';
      try {
        errBody = await res.text();
      } catch {}
      var errMsg = errBody || 'HTTP ' + res.status;
      try {
        var errJson = JSON.parse(errBody);
        if (errJson.error) errMsg = errJson.error;
      } catch {}
      progressEl.innerHTML = '<div style="color:var(--danger)">Error: ' + escHtml(errMsg) + '</div>';
      var footerHtml = '<button class="modal-btn modal-btn-secondary" onclick="hideModal()">Close</button>';
      document.getElementById('modalFooter').innerHTML = footerHtml;
      return;
    }
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || !line.startsWith('data: ')) continue;
        try {
          var data = JSON.parse(line.slice(6));
          if (data.type === 'result') {
            progressEl.innerHTML +=
              '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-weight:600;color:var(--success)">[OK] Done: ' +
              data.deleted +
              ' / ' +
              data.total +
              ' accounts</div>';
            if (data.errors && data.errors.length > 0) {
              for (var ei = 0; ei < data.errors.length; ei++) {
                progressEl.innerHTML +=
                  '<div style="color:var(--danger);font-size:0.75rem;padding:2px 0">[FAIL] ' + escHtml(data.errors[ei]) + '</div>';
              }
            }
            var footerHtml = '<button class="modal-btn modal-btn-secondary" onclick="hideModal()">Close</button>';
            document.getElementById('modalFooter').innerHTML = footerHtml;
            return;
          }
          if (data.type === 'progress') {
            if (data.status === 'deleting') {
              progressEl.innerHTML +=
                '<div id="prog-' +
                escHtml(data.email.replace(/[@.]/g, '_')) +
                '" style="color:var(--text-secondary);padding:3px 0;font-size:0.75rem">\u2026 ' +
                escHtml(data.email) +
                '...</div>';
            } else if (data.status === 'done') {
              doneCount++;
              var progEl = document.getElementById('prog-' + escHtml(data.email.replace(/[@.]/g, '_')));
              if (progEl) {
                progEl.outerHTML =
                  '<div style="color:var(--success);padding:3px 0;font-size:0.75rem">[OK] ' + escHtml(data.email) + '</div>';
              } else {
                progressEl.innerHTML +=
                  '<div style="color:var(--success);padding:3px 0;font-size:0.75rem">[OK] ' + escHtml(data.email) + '</div>';
              }
            } else if (data.status === 'error') {
              errorCount++;
              var progEl = document.getElementById('prog-' + escHtml(data.email.replace(/[@.]/g, '_')));
              if (progEl) {
                progEl.outerHTML =
                  '<div style="color:var(--danger);padding:3px 0;font-size:0.75rem">[FAIL] ' +
                  escHtml(data.email) +
                  ': ' +
                  escHtml(data.error) +
                  '</div>';
              } else {
                progressEl.innerHTML +=
                  '<div style="color:var(--danger);padding:3px 0;font-size:0.75rem">[FAIL] ' +
                  escHtml(data.email) +
                  ': ' +
                  escHtml(data.error) +
                  '</div>';
              }
            }
            progressEl.scrollTop = progressEl.scrollHeight;
          }
        } catch {}
      }
    }
    /* If stream ended with no result event, show fallback */
    var footerHtml = '<button class="modal-btn modal-btn-secondary" onclick="hideModal()">Close</button>';
    document.getElementById('modalFooter').innerHTML = footerHtml;
    if (doneCount === 0 && errorCount === 0) {
      progressEl.innerHTML = '<div style="color:var(--text-secondary)">No accounts processed. The server may have returned an error.</div>';
    }
  } catch (e) {
    bodyEl.innerHTML = '<p style="color:var(--danger)">Error: ' + escHtml(e.message) + '</p>';
    var footerHtml = '<button class="modal-btn modal-btn-secondary" onclick="hideModal()">Close</button>';
    document.getElementById('modalFooter').innerHTML = footerHtml;
  }
}

function showToast(msg, type) {
  var container = document.getElementById('toastContainer') || document.body;
  var toasts = container.querySelectorAll('.toast');
  while (toasts.length >= 5) {
    toasts[0].remove();
    toasts = container.querySelectorAll('.toast');
  }
  var el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 4000);
}

/* ── Init ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSettings);
} else {
  loadSettings();
}

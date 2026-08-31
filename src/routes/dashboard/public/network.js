function fmtJson(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

function methodBadgeClass(method) {
  var m = (method || 'GET').toUpperCase();
  if (m === 'GET') return 'badge-method-get';
  if (m === 'POST') return 'badge-method-post';
  if (m === 'PUT') return 'badge-method-put';
  if (m === 'DELETE') return 'badge-method-delete';
  if (m === 'PATCH') return 'badge-method-patch';
  return 'badge-neutral';
}

function statusBadgeClass(status) {
  if (status >= 500) return 'badge-danger';
  if (status >= 400) return 'badge-warning';
  if (status >= 200 && status < 300) return 'badge-success';
  return 'badge-neutral';
}

function phaseBadgeClass(phase) {
  if (phase === 'completed') return 'phase-completed';
  if (phase === 'streaming') return 'phase-streaming';
  if (phase === 'error') return 'phase-error';
  return 'phase-pending';
}

function categoryCssClass(cat) {
  if (cat === 'chat') return 'cat-chat';
  if (cat === 'auth') return 'cat-auth';
  if (cat === 'models') return 'cat-models';
  return 'cat-other';
}

function durationClass(ms) {
  if (ms == null) return '';
  return ms > 500 ? 'slow' : 'fast';
}

function truncateUrl(url, maxLen) {
  if (!url) return '\u2014';
  maxLen = maxLen || 60;
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

/* ── State ── */
var allEntries = [];

/* ── Filter ── */
function onFilterChange() {
  renderNetworkEntries(allEntries);
}

function getFilters() {
  return {
    method: document.getElementById('methodFilter').value.toUpperCase(),
    status: document.getElementById('statusFilter').value,
    category: document.getElementById('categoryFilter').value,
  };
}

function matchesFilters(entry, filters) {
  if (filters.method) {
    var method = (entry.request && entry.request.method) || entry.method || 'GET';
    if (method.toUpperCase() !== filters.method) return false;
  }
  if (filters.status) {
    var status = (entry.response && entry.response.status) || entry.status || 0;
    var cat = filters.status;
    if (cat === '2xx' && (status < 200 || status >= 300)) return false;
    if (cat === '4xx' && (status < 400 || status >= 500)) return false;
    if (cat === '5xx' && (status < 500 || status >= 600)) return false;
  }
  if (filters.category) {
    var cat = entry.category || '';
    if (cat !== filters.category) return false;
  }
  return true;
}

/* ── Fetch ── */
async function fetchNetworkEntries() {
  var data = await apiFetch('/debug/network?limit=50');
  var emptyEl = document.getElementById('netEmpty');
  var errorEl = document.getElementById('netError');
  if (!data || !data.entries || !Array.isArray(data.entries)) {
    emptyEl.style.display = '';
    errorEl.style.display = 'none';
    allEntries = [];
    renderNetworkEntries([]);
    document.getElementById('entryCount').textContent = '0';
    return;
  }
  emptyEl.style.display = 'none';
  errorEl.style.display = 'none';
  allEntries = data.entries;
  document.getElementById('entryCount').textContent = allEntries.length;
  renderNetworkEntries(allEntries);
}

function renderNetworkEntries(entries) {
  var container = document.getElementById('netContainer');
  var filters = getFilters();
  var filtered = entries.filter(function (e) {
    return matchesFilters(e, filters);
  });
  var filteredCountEl = document.getElementById('filteredCount');
  if (filteredCountEl) {
    var total = entries.length;
    filteredCountEl.textContent = filtered.length === total ? total + ' 条' : filtered.length + ' / ' + total + ' 条';
  }

  /* Keep empty/error state inside container, clear everything else */
  var emptyEl = document.getElementById('netEmpty');
  var errorEl = document.getElementById('netError');
  container.innerHTML = '';
  container.appendChild(emptyEl);
  container.appendChild(errorEl);

  if (filtered.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  for (var i = 0; i < filtered.length; i++) {
    var e = filtered[i];
    var method = (e.request && e.request.method) || e.method || 'GET';
    var url = (e.request && e.request.url) || e.url || '';
    var status = (e.response && e.response.status) || e.status;
    var duration = (e.timing && e.timing.totalDuration) || e.duration;
    var ts = fmtTime(e.timestamp);
    var phase = e.phase || 'completed';

    var card = document.createElement('div');
    card.className = 'net-entry';

    /* ── Entry Header ── */
    card.innerHTML =
      '<div class="net-entry-header" onclick="toggleEntry(this)">' +
      '<span class="badge ' +
      methodBadgeClass(method) +
      '">' +
      escHtml(method.toUpperCase()) +
      '</span>' +
      '<span class="net-url" title="' +
      escHtml(url) +
      '">' +
      escHtml(truncateUrl(url)) +
      '</span>' +
      '<span class="net-meta">' +
      (status != null
        ? '<span class="badge ' + statusBadgeClass(status) + '">' + status + '</span>'
        : '<span class="badge badge-neutral">\u2014</span>') +
      ' <span class="phase-badge ' +
      phaseBadgeClass(phase) +
      '">' +
      escHtml(phase) +
      '</span>' +
      '</span>' +
      '<span class="net-duration ' +
      durationClass(duration) +
      '">' +
      (duration != null ? Math.round(duration) + 'ms' : '\u2014') +
      '</span>' +
      '<span class="net-time">' +
      ts +
      '</span>' +
      '</div>' +
      '<div class="net-entry-body">' +
      renderEntryDetail(e) +
      '</div>';

    container.appendChild(card);
  }
}

/* ── Render Entry Detail — all sections open ── */
function renderEntryDetail(entry) {
  var reqHeaders = (entry.request && entry.request.headers) || entry.requestHeaders;
  var reqBody = (entry.request && entry.request.bodyPreview) || entry.requestBody;
  var resHeaders = (entry.response && entry.response.headers) || entry.responseHeaders;
  var resBody = entry.response ? entry.response.body : entry.responseBody || null;
  var stream = entry.stream;
  var timing = entry.timing;
  var cat = entry.category;
  var email = entry.accountEmail;

  var metaParts = [];
  if (cat) metaParts.push('<span class="badge ' + categoryCssClass(cat) + '">' + escHtml(cat) + '</span>');
  if (email) metaParts.push('<span class="badge badge-neutral">' + escHtml(email) + '</span>');
  if (timing && timing.ttfb != null) metaParts.push('<span class="net-stat">TTFB: ' + Math.round(timing.ttfb) + 'ms</span>');
  if (timing && timing.chunksPerSecond != null)
    metaParts.push('<span class="net-stat">' + timing.chunksPerSecond.toFixed(1) + 'ch/s</span>');

  var html = '';
  if (metaParts.length > 0) {
    html +=
      '<div class="net-meta-row">' +
      metaParts.join('') +
      (stream && stream.totalChunks ? '<span class="net-stat">' + stream.totalChunks + ' chunks</span>' : '') +
      '</div>';
  }

  html += '<div class="detail-grid">';

  /* Request Headers */
  html +=
    '<div class="detail-section">' +
    '<div class="section-header"><span class="section-arrow">\u25b6</span> Request Headers</div>' +
    '<div class="section-body"><pre>' +
    escHtml(reqHeaders ? JSON.stringify(reqHeaders, null, 2) : '（无）') +
    '</pre></div>' +
    '</div>';

  /* Request Body */
  html +=
    '<div class="detail-section">' +
    '<div class="section-header"><span class="section-arrow">\u25b6</span> Request Body</div>' +
    '<div class="section-body"><pre>' +
    escHtml(reqBody ? fmtJson(reqBody) : '（空）') +
    '</pre></div>' +
    '</div>';

  /* Response Headers */
  html +=
    '<div class="detail-section">' +
    '<div class="section-header"><span class="section-arrow">\u25b6</span> Response Headers</div>' +
    '<div class="section-body"><pre>' +
    escHtml(resHeaders ? JSON.stringify(resHeaders, null, 2) : '（无）') +
    '</pre></div>' +
    '</div>';

  /* Response Body */
  html +=
    '<div class="detail-section">' +
    '<div class="section-header"><span class="section-arrow">\u25b6</span> Response Body</div>' +
    '<div class="section-body"><pre>' +
    escHtml(resBody ? fmtJson(resBody) : '（空）') +
    '</pre></div>' +
    '</div>';

  /* Stream chunks if present */
  if (stream && stream.chunks && stream.chunks.length > 0) {
    html +=
      '<div class="detail-section">' +
      '<div class="section-header"><span class="section-arrow">\u25b6</span> Stream Chunks (' +
      stream.totalChunks +
      ' 条，显示 ' +
      stream.chunks.length +
      ')</div>' +
      '<div class="section-body"><pre>' +
      escHtml(stream.chunks.join('\\n')) +
      '</pre></div>' +
      '</div>';
  }

  /* Errors if present */
  if (entry.errors && entry.errors.length > 0) {
    html +=
      '<div class="detail-section">' +
      '<div class="section-header"><span class="section-arrow">\u25b6</span> Errors (' +
      entry.errors.length +
      ')</div>' +
      '<div class="section-body" style="background:var(--danger-soft)"><pre style="color:var(--danger)">' +
      escHtml(entry.errors.join('\\n')) +
      '</pre></div>' +
      '</div>';
  }

  html += '</div>';
  return html;
}

/* ── Toggle entry card ── */
function toggleEntry(header) {
  header.classList.toggle('open');
  var body = header.nextElementSibling;
  if (body) body.classList.toggle('open');
}

/* ── Init ── */
function init() {
  fetchNetworkEntries();
  createPoller(fetchNetworkEntries, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

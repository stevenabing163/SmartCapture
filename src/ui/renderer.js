/**
 * SmartCapture 渲染进程
 * 负责 UI 交互、任务管理、视图切换等
 */

// 防止重复加载（修复 Electron 缓存导致的双执行问题）
if (window.__smartCaptureLoaded) {
  console.warn('[Renderer] renderer.js 已加载过，跳过');
} else {
window.__smartCaptureLoaded = true;

// ============ 环境检测与 API 适配 ============
const IS_ELECTRON = !!window.api;
const API_BASE = IS_ELECTRON ? '' : '';

const api = IS_ELECTRON ? window.api : createHttpApi();

function createHttpApi() {
  const adapters = {
    getTasks: (date) => {
      const url = date ? `/api/tasks?date=${encodeURIComponent(date)}` : '/api/tasks';
      return fetchJson(url);
    },
    getTasksByRange: (start, end) => fetchJson(`/api/tasks?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
    addTask: (task) => fetchJson('/api/tasks', { method: 'POST', body: task }),
    updateTask: (id, updates) => fetchJson(`/api/tasks/${id}`, { method: 'PUT', body: updates }),
    deleteTask: (id) => fetchJson(`/api/tasks/${id}`, { method: 'DELETE' }),
    getTasksByDate: (date) => fetchJson(`/api/tasks?date=${encodeURIComponent(date)}`),
    getSettings: () => fetchJson('/api/settings'),
    updateSettings: (settings) => fetchJson('/api/settings', { method: 'PUT', body: settings }),
    parseContent: (content, type) => fetchJson('/api/parse', { method: 'POST', body: { content, type } }),
    testAIConnection: () => fetchJson('/api/parse/test', { method: 'POST' }),
    notify: (title, body) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') new Notification(title, { body });
        });
      }
      return Promise.resolve();
    },
    startClipboard: () => Promise.resolve(),
    stopClipboard: () => Promise.resolve(),
    startReminder: () => Promise.resolve(),
    stopReminder: () => Promise.resolve(),
    checkReminderNow: () => Promise.resolve(),
    captureScreenshot: () => Promise.reject(new Error('截图功能仅桌面端可用')),
    captureRegion: () => Promise.reject(new Error('截图功能仅桌面端可用')),
    captureFull: () => Promise.reject(new Error('全屏截图仅桌面端可用')),
    manualClipboardCapture: () => Promise.resolve(),
    registerHotkeys: () => Promise.resolve(),
    exportData: () => fetchJson('/api/info'),
    importData: () => Promise.resolve(),
    hideWindow: () => Promise.resolve(),
    showWindow: () => Promise.resolve(),
    onClipboardUpdate: () => () => {},
    onScreenshotTaken: () => () => {},
  };

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '请求失败');
    return data.data;
  }

  return adapters;
}

// ============ 状态 ============
const state = {
  currentView: 'tasks',
  currentFilter: 'all',
  tasks: [],
  settings: {},
  captureHistory: [],
  selectedDate: new Date(),
  calendarMonth: new Date(),
};

// ============ 工具函数 ============

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date - now;
  const days = Math.floor(diff / 86400000);

  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  if (days === 0) return `今天 ${timeStr}`;
  if (days === 1) return `明天 ${timeStr}`;
  if (days === -1) return `昨天 ${timeStr}`;
  if (days > 1 && days < 7) return `${days} 天后 ${timeStr}`;

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + timeStr;
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }[type] || 'ℹ️';

  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============ 视图切换 ============

function switchView(viewName) {
  state.currentView = viewName;

  $$('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  $$('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  // 触发视图初始化
  if (viewName === 'calendar') renderCalendar();
  if (viewName === 'capture') renderCaptureCenter();
  if (viewName === 'settings') loadSettings();
}

// ============ 任务管理 ============

async function loadTasks() {
  try {
    state.tasks = await api.getTasks();
    renderTasks();
    updateStats();
  } catch (err) {
    console.error('加载任务失败:', err);
  }
}

function renderTasks() {
  const list = $('#task-list');
  const empty = $('#empty-state');
  const filtered = filterTasks(state.tasks);

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = filtered.map(taskCard).join('');

  // 绑定事件
  list.querySelectorAll('.task-card').forEach(card => {
    const id = parseInt(card.dataset.id);

    card.querySelector('.task-checkbox').addEventListener('click', () => toggleTask(id));
    card.querySelector('.task-action-btn.edit')?.addEventListener('click', () => openTaskModal(id));
    card.querySelector('.task-action-btn.delete')?.addEventListener('click', () => deleteTask(id));
  });
}

function filterTasks(tasks) {
  const filter = state.currentFilter;
  const keyword = ($('#search-input')?.value || '').toLowerCase();

  return tasks.filter(t => {
    if (filter === 'today') return isToday(t.dueDate);
    if (filter === 'pending') return !t.completed;
    if (filter === 'completed') return t.completed;
    if (keyword) return t.title.toLowerCase().includes(keyword) || (t.rawText || '').toLowerCase().includes(keyword);
    return true;
  });
}

function taskCard(task) {
  const priorityClass = ['low', 'medium', 'high'][task.priority - 1] || 'medium';
  const overdue = !task.completed && isOverdue(task.dueDate) && task.dueDate;
  const dueToday = !task.completed && isToday(task.dueDate);

  // 截图缩略图
  const thumbHtml = task.image ? `
    <img class="task-thumb" src="${task.image}" alt="截图" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border, #e0e0e0);cursor:pointer;" onclick="event.stopPropagation(); window.__previewImage('${task.image.replace(/'/g, "\\'")}')">
  ` : '';

  return `
    <div class="task-card ${task.completed ? 'completed' : ''}" data-id="${task.id}">
      <div class="task-checkbox ${task.completed ? 'checked' : ''}"></div>
      ${thumbHtml}
      <div class="task-content">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          ${task.dueDate ? `<span class="task-meta-item ${overdue ? 'overdue' : dueToday ? 'due-today' : ''}">
            ${overdue ? '🚨' : dueToday ? '⏰' : '📅'} ${formatDate(task.dueDate)}
          </span>` : ''}
          ${task.location ? `<span class="task-meta-item">📍 ${escapeHtml(task.location)}</span>` : ''}
          <span class="task-meta-item">
            <span class="priority-dot ${priorityClass}"></span>
            ${['低', '中', '高'][task.priority - 1] || '中'}优先级
          </span>
          ${task.type === 'event' ? '<span class="task-meta-item">📅 日历事件</span>' : ''}
          ${task.image ? '<span class="task-meta-item">📷 截图</span>' : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-action-btn edit" title="编辑">✏️</button>
        <button class="task-action-btn delete" title="删除">🗑️</button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  await api.updateTask(id, { completed: !task.completed });
  await loadTasks();
}

async function deleteTask(id) {
  if (!confirm('确定要删除这个任务吗？')) return;

  await api.deleteTask(id);
  showToast('任务已删除', 'success');
  await loadTasks();
}

function updateStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const pending = total - completed;
  const today = state.tasks.filter(t => !t.completed && isToday(t.dueDate)).length;

  $('#stat-total').textContent = total;
  $('#stat-pending').textContent = pending;
  $('#stat-done').textContent = completed;
  $('#badge-today').textContent = today;
  $('#badge-today').style.display = today > 0 ? 'inline-block' : 'none';
}

// ============ 任务弹窗 ============

let editingTaskId = null;
let currentReminders = []; // 当前任务的提醒列表（分钟数数组）

function openTaskModal(taskId = null) {
  editingTaskId = taskId;
  const modal = $('#task-modal');
  const title = $('#modal-title');
  const rawSection = $('#raw-section');
  const imageSection = $('#image-section');

  if (taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    title.textContent = '编辑任务';
    $('#input-title').value = task.title;
    $('#input-type').value = task.type;
    $('#input-priority').value = task.priority;
    $('#input-due').value = task.dueDate ? toLocalDatetime(task.dueDate) : '';
    $('#input-location').value = task.location || '';
    currentReminders = task.reminders ? [...task.reminders] : [];
    renderReminderList();

    if (task.rawText) {
      rawSection.style.display = 'block';
      $('#input-raw').textContent = task.rawText;
    } else {
      rawSection.style.display = 'none';
    }

    if (task.image) {
      imageSection.style.display = 'block';
      $('#task-image').src = task.image;
    } else {
      imageSection.style.display = 'none';
    }
  } else {
    title.textContent = '新建任务';
    $('#input-title').value = '';
    $('#input-type').value = 'todo';
    $('#input-priority').value = '2';
    $('#input-due').value = '';
    $('#input-location').value = '';
    currentReminders = [];
    renderReminderList();
    rawSection.style.display = 'none';
    imageSection.style.display = 'none';
  }

  modal.classList.add('active');
}

function closeTaskModal() {
  $('#task-modal').classList.remove('active');
  editingTaskId = null;
  currentReminders = [];
}

function renderReminderList() {
  const list = $('#reminder-list');
  const hint = $('#reminder-hint');

  if (!$('#input-due').value) {
    hint.textContent = '（请先设置截止日期）';
    list.innerHTML = '';
    return;
  }
  hint.textContent = '';

  if (currentReminders.length === 0) {
    list.innerHTML = '<span class="reminder-empty">未设置提醒</span>';
    return;
  }

  const sorted = [...currentReminders].sort((a, b) => b - a);
  list.innerHTML = sorted.map(min => {
    const label = min === 0 ? '到期时' : `${min} 分钟前`;
    return `<span class="chip reminder-chip">${label} <span class="chip-close" data-min="${min}">✕</span></span>`;
  }).join('');

  list.querySelectorAll('.chip-close').forEach(el => {
    el.addEventListener('click', (e) => {
      const min = parseInt(e.target.dataset.min);
      currentReminders = currentReminders.filter(m => m !== min);
      renderReminderList();
    });
  });
}

async function saveTask() {
  const title = $('#input-title').value.trim();
  if (!title) {
    showToast('请输入任务标题', 'warning');
    return;
  }

  const task = {
    title,
    type: $('#input-type').value,
    priority: parseInt($('#input-priority').value),
    dueDate: $('#input-due').value ? new Date($('#input-due').value).toISOString() : null,
    location: $('#input-location').value.trim() || null,
    reminders: currentReminders.length > 0 ? [...new Set(currentReminders)].sort((a, b) => a - b) : [],
  };

  if (editingTaskId) {
    await api.updateTask(editingTaskId, task);
    showToast('任务已更新', 'success');
  } else {
    await api.addTask(task);
    showToast('任务已创建', 'success');
  }

  closeTaskModal();
  await loadTasks();
}

function toLocalDatetime(isoStr) {
  const date = new Date(isoStr);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

// ============ 解析结果弹窗 ============

function showParseResult(result) {
  const modal = $('#parse-modal');
  const body = $('#parse-body');

  if (!result.success || !result.tasks || result.tasks.length === 0) {
    const errMsg = result.error ? `错误: ${escapeHtml(result.error)}` : '未能解析出有效任务';
    body.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 20px;">${errMsg}</p>`;
    if (result.error && result.error.includes('AI')) {
      body.innerHTML += `<p style="text-align:center; margin-top:12px;"><button id="goto-settings" style="padding:8px 20px; background:var(--primary); color:white; border:none; border-radius:var(--radius); cursor:pointer;">前往设置配置 AI</button></p>`;
      setTimeout(() => {
        const btn = document.getElementById('goto-settings');
        if (btn) btn.onclick = () => {
          modal.classList.remove('active');
          switchView('settings');
        };
      }, 0);
    }
  } else {
    body.innerHTML = result.tasks.map(task => `
      <div class="parse-result-item">
        <h4>${escapeHtml(task.title)}</h4>
        <div class="parse-meta">
          <span>📅 ${task.dueDate ? formatDate(task.dueDate) : '无截止日期'}</span>
          <span>📍 ${escapeHtml(task.location) || '无地点'}</span>
          <span>${task.type === 'event' ? '📅 事件' : '✓ 待办'}</span>
          <span>${['低', '中', '高'][task.priority - 1] || '中'}优先级</span>
        </div>
      </div>
    `).join('');
  }

  modal.classList.add('active');

  // 保存按钮
  $('#parse-save-all').onclick = async () => {
    if (result.tasks && result.tasks.length > 0) {
      for (const task of result.tasks) {
        await api.addTask(task);
      }
      showToast(`已保存 ${result.tasks.length} 个任务`, 'success');
    }
    modal.classList.remove('active');
    await loadTasks();
  };
}

// ============ 图片预览 ============
window.__previewImage = function(dataUrl) {
  const previewModal = $('#image-preview-modal');
  const previewImg = $('#image-preview-img');
  previewImg.src = dataUrl;
  previewModal.classList.add('active');
};

window.__closeImagePreview = function() {
  $('#image-preview-modal').classList.remove('active');
};

// ============ 剪贴板监听 ============

let currentCaptureContent = '';

try {
  api.onClipboardUpdate(async ({ text, source }) => {
    if (!text || text === currentCaptureContent) return;
    currentCaptureContent = text;

    state.captureHistory.unshift({ text, source, time: new Date().toISOString() });
    if (state.captureHistory.length > 20) state.captureHistory.pop();

    if (state.settings.autoParse !== false) {
      const result = await api.parseContent(text, 'clipboard');
      if (result.success && result.tasks && result.tasks.length > 0) {
        showParseResult(result);
      }
    }

    showToast(`捕获 ${source === 'clipboard' ? '剪贴板' : '手动'} 内容`, 'info');
    renderCaptureHistory();
  });
} catch(e) { console.warn('[Renderer] onClipboardUpdate 注册失败:', e.message); }

// ============ 截图监听 ============

let pendingScreenshot = null; // 缓存截图数据，等待用户选择

try {
  api.onScreenshotTaken(async (dataUrl) => {
    showToast('截图成功！请选择处理方式', 'info');
    pendingScreenshot = dataUrl;
    showScreenshotDialog(dataUrl);
  });
} catch(e) { console.warn('[Renderer] onScreenshotTaken 注册失败:', e.message); }

// 截图处理选择对话框
function showScreenshotDialog(dataUrl) {
  const modal = $('#screenshot-modal');
  const preview = $('#screenshot-preview');
  preview.src = dataUrl;
  modal.classList.add('active');
}

function closeScreenshotDialog() {
  const modal = $('#screenshot-modal');
  modal.classList.remove('active');
  pendingScreenshot = null;
}

// AI 识别截图
async function parseScreenshot() {
  const data = pendingScreenshot;
  if (!data) return;
  closeScreenshotDialog();
  showToast('正在 AI 识别...', 'info');
  try {
    const result = await api.parseContent(data, 'screenshot');
    if (result.success && result.tasks && result.tasks.length > 0) {
      showParseResult(result);
    } else {
      showToast('识别失败: ' + (result.error || '未能识别出待办'), 'error');
    }
  } catch (err) {
    console.error('[Renderer] 截图解析失败:', err);
    showToast('截图解析失败: ' + (err.message || '未知错误'), 'error');
  }
}

// 直接存为待办
async function saveScreenshotAsTask() {
  const data = pendingScreenshot;
  if (!data) return;
  closeScreenshotDialog();
  
  // 自动创建一个任务，附带截图
  const now = new Date();
  const task = {
    title: `📷 截图待办 - ${now.toLocaleString('zh-CN')}`,
    type: 'todo',
    dueDate: now.toISOString(),
    priority: 2,
    source: 'screenshot',
    rawText: '[截图] 直接保存的待办事项，点击编辑添加描述',
    image: data,
  };
  
  try {
    const result = await api.addTask(task);
    showToast('截图已保存为待办', 'success');
    await loadTasks();
    // 跳转到待办列表
    switchView('tasks');
    // 自动打开该任务的编辑弹窗
    if (result && result.id) {
      openTaskModal(result.id);
    }
  } catch (err) {
    console.error('[Renderer] 保存截图待办失败:', err);
    showToast('保存失败: ' + (err.message || '未知错误'), 'error');
  }
}

// 暴露到 window 供 HTML onclick 调用（必须在函数定义之后）
window.__closeScreenshotDialog = closeScreenshotDialog;
window.__parseScreenshot = parseScreenshot;
window.__saveScreenshotAsTask = saveScreenshotAsTask;

// ============ 日历视图 ============

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function renderCalendar() {
  const year = state.calendarMonth.getFullYear();
  const month = state.calendarMonth.getMonth();

  $('#cal-title').textContent = `${year}年 ${month + 1}月`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const grid = $('#cal-grid');
  const cells = [];

  // 上月填充
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    cells.push({ day, otherMonth: true });
  }

  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const tasksOnDay = state.tasks.filter(t => t.dueDate && toLocalDateStr(new Date(t.dueDate)) === dateStr && !t.completed);
    const firstTask = tasksOnDay[0];
    let eventTime = '';
    if (firstTask && firstTask.dueDate) {
      const dt = new Date(firstTask.dueDate);
      eventTime = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }
    cells.push({
      day: d,
      otherMonth: false,
      hasEvent: tasksOnDay.length > 0,
      eventCount: tasksOnDay.length,
      eventTitle: firstTask ? firstTask.title : '',
      eventTime,
      isToday: dateStr === toLocalDateStr(new Date()),
      isSelected: dateStr === toLocalDateStr(state.selectedDate),
    });
  }

  // 下月填充
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, otherMonth: true });
  }

  grid.innerHTML = cells.map(c => {
    let eventContent = '';
    if (c.hasEvent) {
      if (c.eventCount > 1) {
        eventContent = `<span class="event-count-badge">${c.eventCount}</span>`;
      } else {
        eventContent = '<span class="event-dot has-event"></span>';
      }
      if (c.eventTitle) {
        const timeStr = c.eventTime ? `<span class="event-time">${c.eventTime}</span> · ` : '';
        eventContent += `<div class="event-marquee"><span class="marquee-text">${timeStr}${escapeHtml(c.eventTitle)}</span></div>`;
      }
    }
    return `
    <div class="cal-cell ${c.otherMonth ? 'other-month' : ''} ${c.isToday ? 'today' : ''} ${c.isSelected ? 'selected' : ''}"
         data-day="${c.day}" data-other="${c.otherMonth}"
         ${c.hasEvent ? 'title="点击查看事件"' : ''}
         onclick="window.__onCalCellClick(${c.day}, ${c.otherMonth})">
      <span class="day-number">${c.day}</span>
      ${eventContent}
    </div>
  `;
  }).join('');

  renderDayEvents();
}

// 日历单元格点击事件委托（只绑定一次，避免重复绑定）
document.addEventListener('click', (e) => {
  const cell = e.target.closest('.cal-cell');
  if (!cell) return;
  
  const day = parseInt(cell.dataset.day);
  const isOther = cell.dataset.other === 'true';
  if (isOther) return;
  
  const year = state.calendarMonth.getFullYear();
  const month = state.calendarMonth.getMonth();
  
  state.selectedDate = new Date(year, month, day);
  renderCalendar();
  // 滚动到事件列表
  const dayEvents = document.getElementById('day-events');
  if (dayEvents) dayEvents.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// 日历单元格点击 - 直接onclick回调（双重保障）
window.__onCalCellClick = function(day, isOther) {
  if (isOther) return;
  const year = state.calendarMonth.getFullYear();
  const month = state.calendarMonth.getMonth();
  state.selectedDate = new Date(year, month, day);
  renderCalendar();
  // 滚动到事件列表
  const dayEvents = document.getElementById('day-events');
  if (dayEvents) dayEvents.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function renderDayEvents() {
  const dateStr = toLocalDateStr(state.selectedDate);
  const tasksOnDay = state.tasks.filter(t => t.dueDate && toLocalDateStr(new Date(t.dueDate)) === dateStr);

  $('#day-events-title').textContent = `${dateStr} 的待办事项 (${tasksOnDay.length})`;

  const list = $('#day-event-list');
  if (tasksOnDay.length === 0) {
    list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">当天没有待办事项</p>';
    return;
  }

  list.innerHTML = tasksOnDay.map(t => {
    let timeLabel = '';
    if (t.dueDate) {
      const dt = new Date(t.dueDate);
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      timeLabel = `<span class="event-time-badge">⏰ ${hh}:${mm}</span>`;
    }
    const typeIcon = t.type === 'event' ? '📅' : '✓';
    const priorityLabels = ['低', '中', '高'];
    const priorityColors = ['#95a5a6', '#f39c12', '#e74c3c'];
    const priorityDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityColors[(t.priority||2)-1]||'#f39c12'};margin-right:4px;"></span>${priorityLabels[(t.priority||2)-1]||'中'}`;
    
    // 显示原始全文（如果有）
    const rawTextHtml = t.rawText ? `
      <div style="margin-top:8px; padding:8px 10px; background:var(--bg-secondary, #f5f6fa); border-left:3px solid var(--primary, #4A90D9); border-radius:4px; font-size:13px; color:var(--text, #2c3e50); line-height:1.6; white-space:pre-wrap; word-break:break-word;">${escapeHtml(t.rawText)}</div>
    ` : '';

    // 截图缩略图
    const imgHtml = t.image ? `
      <img src="${t.image}" alt="截图" style="margin-top:8px; max-width:200px; max-height:120px; object-fit:cover; border-radius:6px; cursor:zoom-in; border:1px solid var(--border, #e0e0e0);" onclick="event.stopPropagation(); window.__previewImage(this.src)">
    ` : '';

    return `
    <div class="day-event-item" data-task-id="${t.id}" style="cursor:pointer; padding:14px 16px; border-radius:10px; transition:background 0.15s; border:1px solid var(--border, #e0e0e0); margin-bottom:10px;" onmouseover="this.style.background='var(--bg-hover, #f0f4f8)'" onmouseout="this.style.background=''">
      <div style="display:flex; align-items:flex-start; gap:10px;">
        <div class="task-checkbox ${t.completed ? 'checked' : ''}" data-id="${t.id}" style="flex-shrink:0; margin-top:2px;"></div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:15px; font-weight:600; ${t.completed ? 'text-decoration: line-through; opacity: 0.6;' : 'color:var(--text, #2c3e50);'}">${typeIcon} ${escapeHtml(t.title)}</div>
          <div style="font-size:12px; color: var(--text-secondary, #7f8c8d); margin-top:6px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            ${timeLabel}
            ${t.location ? `<span>📍 ${escapeHtml(t.location)}</span>` : ''}
            <span>${priorityDot}</span>
            <span style="opacity:0.7;">${formatDate(t.dueDate)}</span>
            ${t.image ? '<span>📷 截图</span>' : ''}
          </div>
          ${rawTextHtml}
          ${imgHtml}
        </div>
      </div>
    </div>
  `;
  }).join('');

  // 绑定点击事件 → 打开任务详情
  list.querySelectorAll('.day-event-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.task-checkbox')) return;
      const taskId = parseInt(item.dataset.taskId);
      if (taskId) openTaskModal(taskId);
    });
  });

  // 绑定复选框 → 切换完成状态
  list.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(cb.dataset.id);
      if (id) {
        await toggleTask(id);
        renderCalendar();
        renderDayEvents();
      }
    });
  });
}

// ============ 捕获中心 ============

function renderCaptureCenter() {
  // 快捷键列表
  const hotkeys = state.settings.hotkeys || {
    captureScreenshot: 'Ctrl+Shift+A',
    captureRegion: 'Ctrl+Shift+S',
    toggleWindow: 'Ctrl+Shift+T',
    quickCapture: 'Ctrl+Shift+Q',
  };

  const hotkeyNames = {
    captureScreenshot: '区域截图',
    captureRegion: '区域截图',
    captureFull: '全屏截图',
    toggleWindow: '显示/隐藏窗口',
    quickCapture: '快速捕获',
  };

  $('#hotkey-list').innerHTML = Object.entries(hotkeys).map(([key, value]) => `
    <div class="hotkey-item">
      <span>${hotkeyNames[key] || key}</span>
      <span class="hotkey-key">${value}</span>
    </div>
  `).join('');

  renderCaptureHistory();
}

function renderCaptureHistory() {
  const history = $('#capture-history');
  if (state.captureHistory.length === 0) {
    history.innerHTML = '<p class="empty-hint">暂无捕获记录</p>';
    return;
  }

  history.innerHTML = state.captureHistory.map((item, i) => `
    <div class="capture-history-item" data-index="${i}">
      <span class="capture-history-text">${escapeHtml(item.text)}</span>
      <span style="font-size: 11px; color: var(--text-secondary);">
        ${new Date(item.time).toLocaleTimeString('zh-CN')}
      </span>
    </div>
  `).join('');

  // 绑定点击解析
  history.querySelectorAll('.capture-history-item').forEach(item => {
    item.addEventListener('click', async () => {
      const index = parseInt(item.dataset.index);
      const historyItem = state.captureHistory[index];
      if (historyItem && historyItem.text && historyItem.text !== '[截图]') {
        const result = await api.parseContent(historyItem.text, 'clipboard');
        showParseResult(result);
      }
    });
  });
}

// ============ 设置页 ============

async function loadSettings() {
  state.settings = await api.getSettings();

  $('#setting-ai-endpoint').value = state.settings.aiEndpoint || '';
  $('#setting-ai-key').value = state.settings.aiApiKey || '';
  $('#setting-ai-model').value = state.settings.aiModel || '';
  $('#setting-monitor-clipboard').checked = state.settings.monitorClipboard !== false;
  $('#setting-poll-interval').value = state.settings.clipboardPollInterval || 1000;
  $('#setting-auto-parse').checked = state.settings.autoParse !== false;
  $('#setting-enable-reminders').checked = state.settings.enableReminders !== false;
  $('#setting-reminder-advance').value = state.settings.reminderAdvanceMinutes || 15;
}

async function saveAISettings() {
  const newSettings = {
    aiEndpoint: $('#setting-ai-endpoint').value.trim(),
    aiApiKey: $('#setting-ai-key').value.trim(),
    aiModel: $('#setting-ai-model').value.trim(),
  };

  await api.updateSettings(newSettings);
  state.settings = { ...state.settings, ...newSettings };
  showToast('AI 配置已保存', 'success');
}

// ============ 事件绑定 ============

function bindEvents() {
  // 侧边栏导航
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // 筛选标签
  $$('.filter-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.filter-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentFilter = tab.dataset.filter;
      renderTasks();
    });
  });

  // 搜索
  $('#search-input').addEventListener('input', () => renderTasks());

  // 工具栏按钮
  $('#btn-add').addEventListener('click', () => openTaskModal());
  $('#btn-screenshot').addEventListener('click', async () => {
    showToast('请框选截图区域...', 'info');
    try {
      const result = await api.captureScreenshot();
      if (result && result.success) {
        // 截图成功后，onScreenshotTaken 会自动弹出选择对话框
        // 这里作为后备：如果事件没触发，直接处理
        if (result.dataUrl && !pendingScreenshot) {
          pendingScreenshot = result.dataUrl;
          showScreenshotDialog(result.dataUrl);
        }
      } else if (result && result.error) {
        showToast('截图失败: ' + result.error, 'error');
      }
    } catch (err) {
      console.error('[Renderer] 截图异常:', err);
      showToast('截图错误: ' + (err.message || '未知错误'), 'error');
    }
  });
  $('#btn-paste').addEventListener('click', async () => {
    const text = await navigator.clipboard.readText();
    if (text) {
      const result = await api.parseContent(text, 'manual');
      showParseResult(result);
    } else {
      showToast('剪贴板为空', 'warning');
    }
  });

  // 提示按钮
  $('#tip-clipboard').addEventListener('click', async () => {
    const text = await navigator.clipboard.readText();
    if (text) {
      const result = await api.parseContent(text, 'manual');
      showParseResult(result);
    }
  });
  $('#tip-screenshot').addEventListener('click', async () => {
    showToast('请框选截图区域...', 'info');
    try {
      const result = await api.captureScreenshot();
      if (result && result.success) {
        showToast('截图成功，正在识别...', 'info');
        if (result.dataUrl) {
          try {
            const parseResult = await api.parseContent(result.dataUrl, 'screenshot');
            showParseResult(parseResult);
          } catch (parseErr) {
            console.error('[Renderer] 截图解析失败:', parseErr);
            showToast('截图解析失败: ' + (parseErr.message || '未知错误'), 'error');
          }
        }
      } else if (result && result.error) {
        showToast('截图失败: ' + result.error, 'error');
      }
    } catch (err) {
      console.error('[Renderer] 截图异常:', err);
      showToast('截图错误: ' + (err.message || '未知错误'), 'error');
    }
  });
  $('#tip-add').addEventListener('click', () => openTaskModal());

  // 任务弹窗
  $('#modal-close').addEventListener('click', closeTaskModal);
  $('#modal-cancel').addEventListener('click', closeTaskModal);
  $('#modal-save').addEventListener('click', saveTask);

  // 提醒预设按钮
  document.querySelectorAll('#reminder-presets .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const min = parseInt(chip.dataset.min);
      if (!$('#input-due').value) {
        showToast('请先设置截止日期', 'warning');
        return;
      }
      if (!currentReminders.includes(min)) {
        currentReminders.push(min);
        renderReminderList();
      }
    });
  });

  // 自定义提醒添加
  $('#reminder-add-custom').addEventListener('click', () => {
    const input = $('#reminder-custom-min');
    const min = parseInt(input.value);
    if (isNaN(min) || min < 0) {
      showToast('请输入有效的分钟数', 'warning');
      return;
    }
    if (!$('#input-due').value) {
      showToast('请先设置截止日期', 'warning');
      return;
    }
    if (!currentReminders.includes(min)) {
      currentReminders.push(min);
      renderReminderList();
    }
    input.value = '';
  });

  // 截止日期变化时刷新提醒列表
  $('#input-due').addEventListener('change', () => {
    renderReminderList();
  });

  // 解析弹窗
  $('#parse-close').addEventListener('click', () => $('#parse-modal').classList.remove('active'));
  $('#parse-skip').addEventListener('click', () => $('#parse-modal').classList.remove('active'));

  // 日历控制
  $('#cal-prev').addEventListener('click', () => {
    state.calendarMonth.setMonth(state.calendarMonth.getMonth() - 1);
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', () => {
    state.calendarMonth.setMonth(state.calendarMonth.getMonth() + 1);
    renderCalendar();
  });
  $('#cal-today').addEventListener('click', () => {
    state.calendarMonth = new Date();
    state.selectedDate = new Date();
    renderCalendar();
  });

  // 捕获中心
  $('#toggle-clipboard').addEventListener('change', async (e) => {
    if (e.target.checked) {
      await api.startClipboard();
    } else {
      await api.stopClipboard();
    }
    await api.updateSettings({ monitorClipboard: e.target.checked });
    state.settings.monitorClipboard = e.target.checked;
    $('#clipboard-status').textContent = e.target.checked ? '已开启' : '已关闭';
    $('#clipboard-status').className = e.target.checked ? 'status-on' : 'status-off';
  });

  $('#btn-capture-full').addEventListener('click', () => api.captureFull());
  $('#btn-capture-region').addEventListener('click', () => api.captureRegion());

  // 设置保存
  $('#btn-save-ai').addEventListener('click', saveAISettings);

  // 测试 AI 连接
  $('#btn-test-ai').addEventListener('click', async () => {
    const resultEl = $('#ai-test-result');
    resultEl.innerHTML = '<span style="color:#95a5a6;">⏳ 正在测试连接...</span>';
    
    // 先保存当前输入的配置
    const tempSettings = {
      aiEndpoint: $('#setting-ai-endpoint').value.trim(),
      aiApiKey: $('#setting-ai-key').value.trim(),
      aiModel: $('#setting-ai-model').value.trim(),
    };
    
    // 临时更新到parser
    state.settings = { ...state.settings, ...tempSettings };
    
    try {
      const result = await api.testAIConnection();
      if (result.success) {
        resultEl.innerHTML = `<span style="color:#27ae60;">✅ 连接成功！模型: ${result.model || tempSettings.aiModel}</span>`;
        showToast('AI 连接测试成功', 'success');
      } else {
        resultEl.innerHTML = `<span style="color:#e74c3c;">❌ ${escapeHtml(result.error || '未知错误')}</span>`;
        showToast('AI 连接失败', 'error');
      }
    } catch (err) {
      resultEl.innerHTML = `<span style="color:#e74c3c;">❌ ${escapeHtml(err.message || '测试请求失败')}</span>`;
      showToast('AI 连接测试异常', 'error');
    }
  });

  $('#setting-monitor-clipboard').addEventListener('change', async (e) => {
    if (e.target.checked) {
      await api.startClipboard();
    } else {
      await api.stopClipboard();
    }
    await api.updateSettings({ monitorClipboard: e.target.checked });
    state.settings.monitorClipboard = e.target.checked;
    const tc = $('#toggle-clipboard');
    if (tc) tc.checked = e.target.checked;
  });

  $('#setting-auto-parse').addEventListener('change', async (e) => {
    await api.updateSettings({ autoParse: e.target.checked });
    state.settings.autoParse = e.target.checked;
  });

  // 任务提醒设置
  $('#btn-save-reminder').addEventListener('click', async () => {
    const enabled = $('#setting-enable-reminders').checked;
    const advance = parseInt($('#setting-reminder-advance').value) || 15;
    await api.updateSettings({ enableReminders: enabled, reminderAdvanceMinutes: advance });
    state.settings.enableReminders = enabled;
    state.settings.reminderAdvanceMinutes = advance;
    if (enabled) {
      await api.startReminder();
      showToast(`提醒已开启 (提前 ${advance} 分钟)`, 'success');
    } else {
      await api.stopReminder();
      showToast('提醒已关闭', 'info');
    }
  });

  $('#btn-test-reminder').addEventListener('click', async () => {
    await api.notify('🔔 测试提醒', '这是一条测试通知，确认提醒功能正常工作。');
    showToast('测试通知已发送，请查看系统通知', 'info');
  });

  $('#setting-enable-reminders').addEventListener('change', async (e) => {
    await api.updateSettings({ enableReminders: e.target.checked });
    state.settings.enableReminders = e.target.checked;
    if (e.target.checked) {
      await api.startReminder();
    } else {
      await api.stopReminder();
    }
  });

  // 数据管理
  $('#btn-export').addEventListener('click', async () => {
    const result = await api.exportData();
    if (result.success) {
      showToast(`已导出到 ${result.path}`, 'success');
    } else {
      showToast(result.error || '导出失败', 'error');
    }
  });

  $('#btn-import').addEventListener('click', async () => {
    const result = await api.importData();
    if (result.success) {
      showToast(`已导入 ${result.taskCount} 个任务`, 'success');
      await loadTasks();
    } else {
      showToast(result.error || '导入失败', 'error');
    }
  });

  // Web 服务信息
  async function loadWebServerInfo() {
    const infoEl = $('#webserver-info');
    try {
      let info;
      if (IS_ELECTRON) {
        info = await api.getWebServerInfo();
      } else {
        const res = await fetch('/api/info');
        const json = await res.json();
        info = { port: json.data?.port || 3000, addresses: json.data?.addresses || [], running: true };
      }

      if (!info.running) {
        infoEl.innerHTML = '<span class="error">Web 服务未启动</span>';
        return;
      }

      const localhost = `http://localhost:${info.port}`;
      const addrs = (info.addresses || []).map(a => `http://${a}:${info.port}`);

      infoEl.innerHTML = `
        <div class="webserver-item">
          <span class="ws-label">💻 本机:</span>
          <code>${localhost}</code>
        </div>
        ${addrs.map(a => `
          <div class="webserver-item">
            <span class="ws-label">📱 手机:</span>
            <code>${a}</code>
            <button class="btn-copy-inline" data-url="${a}">复制</button>
          </div>
        `).join('')}
        <p class="ws-hint">💡 如手机无法访问，请检查防火墙或确认在同一 WiFi</p>
      `;

      infoEl.querySelectorAll('.btn-copy-inline').forEach(btn => {
        btn.addEventListener('click', () => {
          const url = btn.dataset.url;
          navigator.clipboard.writeText(url);
          showToast(`已复制: ${url}`, 'success');
        });
      });
    } catch (e) {
      infoEl.innerHTML = `<span class="error">获取失败: ${e.message}</span>`;
    }
  }

  $('#btn-copy-addr').addEventListener('click', () => {
    const infoEl = $('#webserver-info');
    const codes = infoEl.querySelectorAll('code');
    if (codes.length > 0) {
      navigator.clipboard.writeText(codes[0].textContent);
      showToast('已复制到剪贴板', 'success');
    }
  });

  loadWebServerInfo();

  $('#btn-clear').addEventListener('click', async () => {
    if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) return;
    const tasks = await api.getTasks();
    for (const t of tasks) {
      await api.deleteTask(t.id);
    }
    showToast('数据已清空', 'success');
    await loadTasks();
  });

  // 关闭弹窗
  $$('.modal').forEach(modal => {
    modal.querySelector('.modal-overlay')?.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  });

  // ESC 关闭弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal').forEach(modal => {
        if (modal.classList.contains('active')) {
          modal.classList.remove('active');
        }
      });
    }
  });
}

// ============ 初始化 ============

async function init() {
  try {
    bindEvents();
    await loadTasks();
    state.settings = await api.getSettings();

    const cs = document.getElementById('clipboard-status');
    if (cs) {
      cs.textContent = state.settings.monitorClipboard !== false ? '已开启' : '已关闭';
      cs.className = state.settings.monitorClipboard !== false ? 'status-on' : 'status-off';
    }
    const tc = document.getElementById('toggle-clipboard');
    if (tc) tc.checked = state.settings.monitorClipboard !== false;

    console.log('[Renderer] SmartCapture 已就绪');

    // ============ PWA 初始化 ============
    registerServiceWorker();
    setupInstallPrompt();
  } catch (err) {
    console.error('[Renderer] 初始化出错:', err);
  }
}

// ============ Service Worker ============
function registerServiceWorker() {
  if (!IS_ELECTRON && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => {
        console.log('[PWA] Service Worker 已注册');
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] 新版本可用，刷新页面更新');
            }
          });
        });
      })
      .catch((err) => console.warn('[PWA] SW 注册失败:', err.message));
  }
}

// ============ PWA 安装提示 ============
let deferredPrompt = null;

function setupInstallPrompt() {
  if (IS_ELECTRON) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBanner();
  });

  // 检测是否已安装到主屏幕
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone) {
    console.log('[PWA] 已安装为独立应用');
  }
}

function showInstallBanner() {
  const existing = document.getElementById('pwa-install-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="pwa-banner-content">
      <span>📱 安装到主屏幕，体验更流畅</span>
      <div class="pwa-banner-actions">
        <button class="pwa-btn pwa-install">安装</button>
        <button class="pwa-btn pwa-dismiss">稍后</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  banner.querySelector('.pwa-install').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] 用户选择:', outcome);
      deferredPrompt = null;
      hideInstallBanner();
    }
  });

  banner.querySelector('.pwa-dismiss').addEventListener('click', () => {
    hideInstallBanner();
  });
}

function hideInstallBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

} // end of __smartCaptureLoaded guard
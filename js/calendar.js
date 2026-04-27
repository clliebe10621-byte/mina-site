const CALENDAR_API_URL = 'https://thvrcvcot4.execute-api.us-east-1.amazonaws.com/prod/calendar';

// ── 定数 ──────────────────────────────────────────────────────────

const EVENT_TYPES = {
    anniversary: { label: '記念日', color: '#C27B7B' },
    plan:        { label: '予定',   color: '#5C7A8A' },
    memory:      { label: '思い出', color: '#B5935A' }
};

const LOCATIONS = [
    { id: 'home_minato', label: '湊の家',       mode: 'together', bg: 'minato-living-night' },
    { id: 'home_yui',    label: 'ゆいの家',     mode: 'together', bg: 'yui-living-day'      },
    { id: 'workplace',   label: '職場',         mode: 'line',     bg: 'minato-office-day'   },
    { id: 'cafe',        label: 'カフェ',       mode: 'together', bg: 'cafe-day'            },
    { id: 'date_out',    label: '外出・デート', mode: 'together', bg: null                  },
    { id: 'travel',      label: '旅行先',       mode: 'together', bg: null                  }
];

const DEFAULT_SCHEDULE_FALLBACK = {
    weekday: [
        { startHour: 0,  endHour: 5,  locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-bedroom-night'  },
        { startHour: 5,  endHour: 7,  locationId: 'home_minato', mode: 'together', label: '湊の家・朝', bg: 'minato-bedroom-morning'},
        { startHour: 7,  endHour: 9,  locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-living-day'     },
        { startHour: 9,  endHour: 18, locationId: 'workplace',   mode: 'line',     label: '職場',      bg: 'minato-office-day'     },
        { startHour: 18, endHour: 23, locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-living-night'   },
        { startHour: 23, endHour: 24, locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-bedroom-night'  }
    ],
    weekend: [
        { startHour: 0,  endHour: 7,  locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-bedroom-night'  },
        { startHour: 7,  endHour: 9,  locationId: 'home_minato', mode: 'together', label: '湊の家・朝', bg: 'minato-bedroom-morning'},
        { startHour: 9,  endHour: 12, locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-living-day'     },
        { startHour: 12, endHour: 17, locationId: 'cafe',        mode: 'together', label: 'カフェ',    bg: 'cafe-day'              },
        { startHour: 17, endHour: 20, locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-living-day'     },
        { startHour: 20, endHour: 23, locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-living-night'   },
        { startHour: 23, endHour: 24, locationId: 'home_minato', mode: 'together', label: '湊の家',    bg: 'minato-bedroom-night'  }
    ]
};

// ── 状態 ──────────────────────────────────────────────────────────

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed
let selectedDate = null;
let eventsCache  = {}; // "YYYY-MM-DD" → [event, ...]
let defaultSchedule = null;

// ── API ───────────────────────────────────────────────────────────

async function apiPost(data) {
    const res = await fetch(CALENDAR_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function fetchMonthEvents(year, month) {
    const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
    try {
        const data = await apiPost({ type: 'get_events', yearMonth });
        eventsCache = {};
        (data.events || []).forEach(ev => {
            if (!eventsCache[ev.date]) eventsCache[ev.date] = [];
            eventsCache[ev.date].push(ev);
        });
    } catch (e) {
        console.warn('イベント取得失敗:', e.message);
    }
}

async function createEvent(ev) {
    const data = await apiPost({ type: 'create_event', event: ev });
    const event = data.event;
    if (!eventsCache[event.date]) eventsCache[event.date] = [];
    eventsCache[event.date].push(event);
    return event;
}

async function deleteEvent(eventId, date) {
    await apiPost({ type: 'delete_event', eventId });
    if (eventsCache[date]) {
        eventsCache[date] = eventsCache[date].filter(e => e.eventId !== eventId);
    }
}

async function fetchDefaultSchedule() {
    try {
        const data = await apiPost({ type: 'get_default_schedule' });
        defaultSchedule = data.schedule || DEFAULT_SCHEDULE_FALLBACK;
    } catch {
        defaultSchedule = DEFAULT_SCHEDULE_FALLBACK;
    }
}

async function saveDefaultSchedule(schedule) {
    await apiPost({ type: 'save_default_schedule', schedule });
    defaultSchedule = schedule;
}

// ── カレンダー描画 ────────────────────────────────────────────────

function renderCalendar() {
    const today = new Date();
    const firstDay  = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    document.getElementById('calMonthLabel').textContent =
        `${currentYear}年${currentMonth + 1}月`;

    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';

    // 曜日ヘッダー
    ['日','月','火','水','木','金','土'].forEach((d, i) => {
        const cell = document.createElement('div');
        cell.className = 'cal-weekday' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '');
        cell.textContent = d;
        grid.appendChild(cell);
    });

    // 先頭の空白
    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-day empty' }));
    }

    // 日付セル
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = today.getFullYear() === currentYear &&
                        today.getMonth()    === currentMonth &&
                        today.getDate()     === d;
        const isSelected = selectedDate === dateStr;

        const cell = document.createElement('div');
        cell.className = 'cal-day' +
            (isToday    ? ' today'    : '') +
            (isSelected ? ' selected' : '');
        cell.dataset.date = dateStr;

        const num = document.createElement('span');
        num.className = 'cal-day-num';
        num.textContent = d;
        cell.appendChild(num);

        // イベントドット
        const events = eventsCache[dateStr] || [];
        if (events.length > 0) {
            const dots = document.createElement('div');
            dots.className = 'cal-dots';
            const shown = events.slice(0, 3);
            shown.forEach(ev => {
                const dot = document.createElement('span');
                dot.className = 'cal-dot';
                dot.style.background = EVENT_TYPES[ev.type]?.color || EVENT_TYPES.plan.color;
                dots.appendChild(dot);
            });
            cell.appendChild(dots);
        }

        cell.addEventListener('click', () => selectDate(dateStr));
        grid.appendChild(cell);
    }
}

function selectDate(dateStr) {
    selectedDate = dateStr;
    renderCalendar();
    renderDatePanel(dateStr);
}

function renderDatePanel(dateStr) {
    const panel = document.getElementById('datePanel');
    const events = eventsCache[dateStr] || [];

    const [y, m, d] = dateStr.split('-');
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    const weekdays = ['日','月','火','水','木','金','土'];

    panel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'date-panel-header';
    header.innerHTML = `
        <span class="date-panel-title">${Number(m)}月${Number(d)}日（${weekdays[dt.getDay()]}）</span>
        <button class="add-event-btn" onclick="openEventModal('${dateStr}')">＋ 追加</button>
    `;
    panel.appendChild(header);

    if (events.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'date-panel-empty';
        empty.textContent = '予定はありません';
        panel.appendChild(empty);
    } else {
        events.forEach(ev => {
            const item = document.createElement('div');
            item.className = 'event-item';
            const dot = EVENT_TYPES[ev.type]?.color || EVENT_TYPES.plan.color;
            const typeLabel = EVENT_TYPES[ev.type]?.label || '予定';
            const timeStr = ev.startTime
                ? (ev.endTime ? `${ev.startTime}〜${ev.endTime}` : ev.startTime)
                : '終日';
            item.innerHTML = `
                <span class="event-dot-sm" style="background:${dot}"></span>
                <div class="event-info">
                    <span class="event-title">${escHtml(ev.title)}</span>
                    <span class="event-meta">${typeLabel} · ${escHtml(ev.label || '湊の家')} · ${timeStr}</span>
                </div>
                <button class="event-delete-btn" onclick="handleDeleteEvent('${ev.eventId}','${ev.date}')">×</button>
            `;
            panel.appendChild(item);
        });
    }

    panel.classList.add('active');
}

// ── イベント追加モーダル ──────────────────────────────────────────

function openEventModal(dateStr) {
    const modal = document.getElementById('eventModal');
    document.getElementById('eventDate').value = dateStr || selectedDate || '';
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventType').value = 'plan';
    document.getElementById('eventLocation').value = 'home_minato';
    document.getElementById('eventStartTime').value = '';
    document.getElementById('eventEndTime').value = '';
    updateModeDisplay();
    modal.classList.add('open');
}

function closeEventModal() {
    document.getElementById('eventModal').classList.remove('open');
}

function updateModeDisplay() {
    const locId = document.getElementById('eventLocation').value;
    const loc = LOCATIONS.find(l => l.id === locId);
    const modeEl = document.getElementById('eventModeDisplay');
    if (modeEl) modeEl.textContent = loc?.mode === 'line' ? 'LINE' : 'いっしょ';
}

async function handleSubmitEvent(e) {
    e.preventDefault();
    const btn = document.getElementById('eventSubmitBtn');
    btn.disabled = true;
    btn.textContent = '保存中…';

    const locId = document.getElementById('eventLocation').value;
    const loc = LOCATIONS.find(l => l.id === locId);

    try {
        const ev = {
            date:       document.getElementById('eventDate').value,
            title:      document.getElementById('eventTitle').value.trim(),
            type:       document.getElementById('eventType').value,
            locationId: locId,
            mode:       loc?.mode || 'together',
            label:      loc?.label || '湊の家',
            startTime:  document.getElementById('eventStartTime').value || null,
            endTime:    document.getElementById('eventEndTime').value   || null
        };

        await createEvent(ev);
        closeEventModal();
        renderCalendar();
        if (selectedDate === ev.date) renderDatePanel(ev.date);
    } catch (err) {
        alert('保存に失敗しました: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '保存する';
    }
}

async function handleDeleteEvent(eventId, date) {
    if (!confirm('このイベントを削除しますか？')) return;
    try {
        await deleteEvent(eventId, date);
        renderCalendar();
        renderDatePanel(date);
    } catch (err) {
        alert('削除に失敗しました: ' + err.message);
    }
}

// ── デフォルトスケジュールモーダル ───────────────────────────────

function openScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    renderScheduleEditor();
    modal.classList.add('open');
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('open');
}

function renderScheduleEditor() {
    const schedule = defaultSchedule || DEFAULT_SCHEDULE_FALLBACK;
    renderScheduleSection('scheduleWeekday', schedule.weekday, 'weekday');
    renderScheduleSection('scheduleWeekend', schedule.weekend, 'weekend');
}

function renderScheduleSection(containerId, rules, dayType) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    rules.forEach((rule, idx) => {
        const row = document.createElement('div');
        row.className = 'schedule-row';
        row.innerHTML = `
            <span class="schedule-time">${pad(rule.startHour)}:00〜${pad(rule.endHour)}:00</span>
            <select class="schedule-loc-select" data-daytype="${dayType}" data-idx="${idx}">
                ${LOCATIONS.map(l =>
                    `<option value="${l.id}" ${l.id === rule.locationId ? 'selected' : ''}>${l.label}</option>`
                ).join('')}
            </select>
            <span class="schedule-mode">${rule.mode === 'line' ? 'LINE' : 'いっしょ'}</span>
        `;
        const sel = row.querySelector('select');
        sel.addEventListener('change', (e) => {
            const loc = LOCATIONS.find(l => l.id === e.target.value);
            const modeEl = row.querySelector('.schedule-mode');
            if (loc) {
                modeEl.textContent = loc.mode === 'line' ? 'LINE' : 'いっしょ';
            }
        });
        container.appendChild(row);
    });
}

async function handleSaveSchedule() {
    const btn = document.getElementById('scheduleSaveBtn');
    btn.disabled = true;
    btn.textContent = '保存中…';

    try {
        const base = defaultSchedule || DEFAULT_SCHEDULE_FALLBACK;
        const makeUpdated = (rules, dayType) => rules.map((rule, idx) => {
            const sel = document.querySelector(
                `.schedule-loc-select[data-daytype="${dayType}"][data-idx="${idx}"]`
            );
            if (!sel) return rule;
            const loc = LOCATIONS.find(l => l.id === sel.value);
            return { ...rule, locationId: sel.value, mode: loc?.mode || rule.mode, label: loc?.label || rule.label };
        });

        const updated = {
            weekday: makeUpdated(base.weekday, 'weekday'),
            weekend: makeUpdated(base.weekend, 'weekend')
        };

        await saveDefaultSchedule(updated);
        closeScheduleModal();
    } catch (err) {
        alert('保存に失敗しました: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '保存する';
    }
}

// ── ナビゲーション ────────────────────────────────────────────────

function prevMonth() {
    if (currentMonth === 0) { currentMonth = 11; currentYear--; }
    else currentMonth--;
    selectedDate = null;
    document.getElementById('datePanel').classList.remove('active');
    loadAndRender();
}

function nextMonth() {
    if (currentMonth === 11) { currentMonth = 0; currentYear++; }
    else currentMonth++;
    selectedDate = null;
    document.getElementById('datePanel').classList.remove('active');
    loadAndRender();
}

async function loadAndRender() {
    await fetchMonthEvents(currentYear, currentMonth);
    renderCalendar();
}

// ── ユーティリティ ────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 初期化 ────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        fetchMonthEvents(currentYear, currentMonth),
        fetchDefaultSchedule()
    ]);
    renderCalendar();

    document.getElementById('eventForm').addEventListener('submit', handleSubmitEvent);
    document.getElementById('eventLocation').addEventListener('change', updateModeDisplay);
    document.getElementById('eventModalBackdrop').addEventListener('click', closeEventModal);
    document.getElementById('scheduleModalBackdrop').addEventListener('click', closeScheduleModal);
});

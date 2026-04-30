const CALENDAR_API_URL = 'https://thvrcvcot4.execute-api.us-east-1.amazonaws.com/prod/calendar';

// ── 定数 ──────────────────────────────────────────────────────────

const QUICK_TYPES = {
    gohan:   { label: 'ごはん',       icon: '🍴',  locationId: 'date_out',    color: '#C27B7B' },
    cafe:    { label: 'カフェ',       icon: '☕',   locationId: 'cafe',        color: '#B5935A' },
    otomari: { label: 'お泊まり',     icon: '🌙',  locationId: 'home_minato', color: '#5C7A8A' },
    sanpo:   { label: '散歩',         icon: '🚶',  locationId: 'date_out',    color: '#7A9A6A' },
    ie:      { label: '家でゆっくり', icon: '🏠',  locationId: 'home_minato', color: '#9A8A7A' },
    special: { label: 'ちょっと特別', icon: '✨',  locationId: 'date_out',    color: '#A87BAA' },
    other:   { label: 'その他',       icon: '📝',  locationId: 'date_out',    color: '#8A8A8A' }
};

const LOCATIONS = [
    { id: 'home_minato', label: '湊の家',       mode: 'together' },
    { id: 'home_yui',    label: 'ゆいの家',     mode: 'together' },
    { id: 'workplace',   label: '職場',         mode: 'line'     },
    { id: 'cafe',        label: 'カフェ',       mode: 'together' },
    { id: 'date_out',    label: '外出・デート', mode: 'together' },
    { id: 'travel',      label: '旅行先',       mode: 'together' }
];

const DEFAULT_SCHEDULE_FALLBACK = {
    weekday: [
        { startHour: 0,  endHour: 5,  locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-bedroom-night'   },
        { startHour: 5,  endHour: 7,  locationId: 'home_minato', mode: 'together', label: '湊の家・朝',  bg: 'minato-bedroom-morning' },
        { startHour: 7,  endHour: 9,  locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-living-day'      },
        { startHour: 9,  endHour: 18, locationId: 'workplace',   mode: 'line',     label: '職場',       bg: 'minato-office-day'      },
        { startHour: 18, endHour: 23, locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-living-night'    },
        { startHour: 23, endHour: 24, locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-bedroom-night'   }
    ],
    weekend: [
        { startHour: 0,  endHour: 7,  locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-bedroom-night'   },
        { startHour: 7,  endHour: 9,  locationId: 'home_minato', mode: 'together', label: '湊の家・朝',  bg: 'minato-bedroom-morning' },
        { startHour: 9,  endHour: 12, locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-living-day'      },
        { startHour: 12, endHour: 17, locationId: 'cafe',        mode: 'together', label: 'カフェ',     bg: 'cafe-day'               },
        { startHour: 17, endHour: 20, locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-living-day'      },
        { startHour: 20, endHour: 23, locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-living-night'    },
        { startHour: 23, endHour: 24, locationId: 'home_minato', mode: 'together', label: '湊の家',     bg: 'minato-bedroom-night'   }
    ]
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ── 状態 ──────────────────────────────────────────────────────────

let currentYear    = new Date().getFullYear();
let currentMonth   = new Date().getMonth();
let selectedDate   = null;
let currentEditDate = null;
let eventsCache    = {};
let defaultSchedule = null;

// ── API ───────────────────────────────────────────────────────────

async function apiPost(data) {
    const res = await fetch(CALENDAR_API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data)
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
    const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    document.getElementById('calMonthLabel').textContent =
        `${currentYear}年${currentMonth + 1}月`;

    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';

    ['日', '月', '火', '水', '木', '金', '土'].forEach((d, i) => {
        const cell = document.createElement('div');
        cell.className = 'cal-weekday' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '');
        cell.textContent = d;
        grid.appendChild(cell);
    });

    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-day empty' }));
    }

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
        num.className   = 'cal-day-num';
        num.textContent = d;
        cell.appendChild(num);

        const events = eventsCache[dateStr] || [];
        if (events.length > 0) {
            const dots = document.createElement('div');
            dots.className = 'cal-dots';
            events.slice(0, 3).forEach(ev => {
                const dot = document.createElement('span');
                dot.className = 'cal-dot';
                const qt = QUICK_TYPES[ev.quickType];
                dot.style.background = qt?.color || '#8A8A8A';
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
    renderCalDetail(dateStr);
}

function renderCalDetail(dateStr) {
    const detail = document.getElementById('calDetail');
    const events = eventsCache[dateStr] || [];
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(Number(y), Number(m) - 1, Number(d));

    detail.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cal-detail-header';
    header.innerHTML = `
        <span class="cal-detail-date">${Number(m)}月${Number(d)}日（${WEEKDAYS[dt.getDay()]}）</span>
        <button class="add-event-btn" onclick="openEventModal('${dateStr}')">＋ きろく</button>
    `;
    detail.appendChild(header);

    if (events.length === 0) {
        const empty = document.createElement('p');
        empty.className   = 'date-panel-empty';
        empty.textContent = 'きろくなし';
        detail.appendChild(empty);
        return;
    }

    events.forEach(ev => {
        const qt = QUICK_TYPES[ev.quickType] || QUICK_TYPES.other;
        const timeStr = ev.startTime
            ? (ev.endTime ? `${ev.startTime}〜${ev.endTime}` : ev.startTime)
            : '';
        const showTitle = ev.title && ev.title !== qt.label;

        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <span class="event-card-icon">${qt.icon}</span>
            <div class="event-card-body">
                <span class="event-card-type">${qt.label}</span>
                ${showTitle ? `<span class="event-card-title">${escHtml(ev.title)}</span>` : ''}
                ${ev.memo   ? `<p class="event-card-memo">${escHtml(ev.memo)}</p>` : ''}
                ${timeStr   ? `<span class="event-card-time">${timeStr}</span>` : ''}
            </div>
            <button class="event-delete-btn" onclick="handleDeleteEvent('${ev.eventId}','${ev.date}')">×</button>
        `;
        detail.appendChild(card);
    });
}

// ── きろく追加モーダル ────────────────────────────────────────────

function buildQuickTypeGrid() {
    const grid = document.getElementById('quickTypeGrid');
    grid.innerHTML = '';
    Object.entries(QUICK_TYPES).forEach(([key, qt]) => {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'quick-type-btn';
        btn.dataset.key = key;
        btn.innerHTML = `
            <span class="quick-type-icon">${qt.icon}</span>
            <span class="quick-type-label">${qt.label}</span>
        `;
        btn.addEventListener('click', () => selectQuickType(key));
        grid.appendChild(btn);
    });
}

function selectQuickType(key) {
    document.querySelectorAll('.quick-type-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.key === key);
    });
    document.getElementById('eventQuickType').value = key;
    document.getElementById('eventSubmitBtn').disabled = false;
}

function openEventModal(dateStr) {
    currentEditDate = dateStr || selectedDate || '';

    const titleEl = document.getElementById('eventModalTitle');
    if (currentEditDate) {
        const [y, m, d] = currentEditDate.split('-');
        const dt = new Date(Number(y), Number(m) - 1, Number(d));
        titleEl.textContent = `${Number(m)}月${Number(d)}日（${WEEKDAYS[dt.getDay()]}）のきろく`;
    } else {
        titleEl.textContent = 'きろくを追加';
    }

    document.getElementById('eventQuickType').value = '';
    document.getElementById('eventTitle').value      = '';
    document.getElementById('eventMemo').value       = '';
    document.getElementById('eventStartTime').value  = '';
    document.getElementById('eventEndTime').value    = '';
    document.getElementById('eventSubmitBtn').disabled = true;
    document.querySelectorAll('.quick-type-btn').forEach(b => b.classList.remove('selected'));

    document.getElementById('eventModal').classList.add('open');
    document.getElementById('eventModalBackdrop').classList.add('open');
}

function closeEventModal() {
    document.getElementById('eventModal').classList.remove('open');
    document.getElementById('eventModalBackdrop').classList.remove('open');
}

async function handleSubmitEvent(e) {
    e.preventDefault();
    const quickTypeKey = document.getElementById('eventQuickType').value;
    if (!quickTypeKey) return;

    const btn = document.getElementById('eventSubmitBtn');
    btn.disabled    = true;
    btn.textContent = '保存中…';

    const qt    = QUICK_TYPES[quickTypeKey];
    const title = document.getElementById('eventTitle').value.trim() || qt.label;
    const loc   = LOCATIONS.find(l => l.id === qt.locationId);

    try {
        const ev = {
            date:       currentEditDate,
            title,
            quickType:  quickTypeKey,
            type:       'plan',
            locationId: qt.locationId,
            mode:       loc?.mode || 'together',
            label:      loc?.label || qt.label,
            memo:       document.getElementById('eventMemo').value.trim() || null,
            startTime:  document.getElementById('eventStartTime').value || null,
            endTime:    document.getElementById('eventEndTime').value   || null
        };

        await createEvent(ev);
        closeEventModal();
        renderCalendar();
        if (selectedDate === ev.date) renderCalDetail(ev.date);
    } catch (err) {
        alert('保存に失敗しました: ' + err.message);
    } finally {
        btn.disabled    = false;
        btn.textContent = '保存する';
    }
}

async function handleDeleteEvent(eventId, date) {
    if (!confirm('このきろくを削除しますか？')) return;
    try {
        await deleteEvent(eventId, date);
        renderCalendar();
        renderCalDetail(date);
    } catch (err) {
        alert('削除に失敗しました: ' + err.message);
    }
}

// ── デフォルトスケジュールモーダル ───────────────────────────────

function openScheduleModal() {
    renderScheduleEditor();
    document.getElementById('scheduleModal').classList.add('open');
    document.getElementById('scheduleModalBackdrop').classList.add('open');
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('open');
    document.getElementById('scheduleModalBackdrop').classList.remove('open');
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
            row.querySelector('.schedule-mode').textContent = loc?.mode === 'line' ? 'LINE' : 'いっしょ';
        });
        container.appendChild(row);
    });
}

async function handleSaveSchedule() {
    const btn = document.getElementById('scheduleSaveBtn');
    btn.disabled    = true;
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
        btn.disabled    = false;
        btn.textContent = '保存する';
    }
}

// ── ナビゲーション ────────────────────────────────────────────────

function prevMonth() {
    if (currentMonth === 0) { currentMonth = 11; currentYear--; }
    else currentMonth--;
    selectedDate = null;
    document.getElementById('calDetail').innerHTML = '<div class="cal-detail-empty">日付を選んでください</div>';
    loadAndRender();
}

function nextMonth() {
    if (currentMonth === 11) { currentMonth = 0; currentYear++; }
    else currentMonth++;
    selectedDate = null;
    document.getElementById('calDetail').innerHTML = '<div class="cal-detail-empty">日付を選んでください</div>';
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
    buildQuickTypeGrid();

    await Promise.all([
        fetchMonthEvents(currentYear, currentMonth),
        fetchDefaultSchedule()
    ]);
    renderCalendar();

    document.getElementById('eventForm').addEventListener('submit', handleSubmitEvent);
    document.getElementById('eventModalBackdrop').addEventListener('click', closeEventModal);
    document.getElementById('scheduleModalBackdrop').addEventListener('click', closeScheduleModal);
});

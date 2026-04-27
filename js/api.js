const API_URL          = 'https://thvrcvcot4.execute-api.us-east-1.amazonaws.com/prod/chat';
const CALENDAR_API_URL = 'https://thvrcvcot4.execute-api.us-east-1.amazonaws.com/prod/calendar';

// ===== デフォルトスケジュール（フォールバック） =====
const SCHEDULE = {
    weekday: [
        { start: 0,  end: 5,  bg: 'minato-bedroom-night',   mode: 'together', label: '湊の家' },
        { start: 5,  end: 7,  bg: 'minato-bedroom-morning',  mode: 'together', label: '湊の家・朝' },
        { start: 7,  end: 9,  bg: 'minato-living-day',       mode: 'together', label: '湊の家' },
        { start: 9,  end: 18, bg: 'minato-office-day',       mode: 'line',     label: '職場' },
        { start: 18, end: 23, bg: 'minato-living-night',     mode: 'together', label: '湊の家' },
        { start: 23, end: 24, bg: 'minato-bedroom-night',    mode: 'together', label: '湊の家' },
    ],
    weekend: [
        { start: 0,  end: 7,  bg: 'minato-bedroom-night',   mode: 'together', label: '湊の家' },
        { start: 7,  end: 9,  bg: 'minato-bedroom-morning',  mode: 'together', label: '湊の家・朝' },
        { start: 9,  end: 12, bg: 'minato-living-day',       mode: 'together', label: '湊の家' },
        { start: 12, end: 17, bg: 'cafe-day',                mode: 'together', label: 'カフェ' },
        { start: 17, end: 20, bg: 'minato-living-day',       mode: 'together', label: '湊の家' },
        { start: 20, end: 23, bg: 'minato-living-night',     mode: 'together', label: '湊の家' },
        { start: 23, end: 24, bg: 'minato-bedroom-night',    mode: 'together', label: '湊の家' },
    ]
};

// ===== 状態 =====
let dynamicSchedule   = null; // DynamoDB から取得したスケジュール（取得後に上書き）
let todayEvents       = [];   // 今日のカレンダーイベント
let currentSituation  = null;
let isSending         = false;

// ===== シチュエーション解決 =====

function getDefaultSituation() {
    const now = new Date();
    const h   = now.getHours();
    const isWeekend = [0, 6].includes(now.getDay());

    if (dynamicSchedule) {
        const rules = isWeekend ? dynamicSchedule.weekend : dynamicSchedule.weekday;
        const rule  = rules.find(r => h >= r.startHour && h < r.endHour) || rules[0];
        return { bg: rule.bg, mode: rule.mode, label: rule.label };
    }

    const rules = isWeekend ? SCHEDULE.weekend : SCHEDULE.weekday;
    return rules.find(s => h >= s.start && h < s.end) || rules[0];
}

// カレンダーイベントが有効なら mode/label を上書き、bg は時間帯ベースを維持
function getActiveSituation() {
    const defSit = getDefaultSituation();
    if (!todayEvents.length) return defSit;

    const now  = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const active = todayEvents.find(ev => {
        if (!ev.startTime) return true; // 終日イベント
        const [sh, sm] = ev.startTime.split(':').map(Number);
        const [eh, em] = (ev.endTime || '23:59').split(':').map(Number);
        return mins >= sh * 60 + sm && mins < eh * 60 + em;
    });

    if (!active) return defSit;
    return { bg: defSit.bg, mode: active.mode, label: active.label };
}

// ===== カレンダーデータ取得 =====

async function calPost(data) {
    const res = await fetch(CALENDAR_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

async function fetchAndApplyCalendar() {
    try {
        const now     = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const [schedRes, evRes] = await Promise.all([
            calPost({ type: 'get_default_schedule' }).catch(() => null),
            calPost({ type: 'get_today', date: dateStr }).catch(() => null)
        ]);

        if (schedRes?.schedule) dynamicSchedule = schedRes.schedule;
        if (evRes?.events)      todayEvents      = evRes.events;

        // 取得後にシチュエーションを再評価
        const newSit = getActiveSituation();
        if (newSit.mode !== currentSituation.mode || newSit.label !== currentSituation.label || newSit.bg !== currentSituation.bg) {
            currentSituation = newSit;
            updateBackground(newSit);
            updateTopBar(newSit);
        }
    } catch (e) {
        console.warn('カレンダー取得失敗（フォールバック使用）:', e.message);
    }
}

// ===== チャット履歴の永続化 =====
const CHAT_STORAGE_KEY = 'mina_chat_html';

function saveChatToStorage() {
    try {
        sessionStorage.setItem(CHAT_STORAGE_KEY, document.getElementById('chatArea').innerHTML);
    } catch(e) {}
}

function restoreChatFromStorage() {
    try {
        const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
        if (saved) {
            document.getElementById('chatArea').innerHTML = saved;
            scrollBottom();
        }
    } catch(e) {}
}

// ===== 初期化 =====

function init() {
    currentSituation = getActiveSituation();
    updateBackground(currentSituation);
    updateTopBar(currentSituation);
    updateClock();
    restoreChatFromStorage();
    setInterval(updateClock, 1000);
    setInterval(checkSituationChange, 60000);

    const input = document.getElementById('userInput');
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendMessage();
        }
    });

    // バックグラウンドでカレンダーデータを取得して反映
    fetchAndApplyCalendar();
}

function updateClock() {
    const now = new Date();
    const el  = document.getElementById('currentTime');
    if (el) el.textContent =
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function checkSituationChange() {
    const newSit = getActiveSituation();
    if (newSit.bg !== currentSituation.bg || newSit.mode !== currentSituation.mode) {
        currentSituation = newSit;
        updateBackground(newSit);
        updateTopBar(newSit);
    }
}

function updateBackground(sit) {
    const layer = document.getElementById('bgLayer');
    if (!layer || !sit.bg) return;
    layer.classList.add('fade-out');
    setTimeout(() => {
        layer.style.backgroundImage = `url('images/${sit.bg}.jpeg')`;
        layer.classList.remove('fade-out');
    }, 400);
}

// ===== キーワード→背景切り替え =====

// 現在の背景プレフィックスから「どの家にいるか」を判定
function getLocationOwner() {
    const bg = currentSituation.bg;
    if (bg.startsWith('minato-')) return 'minato';
    if (bg.startsWith('yui-'))   return 'yui';
    return null; // 職場・カフェなど外はキーワード切り替えなし
}

const KEYWORD_BG = [
    {
        words: ['キッチン', '台所', '料理', '炒め', 'コンロ', '鍋'],
        // minato-kitchen.jpeg がないため yui-kitchen を共用
        bg: (owner) => (owner === 'minato' || owner === 'yui') ? 'yui-kitchen' : null
    },
    {
        words: ['お風呂', '風呂', 'シャワー', 'バスルーム'],
        bg: (owner) => owner === 'minato' ? 'minato-bathroom' : null
    },
    {
        words: ['ベッド', '布団', '寝室', '横になる', '寝よう', '寝転'],
        bg: (owner) => {
            const night = new Date().getHours() >= 18 || new Date().getHours() < 6;
            if (owner === 'minato') return night ? 'minato-bedroom-night' : 'minato-bedroom-morning';
            if (owner === 'yui')   return night ? 'yui-bedroom-night'    : 'yui-bedroom-morning';
            return null;
        }
    },
    {
        words: ['リビング', 'ソファ', 'テレビ'],
        bg: (owner) => {
            const night = new Date().getHours() >= 18 || new Date().getHours() < 6;
            if (owner === 'minato') return night ? 'minato-living-night' : 'minato-living-day';
            if (owner === 'yui')   return night ? 'yui-living-night'    : 'yui-living-day';
            return null;
        }
    },
];

function checkKeywordBackground(text) {
    const owner = getLocationOwner();
    if (!owner) return; // 外・職場では切り替えなし

    for (const entry of KEYWORD_BG) {
        if (entry.words.some(w => text.includes(w))) {
            const newBg = entry.bg(owner);
            if (newBg && newBg !== currentSituation.bg) {
                updateBackground({ bg: newBg });
            }
            return;
        }
    }
}

function updateTopBar(sit) {
    document.getElementById('locationName').textContent = sit.label;
    const tag = document.getElementById('modeTag');
    if (sit.mode === 'line') {
        tag.textContent = 'LINE';
        tag.classList.add('line-mode');
    } else {
        tag.textContent = 'いっしょ';
        tag.classList.remove('line-mode');
    }
}

// ===== メッセージ送信 =====
async function sendMessage() {
    if (isSending) return;
    const input = document.getElementById('userInput');
    const text  = input.value.trim();
    if (!text) return;

    isSending = true;
    input.value = '';
    document.getElementById('sendBtn').disabled = true;

    const sit = currentSituation;
    appendUserMessage(text, sit.mode);
    const typing = appendTyping(sit.mode);

    try {
        const contextPrefix = sit.mode === 'line'
            ? `[状況: 別々の場所でLINEでやり取り中。${sit.label}にいる] `
            : `[状況: いっしょにいる。${sit.label}。] `;

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: contextPrefix + text, mode: sit.mode, location: sit.label })
        });

        const data = await res.json();
        typing.remove();
        const reply = data.reply || '…';
        appendMinatoMessage(reply, sit.mode);
        checkKeywordBackground(text + ' ' + reply);
    } catch {
        typing.remove();
        appendError();
    } finally {
        isSending = false;
        document.getElementById('sendBtn').disabled = false;
        input.focus();
    }
}

// ===== メッセージ描画 =====
function appendUserMessage(text, mode) {
    const area = document.getElementById('chatArea');
    const wrap = document.createElement('div');
    if (mode === 'line') {
        wrap.className = 'line-msg yui';
        wrap.innerHTML = `<div class="bubble">${escHtml(text)}</div>`;
    } else {
        wrap.className = 'together-msg yui';
        wrap.innerHTML = `<div class="dialogue-bubble">${escHtml(text)}</div>`;
    }
    area.appendChild(wrap);
    scrollBottom();
    saveChatToStorage();
}

function appendMinatoMessage(text, mode) {
    const area = document.getElementById('chatArea');
    const wrap = document.createElement('div');
    if (mode === 'line') {
        wrap.className = 'line-msg minato';
        wrap.innerHTML = `<div class="bubble">${formatLine(text)}</div>`;
    } else {
        wrap.className = 'together-msg minato';
        wrap.innerHTML = formatTogether(text);
    }
    area.appendChild(wrap);
    scrollBottom();
    saveChatToStorage();
}

function appendTyping(mode) {
    const area = document.getElementById('chatArea');
    const el   = document.createElement('div');
    el.className = mode === 'line' ? 'line-msg minato' : 'together-msg minato';
    el.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>`;
    area.appendChild(el);
    scrollBottom();
    return el;
}

function appendError() {
    const area = document.getElementById('chatArea');
    const el   = document.createElement('div');
    el.className  = 'error-msg';
    el.textContent = '送信に失敗しました。もう一度試してください。';
    area.appendChild(el);
    scrollBottom();
    saveChatToStorage();
}

// ===== テキスト整形 =====
function formatLine(text) {
    return escHtml(text).replace(/\n/g, '<br>');
}

function formatTogether(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const result = [];

    lines.forEach(line => {
        const trimmed = line.trim();

        if (/^\*([^*]+)\*$/.test(trimmed)) {
            result.push(`<p class="action-text">${escHtml(trimmed.slice(1, -1))}</p>`);
            return;
        }

        if (trimmed.includes('*')) {
            const parts = trimmed.split(/(\*[^*]+\*)/g);
            const actions = [];
            const dialogues = [];
            parts.forEach(part => {
                if (/^\*([^*]+)\*$/.test(part)) {
                    actions.push(escHtml(part.slice(1, -1)));
                } else if (part.trim()) {
                    dialogues.push(escHtml(part.trim()));
                }
            });
            if (actions.length)   result.push(`<p class="action-text">${actions.join('・')}</p>`);
            if (dialogues.length) result.push(`<div class="dialogue-bubble">${dialogues.join(' ')}</div>`);
            return;
        }

        result.push(`<div class="dialogue-bubble">${escHtml(trimmed)}</div>`);
    });

    return result.join('');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scrollBottom() {
    const area = document.getElementById('chatArea');
    area.scrollTop = area.scrollHeight;
}

window.addEventListener('DOMContentLoaded', init);

const API_URL = 'https://thvrcvcot4.execute-api.us-east-1.amazonaws.com/prod/chat';

// ===== シチュエーション定義 =====
const SCHEDULE = {
    weekday: [
        { start: 0,  end: 5,  bg: 'minato-bedroom-night', mode: 'together', label: '湊の家' },
        { start: 5,  end: 7,  bg: 'minato-bedroom-morning', mode: 'together', label: '湊の家・朝' },
        { start: 7,  end: 9,  bg: 'minato-living-day', mode: 'together', label: '湊の家' },
        { start: 9,  end: 18, bg: 'minato-office-day', mode: 'line', label: '職場' },
        { start: 18, end: 23, bg: 'minato-living-night', mode: 'together', label: '湊の家' },
        { start: 23, end: 24, bg: 'minato-bedroom-night', mode: 'together', label: '湊の家' },
    ],
    weekend: [
        { start: 0,  end: 7,  bg: 'minato-bedroom-night', mode: 'together', label: '湊の家' },
        { start: 7,  end: 9,  bg: 'minato-bedroom-morning', mode: 'together', label: '湊の家・朝' },
        { start: 9,  end: 12, bg: 'minato-living-day', mode: 'together', label: '湊の家' },
        { start: 12, end: 17, bg: 'cafe-day', mode: 'together', label: 'カフェ' },
        { start: 17, end: 20, bg: 'minato-living-day', mode: 'together', label: '湊の家' },
        { start: 20, end: 23, bg: 'minato-living-night', mode: 'together', label: '湊の家' },
        { start: 23, end: 24, bg: 'minato-bedroom-night', mode: 'together', label: '湊の家' },
    ]
};

function getSituation() {
    const now = new Date();
    const h = now.getHours();
    const d = now.getDay();
    const isWeekend = d === 0 || d === 6;
    const schedule = isWeekend ? SCHEDULE.weekend : SCHEDULE.weekday;
    return schedule.find(s => h >= s.start && h < s.end) || schedule[0];
}

// ===== 状態 =====
let currentSituation = getSituation();
let isSending = false;

// ===== 初期化 =====
function init() {
    updateBackground(currentSituation);
    updateTopBar(currentSituation);
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(checkSituationChange, 60000);

    const input = document.getElementById('userInput');
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const el = document.getElementById('currentTime');
    if (el) el.textContent = `${h}:${m}`;
}

function checkSituationChange() {
    const newSit = getSituation();
    if (newSit.bg !== currentSituation.bg) {
        currentSituation = newSit;
        updateBackground(newSit);
        updateTopBar(newSit);
    }
}

function updateBackground(sit) {
    const layer = document.getElementById('bgLayer');
    layer.classList.add('fade-out');
    setTimeout(() => {
        layer.style.backgroundImage = `url('images/${sit.bg}.jpeg')`;
        layer.classList.remove('fade-out');
    }, 400);
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
    const text = input.value.trim();
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
        appendMinatoMessage(data.reply || '…', sit.mode);
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

    if (mode === 'line') {
        const wrap = document.createElement('div');
        wrap.className = 'line-msg yui';
        wrap.innerHTML = `<div class="bubble">${escHtml(text)}</div>`;
        area.appendChild(wrap);
    } else {
        const wrap = document.createElement('div');
        wrap.className = 'together-msg yui';
        wrap.innerHTML = `<p class="dialogue-text">${escHtml(text)}</p>`;
        area.appendChild(wrap);
    }
    scrollBottom();
}

function appendMinatoMessage(text, mode) {
    const area = document.getElementById('chatArea');

    if (mode === 'line') {
        const wrap = document.createElement('div');
        wrap.className = 'line-msg minato';
        wrap.innerHTML = `<div class="bubble">${formatLine(text)}</div>`;
        area.appendChild(wrap);
    } else {
        const wrap = document.createElement('div');
        wrap.className = 'together-msg minato';
        wrap.innerHTML = formatTogether(text);
        area.appendChild(wrap);
    }
    scrollBottom();
}

function appendTyping(mode) {
    const area = document.getElementById('chatArea');
    const el = document.createElement('div');

    if (mode === 'line') {
        el.className = 'line-msg minato';
        el.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>`;
    } else {
        el.className = 'together-msg minato';
        el.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>`;
    }
    area.appendChild(el);
    scrollBottom();
    return el;
}

function appendError() {
    const area = document.getElementById('chatArea');
    const el = document.createElement('div');
    el.className = 'error-msg';
    el.textContent = '送信に失敗しました。もう一度試してください。';
    area.appendChild(el);
    scrollBottom();
}

// ===== テキスト整形 =====
function formatLine(text) {
    return escHtml(text).replace(/\n/g, '<br>');
}

function formatTogether(text) {
    const lines = text.split('\n').filter(l => l.trim());
    return lines.map(line => {
        // *action* → action-text
        if (/^\*(.+)\*$/.test(line)) {
            return `<p class="action-text">${escHtml(line.slice(1, -1))}</p>`;
        }
        return `<p class="dialogue-text">${escHtml(line)}</p>`;
    }).join('');
}

function escHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function scrollBottom() {
    const area = document.getElementById('chatArea');
    area.scrollTop = area.scrollHeight;
}

window.addEventListener('DOMContentLoaded', init);

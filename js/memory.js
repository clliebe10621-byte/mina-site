const API_URL = 'https://thvrcvcot4.execute-api.us-east-1.amazonaws.com/prod/chat';

async function loadMemories() {
    const list    = document.getElementById('memList');
    const loading = document.getElementById('memLoading');
    const count   = document.getElementById('memCount');

    try {
        const res  = await fetch(API_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ type: 'get_memory' })
        });
        const data     = await res.json();
        const memories = data.memories || [];

        loading.remove();
        count.textContent = memories.length > 0 ? `${memories.length}件` : '';

        if (memories.length === 0) {
            const empty = document.createElement('p');
            empty.className   = 'mem-empty';
            empty.textContent = 'まだ記憶はありません';
            list.appendChild(empty);
            return;
        }

        // Group by month
        const groups = {};
        memories.forEach(mem => {
            const d   = new Date(Number(mem.memoryKey));
            const key = `${d.getFullYear()}年${d.getMonth() + 1}月`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(mem);
        });

        Object.entries(groups).forEach(([label, items]) => {
            const section = document.createElement('div');
            section.className = 'mem-section';

            const heading = document.createElement('p');
            heading.className   = 'mem-month';
            heading.textContent = label;
            section.appendChild(heading);

            items.forEach(mem => {
                const d       = new Date(Number(mem.memoryKey));
                const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;

                const item = document.createElement('div');
                item.className = 'mem-item';
                item.innerHTML = `
                    <svg class="mem-heart" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    <div class="mem-body">
                        <p class="mem-text">${escHtml(mem.content)}</p>
                        <time class="mem-date">${dateStr}</time>
                    </div>
                `;
                section.appendChild(item);
            });

            list.appendChild(section);
        });

    } catch {
        loading.remove();
        const err = document.createElement('p');
        err.className   = 'mem-empty';
        err.textContent = '読み込みに失敗しました';
        list.appendChild(err);
    }
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', loadMemories);

const state = {
    user_id: '',
    display_name: 'User',
    credits: 0,
    currentSection: 'home',
    isTyping: false,
    viewDate: new Date(),
    selectedDate: new Date(),
    lastMessageDate: null,
    isActionPanelOpen: false
};

// DOM Elements
const sections = {
    home: document.getElementById('home-section'),
    chat: document.getElementById('chat-section')
};

const subSections = {
    chatList: document.getElementById('chat-list-view'),
    chatView: document.getElementById('chat-conversation-view')
};

const onboardingModal = document.getElementById('onboarding-modal');
const onboardingInput = document.getElementById('onboarding-name');
const getStartedBtn = document.getElementById('get-started-btn');

const navItems = document.querySelectorAll('.nav-item');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const backToListBtn = document.getElementById('back-to-list');
const aiAssistantContact = document.getElementById('ai-assistant-contact');
const toggleActionsBtn = document.getElementById('toggle-actions-btn');
const chatActionPanel = document.getElementById('chat-action-panel');
const actionBtns = document.querySelectorAll('.action-btn');

const creditCounts = [
    document.getElementById('credit-count'),
    document.getElementById('chat-credit-count')
];

// Calendar Nav Buttons
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

if (prevMonthBtn) {
    prevMonthBtn.onclick = () => {
        state.viewDate.setMonth(state.viewDate.getMonth() - 1);
        generateCalendar();
    };
}

if (nextMonthBtn) {
    nextMonthBtn.onclick = () => {
        state.viewDate.setMonth(state.viewDate.getMonth() + 1);
        generateCalendar();
    };
}

// Initialize
async function init() {
    state.user_id = localStorage.getItem('peep_api_key') || '';

    if (!state.user_id) {
        onboardingModal.classList.add('active');
    } else {
        await fetchProfile();
        setupSSE();
        generateCalendar();
        fetchSchedules();
    }
}

// Onboarding
getStartedBtn.addEventListener('click', async () => {
    const name = onboardingInput.value.trim();
    if (!name) return;

    try {
        const response = await fetch('/api/v1/uids', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: name })
        });

        if (response.ok) {
            const data = await response.json();
            state.user_id = data.id;
            state.display_name = name;
            state.credits = data.credits;

            localStorage.setItem('peep_api_key', data.id);
            onboardingModal.classList.remove('active');

            updateCredits(data.credits);
            document.getElementById('display-name').textContent = name;

            setupSSE();
            generateCalendar();
            fetchSchedules();
        }
    } catch (err) {
        console.error('Onboarding failed:', err);
    }
});

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        if (!target || !sections[target]) return;

        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        Object.keys(sections).forEach(key => sections[key].classList.remove('active'));
        sections[target].classList.add('active');
        state.currentSection = target;

        if (target !== 'chat') {
            subSections.chatView.classList.remove('active');
            subSections.chatList.classList.add('active');
        }
    });
});

aiAssistantContact.addEventListener('click', () => {
    subSections.chatList.classList.remove('active');
    subSections.chatView.classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'none';

    // Clear and fetch history
    chatMessages.innerHTML = '';
    state.lastMessageDate = null;
    fetchChatHistory();

    scrollToBottom();
});

async function fetchChatHistory() {
    state.isTyping = true;
    chatMessages.innerHTML = `
        <div class="history-loader">
            <div class="spinner"></div>
            <span>Loading messages...</span>
        </div>
    `;

    try {
        const response = await fetch('/api/v1/chats?limit=50&desc=true', {
            headers: { 'x-api-key': state.user_id }
        });

        chatMessages.innerHTML = ''; // Clear loader

        if (response.ok) {
            const data = await response.json();
            data.items.reverse().forEach(chat => {
                const role = chat.sender_id === 'bot' ? 'bot' : 'user';
                addMessage(chat.message, role, chat.created_at);
            });
            scrollToBottom();
        }
    } catch (err) {
        console.error('Failed to fetch chat history:', err);
        chatMessages.innerHTML = '<div class="empty-state">Failed to load history</div>';
    } finally {
        state.isTyping = false;
        setTimeout(scrollToBottom, 100);
    }
}

backToListBtn.addEventListener('click', () => {
    subSections.chatView.classList.remove('active');
    subSections.chatList.classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'flex';
});

// Calendar Logic
function generateCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    const viewYear = state.viewDate.getFullYear();
    const viewMonth = state.viewDate.getMonth();

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const startDay = new Date(viewYear, viewMonth, 1).getDay();

    document.getElementById('current-month').textContent = state.viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    grid.innerHTML = '';

    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dayNames.forEach(day => {
        const el = document.createElement('div');
        el.className = 'calendar-day-name';
        el.textContent = day;
        grid.appendChild(el);
    });

    for (let i = 0; i < startDay; i++) {
        grid.appendChild(document.createElement('div'));
    }

    const today = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
        const el = document.createElement('div');
        el.className = 'calendar-day';
        el.id = `day-${i}`;

        if (i === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()) {
            el.classList.add('is-today');
        }

        if (i === state.selectedDate.getDate() && viewMonth === state.selectedDate.getMonth() && viewYear === state.selectedDate.getFullYear()) {
            el.classList.add('today');
        }

        el.textContent = i;
        el.addEventListener('click', () => {
            state.selectedDate = new Date(viewYear, viewMonth, i);
            document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('today'));
            el.classList.add('today');
            fetchSchedules(state.selectedDate);
        });

        grid.appendChild(el);
    }

    // Fetch highlights in background (Async)
    fetchMonthHighlights(viewYear, viewMonth, daysInMonth);
}

async function fetchMonthHighlights(year, month, daysInMonth) {
    try {
        const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01 00:00`;
        const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth} 23:59`;
        const response = await fetch(`/api/v1/schedules?start_date=${encodeURIComponent(startOfMonth)}&end_date=${encodeURIComponent(endOfMonth)}&limit=100`, {
            headers: { 'x-api-key': state.user_id }
        });
        if (response.ok) {
            const data = await response.json();
            data.items.forEach(item => {
                const d = new Date(item.scheduled_at);
                const dayNum = d.getDate();
                const el = document.getElementById(`day-${dayNum}`);
                if (el) el.classList.add('has-event');
            });
        }
    } catch (err) {
        console.error('Failed to fetch highlights:', err);
    }
}

// Fetch Schedules
async function fetchSchedules(targetDate = null) {
    try {
        const now = targetDate || new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        let url = `/api/v1/schedules?limit=10`;

        if (targetDate) {
            const startDate = `${year}-${month}-${day} 00:00`;
            const endDate = `${year}-${month}-${day} 23:59`;
            url += `&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
            document.querySelector('.section-label h3').textContent = `Schedules for ${now.toLocaleString('default', { month: 'short', day: 'numeric' })}`;
        } else {
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const startDate = `${year}-${month}-${day} ${hours}:${minutes}`;
            url += `&start_date=${encodeURIComponent(startDate)}`;
            document.querySelector('.section-label h3').textContent = 'Upcoming Schedules';
        }

        const response = await fetch(url, {
            headers: { 'x-api-key': state.user_id }
        });
        if (response.ok) {
            const data = await response.json();
            renderSchedules(data.items);
        }
    } catch (err) {
        console.error('Failed to fetch schedules:', err);
    }
}

function renderSchedules(items) {
    const list = document.getElementById('upcoming-schedules');
    if (!list) return;

    const today = new Date();
    list.innerHTML = '';

    if (!items || items.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i data-lucide="calendar-off"></i>
                <p>No schedules found</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    items.slice(0, 5).forEach(item => {
        const date = new Date(item.scheduled_at);
        const hour = date.getHours();
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
        const dateStr = isToday ? '' : `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()} • `;

        const div = document.createElement('div');
        div.className = 'schedule-item';
        div.innerHTML = `
            <div class="schedule-time">
                <span class="hour">${displayHour}</span>
                <span class="ampm">${ampm}</span>
            </div>
            <div class="schedule-details">
                <h4>${item.title}</h4>
                <p>${dateStr}${item.location || 'No location'}</p>
            </div>
        `;
        list.appendChild(div);
    });
    lucide.createIcons();
}

let sseConnectionActive = false;

async function setupSSE() {
    if (sseConnectionActive) return;
    sseConnectionActive = true;

    try {
        const response = await fetch('/api/v1/chats/stream', {
            headers: { 'x-api-key': state.user_id }
        });

        if (!response.ok) throw new Error('SSE connection failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = 'message';

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.warn('SSE Stream closed by server');
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEvent = line.slice(7).trim();
                } else if (line.startsWith('data: ')) {
                    const rawData = line.slice(6).trim();
                    if (!rawData) continue;

                    try {
                        const data = JSON.parse(rawData);
                        if (currentEvent === 'message') {
                            if (data.sender_id === 'bot') {
                                hideTypingIndicator();
                                addMessage(data.message, 'bot');
                                state.isTyping = false;
                            }
                        } else if (currentEvent === 'credit_balance') {
                            updateCredits(data.credits);
                        } else if (currentEvent === 'ping') {
                            console.log('SSE Ping received');
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE data:', rawData);
                    }
                    currentEvent = 'message';
                }
            }
        }
    } catch (err) {
        console.error('SSE Error:', err);
    } finally {
        sseConnectionActive = false;
        console.log('SSE Reconnecting in 3s...');
        setTimeout(setupSSE, 3000);
    }
}

async function fetchProfile() {
    try {
        const response = await fetch('/api/v1/uids/profile', {
            headers: { 'x-api-key': state.user_id }
        });
        if (response.ok) {
            const data = await response.json();
            updateCredits(data.credits);
            state.display_name = data.display_name || 'User';
            document.getElementById('display-name').textContent = state.display_name;
        }
    } catch (err) {
        console.error('Failed to fetch profile:', err);
    }
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || state.isTyping) return;

    state.isTyping = true;
    addMessage(text, 'user');
    messageInput.value = '';
    showTypingIndicator();

    try {
        const response = await fetch('/api/v1/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': state.user_id
            },
            body: JSON.stringify({ message: text })
        });
        if (!response.ok) {
            hideTypingIndicator();
            const error = await response.json();
            addMessage(error.message || 'Error', 'bot');
            state.isTyping = false;
        }
    } catch (err) {
        hideTypingIndicator();
        addMessage('Connection error.', 'bot');
        state.isTyping = false;
    }
}

function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    chatMessages.appendChild(indicator);
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

function addMessage(text, role, timestamp = null) {
    const now = timestamp ? new Date(timestamp) : new Date();
    const dateStr = now.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });

    // Add date separator if new day
    if (state.lastMessageDate !== dateStr) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        separator.innerHTML = `<span class="date-badge">${dateStr}</span>`;
        chatMessages.appendChild(separator);
        state.lastMessageDate = dateStr;
    }

    const timeStr = now.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit', hour12: false });

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = `
        <div class="text">${text}</div>
        <span class="time">${timeStr}</span>
    `;
    chatMessages.appendChild(msgDiv);
    scrollToBottom();
}

// Quick Actions Logic
toggleActionsBtn.addEventListener('click', () => {
    state.isActionPanelOpen = !state.isActionPanelOpen;
    chatActionPanel.classList.toggle('active', state.isActionPanelOpen);
    toggleActionsBtn.classList.toggle('active', state.isActionPanelOpen);
});

actionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        if (action) {
            // Close panel
            state.isActionPanelOpen = false;
            chatActionPanel.classList.remove('active');
            toggleActionsBtn.classList.remove('active');
            
            await handleChatAction(action);
        }
    });
});

async function handleChatAction(type) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch(`/api/v1/chats/actions/${type}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': state.user_id
            },
            body: JSON.stringify({
                start_date: today,
                end_date: today
            })
        });

        if (!response.ok) {
            const error = await response.json();
            addMessage(error.message || 'Failed to trigger action', 'bot');
        }
    } catch (err) {
        console.error('Action failed:', err);
        addMessage('Connection error while performing action.', 'bot');
    }
}

// Close panel when back to list
backToListBtn.addEventListener('click', () => {
    state.isActionPanelOpen = false;
    chatActionPanel.classList.remove('active');
    toggleActionsBtn.classList.remove('active');
});

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateCredits(amount) {
    state.credits = amount;
    creditCounts.forEach(el => { if (el) el.textContent = amount; });
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

init();

// State Management
const state = {
  apiKey: localStorage.getItem('x-api-key') || '',
  username: localStorage.getItem('username') || '',
  credits: 100,
  chats: [],
  isThinking: false,
  authMode: 'login', // login | register
  activeStreamReader: null
};

// Initialize application on load
window.addEventListener('DOMContentLoaded', () => {
  checkAuthState();
});

// Check login state and bootstrap dashboard
async function checkAuthState() {
  const loginOverlay = document.getElementById('login-view');
  if (state.apiKey) {
    loginOverlay.style.opacity = '0';
    setTimeout(() => loginOverlay.classList.add('hidden'), 300);
    
    // Load User Info & Sync stats
    await fetchUserInfo();
  } else {
    loginOverlay.classList.remove('hidden');
    setTimeout(() => loginOverlay.style.opacity = '1', 50);
  }
}

// Toggle Login/Register state in overlay
function switchLoginTab(mode) {
  state.authMode = mode;
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const tabActivePill = document.getElementById('tab-active-pill');
  const confirmGroup = document.getElementById('auth-confirm-group');
  const submitBtn = document.getElementById('auth-submit-btn');
  const errorDiv = document.getElementById('auth-error');
  
  errorDiv.classList.add('hidden');

  if (mode === 'login') {
    // Slide active indicator pill left
    if (tabActivePill) tabActivePill.style.left = '4px';
    
    // Toggle font color states
    tabLogin.classList.remove('text-white/50');
    tabLogin.classList.add('text-white');
    tabRegister.classList.remove('text-white');
    tabRegister.classList.add('text-white/50');

    // Smooth collapse Confirm Password input
    if (confirmGroup) {
      confirmGroup.style.maxHeight = '0px';
      confirmGroup.style.opacity = '0';
      confirmGroup.style.pointerEvents = 'none';
    }
    
    submitBtn.innerText = 'Sign In';
  } else {
    // Slide active indicator pill right
    if (tabActivePill) tabActivePill.style.left = '50%';
    
    // Toggle font color states
    tabRegister.classList.remove('text-white/50');
    tabRegister.classList.add('text-white');
    tabLogin.classList.remove('text-white');
    tabLogin.classList.add('text-white/50');

    // Smooth expand Confirm Password input
    if (confirmGroup) {
      confirmGroup.style.maxHeight = '120px';
      confirmGroup.style.opacity = '1';
      confirmGroup.style.pointerEvents = 'auto';
    }
    
    submitBtn.innerText = 'Create Account';
  }
}

// Helper to extract clean error message from backend HTTPException format
function extractErrorMessage(data) {
  if (!data) return null;
  if (data.error) {
    if (Array.isArray(data.error.details) && data.error.details.length > 0) {
      // Return validation issue messages (e.g. "Password must be at least 7 characters")
      return data.error.details.map(d => d.message).join(', ');
    }
    if (typeof data.error.message === 'string') {
      return data.error.message;
    }
    if (typeof data.error === 'string') {
      return data.error;
    }
  }
  if (typeof data.message === 'string') {
    return data.message;
  }
  return null;
}

// Handle authentication submission (Login or Register)
async function handleAuthSubmit(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('auth-username').value.trim();
  const passwordInput = document.getElementById('auth-password').value;
  const confirmPasswordInput = document.getElementById('auth-confirm-password').value;
  const errorDiv = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit-btn');

  errorDiv.classList.add('hidden');

  if (usernameInput.length < 4) {
    errorDiv.innerText = 'Username must be at least 4 characters.';
    errorDiv.classList.remove('hidden');
    return;
  }
  if (passwordInput.length < 7) {
    errorDiv.innerText = 'Password must be at least 7 characters.';
    errorDiv.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerText = 'Please wait...';

  try {
    if (state.authMode === 'login') {
      // Send login payload
      const res = await fetch('/api/v1/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data) || 'Authentication failed.');

      // Store key
      localStorage.setItem('x-api-key', data.apiKey);
      localStorage.setItem('username', data.username);
      state.apiKey = data.apiKey;
      state.username = data.username;
      
      showToast(`Welcome back, ${data.username}! ☁️`);
      checkAuthState();
    } else {
      // Register flow
      if (passwordInput !== confirmPasswordInput) {
        throw new Error('Passwords do not match.');
      }

      const res = await fetch('/api/v1/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput,
          password: passwordInput,
          confirm_password: confirmPasswordInput
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data) || 'Registration failed.');

      showToast('Account created successfully! Logging in...');
      
      // Call login after creating
      const loginRes = await fetch('/api/v1/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) throw new Error(extractErrorMessage(loginData) || 'Autologin failed.');

      localStorage.setItem('x-api-key', loginData.apiKey);
      localStorage.setItem('username', loginData.username);
      state.apiKey = loginData.apiKey;
      state.username = loginData.username;

      checkAuthState();
    }
  } catch (err) {
    errorDiv.innerText = err.message;
    errorDiv.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = state.authMode === 'login' ? 'Sign In' : 'Create Account';
  }
}


// Fetch dynamic profile credit state
async function fetchUserInfo() {
  if (!state.apiKey) return;
  try {
    const res = await fetch('/api/v1/users/me', {
      headers: { 'x-api-key': state.apiKey }
    });
    const data = await res.json();
    if (res.ok) {
      state.credits = data.credit ?? 100;
      document.getElementById('credit-badge').innerText = state.credits;
      document.getElementById('chat-credits-counter').innerText = state.credits;
    }
  } catch (err) {
    console.error('Failed to sync profile credits:', err);
  }
}

// Settings overlay utilities
function openSettingsModal() {
  document.getElementById('settings-username-display').innerText = state.username;
  document.getElementById('settings-credit-display').innerText = `${state.credits} Credits`;
  document.getElementById('settings-apikey-display').value = state.apiKey;
  document.getElementById('settings-apikey-display').type = 'password';
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

// Toggle masking for apiKey text in Settings
function toggleApiKeyMask() {
  const input = document.getElementById('settings-apikey-display');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function handleLogOut() {
  localStorage.clear();
  state.apiKey = '';
  state.username = '';
  state.chats = [];
  closeSettingsModal();
  
  const loginOverlay = document.getElementById('login-view');
  loginOverlay.classList.remove('hidden');
  setTimeout(() => loginOverlay.style.opacity = '1', 50);
  
  // Close chat panel if open
  closeChatScreen();
  showToast('Logged out of session. See you soon! 👋');
}

// Transitions - Open mobile chat screen
function openChatScreen() {
  const chatPanel = document.getElementById('chat-view');
  chatPanel.classList.remove('translate-x-full');
  chatPanel.classList.add('translate-x-0');
  
  // Load previous chats
  loadChatHistory();
}

function closeChatScreen() {
  const chatPanel = document.getElementById('chat-view');
  chatPanel.classList.remove('translate-x-0');
  chatPanel.classList.add('translate-x-full');
  
  // Abort any ongoing SSE stream
  abortActiveSSE();
}

function quickFillInput(prompt) {
  const input = document.getElementById('chat-message-input');
  input.value = prompt;
  input.focus();
}

// Fetch and render message history
async function loadChatHistory() {
  if (!state.apiKey) return;
  const container = document.getElementById('chat-messages-container');
  const emptyState = document.getElementById('chat-empty-state');
  
  try {
    const res = await fetch('/api/v1/chats?limit=50', {
      headers: { 'x-api-key': state.apiKey }
    });
    const data = await res.json();
    
    if (res.ok && data.items && data.items.length > 0) {
      emptyState.classList.add('hidden');
      
      // Clear current dynamic content (but keep empty-state div locked)
      const items = Array.from(container.children).filter(el => el.id !== 'chat-empty-state');
      items.forEach(el => el.remove());

      // Sort by creation date (older first for chat rendering)
      const sorted = data.items.reverse();
      sorted.forEach(msg => {
        appendMessageBubble(msg);
      });
      
      // Update snippets on dashboard
      const lastMsg = sorted[sorted.length - 1];
      if (lastMsg && lastMsg.content && lastMsg.content[0]) {
        const snippet = lastMsg.content[0].text || 'รหัสข้อความแบบโต้ตอบ ☁️';
        document.getElementById('dashboard-cloudy-snippet').innerText = snippet;
      }

      scrollChatToBottom();
    } else {
      emptyState.classList.remove('hidden');
    }
  } catch (err) {
    showToast('Error syncing chat histories.');
    console.error(err);
  }
}

// Custom renderer mapping text formatting, markdown details, and emojis
function formatMessageText(text) {
  if (!text) return '';
  // Escape HTML to prevent injections
  let esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Format bold markdown (**text** or __text__)
  esc = esc.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
  esc = esc.replace(/__(.*?)__/g, '<strong class="font-bold text-white">$1</strong>');

  // Bullet items
  esc = esc.replace(/^\s*-\s+(.*?)$/gm, '<li class="ml-4 list-disc text-white/80">$1</li>');

  // Multi-line code blocks
  esc = esc.replace(/```([\s\S]*?)```/g, '<pre class="bg-black/30 border border-white/5 p-3 rounded-lg font-mono text-xs my-2 text-brandCoral overflow-x-auto">$1</pre>');
  
  // Inline codes
  esc = esc.replace(/`(.*?)`/g, '<code class="bg-black/20 text-brandCoral px-1 py-0.5 rounded font-mono text-xs">$1</code>');

  // Preserve double-newline paragraphs
  return esc.replace(/\n/g, '<br>');
}

// Dynamically insert message elements into DOM
function appendMessageBubble(messageObj) {
  const container = document.getElementById('chat-messages-container');
  const isUser = messageObj.sender_id !== 'cloudy' && messageObj.sender_id !== 'assistant';
  const bubbleId = messageObj.id;

  // Check if duplicate element
  if (document.getElementById(`bubble-${bubbleId}`)) return;

  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.id = `bubble-${bubbleId}`;
  bubbleWrapper.className = `flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1 w-full max-w-[85%] ${isUser ? 'ml-auto' : 'mr-auto'}`;

  const contentsDiv = document.createElement('div');
  contentsDiv.className = 'w-full';

  // Iterate through message content blocks
  messageObj.content.forEach(part => {
    if (part.type === 'text') {
      const pill = document.createElement('div');
      pill.className = isUser 
        ? 'bg-gradient-to-br from-brandCoral to-brandCoral/85 border border-brandCoral/10 text-white rounded-[20px] rounded-tr-[4px] p-3 text-sm shadow-md leading-relaxed break-words'
        : 'bg-[#151025]/85 border border-white/5 text-white/90 rounded-[20px] rounded-tl-[4px] p-3 text-sm shadow-md leading-relaxed break-words';
      
      pill.innerHTML = formatMessageText(part.text);
      contentsDiv.appendChild(pill);
    }
    else if (part.type === 'mood_card') {
      // Interactive Mood Voting card
      const card = document.createElement('div');
      card.className = 'w-full bg-[#18112c]/90 border border-white/10 rounded-2xl p-4 shadow-lg flex flex-col gap-3 mt-1.5';
      
      card.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-base">☁️</span>
          <span class="text-[13.5px] font-bold text-white/90">Daily Mood Check</span>
        </div>
        <p class="text-[12.5px] text-white/60">คลาวดี้อยากทราบว่าคุณปี๊บรู้สึกอย่างไรบ้างในวันนี้จ้า?</p>
        <div class="grid grid-cols-2 gap-2 mt-1.5" id="mood-options-${bubbleId}">
          ${part.options.map(mood => {
            const isSelected = part.selected_mood === mood;
            const isAnySelected = part.selected_mood !== null && part.selected_mood !== undefined;
            return `
              <button 
                onclick="submitUserMood('${bubbleId}', '${mood}')"
                ${isAnySelected ? 'disabled' : ''}
                class="py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  isSelected 
                    ? 'bg-brandCoral/20 border-brandCoral text-brandCoral shadow-[0_0_12px_rgba(232,92,65,0.25)]' 
                    : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 disabled:opacity-60 disabled:hover:bg-white/5'
                }"
              >${mood}</button>
            `;
          }).join('')}
        </div>
        ${part.selected_mood 
          ? `<div class="text-[11px] text-green-400 font-semibold flex items-center gap-1 mt-1 justify-center">
              <span>✓</span> บันทึกอารมณ์เป็น "${part.selected_mood}" เรียบร้อยจ้า!
             </div>` 
          : ''
        }
      `;
      contentsDiv.appendChild(card);
    }
    else if (part.type === 'action') {
      // Action link button card
      const btnCard = document.createElement('div');
      btnCard.className = 'w-full bg-[#19142b]/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5 mt-1.5 cursor-pointer hover:bg-white/5 transition-all';
      btnCard.onclick = () => handleDeepLinkClick(part.link);
      
      let icon = '🔗';
      let label = 'คลิกเพื่อดูรายละเอียดได้เลยจ้า';
      if (part.link.includes('fortune-telling')) { icon = '🔮'; label = 'ดูผลทำนายดวงชะตาประจำวัน'; }
      else if (part.link.includes('todo')) { icon = '✅'; label = 'เปิดดูรายการสิ่งที่ต้องทำ'; }
      else if (part.link.includes('schedule')) { icon = '📅'; label = 'เปิดดูตารางงานของคุณปี๊บ'; }
      else if (part.link.includes('expense')) { icon = '💰'; label = 'เปิดดูสรุปรายรับรายจ่าย'; }

      btnCard.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="text-2xl">${icon}</span>
          <div class="flex-1 flex flex-col">
            <span class="text-xs font-bold text-white/95">${label}</span>
            <span class="text-[10px] text-brandCoral font-mono tracking-tight font-medium mt-0.5 truncate">${part.link}</span>
          </div>
          <span class="text-xs text-white/40">❯</span>
        </div>
      `;
      contentsDiv.appendChild(btnCard);
    }
  });

  bubbleWrapper.appendChild(contentsDiv);

  // Add time footprint
  const timeSpan = document.createElement('span');
  timeSpan.className = 'text-[9.5px] text-white/35 px-1 mt-0.5 select-none';
  timeSpan.innerText = messageObj.created_at 
    ? new Date(messageObj.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  bubbleWrapper.appendChild(timeSpan);
  container.appendChild(bubbleWrapper);
}

// Submit daily mood from card options
async function submitUserMood(messageId, mood) {
  if (!state.apiKey) return;
  try {
    const res = await fetch('/api/v1/chats/mood', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey
      },
      body: JSON.stringify({ messageId, mood })
    });
    const data = await res.json();
    
    if (res.ok) {
      showToast('บันทึกอารมณ์สำเร็จจ้า! ☁️✨');
      
      // Re-sync chat messages locally to show selection state locked
      await loadChatHistory();
    } else {
      showToast(data.error || 'Failed to submit mood.');
    }
  } catch (err) {
    showToast('Error sending mood selection.');
    console.error(err);
  }
}

// User Message form submit
async function handleChatSubmit(e) {
  e.preventDefault();
  if (state.isThinking) return;

  const input = document.getElementById('chat-message-input');
  const text = input.value.trim();
  if (!text) return;

  // Clean empty state
  document.getElementById('chat-empty-state').classList.add('hidden');

  // Append user bubble locally
  const mockId = 'user-msg-' + Date.now();
  appendMessageBubble({
    id: mockId,
    sender_id: state.username,
    content: [{ type: 'text', text: text }],
    created_at: new Date().toISOString()
  });
  
  input.value = '';
  scrollChatToBottom();

  try {
    state.isThinking = true;
    toggleThinkingIndicator(true);

    const res = await fetch('/api/v1/chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey
      },
      body: JSON.stringify({
        content: [{ type: 'text', text }]
      })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || errData.error || 'Failed to dispatch message.');
    }

    // Establish real-time SSE listener
    await streamAgentResponse();
  } catch (err) {
    showToast(err.message);
    toggleThinkingIndicator(false);
    state.isThinking = false;
  }
}

// Trigger central mobile quick prompt action route
async function triggerCloudyAction(action) {
  if (state.isThinking || !state.apiKey) return;
  
  document.getElementById('chat-empty-state').classList.add('hidden');

  let label = '';
  switch(action) {
    case 'expense': label = 'ขอดูรายการค่าใช้จ่ายของวันนี้ให้หน่อยนะจ๊ะ'; break;
    case 'schedule': label = 'ขอดูรายการกำหนดการของวันนี้ให้หน่อยจ้า'; break;
    case 'todo': label = 'ขอดูรายการสิ่งที่ต้องทำของวันนี้ให้หน่อยนะจ๊ะ'; break;
    case 'mood': label = 'ช่วยสรุปอารมณ์ (mood) ของผมในช่วง 7 วันล่าสุดให้หน่อยนะจ๊ะ'; break;
    case 'summary': label = 'ช่วยวิเคราะห์สรุปข้อมูลภาพรวมของโครงการให้หน่อยนะจ๊ะ'; break;
    case 'fortune-telling': label = 'ช่วยทำนายดวงชะตาให้ผมหน่อยนะจ๊ะ'; break;
  }

  // Render locally first
  appendMessageBubble({
    id: 'action-msg-' + Date.now(),
    sender_id: state.username,
    content: [{ type: 'text', text: label }],
    created_at: new Date().toISOString()
  });

  scrollChatToBottom();

  try {
    state.isThinking = true;
    toggleThinkingIndicator(true);

    const res = await fetch('/api/v1/chats/actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey
      },
      body: JSON.stringify({ action })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Action dispatch failed.');
    }

    // Stream generated output
    await streamAgentResponse();
  } catch(err) {
    showToast(err.message);
    toggleThinkingIndicator(false);
    state.isThinking = false;
  }
}

// Read SSE Streams via Authentication-ready Fetch API with ReadableStream
async function streamAgentResponse() {
  // Prevent double hooks
  abortActiveSSE();

  const controller = new AbortController();
  state.activeStreamReader = controller;

  try {
    const response = await fetch('/api/v1/chats/stream', {
      headers: {
        'x-api-key': state.apiKey,
        'Accept': 'text/event-stream'
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error('SSE Stream failed to hook.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // Clear trace logs UI
    document.getElementById('react-trace-logs').innerHTML = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Save the last incomplete chunk to parser buffer
      buffer = lines.pop();

      let currentEvent = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.replace('event:', '').trim();
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.replace('data:', '').trim();
          try {
            const eventData = JSON.parse(dataStr);
            handleAgentStreamEvent(currentEvent, eventData);
          } catch(e) {
            console.warn('Failed parse event chunk:', e);
          }
          currentEvent = '';
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Streaming parser error:', err);
      showToast('SSE Stream disconnected.');
    }
  } finally {
    state.activeStreamReader = null;
    toggleThinkingIndicator(false);
    state.isThinking = false;
    
    // Sync user profile tokens/credits
    await fetchUserInfo();
  }
}

// Process different SSE events received from stream
function handleAgentStreamEvent(event, data) {
  const logs = document.getElementById('react-trace-logs');
  const timeStr = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (event === 'thinking') {
    const line = document.createElement('div');
    line.innerHTML = `<span class="text-brandCoral">[${timeStr}]</span> Cloudy is thinking...`;
    logs.appendChild(line);
    logs.scrollTop = logs.scrollHeight;
    
    if (data.message) {
      document.getElementById('react-thinking-title').innerText = data.message;
    }
  } 
  else if (event === 'calling_tool') {
    const line = document.createElement('div');
    line.innerHTML = `<span class="text-yellow-400">[${timeStr}] 🛠️ Calling tool:</span> <span class="text-white font-bold">${data.tool_name}</span>`;
    logs.appendChild(line);
    logs.scrollTop = logs.scrollHeight;
    
    document.getElementById('react-thinking-title').innerText = `🛠️ Calling tool: ${data.tool_name}...`;
  } 
  else if (event === 'tool_response') {
    const line = document.createElement('div');
    line.innerHTML = `<span class="text-green-400">[${timeStr}] ✓ Tool complete:</span> <span class="text-white/70">${data.tool_name}</span>`;
    logs.appendChild(line);
    logs.scrollTop = logs.scrollHeight;
  } 
  else if (event === 'done') {
    // AI execution complete, terminate streaming reader and reload chat histories
    abortActiveSSE();
    loadChatHistory();
  }
  else if (event === 'error') {
    abortActiveSSE();
    showToast(`Cloudy error: ${data.message}`);
  }
}

// Abort active stream reader
function abortActiveSSE() {
  if (state.activeStreamReader) {
    state.activeStreamReader.abort();
    state.activeStreamReader = null;
  }
}

// UI Utilities - Toggle thinking panel overlay
function toggleThinkingIndicator(show) {
  const panel = document.getElementById('react-thinking-panel');
  const submitBtn = document.getElementById('chat-send-btn');
  
  if (show) {
    panel.classList.remove('hidden');
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-50', 'pointer-events-none');
  } else {
    panel.classList.add('hidden');
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50', 'pointer-events-none');
  }
}

// Scroll chat viewport to base
function scrollChatToBottom() {
  const container = document.getElementById('chat-messages-container');
  setTimeout(() => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }, 100);
}

// Handle deep-link redirects inside cards
function handleDeepLinkClick(link) {
  // E.g., peep://fortune-telling
  showToast(`Opening Action URL: ${link} ☁️✨`);
  
  // We can open specialized tabs/views based on link paths
  if (link.includes('todo')) {
    showToast('Navigating to Todo dashboard... ✅');
  } else if (link.includes('fortune-telling')) {
    showToast('Launching fortune-teller portal... 🔮');
  } else if (link.includes('schedule')) {
    showToast('Opening personal calendar... 📅');
  } else if (link.includes('expense')) {
    showToast('Opening accounts sheet... 💰');
  }
}

// Custom Glassmorphic Toast Notification engine
function showToast(message) {
  const wrapper = document.getElementById('toast-wrapper');
  
  const toast = document.createElement('div');
  toast.className = 'w-full bg-black/60 border border-white/10 backdrop-blur-lg px-4 py-3 rounded-2xl text-xs font-semibold shadow-2xl flex items-center justify-between text-white tracking-wide transition-all transform translate-y-4 opacity-0 pointer-events-auto cursor-pointer';
  toast.innerHTML = `
    <span>${message}</span>
    <span class="text-white/40 text-[9px] uppercase pl-2">Dismiss</span>
  `;
  
  toast.onclick = () => {
    toast.style.transform = 'translateY(4px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  };

  wrapper.appendChild(toast);

  // Trigger animation frame
  requestAnimationFrame(() => {
    setTimeout(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }, 50);
  });

  // Auto dismiss after 4 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transform = 'translateY(4px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }
  }, 4000);
}

// Attach key functions to window for global access
window.switchLoginTab = switchLoginTab;
window.handleAuthSubmit = handleAuthSubmit;
window.openChatScreen = openChatScreen;
window.closeChatScreen = closeChatScreen;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.toggleApiKeyMask = toggleApiKeyMask;
window.handleLogOut = handleLogOut;
window.triggerCloudyAction = triggerCloudyAction;
window.handleChatSubmit = handleChatSubmit;
window.quickFillInput = quickFillInput;
window.submitUserMood = submitUserMood;
window.handleDeepLinkClick = handleDeepLinkClick;


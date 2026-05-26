// State Management
const state = {
  apiKey: localStorage.getItem('x-api-key') || '',
  username: localStorage.getItem('username') || '',
  credits: null,
  chats: [],
  isThinking: false,
  isReloadingHistory: false,
  authMode: 'login', // login | register
  activeStreamReader: null,
  chatLimit: 20,
  hasMoreChats: true,
  isLoadingChats: false
};

// SVG Assets for reactions instead of emojis
function getHeartSvg(sizeClass = 'w-4 h-4') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${sizeClass} text-white"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" fill="currentColor" fill-opacity="0.15"/></svg>`;
}

function getAngrySvg(sizeClass = 'w-4 h-4') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${sizeClass} text-white"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm10-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" fill="currentColor" fill-opacity="0.15"/></svg>`;
}

// Initialize application on load
window.addEventListener('DOMContentLoaded', () => {
  checkAuthState();
  setupChatScrollListener();
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
      const res = await fetch('/poc/api/v1/users/login', {
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

      const res = await fetch('/poc/api/v1/users/create', {
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
      const loginRes = await fetch('/poc/api/v1/users/login', {
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
function setCreditsDisplay(value) {
  const spinner = document.getElementById('credits-loading-spinner');
  const creditsVal = document.getElementById('credits-value');
  const badge = document.getElementById('credit-badge');
  if (spinner) spinner.style.display = 'none';
  if (creditsVal) creditsVal.innerText = value;
  if (badge) badge.innerText = value;
}

async function fetchUserInfo() {
  if (!state.apiKey) return;
  // Show spinner, hide any stale value
  const spinner = document.getElementById('credits-loading-spinner');
  const creditsVal = document.getElementById('credits-value');
  if (spinner) spinner.style.display = 'inline-block';
  if (creditsVal) creditsVal.innerText = '';
  try {
    const res = await fetch('/poc/api/v1/users/me', {
      headers: { 'x-api-key': state.apiKey }
    });
    const data = await res.json();
    if (res.ok) {
      state.credits = data.credit ?? 0;
      setCreditsDisplay(state.credits);
    } else {
      setCreditsDisplay('-');
    }
  } catch (err) {
    console.error('Failed to sync profile credits:', err);
    setCreditsDisplay('-');
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
  
  // Reset pagination state
  state.chatLimit = 20;
  state.hasMoreChats = true;
  state.isLoadingChats = false;

  // Clear previous message bubbles and show loading spinner
  const container = document.getElementById('chat-messages-container');
  if (container) {
    const items = Array.from(container.children).filter(
      el => el.id !== 'chat-empty-state' && el.id !== 'chat-loading-state'
    );
    items.forEach(el => el.remove());
  }

  const loadingState = document.getElementById('chat-loading-state');
  const emptyState = document.getElementById('chat-empty-state');
  if (loadingState) loadingState.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');
  
  const chips = document.getElementById('chat-prompt-chips');
  if (chips) chips.classList.add('hidden');
  
  // Load previous chats (isInitial = true)
  loadChatHistory(true);
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

// Render sorted chat bubbles inside viewport container
async function renderChatsList(items, isInitial, previousScrollHeight) {
  state.chats = items;
  const container = document.getElementById('chat-messages-container');
  const emptyState = document.getElementById('chat-empty-state');
  const loadingState = document.getElementById('chat-loading-state');
  const scrollLoader = document.getElementById('chat-scroll-loader');

  if (emptyState) emptyState.classList.add('hidden');
  
  const chips = document.getElementById('chat-prompt-chips');
  if (chips) chips.classList.add('hidden');

  // Clear current dynamic content (keep empty-state, loading spinner, and scroll loader)
  const elementsToClear = Array.from(container.children).filter(
    el => el.id !== 'chat-empty-state' && el.id !== 'chat-loading-state' && el.id !== 'chat-scroll-loader'
  );
  elementsToClear.forEach(el => el.remove());

  // Sort by creation date (older first for chat rendering)
  const sorted = [...items].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(msg => appendMessageBubble(msg));
  
  // Update snippets on dashboard
  updateDashboardSnippet(sorted);

  // Hide loading indicator before scroll calculations to prevent layout shifting
  if (loadingState) loadingState.classList.add('hidden');
  if (scrollLoader) scrollLoader.classList.add('hidden');

  if (isInitial) {
    await scrollChatToBottom(false);
  } else {
    // Anchor scroll position
    container.scrollTop = container.scrollHeight - previousScrollHeight;
  }
}

// Update snippet message in dashboard preview
function updateDashboardSnippet(sortedMessages) {
  const lastMsg = sortedMessages[sortedMessages.length - 1];
  if (lastMsg && lastMsg.content && lastMsg.content[0]) {
    let snippet = lastMsg.content[0].text || 'รหัสข้อความแบบโต้ตอบ ☁️';
    // Replace all newlines/carriage returns with space to force single-line display
    snippet = snippet.replace(/\r?\n/g, ' ');
    const snippetEl = document.getElementById('dashboard-cloudy-snippet');
    if (snippetEl) snippetEl.innerText = snippet;
  }
}

// Helper to hide chat loader indicators
function hideChatLoaders(loadingState, scrollLoader) {
  state.isLoadingChats = false;
  if (loadingState) loadingState.classList.add('hidden');
  if (scrollLoader) scrollLoader.classList.add('hidden');
}

// Helper to handle the empty or non-successful history state
function handleEmptyChatHistory(emptyState) {
  if (emptyState) emptyState.classList.remove('hidden');
  const chips = document.getElementById('chat-prompt-chips');
  if (chips) chips.classList.remove('hidden');
  state.hasMoreChats = false;
}

// Helper to handle successful history sync
async function handleChatHistorySync(items, isInitial, container, loadingState, scrollLoader) {
  const currentBubbleCount = Array.from(container.children)
    .filter(el => el.id && el.id.startsWith('bubble-')).length;

  // If no new bubbles were loaded, we are at the end of history
  if (items.length === currentBubbleCount && !isInitial) {
    state.hasMoreChats = false;
    showToast('โหลดประวัติบทสนทนาทั้งหมดเรียบร้อยแล้วจ้า ☁️🔒');
    hideChatLoaders(loadingState, scrollLoader);
    return;
  }

  if (items.length < state.chatLimit) {
    state.hasMoreChats = false;
  }

  const previousScrollHeight = container.scrollHeight;
  await renderChatsList(items, isInitial, previousScrollHeight);
}

// Fetch and render message history
async function loadChatHistory(isInitial = false) {
  if (!state.apiKey) return;
  const container = document.getElementById('chat-messages-container');
  const emptyState = document.getElementById('chat-empty-state');
  const loadingState = document.getElementById('chat-loading-state');
  const scrollLoader = document.getElementById('chat-scroll-loader');

  state.isLoadingChats = true;
  
  if (!isInitial && scrollLoader) {
    scrollLoader.classList.remove('hidden');
  }
  
  try {
    const res = await fetch(`/poc/api/v1/chats?limit=${state.chatLimit}`, {
      headers: { 'x-api-key': state.apiKey }
    });
    const data = await res.json();
    
    if (res.ok && data.items && data.items.length > 0) {
      await handleChatHistorySync(data.items, isInitial, container, loadingState, scrollLoader);
    } else {
      handleEmptyChatHistory(emptyState);
    }
  } catch (err) {
    showToast('Error syncing chat histories.');
    console.error(err);
  } finally {
    hideChatLoaders(loadingState, scrollLoader);
    toggleThinkingIndicator(false);
    state.isThinking = false;
    state.isReloadingHistory = false;
  }
}

// Setup Scroll Listener for Infinite History Pagination
function setupChatScrollListener() {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;

  container.addEventListener('scroll', async () => {
    if (container.scrollTop === 0) {
      if (!state.hasMoreChats || state.isLoadingChats || state.isThinking) {
        return;
      }
      
      state.chatLimit += 20;
      await loadChatHistory(false);
    }
  });
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

// Helper to render plain text message bubbles
function renderTextMessage(part, isUser) {
  const pill = document.createElement('div');
  pill.className = isUser 
    ? 'bg-gradient-to-br from-brandCoral to-brandCoral/85 border border-brandCoral/10 text-white rounded-[20px] rounded-tr-[4px] p-3 text-sm shadow-md leading-relaxed break-words'
    : 'bg-[#151025]/85 border border-white/5 text-white/90 rounded-[20px] rounded-tl-[4px] p-3 text-sm shadow-md leading-relaxed break-words';
  
  pill.innerHTML = formatMessageText(part.text);
  return pill;
}

// Helper to render interactive mood cards
function renderMoodCardMessage(part, bubbleId) {
  const card = document.createElement('div');
  card.className = 'w-full bg-[#18112c]/90 border border-white/10 rounded-2xl p-4 shadow-lg flex flex-col gap-3 mt-1.5';
  
  const optionsHtml = part.options.map(mood => {
    const isSelected = part.selected_mood === mood;
    const isAnySelected = part.selected_mood !== null && part.selected_mood !== undefined;
    const btnClass = isSelected 
      ? 'bg-brandCoral/20 border-brandCoral text-brandCoral shadow-[0_0_12px_rgba(232,92,65,0.25)]' 
      : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 disabled:opacity-60 disabled:hover:bg-white/5';
    
    return `
      <button 
        onclick="submitUserMood('${bubbleId}', '${mood}')"
        ${isAnySelected ? 'disabled' : ''}
        class="py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${btnClass}"
      >${mood}</button>
    `;
  }).join('');

  const statusHtml = part.selected_mood 
    ? `<div class="text-[11px] text-green-400 font-semibold flex items-center gap-1 mt-1 justify-center">
        <span>✓</span> บันทึกอารมณ์เป็น "${part.selected_mood}" เรียบร้อยจ้า!
       </div>` 
    : '';

  card.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-base">☁️</span>
      <span class="text-[13.5px] font-bold text-white/90">Daily Mood Check</span>
    </div>
    <p class="text-[12.5px] text-white/60">วันนี้คุณรู้สึกอย่างไรบ้าง? มาแบ่งปันกับคลาวดี้หน่อยนะ ☁️✨</p>
    <div class="grid grid-cols-2 gap-2 mt-1.5" id="mood-options-${bubbleId}">
      ${optionsHtml}
    </div>
    ${statusHtml}
  `;
  return card;
}

// Helper to determine deep link details
function getActionDetails(link) {
  if (link.includes('fortune-telling')) {
    return { icon: '🔮', label: 'ดูผลทำนายดวงชะตาประจำวัน' };
  }
  if (link.includes('todo')) {
    return { icon: '✅', label: 'เปิดดูรายการสิ่งที่ต้องทำ' };
  }
  if (link.includes('schedule')) {
    return { icon: '📅', label: 'เปิดดูตารางงานของคุณปี๊บ' };
  }
  if (link.includes('expense')) {
    return { icon: '💰', label: 'เปิดดูสรุปรายรับรายจ่าย' };
  }
  return { icon: '🔗', label: 'คลิกเพื่อดูรายละเอียดได้เลยจ้า' };
}

// Helper to render action card bubbles
function renderActionMessage(part) {
  const btnCard = document.createElement('div');
  btnCard.className = 'w-full bg-[#19142b]/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5 mt-1.5 cursor-pointer hover:bg-white/5 transition-all';
  btnCard.onclick = () => handleDeepLinkClick(part.link);
  
  const { icon, label } = getActionDetails(part.link);

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
  return btnCard;
}

// Dynamically insert message elements into DOM
// Dynamically insert message elements into DOM
function appendMessageBubble(messageObj) {
  const container = document.getElementById('chat-messages-container');
  const isUser = messageObj.sender_id !== 'cloudy' && messageObj.sender_id !== 'assistant' && messageObj.sender_id !== 'bot' && messageObj.sender_id !== 'aria';
  const bubbleId = messageObj.id;

  // Check if duplicate element
  if (document.getElementById(`bubble-${bubbleId}`)) return;

  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.id = `bubble-${bubbleId}`;
  bubbleWrapper.className = `flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1 w-full max-w-[85%] ${isUser ? 'ml-auto' : 'mr-auto'}`;

  const contentsDiv = document.createElement('div');
  contentsDiv.className = 'w-full relative';

  // Iterate through message content blocks
  messageObj.content.forEach(part => {
    if (part.type === 'text') {
      contentsDiv.appendChild(renderTextMessage(part, isUser));
    }
    else if (part.type === 'mood_card') {
      contentsDiv.appendChild(renderMoodCardMessage(part, bubbleId));
    }
    else if (part.type === 'action') {
      contentsDiv.appendChild(renderActionMessage(part));
    }
  });

  // For assistant message cards only, attach long-press gesture listeners
  if (!isUser) {
    let pressTimer;
    let pressed = false;
    
    const startPress = (e) => {
      // Ignore right-click
      if (e.button === 2) return;
      // Get pointer coordinates
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      pressed = false;
      pressTimer = setTimeout(() => {
        pressed = true;
        if (navigator.vibrate) navigator.vibrate(40); // small haptic tap
        showReactionMenu(bubbleId, clientX, clientY);
        // Swallow the synthetic `click` that browser fires when user releases
        // after the long-press — prevents it reaching the window dismiss handler
        contentsDiv.addEventListener('click', (e) => e.stopPropagation(), { once: true, capture: true });
      }, 500); // long press hold threshold
    };
    
    const cancelPress = () => {
      if (!pressed) {
        clearTimeout(pressTimer);
      }
      pressed = false;
    };
    
    contentsDiv.addEventListener('mousedown', startPress);
    contentsDiv.addEventListener('touchstart', startPress, { passive: true });
    
    contentsDiv.addEventListener('mouseup', cancelPress);
    contentsDiv.addEventListener('mouseleave', cancelPress);
    contentsDiv.addEventListener('touchend', cancelPress);
    contentsDiv.addEventListener('touchcancel', cancelPress);
    contentsDiv.addEventListener('touchmove', cancelPress);
    
    // Prevent default context menu on long-press (especially on mobile)
    contentsDiv.addEventListener('contextmenu', (e) => e.preventDefault());
    
    contentsDiv.classList.add('cursor-pointer', 'select-none', 'transition-all');
  }

  // Render initial reaction badge if message already has feedback
  const feedbackVal = messageObj.feedback || null;
  if (feedbackVal) {
    const badge = document.createElement('div');
    badge.id = `reaction-badge-${bubbleId}`;
    if (feedbackVal === 'like') {
      badge.className = `absolute -bottom-2 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-brandCoral/30 bg-[#1c1328]/95 select-none`;
      badge.innerHTML = getHeartSvg('w-3 h-3');
    } else {
      badge.className = `absolute -bottom-2 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-indigo-500/30 bg-[#1c1328]/95 select-none`;
      badge.innerHTML = getAngrySvg('w-3 h-3');
    }
    // Static — no perpetual animation on history restore
    contentsDiv.appendChild(badge);
  }

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
    const res = await fetch('/poc/api/v1/chats/mood', {
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
  const chips = document.getElementById('chat-prompt-chips');
  if (chips) chips.classList.add('hidden');

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

    const res = await fetch('/poc/api/v1/chats', {
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

  if (action === 'expense') {
    openExpenseModal();
    return;
  }

  if (action === 'schedule') {
    openScheduleModal();
    return;
  }
  
  document.getElementById('chat-empty-state').classList.add('hidden');
  const chips = document.getElementById('chat-prompt-chips');
  if (chips) chips.classList.add('hidden');

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

    const res = await fetch('/poc/api/v1/chats/actions', {
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
    const response = await fetch('/poc/api/v1/chats/stream', {
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
    
    if (!state.isReloadingHistory) {
      toggleThinkingIndicator(false);
      state.isThinking = false;
    }
    
    if (!state.syncedCreditsViaSSE) {
      // Sync user profile tokens/credits only if not already synced via SSE done metadata
      await fetchUserInfo();
    }
    // Reset the optimization flag
    state.syncedCreditsViaSSE = false;
  }
}

// Process different SSE events received from stream
function handleAgentStreamEvent(event, data) {
  const logs = document.getElementById('react-trace-logs');
  const timeStr = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (event === 'thinking') {
    const line = document.createElement('div');
    const thought = data.message || 'Cloudy is thinking...';
    line.innerHTML = `<span class="text-brandCoral">[${timeStr}] 🧠 Thinking:</span> <span class="text-white/70">${thought}</span>`;
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
    
    if (data.metadata && typeof data.metadata.remaining_credits === 'number') {
      state.credits = data.metadata.remaining_credits;
      setCreditsDisplay(state.credits);
      state.syncedCreditsViaSSE = true;
    }
    
    state.isReloadingHistory = true;
    loadChatHistory(true);
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
  const logs = document.getElementById('react-trace-logs');
  
  if (show) {
    if (logs) logs.innerHTML = '';
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
function scrollChatToBottom(isSmooth = true) {
  return new Promise((resolve) => {
    const container = document.getElementById('chat-messages-container');
    if (!container) {
      resolve();
      return;
    }
    if (isSmooth) {
      setTimeout(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
        resolve();
      }, 100);
    } else {
      // Synchronous layout calculation with requestAnimationFrame to prevent visual flashes
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
        resolve();
      });
    }
  });
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

// Credit package modal actions
function openCreditModal() {
  if (!state.apiKey) return;
  document.getElementById('credit-modal-balance').innerText = state.credits;
  document.getElementById('credit-modal').classList.remove('hidden');
}

function closeCreditModal() {
  document.getElementById('credit-modal').classList.add('hidden');
}

async function purchaseCreditPackage(creditsToAdd, price) {
  if (!state.apiKey) return;
  try {
    showToast(`ขอบพระคุณจ้า! 💳 กำลังทำธุรกรรมจำลองยอด ฿${price}...`);
    
    // Call the credit purchase API
    const res = await fetch('/poc/api/v1/users/credits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey
      },
      body: JSON.stringify({ amount: creditsToAdd })
    });
    const data = await res.json();
    
    if (res.ok) {
      state.credits = data.credit;
      
      // Update balance indicators across the screen
      document.getElementById('credit-badge').innerText = state.credits;
      setCreditsDisplay(state.credits);
      document.getElementById('settings-credit-display').innerText = `${state.credits} Credits`;
      document.getElementById('credit-modal-balance').innerText = state.credits;
      
      showToast(`เติมสำเร็จ +${creditsToAdd} เครดิตแล้วจ้า! 🎉💸`);
    } else {
      showToast(data.error || 'Failed to purchase credits.');
    }
  } catch (err) {
    showToast('Network error during simulated purchase.');
    console.error(err);
  }
}

// Toggle dynamic dropdown quick action menu — slide-down/up unfold animation
function toggleQuickMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('quick-menu-dropdown');
  if (!menu) return;
  const isOpen = menu.getAttribute('aria-hidden') === 'false';

  if (!isOpen) {
    // ── Unfold downward ──
    menu.style.opacity = '0';
    menu.setAttribute('aria-hidden', 'false');
    menu.style.pointerEvents = 'auto';
    menu.style.transition = 'max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease, padding 0.3s ease';
    menu.style.maxHeight = '340px';
    menu.style.paddingTop = '16px';
    menu.style.paddingBottom = '20px';
    // Small delay so opacity fade-in starts just after clip begins
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { menu.style.opacity = '1'; });
    });
  } else {
    // ── Fold upward — keep opacity:1 so slide-up is visible ──
    closeQuickMenu(menu, 280);
  }
}

// Shared close helper: slides up while keeping content visible
function closeQuickMenu(menu, duration) {
  if (!menu || menu.getAttribute('aria-hidden') === 'true') return;
  menu.setAttribute('aria-hidden', 'true');
  menu.style.pointerEvents = 'none';
  // Slide up with content still visible
  menu.style.transition = `max-height ${duration}ms cubic-bezier(0.4,0,0.2,1), padding ${duration}ms ease`;
  menu.style.maxHeight = '0';
  menu.style.paddingTop = '0';
  menu.style.paddingBottom = '0';
  // Fade out only after the slide completes
  setTimeout(() => { menu.style.opacity = '0'; }, duration - 30);
}

// Close the menu then run action
function clickQuickMenuItem(action) {
  const menu = document.getElementById('quick-menu-dropdown');
  closeQuickMenu(menu, 220);
  triggerCloudyAction(action);
}

// Dismiss on outside click
window.addEventListener('click', () => {
  const menu = document.getElementById('quick-menu-dropdown');
  closeQuickMenu(menu, 260);
});

let selectedExpenseCategory = 'food&drink';

function openExpenseModal() {
  const modal = document.getElementById('expense-modal');
  const sheet = document.getElementById('expense-sheet');
  const input = document.getElementById('expense-textarea-input');
  
  // Set dynamic subtitle time
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timeEl = document.getElementById('expense-modal-time');
  if (timeEl) timeEl.innerText = `Today • ${timeStr}`;
  
  // Reset input and button
  if (input) input.value = '';
  onExpenseInputChanged();
  
  // Select default category 'food&drink'
  const firstChip = document.querySelector('#expense-category-chips div');
  if (firstChip) {
    selectExpenseCategory('food&drink', firstChip);
  }
  
  // Display overlay
  if (modal) modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (modal) modal.style.opacity = '1';
      if (sheet) {
        sheet.classList.remove('translate-y-full');
        sheet.classList.add('translate-y-0');
      }
    });
  });
}

function closeExpenseModal() {
  const modal = document.getElementById('expense-modal');
  const sheet = document.getElementById('expense-sheet');
  
  if (sheet) {
    sheet.classList.remove('translate-y-0');
    sheet.classList.add('translate-y-full');
  }
  if (modal) {
    modal.style.opacity = '0';
  }
  
  setTimeout(() => {
    if (modal) modal.classList.add('hidden');
  }, 300);
}

function selectExpenseCategory(category, element) {
  selectedExpenseCategory = category;
  
  // Remove active styling from all category chips
  const chips = document.querySelectorAll('#expense-category-chips div');
  chips.forEach(chip => {
    chip.classList.remove('bg-[#f97050]/20', 'border-[#f97050]', 'text-[#f97050]', 'shadow-[0_0_12px_rgba(249,112,80,0.15)]');
    chip.classList.add('bg-[#252233]', 'border-white/5', 'text-white/70');
  });
  
  // Add active styling to clicked chip
  element.classList.remove('bg-[#252233]', 'border-white/5', 'text-white/70');
  element.classList.add('bg-[#f97050]/20', 'border-[#f97050]', 'text-[#f97050]', 'shadow-[0_0_12px_rgba(249,112,80,0.15)]');
}

function onExpenseInputChanged() {
  const input = document.getElementById('expense-textarea-input');
  const btn = document.getElementById('expense-save-btn');
  if (!input || !btn) return;
  const text = input.value.trim();
  
  if (text) {
    btn.disabled = false;
    btn.classList.remove('bg-[#221f2f]', 'text-white/30', 'cursor-not-allowed');
    btn.classList.add('bg-gradient-to-br', 'from-[#ff6b4a]', 'to-[#e8431e]', 'text-white', 'cursor-pointer', 'active:scale-[0.98]');
  } else {
    btn.disabled = true;
    btn.classList.remove('bg-gradient-to-br', 'from-[#ff6b4a]', 'to-[#e8431e]', 'text-white', 'cursor-pointer', 'active:scale-[0.98]');
    btn.classList.add('bg-[#221f2f]', 'text-white/30', 'cursor-not-allowed');
  }
}

async function submitExpenseForm() {
  const input = document.getElementById('expense-textarea-input');
  if (!input || !state.apiKey) return;
  const text = input.value.trim();
  if (!text) return;
  
  // Disable button while submitting
  const btn = document.getElementById('expense-save-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Saving...';
  }
  
  const lines = text.split('\n');
  const expenses = [];
  
  const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
  const nowTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }); // "HH:MM"
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    // Parse name and amount. E.g. "Coffee 145" or "Dinner 540.50"
    const match = trimmedLine.match(/(.+?)\s+(\d+(?:\.\d+)?)/);
    if (match) {
      const subject = match[1].trim();
      const amount = parseFloat(match[2]);
      expenses.push({
        subject,
        amount,
        category: selectedExpenseCategory,
        currency: 'THB',
        date: today,
        time: nowTime
      });
    } else {
      // If it doesn't match the subject + amount format, treat the entire line as subject and amount 0
      expenses.push({
        subject: trimmedLine,
        amount: 0,
        category: selectedExpenseCategory,
        currency: 'THB',
        date: today,
        time: nowTime
      });
    }
  }
  
  if (expenses.length === 0) {
    showToast('Please enter at least one valid expense item. ⚠️');
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Save Expense';
    }
    return;
  }
  
  try {
    const res = await fetch('/poc/api/v1/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey
      },
      body: JSON.stringify({ expenses })
    });
    
    const data = await res.json();
    if (res.ok) {
      showToast('Expenses saved successfully! 💰🎉');
      closeExpenseModal();
      await loadChatHistory(true);
    } else {
      showToast(data.error || 'Failed to save expense.');
    }
  } catch (err) {
    showToast('Network error while saving expense.');
    console.error(err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Save Expense';
    }
    onExpenseInputChanged();
  }
}

// ── Schedule Modal ──────────────────────────────────────────

function openScheduleModal() {
  const modal = document.getElementById('schedule-modal');
  const sheet = document.getElementById('schedule-sheet');

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timeEl = document.getElementById('schedule-modal-time');
  if (timeEl) timeEl.innerText = `Today • ${timeStr}`;

  // Default: start = next full hour, end = start + 1h
  const startInput = document.getElementById('schedule-start-input');
  const endInput = document.getElementById('schedule-end-input');
  if (startInput) {
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const fmt = (d) => d.toISOString().slice(0, 16);
    startInput.value = fmt(start);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    if (endInput) endInput.value = fmt(end);
  }

  const titleInput = document.getElementById('schedule-title-input');
  if (titleInput) titleInput.value = '';
  const noteInput = document.getElementById('schedule-note-input');
  if (noteInput) noteInput.value = '';
  const repeats = document.getElementById('schedule-repeats');
  if (repeats) repeats.value = 'never';

  onScheduleInputChanged();

  if (modal) modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (modal) modal.style.opacity = '1';
      if (sheet) {
        sheet.classList.remove('translate-y-full');
        sheet.classList.add('translate-y-0');
      }
    });
  });
}

function closeScheduleModal() {
  const modal = document.getElementById('schedule-modal');
  const sheet = document.getElementById('schedule-sheet');
  if (sheet) {
    sheet.classList.remove('translate-y-0');
    sheet.classList.add('translate-y-full');
  }
  setTimeout(() => {
    if (modal) {
      modal.style.opacity = '0';
      modal.classList.add('hidden');
    }
  }, 300);
}

function onScheduleInputChanged() {
  const title = (document.getElementById('schedule-title-input')?.value || '').trim();
  const btn = document.getElementById('schedule-create-btn');
  if (!btn) return;
  if (title.length > 0) {
    btn.disabled = false;
    btn.classList.remove('bg-[#221f2f]', 'text-white/30', 'cursor-not-allowed');
    btn.classList.add('bg-gradient-to-br', 'from-[#ff8754]', 'to-[#f45c22]', 'text-white', 'cursor-pointer', 'active:scale-[0.98]');
  } else {
    btn.disabled = true;
    btn.classList.remove('bg-gradient-to-br', 'from-[#ff8754]', 'to-[#f45c22]', 'text-white', 'cursor-pointer', 'active:scale-[0.98]');
    btn.classList.add('bg-[#221f2f]', 'text-white/30', 'cursor-not-allowed');
  }
}

async function submitScheduleForm() {
  const title = (document.getElementById('schedule-title-input')?.value || '').trim();
  if (!title || !state.apiKey) return;

  const startVal = document.getElementById('schedule-start-input')?.value || '';
  const endVal = document.getElementById('schedule-end-input')?.value || '';
  const repeats = document.getElementById('schedule-repeats')?.value || 'never';
  const note = (document.getElementById('schedule-note-input')?.value || '').trim();

  const btn = document.getElementById('schedule-create-btn');
  if (btn) { btn.disabled = true; btn.innerText = 'Creating...'; }

  const formatDT = (val) => val ? new Date(val).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const repeatLabel = { daily: 'วัน', weekly: 'สัปดาห์', monthly: 'เดือน' };

  let prompt = `เพิ่มกำหนดการ: "${title}"`;
  if (startVal) prompt += ` เริ่ม ${formatDT(startVal)}`;
  if (endVal) prompt += ` สิ้นสุด ${formatDT(endVal)}`;
  if (repeats && repeats !== 'never') prompt += ` ซ้ำทุก${repeatLabel[repeats] || repeats}`;
  if (note) prompt += ` หมายเหตุ: ${note}`;

  closeScheduleModal();

  document.getElementById('chat-empty-state').classList.add('hidden');
  appendMessageBubble({
    id: 'schedule-msg-' + Date.now(),
    sender_id: state.username,
    content: [{ type: 'text', text: prompt }],
    created_at: new Date().toISOString()
  });
  scrollChatToBottom();

  try {
    state.isThinking = true;
    toggleThinkingIndicator(true);

    const res = await fetch('/poc/api/v1/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({ content: [{ type: 'text', text: prompt }] })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to create schedule.');
    }

    await streamAgentResponse();
  } catch (err) {
    showToast(err.message);
    toggleThinkingIndicator(false);
    state.isThinking = false;
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Create'; }
    onScheduleInputChanged();
  }
}

function getOrCreateChatBubbleState(messageId) {
  let currentBubble = state.chats.find(c => c.id === messageId);
  if (!currentBubble) {
    currentBubble = { id: messageId, feedback: null };
    state.chats.push(currentBubble);
  }
  return currentBubble;
}

function showReactionMenu(messageId, clientX, clientY) {
  // Dismiss any active menus first
  dismissReactionMenu();

  const bubbleEl = document.getElementById(`bubble-${messageId}`);
  if (!bubbleEl) return;
  
  const cardEl = bubbleEl.querySelector('.relative'); // select the contents card
  if (!cardEl) return;
  
  // Find current feedback state
  const currentBubble = getOrCreateChatBubbleState(messageId);
  const feedbackVal = currentBubble.feedback || null;

  // Create reaction menu element
  // Use fixed positioning and append to body to avoid overflow-hidden/clip issues
  const menu = document.createElement('div');
  menu.id = 'reaction-context-menu';
  menu.className = 'fixed z-[9998] bg-[#151025]/95 border border-white/10 backdrop-blur-md rounded-full px-3 py-2 flex items-center gap-3.5 shadow-2xl transition-all duration-200 transform scale-90 opacity-0 pointer-events-auto select-none';
  
  // Custom glass shadow/glowing effects for active states
  const likeClass = feedbackVal === 'like' 
    ? 'bg-brandCoral/20 border border-brandCoral/40 scale-[1.15] shadow-[0_0_12px_rgba(249,112,80,0.3)] hover:scale-[1.25] transition-all duration-200 ease-out' 
    : 'opacity-65 border border-transparent hover:opacity-100 hover:scale-[1.25] transition-all duration-200 ease-out';
  const dislikeClass = feedbackVal === 'dislike' 
    ? 'bg-indigo-500/20 border border-indigo-500/40 scale-[1.15] shadow-[0_0_12px_rgba(129,140,248,0.3)] hover:scale-[1.25] transition-all duration-200 ease-out' 
    : 'opacity-65 border border-transparent hover:opacity-100 hover:scale-[1.25] transition-all duration-200 ease-out';

  menu.innerHTML = `
    <button onclick="triggerReactionAction('${messageId}', 'like', event)" class="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 ${likeClass}">
      ${getHeartSvg('w-5 h-5')}
    </button>
    <div class="w-[1px] h-4 bg-white/10"></div>
    <button onclick="triggerReactionAction('${messageId}', 'dislike', event)" class="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 ${dislikeClass}">
      ${getAngrySvg('w-5 h-5')}
    </button>
  `;

  // Append to body to escape any overflow:hidden or clip constraints
  document.body.appendChild(menu);

  // Use viewport-fixed coordinates from getBoundingClientRect
  const cardRect = cardEl.getBoundingClientRect();
  const menuWidth = 120; // approximate pill width
  const menuHeight = 48; // approximate pill height

  // Center the pill horizontally above the card, 12px gap above top edge
  let fixedLeft = cardRect.left + (cardRect.width / 2) - (menuWidth / 2);
  let fixedTop = cardRect.top - menuHeight - 12;

  // Clamp within viewport bounds
  fixedLeft = Math.max(8, Math.min(fixedLeft, window.innerWidth - menuWidth - 8));
  fixedTop = Math.max(8, fixedTop);

  menu.style.left = `${fixedLeft}px`;
  menu.style.top = `${fixedTop}px`;

  // Trigger smooth reveal animation frame
  requestAnimationFrame(() => {
    menu.classList.remove('scale-90', 'opacity-0');
    menu.classList.add('scale-100', 'opacity-100');
  });

  // Attach dynamic window event listener to close it when clicking elsewhere
  setTimeout(() => {
    window.addEventListener('click', dismissReactionMenuOnOutsideClick);
    window.addEventListener('touchstart', dismissReactionMenuOnOutsideClick, { passive: true });
  }, 50);
}

function dismissReactionMenu() {
  const menu = document.getElementById('reaction-context-menu');
  if (!menu) return;
  
  menu.classList.remove('scale-100', 'opacity-100');
  menu.classList.add('scale-90', 'opacity-0');
  setTimeout(() => {
    if (menu.parentNode) menu.parentNode.removeChild(menu);
  }, 200);
  
  window.removeEventListener('click', dismissReactionMenuOnOutsideClick);
  window.removeEventListener('touchstart', dismissReactionMenuOnOutsideClick);
}

function dismissReactionMenuOnOutsideClick(event) {
  const menu = document.getElementById('reaction-context-menu');
  if (menu && !menu.contains(event.target)) {
    dismissReactionMenu();
  }
}

function triggerReactionAction(messageId, feedbackType, event) {
  if (event) event.stopPropagation();
  
  // Check if we are activating this feedback
  const currentBubble = getOrCreateChatBubbleState(messageId);
  const currentFeedback = currentBubble.feedback || null;
  const isActivating = currentFeedback !== feedbackType;
  
  if (isActivating) {
    let startX = window.innerWidth / 2;
    let startY = window.innerHeight / 2;
    if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      startX = event.clientX;
      startY = event.clientY;
    }
    spawnReactionParticle(feedbackType, startX, startY);
  }
  
  submitMessageFeedback(messageId, feedbackType);
  dismissReactionMenu();
}

function spawnReactionParticle(feedbackType, startX, startY) {
  const particle = document.createElement('div');
  particle.className = 'fixed z-[9999] pointer-events-none select-none text-4xl transition-all duration-700 ease-out transform scale-75 opacity-100 flex items-center justify-center';
  particle.innerHTML = feedbackType === 'like' ? '👍' : '👎';
  particle.style.left = `${startX - 20}px`;
  particle.style.top = `${startY - 20}px`;
  
  document.body.appendChild(particle);
  
  // Force layout reflow
  particle.offsetHeight;
  
  // Scale and rise upwards before fading out
  requestAnimationFrame(() => {
    particle.style.transform = 'translateY(-80px) scale(1.6)';
    particle.style.opacity = '0';
  });
  
  setTimeout(() => {
    particle.remove();
  }, 750);
}

function updateMessageFeedbackDOM(messageId, newFeedback) {
  const bubbleWrapper = document.getElementById(`bubble-${messageId}`);
  if (!bubbleWrapper) return;

  const contentsDiv = bubbleWrapper.querySelector('.relative');
  if (!contentsDiv) return;

  // Remove old badge if exists
  const oldBadge = document.getElementById(`reaction-badge-${messageId}`);
  if (oldBadge) oldBadge.remove();

  if (!newFeedback) return;

  const badge = document.createElement('div');
  badge.id = `reaction-badge-${messageId}`;
  
  if (newFeedback === 'like') {
    badge.className = `absolute -bottom-2 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-brandCoral/30 bg-[#1c1328]/95 select-none`;
    badge.innerHTML = getHeartSvg('w-3 h-3');
  } else {
    badge.className = `absolute -bottom-2 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-indigo-500/30 bg-[#1c1328]/95 select-none`;
    badge.innerHTML = getAngrySvg('w-3 h-3');
  }
  
  // One-shot scale-in entrance — pops in then stays static
  badge.style.transform = 'scale(0)';
  badge.style.transition = 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)';
  contentsDiv.appendChild(badge);
  requestAnimationFrame(() => {
    badge.style.transform = 'scale(1)';
  });
}

async function submitMessageFeedback(messageId, feedbackType) {
  if (!state.apiKey) return;
  
  // Find currently active feedback state
  const currentBubble = getOrCreateChatBubbleState(messageId);
  const currentFeedback = currentBubble.feedback || null;
  
  // Toggle: if they click the same one, clear it (set to null)
  const newFeedback = currentFeedback === feedbackType ? null : feedbackType;
  
  try {
    const res = await fetch('/poc/api/v1/chats/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey
      },
      body: JSON.stringify({ messageId, feedback: newFeedback })
    });
    
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to submit feedback.');
      return;
    }

    if (newFeedback) {
      showToast(newFeedback === 'like' 
        ? `คุณได้กดถูกใจข้อความนี้แล้ว 👍 (ขอบคุณสำหรับกำลังใจนะจ๊ะ! ☁️)` 
        : `คุณได้กดส่งคำติชมข้อความนี้แล้ว 👎 (คลาวดี้จะนำคำแนะนำไปปรับปรุงตัวนะจ๊ะ! ✨)`);
    } else {
      showToast(`ยกเลิกการส่งคำติชมแล้วจ้า`);
    }
    
    // Update local state value so it renders immediately next time
    if (currentBubble) currentBubble.feedback = newFeedback;
    
    // Update UI reaction badge instantly!
    updateMessageFeedbackDOM(messageId, newFeedback);
    
  } catch (err) {
    showToast('Network error while saving feedback.');
    console.error(err);
  }
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
window.openCreditModal = openCreditModal;
window.closeCreditModal = closeCreditModal;
window.purchaseCreditPackage = purchaseCreditPackage;
window.toggleQuickMenu = toggleQuickMenu;
window.clickQuickMenuItem = clickQuickMenuItem;
window.openExpenseModal = openExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.selectExpenseCategory = selectExpenseCategory;
window.onExpenseInputChanged = onExpenseInputChanged;
window.submitExpenseForm = submitExpenseForm;
window.submitMessageFeedback = submitMessageFeedback;
window.triggerReactionAction = triggerReactionAction;
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.onScheduleInputChanged = onScheduleInputChanged;
window.submitScheduleForm = submitScheduleForm;


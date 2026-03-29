const API_URL = window.location.origin;

const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const composerForm = document.getElementById("composer-form");
const historyList = document.getElementById("history-list");
const newChatBtn = document.getElementById("new-chat-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const chatTitle = document.getElementById("chat-title");
const themeSelect = document.getElementById("theme-select");

const THEME_STORAGE_KEY = "crag_theme_mode";
const CHAT_STORAGE_KEY = "crag_chat_threads";
const ACTIVE_THREAD_STORAGE_KEY = "crag_active_thread";
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

let threads = [];
let activeThreadId = null;

bootstrap();

function bootstrap() {
    loadThreads();
    initTheme();

    composerForm.addEventListener("submit", onSubmitMessage);
    userInput.addEventListener("keydown", onInputKeyDown);
    userInput.addEventListener("input", autoResizeInput);
    newChatBtn.addEventListener("click", createAndActivateThread);

    if (themeSelect) {
        themeSelect.addEventListener("change", onThemeChange);
    }

    if (systemThemeQuery && systemThemeQuery.addEventListener) {
        systemThemeQuery.addEventListener("change", onSystemThemeChange);
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener("click", clearAllHistory);
    }

    chatBox.addEventListener("click", async (event) => {
        const yesBtn = event.target.closest(".js-web-yes");
        const noBtn = event.target.closest(".js-web-no");
        if (!yesBtn && !noBtn) return;

        const messageId = (yesBtn || noBtn).dataset.msgId;
        await handleWebSearch(Boolean(yesBtn), messageId);
    });

    renderHistory();
    renderMessages();
}

function initTheme() {
    const saved = safeStorageGet(THEME_STORAGE_KEY) || "system";
    const mode = ["system", "light", "dark"].includes(saved) ? saved : "system";

    if (themeSelect) {
        themeSelect.value = mode;
    }

    applyTheme(mode);
}

function onThemeChange(event) {
    const mode = event.target.value;
    safeStorageSet(THEME_STORAGE_KEY, mode);
    applyTheme(mode);
}

function onSystemThemeChange() {
    const currentMode = themeSelect ? themeSelect.value : "system";
    if (currentMode === "system") {
        applyTheme("system");
    }
}

function applyTheme(mode) {
    const resolved = mode === "system"
        ? (systemThemeQuery.matches ? "dark" : "light")
        : mode;

    document.documentElement.setAttribute("data-theme", resolved);
}

function createThread() {
    const id = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    return {
        id,
        title: "Conversation",
        createdAt: now,
        updatedAt: now,
        messages: [],
    };
}

function createAndActivateThread() {
    const thread = createThread();
    threads.unshift(thread);
    activeThreadId = thread.id;
    persistThreads();
    renderHistory();
    renderMessages();
    userInput.focus();
}

function clearAllHistory() {
    const ok = window.confirm("Delete all saved chat history?");
    if (!ok) return;

    threads = [];
    activeThreadId = null;
    persistThreads();
    renderHistory();
    renderMessages();
    userInput.focus();
}

function deleteThread(threadId) {
    const target = threads.find((thread) => thread.id === threadId);
    if (!target) return;

    const ok = window.confirm(`Delete this chat: "${target.title}"?`);
    if (!ok) return;

    threads = threads.filter((thread) => thread.id !== threadId);

    if (activeThreadId === threadId) {
        activeThreadId = threads.length ? threads[0].id : null;
    }

    persistThreads();
    renderHistory();
    renderMessages();
}

function loadThreads() {
    const rawThreads = safeStorageGet(CHAT_STORAGE_KEY);
    const rawActiveThreadId = safeStorageGet(ACTIVE_THREAD_STORAGE_KEY);

    if (!rawThreads) {
        threads = [];
        activeThreadId = null;
        return;
    }

    try {
        const parsed = JSON.parse(rawThreads);
        if (!Array.isArray(parsed)) {
            threads = [];
            activeThreadId = null;
            return;
        }

        threads = parsed
            .filter((thread) => thread && typeof thread.id === "string")
            .map((thread) => ({
                id: thread.id,
                title: typeof thread.title === "string" ? thread.title : "Conversation",
                createdAt: typeof thread.createdAt === "string" ? thread.createdAt : new Date().toISOString(),
                updatedAt: typeof thread.updatedAt === "string" ? thread.updatedAt : new Date().toISOString(),
                messages: Array.isArray(thread.messages)
                    ? thread.messages.filter((message) => message && typeof message.role === "string")
                    : [],
            }));
    } catch (_error) {
        threads = [];
        activeThreadId = null;
        return;
    }

    if (!threads.length) {
        activeThreadId = null;
        return;
    }

    if (rawActiveThreadId && threads.some((thread) => thread.id === rawActiveThreadId)) {
        activeThreadId = rawActiveThreadId;
        return;
    }

    activeThreadId = threads[0].id;
}

function persistThreads() {
    safeStorageSet(CHAT_STORAGE_KEY, JSON.stringify(threads));
    if (activeThreadId) {
        safeStorageSet(ACTIVE_THREAD_STORAGE_KEY, activeThreadId);
    } else {
        safeStorageRemove(ACTIVE_THREAD_STORAGE_KEY);
    }
}

function getActiveThread() {
    return threads.find((thread) => thread.id === activeThreadId);
}

function ensureActiveThread() {
    let thread = getActiveThread();
    if (thread) return thread;

    thread = createThread();
    threads.unshift(thread);
    activeThreadId = thread.id;
    persistThreads();
    renderHistory();
    return thread;
}

function setActiveThread(threadId) {
    activeThreadId = threadId;
    persistThreads();
    renderHistory();
    renderMessages();
}

function renderHistory() {
    historyList.innerHTML = "";

    threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    threads.forEach((thread) => {
        const item = document.createElement("li");
        item.className = "history-item" + (thread.id === activeThreadId ? " active" : "");

        item.innerHTML = `
            <div class="history-main">
                <div class="title">${escapeHtml(thread.title)}</div>
                <div class="meta">${formatDate(thread.updatedAt)}</div>
            </div>
            <button class="history-delete" type="button" title="Delete chat" aria-label="Delete chat">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"></path>
                </svg>
            </button>
        `;

        item.addEventListener("click", () => setActiveThread(thread.id));

        const deleteBtn = item.querySelector(".history-delete");
        deleteBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            deleteThread(thread.id);
        });

        historyList.appendChild(item);
    });
}

function renderMessages() {
    const thread = getActiveThread();
    chatTitle.textContent = thread?.title || "CRAG IOE Chatbot";
    chatBox.innerHTML = "";

    if (!thread || !thread.messages || thread.messages.length === 0) {
        const empty = document.createElement("article");
        empty.className = "empty-state";
        empty.innerHTML = `
            <h3>Hello, how can I assist you today?</h3>
            <p>Ask anything about your syllabus or course topics.</p>
        `;
        chatBox.appendChild(empty);
        return;
    }

    thread.messages.forEach((message) => {
        chatBox.appendChild(buildMessageNode(message));
    });

    scrollChatToBottom();
}

function buildMessageNode(message) {
    const wrapper = document.createElement("article");
    wrapper.className = `message ${message.role}`;
    wrapper.dataset.messageId = message.id;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (message.type === "web_prompt") {
        bubble.innerHTML = `
            <p><strong>Out of syllabus detected</strong></p>
            <p>This topic may be outside your current syllabus context. Do you want a web search answer?</p>
            <div class="action-buttons">
                <button class="yes js-web-yes" data-msg-id="${message.id}">Yes, search web</button>
                <button class="no js-web-no" data-msg-id="${message.id}">No, cancel</button>
            </div>
        `;
    } else {
        bubble.innerHTML = formatMessageText(message.text);

        if (message.metrics) {
            const metricsPanel = document.createElement("div");
            metricsPanel.className = "metrics-panel";
            metricsPanel.innerHTML = [
                getMetricHtml("Answer", message.metrics.answerRelevance),
                getMetricHtml("Retrieval", message.metrics.retrievalRelevance),
                getMetricHtml("Grounded", message.metrics.groundedness),
                getMetricHtml("Correct", message.metrics.correctness),
            ].join("");
            bubble.appendChild(metricsPanel);
        }
    }

    wrapper.appendChild(bubble);
    return wrapper;
}

async function onSubmitMessage(event) {
    event.preventDefault();

    const text = userInput.value.trim();
    if (!text) return;

    const thread = ensureActiveThread();

    userInput.value = "";
    autoResizeInput();

    addMessage(thread, {
        role: "user",
        type: "normal",
        text,
        metrics: null,
    });

    updateThreadTitleFromFirstUser(thread);

    const loadingId = addLoadingMessage(thread);
    toggleComposerDisabled(true);

    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, thread_id: thread.id }),
        });

        const data = await response.json();
        removeMessageById(thread, loadingId);

        if (data.status === "needs_confirmation") {
            addMessage(thread, {
                role: "bot",
                type: "web_prompt",
                text: "",
                metrics: null,
            });
        } else {
            addMessage(thread, {
                role: "bot",
                type: "normal",
                text: data.answer || "I could not generate a response.",
                metrics: data.metrics || null,
            });
        }
    } catch (error) {
        removeMessageById(thread, loadingId);
        addMessage(thread, {
            role: "bot",
            type: "normal",
            text: "Error: Could not connect to the backend. Is FastAPI running?",
            metrics: null,
        });
    } finally {
        toggleComposerDisabled(false);
        userInput.focus();
    }
}

async function handleWebSearch(confirm, messageId) {
    const thread = getActiveThread();
    if (!thread) return;

    disableWebPromptButtons(messageId);

    const loadingId = addLoadingMessage(thread);

    try {
        const response = await fetch(`${API_URL}/websearch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirm, thread_id: thread.id }),
        });

        const data = await response.json();
        removeMessageById(thread, loadingId);

        addMessage(thread, {
            role: "bot",
            type: "normal",
            text: data.answer || "No response received.",
            metrics: data.metrics || null,
        });
    } catch (error) {
        removeMessageById(thread, loadingId);
        addMessage(thread, {
            role: "bot",
            type: "normal",
            text: "Error while finishing web search.",
            metrics: null,
        });
    }
}

function addMessage(thread, message) {
    const now = new Date().toISOString();
    const withMeta = {
        id: message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now,
        ...message,
    };

    thread.messages.push(withMeta);
    thread.updatedAt = now;
    persistThreads();
    renderHistory();

    if (thread.id === activeThreadId) {
        renderMessages();
        scrollChatToBottom();
    }

    return withMeta.id;
}

function addLoadingMessage(thread) {
    return addMessage(thread, {
        role: "bot",
        type: "normal",
        text: "Thinking...",
        metrics: null,
    });
}

function removeMessageById(thread, messageId) {
    thread.messages = thread.messages.filter((message) => message.id !== messageId);
    thread.updatedAt = new Date().toISOString();
    persistThreads();
    renderHistory();

    if (thread.id === activeThreadId) {
        renderMessages();
    }
}

function disableWebPromptButtons(messageId) {
    const node = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!node) return;

    node.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
        button.style.opacity = "0.65";
    });
}

function updateThreadTitleFromFirstUser(thread) {
    const firstUserMessage = thread.messages.find((message) => message.role === "user");
    if (!firstUserMessage) return;

    const title = firstUserMessage.text.replace(/\s+/g, " ").trim().slice(0, 34);
    thread.title = title.length ? title : "Conversation";
    thread.updatedAt = new Date().toISOString();
    persistThreads();
    renderHistory();
    chatTitle.textContent = thread.title;
}

function toggleComposerDisabled(disabled) {
    userInput.disabled = disabled;
    sendBtn.disabled = disabled;
}

function autoResizeInput() {
    userInput.style.height = "auto";
    userInput.style.height = `${Math.min(userInput.scrollHeight, 160)}px`;
}

function onInputKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        composerForm.requestSubmit();
    }
}

function scrollChatToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

function getMetricHtml(name, score) {
    let colorClass = "metric-poor";

    if (score >= 80) {
        colorClass = "metric-good";
    } else if (score >= 60) {
        colorClass = "metric-avg";
    }

    return `<span class="metric-badge ${colorClass}">${name}: ${score}%</span>`;
}

function formatMessageText(text) {
    const escaped = escapeHtml(String(text || "")).replace(/\r\n/g, "\n");
    const lines = escaped.split("\n");

    let html = "";
    let inList = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (/^[-*]\s+/.test(line)) {
            if (!inList) {
                html += "<ul>";
                inList = true;
            }
            html += `<li>${applyInlineFormatting(line.replace(/^[-*]\s+/, ""))}</li>`;
            continue;
        }

        if (inList) {
            html += "</ul>";
            inList = false;
        }

        if (!line) {
            html += "<p></p>";
        } else {
            html += `<p>${applyInlineFormatting(line)}</p>`;
        }
    }

    if (inList) {
        html += "</ul>";
    }

    return html || "<p></p>";
}

function applyInlineFormatting(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Just now";

    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function safeStorageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (_error) {
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (_error) {
        // Ignore storage write failures (private mode / blocked storage)
    }
}

function safeStorageRemove(key) {
    try {
        window.localStorage.removeItem(key);
    } catch (_error) {
        // Ignore storage remove failures
    }
}


// 📁 server/promptEngine.js
const marked = require('marked');

// 🤖 מולטי-סוכן
const { classify } = require('./agents/orchestrator');
const { runAgent, runAgentsInParallel } = require('./agents/agentRunner');
const { wrapSingleResponse, synthesizeMultiple } = require('./agents/synthesizer');

marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
});

// ═══════════════════════════════════════════
// 💾 In-memory response cache
// Key: SHA-like hash(agentIds + normalizedMessage)
// Value: { markdown, agents_used, mode, sections, timestamp }
// ═══════════════════════════════════════════
const responseCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 שעות

function buildCacheKey(agentIds, message) {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ');
  const agentsKey = [...agentIds].sort().join(',');
  return `${agentsKey}::${normalized}`;
}

function getCachedResponse(agentIds, message) {
  const key = buildCacheKey(agentIds, message);
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  console.log(`⚡ Cache hit: [${agentIds.join(', ')}]`);
  return entry;
}

function setCachedResponse(agentIds, message, data) {
  const key = buildCacheKey(agentIds, message);
  responseCache.set(key, { ...data, timestamp: Date.now() });
  // מנע גדילה בלתי מוגבלת — מקסימום 200 entries
  if (responseCache.size > 200) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
}

// ═══════════════════════════════════════════
// 💬 Session storage
// ═══════════════════════════════════════════
const sessions = new Map();
const SESSION_LAST_ACTIVITY = new Map();
const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 60 * 60 * 1000; // שעה

function touchSession(sessionId) {
  SESSION_LAST_ACTIVITY.set(sessionId, Date.now());
}

// ═══════════════════════════════════════════
// 🧹 LaTeX & sanitize
// ═══════════════════════════════════════════
function sanitizeAndFixReply(reply) {
  // שלב 1: סילוק עברית מתוך LaTeX
  const sanitizeLatexHebrew = (content) => {
    return content.replace(/\\(?:text|textrm)\{([^}]*[\u0590-\u05FF]+[^}]*)\}/g, (_, hebrewText) => {
      return `(${hebrewText})`;
    });
  };

  // שלב 2: הוצאת סמל ש"ח או ₪ מתוך הנוסחאות
  const sanitizeShekelInLatex = (content) => {
    content = content.replace(/\\\(([^)]*?)((₪|ש"?ח)[^)]*?)\\\)/g, (_, expr, currencyPart) => {
      const mathExpr = expr.replace(/(₪|ש"?ח)/g, '').trim();
      return `\\(${mathExpr}\\) ${currencyPart.trim()}`;
    });
    content = content.replace(/\\\[([\s\S]*?)((₪|ש"?ח)[\s\S]*?)\\\]/g, (_, expr, currencyPart) => {
      const mathExpr = expr.replace(/(₪|ש"?ח)/g, '').trim();
      return `\\[${mathExpr}\\] ${currencyPart.trim()}`;
    });
    return content;
  };

  // שלב 3: סינון תווים אסורים כמו #
  const sanitizeInvalidLatexChars = (content) => {
    return content.replace(/\\\(([^)]*?)\\\)/g, (_m, inner) => {
      const cleaned = inner.replace(/#/g, '');
      return `\\(${cleaned}\\)`;
    }).replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => {
      const cleaned = inner.replace(/#/g, '');
      return `\\[${cleaned}\\]`;
    });
  };

  let cleaned = reply;
  cleaned = sanitizeLatexHebrew(cleaned);
  cleaned = sanitizeShekelInLatex(cleaned);
  cleaned = sanitizeInvalidLatexChars(cleaned);
  return cleaned;
}

// ═══════════════════════════════════════════
// 📊 Chart ID deduplication
// ═══════════════════════════════════════════
function extractUsedChartIds(messages) {
  const idRegex = /<canvas[^>]*id=["']([^"']+)["']/g;
  const ids = new Set();
  for (const msg of messages) {
    if (msg.role === 'assistant' && typeof msg.content === 'string') {
      let match;
      while ((match = idRegex.exec(msg.content)) !== null) {
        ids.add(match[1]);
      }
    }
  }
  return ids;
}

function fixDuplicateChartIdsInReply(reply, usedIds) {
  const idRegex = /<canvas[^>]*id=["']([^"']+)["']/g;
  const replacements = new Map();
  let updatedReply = reply;
  const matches = [...reply.matchAll(idRegex)];

  for (const match of matches) {
    const fullMatch = match[0];
    const id = match[1];
    if (usedIds.has(id)) {
      const uniqueSuffix = Date.now().toString(36) + Math.floor(Math.random() * 10000).toString(36);
      const newId = `chart_${uniqueSuffix}`;
      replacements.set(id, newId);
      const newCanvasTag = fullMatch.replace(`id="${id}"`, `id="${newId}"`).replace(`id='${id}'`, `id='${newId}'`);
      updatedReply = updatedReply.replace(fullMatch, newCanvasTag);
    } else {
      usedIds.add(id);
    }
  }

  for (const [oldId, newId] of replacements) {
    const patterns = [
      new RegExp(`getElementById\\(["']${escapeRegex(oldId)}["']\\)`, 'g'),
      new RegExp(`ctx_${escapeRegex(oldId)}\\b`, 'g'),
      new RegExp(`\\b(chart|Chart)_?${escapeRegex(oldId)}\\b`, 'g'),
      new RegExp(`["']${escapeRegex(oldId)}["']`, 'g')
    ];
    patterns.forEach(pattern => {
      updatedReply = updatedReply.replace(pattern, (match) => {
        if (match.includes('getElementById')) return `getElementById("${newId}")`;
        if (match.startsWith('ctx_')) return `ctx_${newId}`;
        if (match.includes('chart') || match.includes('Chart')) return match.replace(oldId, newId);
        return `"${newId}"`;
      });
    });
  }

  return updatedReply;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════
// 🚨 Smart error classification
// ═══════════════════════════════════════════
function classifyError(error) {
  const msg = error.message || '';
  const status = error.status || error.statusCode || 0;

  if (status === 429 || msg.includes('rate limit') || msg.includes('Rate limit')) {
    return {
      userMessage: '⏳ השרת עמוס כרגע. אנא המתן 30 שניות ונסה שוב.',
      type: 'rate_limit',
      retryAfter: 30
    };
  }
  if (status === 401 || msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
    return {
      userMessage: '🔑 שגיאת הרשאה — יש לבדוק את ה-API Key בקובץ .env',
      type: 'auth_error',
      retryAfter: null
    };
  }
  if (status === 503 || msg.includes('overloaded') || msg.includes('server_error')) {
    return {
      userMessage: '🔄 שירות OpenAI זמנית לא זמין. נסה שוב בעוד דקה.',
      type: 'service_unavailable',
      retryAfter: 60
    };
  }
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) {
    return {
      userMessage: '⏱️ הבקשה לקחה יותר מדי זמן. נסה שאלה קצרה יותר או נסה שוב.',
      type: 'timeout',
      retryAfter: 10
    };
  }
  if (msg.includes('context_length') || msg.includes('maximum context')) {
    return {
      userMessage: '📏 השיחה ארוכה מדי. נסה להתחיל שיחה חדשה.',
      type: 'context_length',
      retryAfter: null
    };
  }

  return {
    userMessage: `❗ שגיאה טכנית: ${msg}. אנא נסה שוב בעוד רגע.`,
    type: 'unknown',
    retryAfter: 5
  };
}

// ═══════════════════════════════════════════
// 🧠 Main handler
// ═══════════════════════════════════════════
async function getConversationSession(sessionId) {
  const history = sessions.get(sessionId) || [];
  return { conversation: history };
}

async function handlePrompt(sessionId, userMessage) {
  const history = sessions.get(sessionId) || [];
  touchSession(sessionId);

  try {
    // ─── שלב 1: סיווג ───────────────────────────────────
    const classification = await classify(userMessage, history);
    const { agents, complexity, source, depth } = classification;
    const agentIds = agents.map(a => a.id);

    console.log(`🧭 סיווג (${source}): [${agents.map(a => `${a.id}(${a.confidence}%)`).join(', ')}] | mode: ${complexity} | depth: ${depth}`);

    // ─── שלב 1.5: בדוק cache ─────────────────────────────
    const cached = getCachedResponse(agentIds, userMessage);
    if (cached) {
      // גם כשיש cache — שמור היסטוריה
      sessions.set(sessionId, [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: cached.markdown }
      ]);
      cleanOldSessions();
      return {
        markdown: cached.markdown,
        agents_used: cached.agents_used,
        mode: cached.mode,
        sections: cached.sections,
        from_cache: true
      };
    }

    // ─── שלב 2: הרצת מומחים ──────────────────────────────
    let result;
    let agentFailures = [];

    if (agents.length === 1) {
      const agentId = agents[0].id;
      console.log(`🤖 מפעיל מומחה יחיד: ${agentId}`);
      const rawReply = await runAgent(agentId, userMessage, history, depth);
      result = wrapSingleResponse(agentId, rawReply);

    } else {
      console.log(`🤖 מפעיל ${agents.length} מומחים במקביל...`);
      const { responses, failed } = await runAgentsInParallel(agents, userMessage, history, depth);
      agentFailures = failed;

      if (responses.length === 0) {
        throw new Error('כל המומחים נכשלו — אנא נסה שוב');
      } else if (responses.length === 1) {
        result = wrapSingleResponse(responses[0].agentId, responses[0].content);
      } else {
        console.log(`🔗 מסנתז ${responses.length} תשובות...`);
        result = await synthesizeMultiple(responses, userMessage);
      }

      // הוסף הודעת כשל אם agent נכשל
      if (agentFailures.length > 0) {
        const failedNames = agentFailures.map(f => f.agentName).join(', ');
        console.warn(`⚠️ agents שנכשלו: ${failedNames}`);
        result.markdown += `\n\n> ⚠️ **שים לב**: ניתוח מ-${failedNames} לא היה זמין הפעם. התשובה מבוססת על המומחים הזמינים.`;
      }
    }

    // ─── שלב 3: sanitize LaTeX + תיקון chart IDs ─────────
    const sanitized = sanitizeAndFixReply(result.markdown);
    const allMessages = [...history, { role: 'user', content: userMessage }];
    const usedIds = extractUsedChartIds(allMessages);
    const cleanedMarkdown = fixDuplicateChartIdsInReply(sanitized, usedIds);

    // ─── שלב 4: שמירת היסטוריה ───────────────────────────
    sessions.set(sessionId, [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: cleanedMarkdown }
    ]);
    cleanOldSessions();

    // ─── שלב 5: שמירה ב-cache ────────────────────────────
    const cacheData = {
      markdown: cleanedMarkdown,
      agents_used: result.agents_used,
      mode: result.mode,
      sections: result.sections?.map(s => ({
        agent_id: s.agent_id,
        agent_name: s.agent_name,
        agent_icon: s.agent_icon
      }))
    };
    setCachedResponse(agentIds, userMessage, cacheData);

    console.log(`✅ תגובה מוכנה | מומחים: [${result.agents_used.join(', ')}] | mode: ${result.mode}`);

    return cacheData;

  } catch (error) {
    console.error('❌ שגיאה בקריאה ל-OpenAI:', error);
    const classified = classifyError(error);
    return {
      markdown: classified.userMessage,
      agents_used: [],
      mode: 'error',
      error_type: classified.type,
      retry_after: classified.retryAfter
    };
  }
}

// ═══════════════════════════════════════════
// 📊 Performance stats
// ═══════════════════════════════════════════
function getPerformanceStats() {
  const sessionEntries = Array.from(sessions.entries());
  return {
    activeSessions: sessions.size,
    cacheSize: responseCache.size,
    averageHistoryLength: sessions.size > 0
      ? sessionEntries.reduce((sum, [_, history]) => sum + history.length, 0) / sessions.size
      : 0,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid,
    sessionDetails: sessionEntries.map(([sessionId, history]) => ({
      id: sessionId.substring(0, 8) + '...',
      messages: history.length,
      lastActivity: SESSION_LAST_ACTIVITY.get(sessionId)
        ? new Date(SESSION_LAST_ACTIVITY.get(sessionId)).toISOString()
        : 'לא ידוע'
    })),
    metrics: {
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      uptimeFormatted: formatUptime(process.uptime()),
      avgHistoryLength: sessionEntries.length > 0
        ? Math.round(sessionEntries.reduce((s, [_, h]) => s + h.length, 0) / sessionEntries.length * 100) / 100
        : 0
    }
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

// ═══════════════════════════════════════════
// 🧹 Session cleanup
// ═══════════════════════════════════════════
function clearSession(sessionId) {
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
    SESSION_LAST_ACTIVITY.delete(sessionId);
    console.log(`🗑️ Session ${sessionId} נוקה`);
    return { success: true };
  }
  return { success: false, message: 'Session not found' };
}

function cleanOldSessions() {
  const now = Date.now();

  // נקה sessions לא פעילים
  for (const [id, lastActivity] of SESSION_LAST_ACTIVITY.entries()) {
    if (now - lastActivity > SESSION_TTL_MS) {
      sessions.delete(id);
      SESSION_LAST_ACTIVITY.delete(id);
    }
  }

  // אם עדיין יותר מ-MAX_SESSIONS — מחק הישנים ביותר
  if (sessions.size > MAX_SESSIONS) {
    const sortedByActivity = Array.from(SESSION_LAST_ACTIVITY.entries())
      .sort((a, b) => a[1] - b[1]);
    const toDelete = sortedByActivity.slice(0, sessions.size - MAX_SESSIONS);
    toDelete.forEach(([id]) => {
      sessions.delete(id);
      SESSION_LAST_ACTIVITY.delete(id);
    });
    console.log(`🧹 נוקו ${toDelete.length} sessions ישנים (סה"כ: ${sessions.size})`);
  }

  // נקה cache פג תוקף
  for (const [key, entry] of responseCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      responseCache.delete(key);
    }
  }
}

// ניקוי אוטומטי כל 15 דקות
setInterval(cleanOldSessions, 15 * 60 * 1000);

module.exports = {
  handlePrompt,
  getConversationSession,
  clearSession,
  getPerformanceStats
};

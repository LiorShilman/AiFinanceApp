// 📁 server/promptEngine.js
const FinancialSystemPromptTemplate = require('./FinancialSystemPromptTemplate').FinancialSystemPromptTemplate;
const OpenAI = require('openai');
const marked = require('marked');

marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sessions = new Map();

function sanitizeAndFixReply(reply) {
  // שלב 1: סילוק עברית מתוך LaTeX
  const sanitizeLatexHebrew = (content) => {
    return content.replace(/\\(?:text|textrm)\{([^}]*[\u0590-\u05FF]+[^}]*)\}/g, (_, hebrewText) => {
      return `(${hebrewText})`;
    });
  };
  

  // שלב 2: הוצאת סמל ש"ח או ₪ מתוך הנוסחאות
  const sanitizeShekelInLatex = (content) => {
    // inline: \( ... ש"ח ... \)
    content = content.replace(/\\\(([^)]*?)((₪|ש"?ח)[^)]*?)\\\)/g, (_, expr, currencyPart) => {
      const mathExpr = expr.replace(/(₪|ש"?ח)/g, '').trim();
      return `\\(${mathExpr}\\) ${currencyPart.trim()}`;
    });

    // display: \[ ... ש"ח ... \]
    content = content.replace(/\\\[([\s\S]*?)((₪|ש"?ח)[\s\S]*?)\\\]/g, (_, expr, currencyPart) => {
      const mathExpr = expr.replace(/(₪|ש"?ח)/g, '').trim();
      return `\\[${mathExpr}\\] ${currencyPart.trim()}`;
    });

    return content;
  };

  // שלב 3: סינון תווים אסורים כמו #
  const sanitizeInvalidLatexChars = (content) => {
    return content.replace(/\\\(([^)]*?)\\\)/g, (match, inner) => {
      const cleaned = inner.replace(/#/g, ''); // מסיר # בתוך נוסחה inline
      return `\\(${cleaned}\\)`;
    }).replace(/\\\[([\s\S]*?)\\\]/g, (match, inner) => {
      const cleaned = inner.replace(/#/g, '');
      return `\\[${cleaned}\\]`;
    });
  };

  // חיבור כל השלבים
  let cleaned = reply;
  cleaned = sanitizeLatexHebrew(cleaned);
  cleaned = sanitizeShekelInLatex(cleaned);
  cleaned = sanitizeInvalidLatexChars(cleaned);
  return cleaned;
}




// פונקציה לוולידציה של איכות התשובה
function validateFinancialResponse(response) {
  const requiredElements = [
    'דוח ניתוח פיננסי מקיף',
    'שלב 1',
    'שלב 2', 
    'שלב 3',
    'שלב 4',
    'שלב 5',
    'שלב 6',
    'ניתוח נתונים ראשוניים',
    'חישובים מתמטיים',
    'השוואת תרחישים',
    'ויזואליזציה אינטראקטיבית',
    'ניתוח מקצועי ומסקנות',
    'סיכום מנהלים',
    'Chart.js',
    '\\[', // נוסחאות LaTeX display
    '\\(', // נוסחאות LaTeX inline
    '<table', // טבלאות HTML
    '<canvas' // גרפים
  ];
  
  const missing = requiredElements.filter(element => 
    !response.includes(element)
  );
  
  if (missing.length > 0) {
    console.warn('⚠️ חסרים אלמנטים בתשובה:', missing);
    return {
      isValid: false,
      missing: missing,
      score: Math.max(0, (requiredElements.length - missing.length) / requiredElements.length * 100)
    };
  }
  
  return {
    isValid: true,
    missing: [],
    score: 100
  };
}

function extractUsedChartIds(messages) {
  // ביטוי רגולרי שמוצא כל canvas ID (לא רק chart_)
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
  // ביטוי רגולרי שמוצא כל canvas ID
  const idRegex = /<canvas[^>]*id=["']([^"']+)["']/g;
  const replacements = new Map();
  let updatedReply = reply;

  // שלב 1: מצא ותחלף canvas IDs כפולים
  const matches = [...reply.matchAll(idRegex)];
  
  for (const match of matches) {
    const fullMatch = match[0];
    const id = match[1];
    
    if (usedIds.has(id)) {
      // צור מזהה חדש
      const uniqueSuffix = Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
      const newId = `chart_${uniqueSuffix}`;
      
      // שמור את ההחלפה
      replacements.set(id, newId);
      
      // החלף את ה-canvas tag
      const newCanvasTag = fullMatch.replace(`id="${id}"`, `id="${newId}"`).replace(`id='${id}'`, `id='${newId}'`);
      updatedReply = updatedReply.replace(fullMatch, newCanvasTag);
    } else {
      usedIds.add(id);
    }
  }

  // שלב 2: החלף כל הפניה ל-IDs ששונו
  for (const [oldId, newId] of replacements) {
    // החלף בקוד JavaScript
    const patterns = [
      // getElementById
      new RegExp(`getElementById\\(["']${escapeRegex(oldId)}["']\\)`, 'g'),
      // משתני ctx_
      new RegExp(`ctx_${escapeRegex(oldId)}\\b`, 'g'),
      // משתני chart/Chart עם השם הישן
      new RegExp(`\\b(chart|Chart)_?${escapeRegex(oldId)}\\b`, 'g'),
      // כל הפניה אחרת עם גרש או גרשיים
      new RegExp(`["']${escapeRegex(oldId)}["']`, 'g')
    ];

    patterns.forEach(pattern => {
      updatedReply = updatedReply.replace(pattern, (match) => {
        if (match.includes('getElementById')) {
          return `getElementById("${newId}")`;
        } else if (match.startsWith('ctx_')) {
          return `ctx_${newId}`;
        } else if (match.includes('chart') || match.includes('Chart')) {
          return match.replace(oldId, newId);
        } else {
          return `"${newId}"`;
        }
      });
    });
  }

  return updatedReply;
}

// פונקציה עזר לescaping של regex
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// שימוש:
function processReplyWithChartFix(reply, messages) {
  const usedIds = extractUsedChartIds(messages);
  return fixDuplicateChartIdsInReply(reply, usedIds);
}


function detectAnalysisType(message) {
  const lowered = message.toLowerCase();

  if (lowered.includes('פנסיה') || lowered.includes('קצבה') || lowered.includes('פרישה')) {
    return 'ניתוח פנסיוני';
  }
  if (lowered.includes('משכנתא') || lowered.includes('הלוואה לדיור')) {
    return 'ניתוח משכנתא והשוואת מסלולים';
  }
  if (lowered.includes('הלוואה') || lowered.includes('ריבית') || lowered.includes('פרעון מוקדם')) {
    return 'ניתוח הלוואה';
  }
  if (lowered.includes('תקציב') || lowered.includes('הוצאות') || lowered.includes('ניהול חודשי')) {
    return 'ניתוח תקציב אישי';
  }
  if (lowered.includes('חיסכון') || lowered.includes('השקעה') || lowered.includes('תשואה')) {
    return 'חישוב חיסכון והשקעות';
  }
  if (lowered.includes('קנייה') && lowered.includes('שכירות')) {
    return 'השוואת קנייה מול שכירות';
  }
  if (lowered.includes('ילדים') || lowered.includes('חינוך פיננסי')) {
    return 'תכנון פיננסי למשפחה וילדים';
  }

  return 'ניתוח פיננסי כללי';
}

async function getConversationSession (sessionId) {
  const history = sessions.get(sessionId) || [];
  return {
      conversation: history
    };
}

async function handlePrompt(sessionId, userMessage) {
  const history = sessions.get(sessionId) || [];

  // הוסף context ייחודי
  const uniqueContext = `[Session: ${sessionId.slice(-8)}] [Time: ${Date.now()}] [Messages: ${history.length}]`;
  
  const messages = [
    { role: 'system', content: FinancialSystemPromptTemplate + '\n\n' + uniqueContext },
    ...history,
    { role: 'user', content: userMessage }
    // ❌ הסרתי את assistantIntro
  ];

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.25,        // ⬆️ הגבר
      presence_penalty: 0.1,   // ⬆️ עודד חדשנות
      frequency_penalty: 0.1,  // ⬆️ מנע חזרות
      top_p: 0.9,
      max_completion_tokens: 6000,
      seed: Math.floor(Math.random() * 1000000), // ⭐ רנדומי
      stream: false
    });

    const reply = chatCompletion.choices[0].message.content;
    
    // שאר הטיפול בגרפים...
    const usedIds = extractUsedChartIds(messages);
    const cleanedReply = fixDuplicateChartIdsInReply(reply, usedIds);

    sessions.set(sessionId, [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: cleanedReply }
    ]);

    return { markdown: cleanedReply };
  } catch (error) {
    console.error('❌ שגיאה בקריאה ל־OpenAI:', error);
    return {
      markdown: `❗ שגיאה טכנית: ${error.message}. אנא נסה שוב בעוד רגע.`
    };
  }
}

// 📁 promptEngine.js - וודא שהפונקציה הזו קיימת:

// 📊 פונקציה לסטטיסטיקות ביצועים
function getPerformanceStats() {
  const sessionEntries = Array.from(sessions.entries());
  
  return {
    // Sessions data
    activeSessions: sessions.size,
    averageHistoryLength: sessions.size > 0 
      ? sessionEntries.reduce((sum, [_, history]) => sum + history.length, 0) / sessions.size 
      : 0,
    
    // Memory usage
    memoryUsage: process.memoryUsage(),
    
    // Server info
    uptime: process.uptime(),
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid,
    
    // Sessions details
    sessionDetails: sessionEntries.map(([sessionId, history]) => ({
      id: sessionId.substring(0, 8) + '...',
      messages: history.length,
      lastActivity: history.length > 0 
        ? new Date(Date.now() - 1000).toISOString() // משוער
        : 'לא ידוע'
    })),
    
    // Performance metrics
    metrics: {
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      externalMB: Math.round(process.memoryUsage().external / 1024 / 1024),
      uptimeFormatted: formatUptime(process.uptime()),
      avgHistoryLength: Math.round((sessions.size > 0 
        ? sessionEntries.reduce((sum, [_, history]) => sum + history.length, 0) / sessions.size 
        : 0) * 100) / 100
    }
  };
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  let result = '';
  if (days > 0) result += `${days}d `;
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m `;
  result += `${secs}s`;
  
  return result.trim();
}


// 🧹 פונקציה מאופטמת לניקוי session
function clearSession(sessionId) {
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
    console.log(`🗑️ Session ${sessionId} נוקה בהצלחה`);
    return { success: true, message: 'Session cleared' };
  } else {
    console.warn(`⚠️ Session ${sessionId} לא נמצא`);
    return { success: false, message: 'Session not found' };
  }
}

// פונקציה לניקוי היסטוריה ישנה (אופציונלי)
function cleanOldSessions() {
  const maxSessions = 50;
  const maxAge = 30 * 60 * 1000; // 30 דקות במקום שעה
  if (sessions.size > maxSessions) {
    const entries = Array.from(sessions.entries());
    const toDelete = entries.slice(0, entries.length - maxSessions);
    
    toDelete.forEach(([key]) => {
      sessions.delete(key);
    });
    
    console.log(`🧹 נוקו ${toDelete.length} sessions ישנים (סה"כ: ${sessions.size})`);
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
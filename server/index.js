require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { handlePrompt, getPerformanceStats , getConversationSession } = require('./promptEngine');
const ConversationService = require('./services/conversationService');
const conversationService = new ConversationService(); // ← הוספת new
const SERVER_START_TIME = new Date();

// התחברות למסד נתונים
connectDB();

const app = express();
const PORT = process.env.PORT || 15001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // להתיר Chart.js ו-MathJax
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 דקות
  max: 100, // מקסימום 100 בקשות לכל IP
  message: {
    error: 'יותר מדי בקשות מהכתובת הזו, אנא נסה שוב אחר כך'
  }
});

app.use('/api/', limiter);

// CORS configuration
const ALLOWED_ORIGINS = [
  'http://shilmanlior2608.ddns.net:15000',
  'http://shilmanlior2608.ddns.net',
  'http://localhost:4200',
  'http://localhost:15000',
  'http://localhost:8080'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || '*');
  }
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Private-Network", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ===============================
// נתיבי השיחות החדשים עם MongoDB
// ===============================

app.get('/api/conversations', async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      category: req.query.category,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      search: req.query.search,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      sortBy: req.query.sortBy || 'updatedAt',
      sortOrder: req.query.sortOrder || 'desc',
      favorites: req.query.favorites === 'true',
      contentTypes: req.query.contentTypes ? req.query.contentTypes.split(',') : undefined,
      hasRawContent: req.query.hasRawContent ? req.query.hasRawContent === 'true' : undefined,
      
      // פרמטרים חדשים לבקרה על התוכן
      includeMessages: req.query.includeMessages !== 'false', // ברירת מחדל: true
      includeRawConversation: req.query.includeRawConversation === 'true' // ברירת מחדל: false
    };

    const result = await conversationService.getConversations(options);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('❌ שגיאה בקבלת שיחות:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת'
    });
  }
});

app.get('/api/conversations/:sessionId', async (req, res) => {
  try {
    console.log('📖 מבקש שיחה:', req.params.sessionId);
    
    const result = await conversationService.getConversation(req.params.sessionId);

    if (result.success) {
      console.log('✅ נמצאה שיחה:', result.conversation.title);
      res.json(result);
    } else {
      console.log('❌ שיחה לא נמצאה:', req.params.sessionId);
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('❌ שגיאה בקבלת שיחה:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת'
    });
  }
});

// 📖 טעינת שיחה ספציפית
app.put('/api/conversations/:sessionId', async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'נתוני עדכון לא תקינים'
      });
    }

    const result = await conversationService.updateConversation(
      req.params.sessionId, 
      updates
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ שגיאה בעדכון שיחה:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת'
    });
  }
});

// 🆕 עדכון שיחה (PUT) - מעודכן
app.put('/api/conversations/:sessionId/save', async (req, res) => {
  try {
    const { messages, metadata } = req.body;
    const sessionId = req.params.sessionId;
    
    console.log(`🔄 מקבל בקשת עדכון לsession: ${sessionId}`);
    console.log(`📊 נתונים שהתקבלו:`, { 
      hasMessages: !!messages, 
      messagesLength: messages?.length,
      messagesType: typeof messages,
      isArray: Array.isArray(messages),
      hasMetadata: !!metadata 
    });
    
    // 🔍 בדיקות תקינות מלאות
    if (!sessionId || sessionId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'sessionId חובה ואינו יכול להיות ריק'
      });
    }

    if (!messages) {
      return res.status(400).json({
        success: false,
        error: 'חסרות הודעות בבקשת העדכון'
      });
    }

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: `הודעות חייבות להיות מערך, קיבלתי: ${typeof messages}`
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'מערך הודעות ריק'
      });
    }

    // בדיקת תקינות ההודעות
    const validMessages = messages.filter(msg => {
      if (!msg) {
        console.warn('⚠️ הודעה null/undefined נמצאה');
        return false;
      }
      if (!msg.content && !msg.message) {
        console.warn('⚠️ הודעה ללא תוכן נמצאה:', msg);
        return false;
      }
      return true;
    });

    if (validMessages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'אין הודעות תקינות במערך'
      });
    }

    console.log(`✅ נמצאו ${validMessages.length} הודעות תקינות מתוך ${messages.length}`);
    
    // שמירה עם כפיית עדכון - ישירות למסד נתונים
    const result = await conversationService.saveConversation(
      sessionId,
      validMessages, // שליחת הודעות מסוננות
      {
        ...metadata,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        forceUpdate: true,
        deletedMessages: metadata?.deletedMessages || false,
        updatedFromClient: true,
        serverValidated: true, // סימון שעבר ולידציה בשרת
        originalMessageCount: messages.length,
        validMessageCount: validMessages.length,
        savedAt: new Date()
      }
    );

    if (result.success) {
      console.log(`✅ שיחה עודכנה בהצלחה אחרי מחיקה עם ${validMessages.length} הודעות`);
      res.json(result);
    } else {
      console.error('❌ כשל בעדכון מסד נתונים:', result.error);
      res.status(500).json(result);
    }
    
  } catch (error) {
    console.error('❌ שגיאה בעדכון שיחה:', error);
    console.error('📊 Request body:', req.body);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת: ' + error.message
    });
  }
});


// 🆕 הוסף גם endpoint כללי לשמירה (ללא sessionId בURL)
app.post('/api/conversations/save', async (req, res) => {
    try {
        const messages = req.body.messages;
        const metadata = req.body.metadata || {};
        const sessionId = metadata?.sessionId;
        
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'חסר sessionId' });
        }
        
        const isAutoSave = metadata?.autoSaved === true;
        const hasClientMessages = messages && Array.isArray(messages) && messages.length > 0;
        
        if (isAutoSave || !hasClientMessages) {
            // שמירה מהזיכרון
            const sessionConversation = await getConversationSession(sessionId);
            if (!sessionConversation) {
                return res.status(404).json({ success: false, error: 'שיחה לא נמצאה' });
            }
            
            const result = await conversationService.saveSessionDirectly(sessionId, sessionConversation, metadata);
            res.json(result);
        } else {
            // שמירה עם הודעות מהלקוח
            const result = await conversationService.saveConversation(sessionId, messages, metadata);
            res.json(result);
        }
        
    } catch (error) {
        console.error('❌ שגיאה בשמירה:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ⭐ סימון/ביטול מועדפת
app.patch('/api/conversations/:sessionId/favorite', async (req, res) => {
  try {
    const result = await conversationService.toggleFavorite(req.params.sessionId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('❌ שגיאה בעדכון מועדפת:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת'
    });
  }
});

// 🗑️ מחיקת שיחה
app.delete('/api/conversations/:sessionId', async (req, res) => {
  try {
    const result = await conversationService.deleteConversation(req.params.sessionId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('❌ שגיאה במחיקת שיחה:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת'
    });
  }
});

// 📊 סטטיסטיקות שיחות
app.get('/api/conversations/stats/overview', async (req, res) => {
  try {
    const result = await conversationService.getStatistics();

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('❌ שגיאה בקבלת סטטיסטיקות:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת'
    });
  }
});

// 🔍 חיפוש מתקדם
app.post('/api/conversations/search', async (req, res) => {
  try {
    const { query, filters } = req.body;
    
    const options = {
      search: query,
      ...filters,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };

    const result = await conversationService.getConversations(options);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('❌ שגיאה בחיפוש:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת'
    });
  }
});

// 📤 יצוא שיחה
app.get('/api/conversations/:sessionId/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const result = await conversationService.loadConversation(req.params.sessionId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    const conversation = result.conversation;

    switch (format) {
      case 'json':
        res.setHeader('Content-Disposition', `attachment; filename="conversation_${conversation.sessionId}.json"`);
        res.setHeader('Content-Type', 'application/json');
        res.json(conversation);
        break;

      case 'txt':
        const txtContent = conversation.messages
          .map(msg => `[${msg.timestamp}] ${msg.sender === 'user' ? 'משתמש' : 'יועץ AI'}: ${msg.message}`)
          .join('\n\n');
        
        res.setHeader('Content-Disposition', `attachment; filename="conversation_${conversation.sessionId}.txt"`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(txtContent);
        break;

      default:
        res.status(400).json({
          success: false,
          error: 'פורמט לא נתמך'
        });
    }
  } catch (error) {
    console.error('❌ שגיאה ביצוא שיחה:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה פנימית בשרת'
    });
  }
});

// ===============================
// נתיבים קיימים (מעודכנים)
// ===============================

// נתיב הצ'אט המקורי עם שמירה אוטומטית
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }

  try {
    console.log(`💬 הודעה חדשה מ-${sessionId}: "${message.substring(0, 50)}..."`);
    
    const response = await handlePrompt(sessionId, message);
    
    // שמירה אוטומטית ל-MongoDB
    try {

      // קבלת ההיסטוריה הנוכחית מה-memory
      /* const memorySession = conversationService.getSessionHistory(sessionId);
      
      if (memorySession && memorySession.length > 0) {
        await conversationService.saveConversation(
          sessionId,
          memorySession,
          {
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
            lastActivity: new Date()
          }
        );
        console.log(`💾 שיחה ${sessionId} נשמרה אוטומטית ל-MongoDB`);
      } */
    } catch (saveError) {
      console.error('⚠️ שגיאה בשמירה אוטומטית:', saveError.message);
      // לא נכשיל את התגובה בגלל שגיאת שמירה
    }
    
    res.json(response);
  } catch (err) {
    console.error('❌ שגיאה בטיפול בהודעה:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// נתיב סטטיסטיקות ביצועים (מעודכן)
app.get('/api/performance', async (req, res) => {
  try {
    const memoryStats = conversationService.getPerformanceStats();
    const dbStats = await conversationService.getStatistics();
    
    res.json({
      success: true,
      performance: {
        sessions: {
          active: memoryStats.activeSessions,
          averageHistoryLength: Math.round(memoryStats.averageHistoryLength * 100) / 100,
          totalSaved: dbStats.success ? dbStats.statistics.total : 0
        },
        memory: {
          rss: Math.round(memoryStats.memoryUsage.rss / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memoryStats.memoryUsage.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memoryStats.memoryUsage.heapTotal / 1024 / 1024) + 'MB',
          external: Math.round(memoryStats.memoryUsage.external / 1024 / 1024) + 'MB'
        },
        server: {
          uptime: Math.floor(memoryStats.uptime),
          startTime: SERVER_START_TIME.toLocaleString('he-IL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Jerusalem'
          }),
          platform: process.platform,
          nodeVersion: process.version,
          pid: process.pid
        },
        optimization: {
          sessionCleanupInterval: '15 minutes',
          maxSessionsLimit: 50,
          historyLimitPerSession: 10,
          modelUsed: 'gpt-4o'
        },
        database: {
          connected: require('mongoose').connection.readyState === 1,
          totalConversations: dbStats.success ? dbStats.statistics.total : 0,
          categories: dbStats.success ? dbStats.statistics.categories : [],
          recentActivity: dbStats.success ? dbStats.statistics.recentActivity : []
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error getting performance stats:', err);
    res.status(500).json({ 
      error: 'Failed to get performance statistics',
      details: err.message 
    });
  }
});

// נתיב בדיקת בריאות
app.get('/api/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const dbStatus = mongoose.connection.readyState;
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: dbStatus === 1,
        status: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbStatus]
      },
      memory: process.memoryUsage(),
      version: process.version
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// ===============================
// Error handling middleware
// ===============================

app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'שגיאה פנימית בשרת',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'נתיב לא נמצא'
  });
});

// Helper function
function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// ===============================
// הפעלת השרת
// ===============================

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Performance stats: http://localhost:${PORT}/api/performance`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`💾 Conversations API: http://localhost:${PORT}/api/conversations`);
  console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  
  const mongoose = require('mongoose');
  await mongoose.connection.close();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  
  const mongoose = require('mongoose');
  await mongoose.connection.close();
  
  process.exit(0);
});
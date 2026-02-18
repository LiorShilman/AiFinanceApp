// ConversationService מעודכן לעבודה עם Mongoose
const Conversation = require('../models/conversation');

class ConversationService {

    getPerformanceStats() {
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
                    ? new Date(Date.now() - 1000).toISOString() // 诪砖讜注专
                    : '诇讗 讬讚讜注'
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


    /**
 * קבלת סטטיסטיקות כלליות
 */
    async getStatistics() {
        try {
            const [
                total,
                categories,
                recentCount,
                favoriteCount,
                mathCount,
                htmlCount
            ] = await Promise.all([
                // סך הכל שיחות
                Conversation.countDocuments(),

                // קטגוריות
                Conversation.aggregate([
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ]),

                // שיחות מהשבוע האחרון
                Conversation.countDocuments({
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }),

                // מועדפות
                Conversation.countDocuments({ isFavorite: true }),

                // עם תוכן מתמטי
                Conversation.countDocuments({ 'metadata.contentTypes': 'math' }),

                // עם HTML/תרשימים
                Conversation.countDocuments({ 'metadata.contentTypes': 'html' })
            ]);

            return {
                success: true,
                statistics: {
                    total,
                    recentActivity: recentCount,
                    favorites: favoriteCount,
                    withMath: mathCount,
                    withCharts: htmlCount,
                    categories: categories.map(cat => ({
                        name: cat._id,
                        count: cat.count
                    }))
                }
            };

        } catch (error) {
            console.error('❌ שגיאה בקבלת סטטיסטיקות:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }


    /**
 * פונקציה להעלאת/ביטול מועדפים
 */
    async toggleFavorite(sessionId) {
        try {
            const conversation = await Conversation.findOne({ sessionId });

            if (!conversation) {
                return {
                    success: false,
                    error: 'שיחה לא נמצאה'
                };
            }

            const newFavoriteState = !conversation.isFavorite;

            const updatedConversation = await Conversation.findOneAndUpdate(
                { sessionId },
                {
                    isFavorite: newFavoriteState,
                    'metadata.lastActivity': new Date()
                },
                { new: true }
            );

            return {
                success: true,
                conversation: {
                    sessionId: updatedConversation.sessionId,
                    title: updatedConversation.title,
                    isFavorite: updatedConversation.isFavorite
                }
            };

        } catch (error) {
            console.error('❌ שגיאה בעדכון מועדפת:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
 * שמירת שיחה מעודכנת (כולל מחיקות)
 */
    async saveConversation(sessionId, messages, metadata = {}) {
        try {
            // 🔍 בדיקות תקינות
            if (!sessionId) {
                throw new Error('sessionId חובה');
            }

            if (!messages || !Array.isArray(messages)) {
                throw new Error('messages חובה וחייב להיות מערך');
            }

            if (messages.length === 0) {
                console.log('⚠️ מערך הודעות ריק, לא שומר');
                return {
                    success: false,
                    error: 'מערך הודעות ריק'
                };
            }

            console.log(`💾 שומר שיחה: ${sessionId} עם ${messages.length} הודעות`);

            // 🔄 יצירת rawConversation (התוכן הגולמי כמו במקור)
            const rawConversation = messages.map((msg, index) => {
                // בדיקות תקינות לכל הודעה
                if (!msg) {
                    console.warn(`⚠️ הודעה null בindex ${index}, מדלג`);
                    return null;
                }

                const content = msg.content || msg.message || '';

                return {
                    role: msg.role || (msg.sender === 'user' ? 'user' : 'assistant'),
                    content: content,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                    id: msg.id || this.generateMessageId(),
                    sender: msg.role === 'user' ? 'user' : (msg.sender === 'user' ? 'user' : 'ai'),
                    message: content // שדה נוסף לתאימות
                };
            }).filter(msg => msg !== null); // הסרת הודעות null

            // 🧹 עיבוד ההודעות - ⚠️ שמירת תוכן גולמי ללא ניקוי XSS
            const processedMessages = messages.map((msg, index) => {
                if (!msg) {
                    console.warn(`⚠️ הודעה null בindex ${index} בעיבוד, מדלג`);
                    return null;
                }

                const rawContent = msg.content || msg.message || '';

                return {
                    sender: msg.role === 'user' ? 'user' : (msg.sender === 'user' ? 'user' : 'ai'),
                    message: rawContent, // 🔥 שמירת תוכן גולמי ללא ניקוי!
                    rawContent: rawContent, // 💾 שמירת תוכן גולמי
                    displayMessage: this.sanitizeForDisplay(rawContent), // 🔒 תוכן מנוקה לתצוגה בלבד
                    contentType: this.detectContentType(rawContent),
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                    messageId: msg.id || this.generateMessageId()
                };
            }).filter(msg => msg !== null); // הסרת הודעות null

            if (processedMessages.length === 0) {
                return {
                    success: false,
                    error: 'אין הודעות תקינות לשמירה'
                };
            }

            // הכנת נתוני השיחה
            const conversationData = {
                sessionId,
                messages: processedMessages,
                rawConversation: rawConversation, // 🔥 שמירת התוכן הגולמי!
                metadata: {
                    ...metadata,
                    totalMessages: processedMessages.length,
                    lastActivity: new Date(),
                    contentTypes: this.getContentTypes(processedMessages),
                    updatedFromClient: metadata.updatedFromClient || false,
                    deletedMessages: metadata.deletedMessages || false,
                    rawContentSaved: true, // 📝 סימון ששמרנו תוכן גולמי
                    savedFromSession: false // זה לא מסשן אלא מהלקוח
                }
            };

            // יצירת אובייקט זמני לחישוב כותרת וקטגוריה
            const tempConversation = new Conversation(conversationData);

            // חישוב מטאדטה נוספת
            conversationData.title = tempConversation.generateTitle();
            conversationData.category = tempConversation.detectCategory();
            conversationData.tags = tempConversation.generateTags();
            conversationData.description = this.generateDescription(tempConversation);

            // שמירה או עדכון עם upsert
            const savedConversation = await Conversation.findOneAndUpdate(
                { sessionId },
                conversationData,
                {
                    upsert: true, // יצירה אם לא קיים
                    new: true,    // החזרת המסמך המעודכן
                    setDefaultsOnInsert: true
                }
            );

            console.log(`✅ שיחה נשמרה/עודכנה עם תוכן גולמי: ${savedConversation.title} (${savedConversation.messages.length} הודעות)`);

            return {
                success: true,
                conversation: {
                    id: savedConversation._id,
                    sessionId: savedConversation.sessionId,
                    title: savedConversation.title,
                    description: savedConversation.description,
                    category: savedConversation.category,
                    messageCount: savedConversation.messages.length,
                    lastUpdated: savedConversation.updatedAt,
                    tags: savedConversation.tags,
                    contentTypes: savedConversation.metadata.contentTypes,
                    hasRawContent: true, // יש תוכן גולמי
                    wasDeleted: metadata.deletedMessages || false
                }
            };

        } catch (error) {
            console.error('❌ שגיאה בשמירת שיחה:', error);
            console.error('📊 נתונים שהתקבלו:', { sessionId, messagesLength: messages?.length, metadata });
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * 🔒 ניקוי תוכן לתצוגה מאובטחת (מניעת XSS)
     */
    sanitizeForDisplay(content) {
        if (!content || typeof content !== 'string') return content;

        // אם יש תוכן מתמטי, נשאיר אותו לעיבוד בקליינט
        if (content.includes('MATHD{') || content.includes('MATHI{')) {
            return content;
        }

        // הסרת סקריפטים מסוכנים
        let sanitized = content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // הסרת script tags
            .replace(/javascript:/gi, '') // הסרת javascript: URLs
            .replace(/on\w+\s*=/gi, '') // הסרת event handlers (onclick, onload וכו')
            .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // הסרת iframes
            .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '') // הסרת objects
            .replace(/<embed[^>]*>/gi, '') // הסרת embeds
            .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, ''); // הסרת forms

        // הגבלת אורך לביטחון
        if (sanitized.length > 50000) {
            sanitized = sanitized.substring(0, 50000) + '... [תוכן קוצר לביטחון]';
        }

        return sanitized;
    }

    /**
     * 🔄 חילוץ הודעה לתצוגה (מעודכן עם ניקוי)
     */
    extractDisplayMessage(msg) {
        // לשמירה במסד נתונים - תוכן מלא ללא ניקוי
        return this.extractRawMessage(msg);
    }

    /**
     * שמירה ישירה ללא בדיקת קיום - פשוט שמור/עדכן
     */
    async saveSessionDirectly(sessionId, sessionConversation, metadata = {}) {
        try {
            // הכנת הודעות מעובדות
            const processedMessages = this.processSessionMessages(sessionConversation);

            // הכנת נתוני השיחה
            const conversationData = {
                sessionId,
                messages: processedMessages,
                rawConversation: sessionConversation.conversation,
                metadata: {
                    ...metadata,
                    rawContentSaved: true,
                    savedFromSession: true,
                    totalMessages: processedMessages.length,
                    lastActivity: new Date(),
                    contentTypes: this.getContentTypes(processedMessages)
                }
            };

            // יצירת אובייקט Conversation
            const tempConversation = new Conversation(conversationData);

            // יצירת כותרת, קטגוריה ותגיות
            conversationData.title = tempConversation.generateTitle();
            conversationData.category = tempConversation.detectCategory();
            conversationData.tags = tempConversation.generateTags();
            conversationData.description = this.generateDescription(tempConversation);

            // שמירה או עדכון עם upsert
            const savedConversation = await Conversation.findOneAndUpdate(
                { sessionId }, // מציאה לפי sessionId
                conversationData, // הנתונים לעדכון
                {
                    upsert: true, // יצירה אם לא קיים
                    new: true,    // החזרת המסמך המעודכן
                    setDefaultsOnInsert: true // הגדרת ברירות מחדל ביצירה
                }
            );

            console.log(`✅ שיחה נשמרה: ${savedConversation.title} (${savedConversation.messages.length} הודעות)`);

            return {
                success: true,
                conversation: {
                    id: savedConversation._id,
                    sessionId: savedConversation.sessionId,
                    title: savedConversation.title,
                    description: savedConversation.description,
                    category: savedConversation.category,
                    messageCount: savedConversation.messages.length,
                    hasRawContent: true,
                    lastUpdated: savedConversation.updatedAt,
                    tags: savedConversation.tags,
                    contentTypes: savedConversation.metadata.contentTypes
                }
            };

        } catch (error) {
            console.error('❌ שגיאה בשמירה:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * עיבוד הודעות מהסשן
     */
    processSessionMessages(sessionConversation) {
        const rawMessages = sessionConversation.conversation || [];

        return rawMessages.map((msg, index) => {
            const rawContent = this.extractRawMessage(msg);

            return {
                sender: this.determineSender(msg, index),
                message: rawContent, // 🔥 שמירת תוכן גולמי
                rawContent: rawContent,
                displayMessage: this.sanitizeForDisplay(rawContent), // 🔒 תוכן מנוקה לתצוגה
                contentType: this.detectContentType(rawContent),
                timestamp: msg.timestamp || new Date(),
                messageId: msg.id || this.generateMessageId()
            };
        });
    }

    // פונקציה חדשה לקבלת תוכן לתצוגה
    getDisplayContent(message) {
        // אם יש displayMessage מוכן, נשתמש בו
        if (message.displayMessage) {
            return message.displayMessage;
        }

        // אחרת, ננקה את התוכן הגולמי
        return this.sanitizeForDisplay(message.message || message.rawContent);
    }


    /**
     * קביעת השולח
     */
    determineSender(msg, index) {
        if (msg.sender) return msg.sender === 'user' ? 'user' : 'ai';
        if (msg.role) return msg.role === 'user' ? 'user' : 'ai';
        return index % 2 === 0 ? 'user' : 'ai';
    }

    /**
     * חילוץ התוכן הגולמי
     */
    extractRawMessage(msg) {
        if (msg.rawContent) return msg.rawContent;
        if (msg.message) return msg.message;
        if (msg.content) return msg.content;
        if (typeof msg === 'string') return msg;
        return String(msg);
    }

    /**
     * חילוץ הודעה לתצוגה
     */
    extractDisplayMessage(msg) {
        return this.extractRawMessage(msg);
    }

    /**
     * זיהוי סוג התוכן
     */
    detectContentType(content) {
        if (!content || typeof content !== 'string') return 'text';
        if (content.includes('MATHD{') || content.includes('MATHI{')) return 'math';
        if (/<[^>]*>/g.test(content)) return 'html';
        if (/[#*_`\[\]]/g.test(content)) return 'markdown';
        return 'text';
    }

    /**
     * קבלת סוגי תוכן
     */
    getContentTypes(messages) {
        const types = new Set();
        messages.forEach(msg => types.add(msg.contentType));
        return Array.from(types);
    }

    /**
     * יצירת תיאור
     */
    generateDescription(conversation) {
        const messageCount = conversation.messages.length;
        const contentTypes = conversation.metadata.contentTypes || [];

        let description = `שיחה עם ${messageCount} הודעות`;

        if (contentTypes.includes('math')) description += ', כולל תוכן מתמטי';
        if (contentTypes.includes('html')) description += ', עם תרשימים';
        if (contentTypes.includes('markdown')) description += ', עם מסמכים מעוצבים';

        return description;
    }

    /**
     * יצירת ID ייחודי
     */
    generateMessageId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }


    /**
     * קביעת השולח
     */
    determineSender(msg, index) {
        if (msg.sender) {
            return msg.sender === 'user' ? 'user' : 'ai';
        }
        if (msg.role) {
            return msg.role === 'user' ? 'user' : 'ai';
        }
        // הנחה: משתמש = זוגי, AI = אי זוגי
        return index % 2 === 0 ? 'user' : 'ai';
    }

    /**
     * חילוץ התוכן הגולמי
     */
    extractRawMessage(msg) {
        if (msg.rawContent) return msg.rawContent;
        if (msg.message) return msg.message;
        if (msg.content) return msg.content;
        if (typeof msg === 'string') return msg;
        return String(msg);
    }

    /**
     * חילוץ הודעה לתצוגה (ניקוי בסיסי)
     */
    extractDisplayMessage(msg) {
        const rawContent = this.extractRawMessage(msg);

        // אם יש תוכן מתמטי, נשאיר אותו לעיבוד בקליינט
        if (rawContent.includes('MATHD{') || rawContent.includes('MATHI{')) {
            return rawContent;
        }

        // ניקוי בסיסי לתצוגה
        return rawContent
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .substring(0, 10000); // הגבלת אורך
    }

    /**
     * זיהוי סוג התוכן
     */
    detectContentType(content) {
        if (!content || typeof content !== 'string') return 'text';

        if (content.includes('MATHD{') || content.includes('MATHI{')) {
            return 'math';
        }
        if (/<[^>]*>/g.test(content)) {
            return 'html';
        }
        if (/[#*_`\[\]]/g.test(content)) {
            return 'markdown';
        }
        return 'text';
    }

    /**
     * יצירת תיאור
     */
    generateDescription(conversation) {
        const messageCount = conversation.messages.length;
        const contentTypes = conversation.metadata.contentTypes || [];

        let description = `שיחה עם ${messageCount} הודעות`;

        if (contentTypes.includes('math')) {
            description += ', כולל תוכן מתמטי';
        }
        if (contentTypes.includes('html')) {
            description += ', עם תרשימים וגרפיקה';
        }
        if (contentTypes.includes('markdown')) {
            description += ', עם מסמכים מעוצבים';
        }

        return description;
    }

    /**
     * יצירת ID ייחודי
     */
    generateMessageId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * קבלת שיחה לפי sessionId
     */
    async getConversation(sessionId) {
        try {
            const conversation = await Conversation.findOne({ sessionId });

            if (!conversation) {
                return {
                    success: false,
                    error: 'שיחה לא נמצאה'
                };
            }

            return {
                success: true,
                conversation: {
                    id: conversation._id,
                    sessionId: conversation.sessionId,
                    title: conversation.title,
                    description: conversation.description,
                    category: conversation.category,
                    messages: conversation.messages,
                    rawConversation: conversation.rawConversation,
                    tags: conversation.tags,
                    metadata: conversation.metadata,
                    createdAt: conversation.createdAt,
                    updatedAt: conversation.updatedAt
                }
            };

        } catch (error) {
            console.error('❌ שגיאה בקבלת שיחה:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * חיפוש שיחות
     */
    async searchConversations(query, options = {}) {
        try {
            const conversations = await Conversation.searchConversations(query, options);

            return {
                success: true,
                conversations: conversations.map(conv => ({
                    id: conv._id,
                    sessionId: conv.sessionId,
                    title: conv.title,
                    description: conv.description,
                    category: conv.category,
                    tags: conv.tags,
                    messageCount: conv.metadata.totalMessages,
                    hasRawContent: conv.metadata.rawContentSaved,
                    createdAt: conv.createdAt,
                    updatedAt: conv.updatedAt,
                    isFavorite: conv.isFavorite
                })),
                total: conversations.length
            };

        } catch (error) {
            console.error('❌ שגיאה בחיפוש שיחות:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * מחיקת שיחה
     */
    async deleteConversation(sessionId) {
        try {
            const result = await Conversation.deleteOne({ sessionId });

            if (result.deletedCount === 0) {
                return {
                    success: false,
                    error: 'שיחה לא נמצאה'
                };
            }

            return {
                success: true,
                message: 'שיחה נמחקה בהצלחה'
            };

        } catch (error) {
            console.error('❌ שגיאה במחיקת שיחה:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * עדכון שיחה (מועדפים, ארכיון וכו')
     */
    async updateConversation(sessionId, updates) {
        try {
            const allowedUpdates = ['isFavorite', 'isArchived', 'title', 'description', 'category', 'tags'];
            const updateData = {};

            // סינון עדכונים מותרים בלבד
            Object.keys(updates).forEach(key => {
                if (allowedUpdates.includes(key)) {
                    updateData[key] = updates[key];
                }
            });

            if (Object.keys(updateData).length === 0) {
                return {
                    success: false,
                    error: 'לא סופקו עדכונים תקינים'
                };
            }

            const updatedConversation = await Conversation.findOneAndUpdate(
                { sessionId },
                {
                    ...updateData,
                    'metadata.lastActivity': new Date()
                },
                { new: true }
            );

            if (!updatedConversation) {
                return {
                    success: false,
                    error: 'שיחה לא נמצאה'
                };
            }

            return {
                success: true,
                conversation: {
                    id: updatedConversation._id,
                    sessionId: updatedConversation.sessionId,
                    title: updatedConversation.title,
                    isFavorite: updatedConversation.isFavorite,
                    isArchived: updatedConversation.isArchived,
                    updatedAt: updatedConversation.updatedAt
                }
            };

        } catch (error) {
            console.error('❌ שגיאה בעדכון שיחה:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * קבלת שיחות עם סינון וחיפוש
     */
    async getConversations(options = {}) {
        try {
            const {
                page = 1,
                limit = 20,
                category,
                tags,
                search,
                dateFrom,
                dateTo,
                sortBy = 'updatedAt',
                sortOrder = 'desc',
                favorites = false,
                contentTypes,
                hasRawContent,
                includeMessages = true, // ← פרמטר חדש
                includeRawConversation = false // ← פרמטר חדש
            } = options;

            // בניית query (זהה)
            const query = {};

            if (category) query.category = category;
            if (tags && tags.length > 0) query.tags = { $in: tags };
            if (contentTypes && contentTypes.length > 0) query['metadata.contentTypes'] = { $in: contentTypes };
            if (hasRawContent !== undefined) query['metadata.rawContentSaved'] = hasRawContent;
            if (favorites) query.isFavorite = true;

            if (dateFrom || dateTo) {
                query.createdAt = {};
                if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
                if (dateTo) query.createdAt.$lte = new Date(dateTo);
            }

            if (search) {
                query.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { tags: { $regex: search, $options: 'i' } }
                ];
            }

            const skip = (page - 1) * limit;
            const sortDirection = sortOrder === 'desc' ? -1 : 1;
            const sortObject = { [sortBy]: sortDirection };

            // בניית שדות לבחירה
            let selectFields = 'sessionId title description category tags metadata createdAt updatedAt isFavorite performance';

            if (includeMessages) {
                selectFields += ' messages';
            }

            if (includeRawConversation) {
                selectFields += ' rawConversation';
            }

            // ביצוע השאילתה
            const [conversations, totalCount] = await Promise.all([
                Conversation.find(query)
                    .select(selectFields)
                    .sort(sortObject)
                    .skip(skip)
                    .limit(limit)
                    .lean(),

                Conversation.countDocuments(query)
            ]);

            // עיבוד התוצאות
            const processedConversations = conversations.map(conv => {
                const result = {
                    id: conv._id,
                    sessionId: conv.sessionId,
                    title: conv.title,
                    description: conv.description,
                    category: conv.category,
                    tags: conv.tags || [],
                    messageCount: conv.metadata?.totalMessages || conv.messages?.length || 0,
                    hasRawContent: conv.metadata?.rawContentSaved || false,
                    savedFromSession: conv.metadata?.savedFromSession || false,
                    contentTypes: conv.metadata?.contentTypes || [],
                    createdAt: conv.createdAt,
                    updatedAt: conv.updatedAt,
                    lastActivity: conv.metadata?.lastActivity || conv.updatedAt,
                    isFavorite: conv.isFavorite || false,
                    performance: {
                        responseTime: conv.performance?.responseTime,
                        mathFormulas: conv.performance?.mathFormulas || 0,
                        charts: conv.performance?.charts || 0,
                        tables: conv.performance?.tables || 0
                    }
                };

                // הוספת הודעות אם נדרש
                if (includeMessages && conv.messages) {
                    result.messages = conv.messages;
                }

                // הוספת שיחה גולמית אם נדרש
                if (includeRawConversation && conv.rawConversation) {
                    result.rawConversation = conv.rawConversation;
                }

                return result;
            });

            const totalPages = Math.ceil(totalCount / limit);
            const hasNext = page < totalPages;
            const hasPrev = page > 1;

            return {
                success: true,
                conversations: processedConversations,
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages,
                    hasNext,
                    hasPrev
                },
                filters: {
                    category,
                    tags,
                    search,
                    dateFrom,
                    dateTo,
                    contentTypes,
                    hasRawContent,
                    favorites,
                    includeMessages,
                    includeRawConversation
                }
            };

        } catch (error) {
            console.error('❌ שגיאה בקבלת שיחות:', error);
            return {
                success: false,
                error: error.message,
                conversations: [],
                pagination: {
                    page: 1,
                    limit: 20,
                    totalCount: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    }

}

module.exports = ConversationService;
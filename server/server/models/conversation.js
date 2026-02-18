// 📁 models/Conversation.js - מעודכן לתוכן גולמי
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['user', 'ai'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  rawContent: {
    type: String, // התוכן הגולמי המלא
    required: true
  },
  contentType: {
    type: String,
    enum: ['text', 'html', 'math', 'markdown'],
    default: 'text'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  messageId: {
    type: String,
    required: true
  }
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 500
  },
  category: {
    type: String,
    enum: [
      'ניתוח פנסיוני',
      'ניתוח משכנתא והשוואת מסלולים', 
      'ניתוח הלוואה',
      'ניתוח תקציב אישי',
      'חישוב חיסכון והשקעות',
      'השוואת קנייה מול שכירות',
      'תכנון פיננסי למשפחה וילדים',
      'ניתוח פיננסי כללי',
      'מתמטיקה ופיננסים', // הוספה
      'תרשימים וגרפיקה',   // הוספה
      'תכנות'              // הוספה
    ],
    default: 'ניתוח פיננסי כללי'
  },
  messages: [MessageSchema],
  rawConversation: {
    type: mongoose.Schema.Types.Mixed, // השיחה הגולמית המלאה מהסשן
    required: false
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    language: {
      type: String,
      default: 'he'
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    },
    rawContentSaved: {
      type: Boolean,
      default: false
    },
    savedFromSession: {
      type: Boolean,
      default: false
    },
    contentTypes: [{
      type: String,
      enum: ['text', 'html', 'math', 'markdown']
    }]
  },
  tags: [{
    type: String,
    maxlength: 50
  }],
  isArchived: {
    type: Boolean,
    default: false
  },
  isFavorite: {
    type: Boolean,
    default: false
  },
  performance: {
    responseTime: Number,
    tokenCount: Number,
    mathFormulas: Number,
    charts: Number,
    tables: Number
  }
}, {
  timestamps: true,
  collection: 'conversations'
});

// אינדקסים קיימים + חדשים
ConversationSchema.index({ createdAt: -1 });
ConversationSchema.index({ category: 1, createdAt: -1 });
ConversationSchema.index({ tags: 1 });
ConversationSchema.index({ 'metadata.lastActivity': -1 });
ConversationSchema.index({ title: 'text', description: 'text' });
ConversationSchema.index({ 'metadata.contentTypes': 1 }); // חדש
ConversationSchema.index({ 'metadata.rawContentSaved': 1 }); // חדש

// Virtual לקבלת כמות הודעות
ConversationSchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Middleware לעדכון מטאדטה
ConversationSchema.pre('save', function(next) {
  this.metadata.totalMessages = this.messages.length;
  this.metadata.lastActivity = new Date();
  
  // עדכון סוגי תוכן
  const contentTypes = new Set();
  this.messages.forEach(msg => {
    if (msg.contentType) {
      contentTypes.add(msg.contentType);
    }
  });
  this.metadata.contentTypes = Array.from(contentTypes);
  
  next();
});

// Method לחילוץ כותרת אוטומטי - מעודכן לתוכן גולמי
ConversationSchema.methods.generateTitle = function() {
  if (this.messages.length > 0) {
    const firstUserMessage = this.messages.find(msg => msg.sender === 'user');
    if (firstUserMessage) {
      // שימוש בתוכן גולמי או רגיל
      const content = firstUserMessage.rawContent || firstUserMessage.message;
      const title = this.cleanTextForTitle(content)
        .substring(0, 80)
        .trim();
      return title || 'שיחה ללא כותרת';
    }
  }
  return 'שיחה חדשה';
};

// Method לניקוי טקסט לכותרת
ConversationSchema.methods.cleanTextForTitle = function(text) {
  if (!text) return '';
  
  return text
    .replace(/MATHD\{[^}]*\}/g, '[נוסחה]')
    .replace(/MATHI\{[^}]*\}/g, '[משתנה]')
    .replace(/<[^>]*>/g, '')
    .replace(/[#*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Method לחילוץ תגיות אוטומטי - מעודכן
ConversationSchema.methods.generateTags = function() {
  const tagMap = {
    'משכנתא': ['משכנתא', 'הלוואה', 'דיור'],
    'פנסיה': ['פנסיה', 'פרישה', 'קצבה'],
    'השקעה': ['השקעה', 'מניות', 'קרנות'],
    'תקציב': ['תקציב', 'הוצאות', 'חיסכון'],
    'ילדים': ['ילדים', 'משפחה', 'חינוך'],
    'הלוואה': ['הלוואה', 'ריבית', 'אשראי'],
    'מתמטיקה': ['MATHD', 'MATHI', 'חישוב', 'נוסחה'],
    'תרשימים': ['canvas', 'chart', 'גרף', 'תרשים'],
    'HTML': ['<script>', '<canvas>', '<table>']
  };
  
  const tags = new Set();
  
  // בדיקה בהודעות
  const content = this.messages
    .map(msg => (msg.rawContent || msg.message).toLowerCase())
    .join(' ');
    
  Object.entries(tagMap).forEach(([tag, keywords]) => {
    if (keywords.some(keyword => content.includes(keyword.toLowerCase()))) {
      tags.add(tag);
    }
  });
  
  // הוספת תגיות לפי סוגי תוכן
  if (this.metadata.contentTypes) {
    this.metadata.contentTypes.forEach(type => {
      switch(type) {
        case 'math': tags.add('מתמטיקה'); break;
        case 'html': tags.add('HTML'); break;
        case 'markdown': tags.add('מסמכים'); break;
      }
    });
  }
  
  return Array.from(tags);
};

// Method לקטגוריזציה אוטומטית
ConversationSchema.methods.detectCategory = function() {
  const content = this.messages
    .map(msg => (msg.rawContent || msg.message))
    .join(' ');
  
  if (content.includes('MATHD{') || content.includes('ריבית') || content.includes('חישוב')) {
    return 'מתמטיקה ופיננסים';
  }
  
  if (content.includes('<canvas>') || content.includes('<script>')) {
    return 'תרשימים וגרפיקה';
  }
  
  if (content.includes('קוד') || content.includes('פיתוח')) {
    return 'תכנות';
  }
  
  // קטגוריות קיימות
  if (content.includes('משכנתא')) return 'ניתוח משכנתא והשוואת מסלולים';
  if (content.includes('פנסיה')) return 'ניתוח פנסיוני';
  if (content.includes('הלוואה')) return 'ניתוח הלוואה';
  if (content.includes('תקציב')) return 'ניתוח תקציב אישי';
  if (content.includes('השקעה') || content.includes('חיסכון')) return 'חישוב חיסכון והשקעות';
  if (content.includes('קנייה') || content.includes('שכירות')) return 'השוואת קנייה מול שכירות';
  if (content.includes('ילדים') || content.includes('משפחה')) return 'תכנון פיננסי למשפחה וילדים';
  
  return 'ניתוח פיננסי כללי';
};

// Static method לחיפוש שיחות - מעודכן
ConversationSchema.statics.searchConversations = function(query, options = {}) {
  const {
    category,
    tags,
    contentTypes,
    hasRawContent,
    dateFrom,
    dateTo,
    limit = 20,
    skip = 0,
    sortBy = 'createdAt',
    sortOrder = -1
  } = options;

  const searchQuery = {};
  
  if (query) {
    searchQuery.$text = { $search: query };
  }
  
  if (category) {
    searchQuery.category = category;
  }
  
  if (tags && tags.length > 0) {
    searchQuery.tags = { $in: tags };
  }
  
  if (contentTypes && contentTypes.length > 0) {
    searchQuery['metadata.contentTypes'] = { $in: contentTypes };
  }
  
  if (hasRawContent !== undefined) {
    searchQuery['metadata.rawContentSaved'] = hasRawContent;
  }
  
  if (dateFrom || dateTo) {
    searchQuery.createdAt = {};
    if (dateFrom) searchQuery.createdAt.$gte = new Date(dateFrom);
    if (dateTo) searchQuery.createdAt.$lte = new Date(dateTo);
  }
  
  return this.find(searchQuery)
    .select('sessionId title description category tags metadata createdAt updatedAt isFavorite')
    .sort({ [sortBy]: sortOrder })
    .limit(limit)
    .skip(skip);
};

module.exports = mongoose.model('Conversation', ConversationSchema);
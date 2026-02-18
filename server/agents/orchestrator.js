// 📁 server/agents/orchestrator.js
// מתאם ראשי — מסווג הודעות ומנתב למומחים הרלוונטיים

const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// רשימת הסוכנים הזמינים
const AVAILABLE_AGENTS = {
  pension: {
    id: 'pension',
    name: 'מומחה פנסיה',
    icon: '🏦',
    description: 'פנסיה, פרישה, קצבאות, ביטוח חיים, אובדן כושר עבודה'
  },
  mortgage: {
    id: 'mortgage',
    name: 'מומחה משכנתא',
    icon: '🏠',
    description: 'משכנתא, הלוואות דיור, מיחזור, קנייה מול שכירות'
  },
  investment: {
    id: 'investment',
    name: 'מומחה השקעות',
    icon: '📈',
    description: 'השקעות, שוק ההון, קרנות, חיסכון, תשואות'
  },
  tax: {
    id: 'tax',
    name: 'מומחה מיסוי',
    icon: '🧾',
    description: 'מס הכנסה, מס שבח, זיכויים, ניכויים, תכנון מס'
  },
  budget: {
    id: 'budget',
    name: 'מומחה תקציב',
    icon: '📊',
    description: 'תקציב אישי, ניהול הוצאות, חובות, קרן חירום, חיסכון'
  },
  general: {
    id: 'general',
    name: 'יועץ פיננסי כללי',
    icon: '💼',
    description: 'ניתוח פיננסי כללי, חישובים, השוואות, מושגים'
  }
};

/**
 * שלב 1: סיווג מהיר מקומי (keyword-based) — חוסך קריאת API כשהנושא ברור
 */
function quickClassify(message) {
  const lowered = message.toLowerCase();
  const scores = {};

  const keywords = {
    pension: ['פנסיה', 'קצבה', 'פרישה', 'גמל', 'השתלמות', 'ביטוח מנהלים', 'אובדן כושר', 'ביטוח חיים', 'פיצויים'],
    mortgage: ['משכנתא', 'הלוואה לדיור', 'מיחזור', 'לוח סילוקין', 'פריים', 'שכירות מול קנייה', 'קנייה מול שכירות', 'דירה'],
    investment: ['השקעה', 'מניות', 'אג"ח', 'תשואה', 'תיק השקעות', 'קרן נאמנות', 'etf', 'בורסה', 'שוק ההון', 'ריבית דריבית', 'קריפטו'],
    tax: ['מס הכנסה', 'מס שבח', 'מס רכישה', 'ניכוי', 'זיכוי', 'נקודות זיכוי', 'החזר מס', 'ביטוח לאומי', 'שומה', 'תכנון מס'],
    budget: ['תקציב', 'הוצאות', 'הכנסות', 'חיסכון', 'חובות', 'קרן חירום', 'ניהול כספים', 'משכורת', 'הלוואה']
  };

  for (const [agent, words] of Object.entries(keywords)) {
    scores[agent] = 0;
    for (const word of words) {
      if (lowered.includes(word)) {
        scores[agent] += 1;
      }
    }
  }

  return scores;
}

/**
 * שלב 2: סיווג חכם עם AI — לשאלות מורכבות שמערבות מספר תחומים
 * משתמש ב-gpt-4o-mini (זול ומהיר) רק לסיווג
 */
async function aiClassify(message, conversationContext) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `אתה מסווג פיננסי. תפקידך לזהות אילו מומחים רלוונטיים לשאלה.

המומחים הזמינים:
- pension: פנסיה, פרישה, קצבאות, ביטוחים, גמל, השתלמות
- mortgage: משכנתא, דיור, מיחזור, קנייה/שכירות
- investment: השקעות, שוק ההון, חיסכון, תשואות, קרנות
- tax: מיסוי, מס הכנסה, מס שבח, זיכויים, ביטוח לאומי
- budget: תקציב, ניהול הוצאות, חובות, קרן חירום
- general: כל מה שלא מתאים לאחרים, או שאלות כלליות

כללים:
1. בחר 1-3 מומחים הכי רלוונטיים
2. תן ציון ביטחון (0-100) לכל מומחה
3. אם השאלה מערבת כמה תחומים — בחר כמה מומחים
4. אם השאלה פשוטה — בחר מומחה אחד
5. הסבר קצר למה כל מומחה נבחר

החזר JSON בפורמט:
{
  "agents": [
    { "id": "pension", "confidence": 90, "reason": "השאלה עוסקת בתכנון פרישה" },
    { "id": "tax", "confidence": 60, "reason": "יש השלכות מס על משיכת כספים" }
  ],
  "complexity": "single|multi",
  "needs_more_data": false,
  "summary": "תיאור קצר של מה המשתמש צריך"
}`
        },
        ...(conversationContext ? [{
          role: 'user',
          content: `הקשר קודם: ${conversationContext}`
        }] : []),
        {
          role: 'user',
          content: message
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 300
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('⚠️ שגיאה בסיווג AI, חוזר לסיווג מקומי:', error.message);
    return null;
  }
}

/**
 * פונקציה ראשית: classify — מחליטה אילו מומחים להפעיל
 * שלב 1: סיווג מקומי מהיר
 * שלב 2: אם לא ברור — סיווג AI
 */
async function classify(message, history = []) {
  // שלב 1: סיווג מקומי
  const localScores = quickClassify(message);
  const sortedLocal = Object.entries(localScores)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, score]) => score > 0);

  // אם יש מומחה דומיננטי ברור (2+ מילות מפתח, והפרש מהשני)
  if (sortedLocal.length > 0 && sortedLocal[0][1] >= 2) {
    const topAgent = sortedLocal[0];
    const secondAgent = sortedLocal.length > 1 ? sortedLocal[1] : null;

    // מומחה יחיד ברור
    if (!secondAgent || topAgent[1] > secondAgent[1] * 2) {
      console.log(`🎯 סיווג מקומי מהיר: ${topAgent[0]} (${topAgent[1]} hits)`);
      return {
        agents: [{ id: topAgent[0], confidence: 95, reason: 'סיווג מקומי - מילות מפתח ברורות' }],
        complexity: 'single',
        source: 'local'
      };
    }

    // שני מומחים רלוונטיים
    if (secondAgent && secondAgent[1] >= 1) {
      console.log(`🎯 סיווג מקומי: ${topAgent[0]} + ${secondAgent[0]}`);
      return {
        agents: [
          { id: topAgent[0], confidence: 85, reason: 'סיווג מקומי - מומחה ראשי' },
          { id: secondAgent[0], confidence: 70, reason: 'סיווג מקומי - מומחה משני' }
        ],
        complexity: 'multi',
        source: 'local'
      };
    }
  }

  // שלב 2: סיווג AI לשאלות מורכבות/עמומות
  const contextSummary = history.length > 0
    ? history.slice(-4).map(m => `${m.role}: ${m.content.substring(0, 100)}`).join('\n')
    : '';

  console.log('🤖 עובר לסיווג AI...');
  const aiResult = await aiClassify(message, contextSummary);

  if (aiResult && aiResult.agents && aiResult.agents.length > 0) {
    console.log(`🤖 סיווג AI: ${aiResult.agents.map(a => a.id).join(', ')}`);
    return {
      ...aiResult,
      source: 'ai'
    };
  }

  // fallback: general
  console.log('⚠️ סיווג: fallback ל-general');
  return {
    agents: [{ id: 'general', confidence: 50, reason: 'לא זוהה תחום ספציפי' }],
    complexity: 'single',
    source: 'fallback'
  };
}

module.exports = { classify, AVAILABLE_AGENTS };

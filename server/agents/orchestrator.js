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
 * שלב 1: סיווג מהיר מקומי (keyword-based)
 * תוקן: סף >= 1 במקום >= 2 — שאלות עם מילת מפתח אחת ברורה מנותבות מיידית
 */
function quickClassify(message) {
  const lowered = message.toLowerCase();
  const scores = {};

  const keywords = {
    pension: ['פנסיה', 'קצבה', 'פרישה', 'גמל', 'קרן השתלמות', 'ביטוח מנהלים', 'אובדן כושר', 'ביטוח חיים', 'פיצויים', 'גיל פרישה', 'קצבת זקנה'],
    mortgage: ['משכנתא', 'הלוואה לדיור', 'מיחזור משכנתא', 'לוח סילוקין', 'מסלול פריים', 'שכירות מול קנייה', 'קנייה מול שכירות', 'מס רכישה', 'הון עצמי לדירה'],
    investment: ['השקעה', 'מניות', 'אג"ח', 'תשואה', 'תיק השקעות', 'קרן נאמנות', 'etf', 'בורסה', 'שוק ההון', 'ריבית דריבית', 'קריפטו', 'פיזור סיכונים', 'תעודת סל'],
    tax: ['מס הכנסה', 'מס שבח', 'מס רכישה', 'ניכוי מס', 'זיכוי מס', 'נקודות זיכוי', 'החזר מס', 'ביטוח לאומי', 'שומת מס', 'תכנון מס', 'מדרגות מס', 'עצמאי מס'],
    budget: ['תקציב', 'הוצאות', 'ניהול כספים', 'חובות', 'קרן חירום', 'חיסכון חודשי', 'הכנסה נטו', 'הלוואה צרכנית', 'כרטיס אשראי', 'אוברדרפט']
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
 * תוקן: context לא נחתך ל-100 תווים אלא ל-500
 */
async function aiClassify(message, conversationContext) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `אתה מסווג פיננסי מדויק. תפקידך לזהות אילו מומחים רלוונטיים לשאלה.

המומחים הזמינים:
- pension: פנסיה, פרישה, קצבאות, ביטוחים, גמל, השתלמות, ביטוח חיים, אובדן כושר
- mortgage: משכנתא, דיור, מיחזור, קנייה/שכירות, LTV, לוח סילוקין
- investment: השקעות, שוק ההון, חיסכון, תשואות, קרנות, ETF, ריבית דריבית
- tax: מיסוי, מס הכנסה, מס שבח, זיכויים, ביטוח לאומי, נקודות זיכוי, עצמאים
- budget: תקציב, ניהול הוצאות, חובות, קרן חירום, הלוואות צרכניות
- general: מושגים כלליים, השוואות, שאלות שלא מתאימות לאחרים

כללים:
1. בחר 1-3 מומחים הכי רלוונטיים
2. תן ציון ביטחון (0-100) לכל מומחה
3. שאלה מורכבת שנוגעת למספר תחומים — בחר כמה מומחים
4. שאלה פשוטה וממוקדת — מומחה אחד בלבד
5. הימנע מ-general אלא אם הנושא באמת כללי

החזר JSON בלבד:
{
  "agents": [
    { "id": "pension", "confidence": 90, "reason": "השאלה עוסקת בתכנון פרישה" },
    { "id": "tax", "confidence": 65, "reason": "יש השלכות מס על משיכת כספים" }
  ],
  "complexity": "single|multi",
  "needs_more_data": false,
  "summary": "תיאור קצר של מה המשתמש צריך"
}`
        },
        ...(conversationContext ? [{
          role: 'user',
          content: `הקשר שיחה קודמת:\n${conversationContext}`
        }] : []),
        {
          role: 'user',
          content: message
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 400
    });

    const raw = response.choices[0].message.content;
    const parsed = JSON.parse(raw);

    // ולידציה בסיסית
    if (!parsed.agents || !Array.isArray(parsed.agents) || parsed.agents.length === 0) {
      throw new Error('AI returned invalid agents array');
    }

    return parsed;
  } catch (error) {
    console.error('⚠️ שגיאה בסיווג AI, חוזר לסיווג מקומי:', error.message);
    return null;
  }
}

/**
 * בונה סיכום הקשר חכם מהיסטוריית השיחה
 * תוקן: 500 תווים במקום 100, עם עדיפות להודעות אחרונות
 */
function buildContextSummary(history) {
  if (!history || history.length === 0) return '';

  // עד 6 הודעות אחרונות, 500 תווים כל אחת
  const recent = history.slice(-6);
  return recent
    .map(m => {
      const role = m.role === 'user' ? '👤 משתמש' : '🤖 יועץ';
      const content = m.content.substring(0, 500).replace(/\n+/g, ' ');
      return `${role}: ${content}`;
    })
    .join('\n');
}

/**
 * פונקציה ראשית: classify — מחליטה אילו מומחים להפעיל
 * שלב 1: סיווג מקומי מהיר (סף >= 1)
 * שלב 2: אם לא ברור — סיווג AI עם context מלא
 */
async function classify(message, history = []) {
  // שלב 1: סיווג מקומי
  const localScores = quickClassify(message);
  const sortedLocal = Object.entries(localScores)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, score]) => score > 0);

  // תוקן: סף >= 1 (היה >= 2)
  if (sortedLocal.length > 0 && sortedLocal[0][1] >= 1) {
    const topAgent = sortedLocal[0];
    const secondAgent = sortedLocal.length > 1 ? sortedLocal[1] : null;

    // מומחה יחיד ברור (פי 2 יותר מהשני)
    if (!secondAgent || topAgent[1] > secondAgent[1] * 2) {
      console.log(`🎯 סיווג מקומי מהיר: ${topAgent[0]} (${topAgent[1]} hits)`);
      return {
        agents: [{ id: topAgent[0], confidence: 90, reason: 'סיווג מקומי - מילת מפתח ברורה' }],
        complexity: 'single',
        source: 'local'
      };
    }

    // שני מומחים רלוונטיים (scores דומים)
    if (secondAgent && secondAgent[1] >= 1) {
      // אם יש 3 עם score >= 1, בדוק אם שלושה
      const thirdAgent = sortedLocal.length > 2 && sortedLocal[2][1] >= 1 ? sortedLocal[2] : null;

      const selectedAgents = [
        { id: topAgent[0], confidence: 85, reason: 'סיווג מקומי - מומחה ראשי' },
        { id: secondAgent[0], confidence: 70, reason: 'סיווג מקומי - מומחה משני' },
        ...(thirdAgent ? [{ id: thirdAgent[0], confidence: 55, reason: 'סיווג מקומי - מומחה שלישי' }] : [])
      ];

      console.log(`🎯 סיווג מקומי: ${selectedAgents.map(a => a.id).join(' + ')}`);
      return {
        agents: selectedAgents,
        complexity: 'multi',
        source: 'local'
      };
    }
  }

  // שלב 2: סיווג AI לשאלות מורכבות/עמומות
  // תוקן: context מלא עם 500 תווים per message
  const contextSummary = buildContextSummary(history);
  console.log('🤖 עובר לסיווג AI...');
  const aiResult = await aiClassify(message, contextSummary);

  if (aiResult && aiResult.agents && aiResult.agents.length > 0) {
    // סנן agents עם confidence < 40
    const filteredAgents = aiResult.agents.filter(a => a.confidence >= 40);
    const finalAgents = filteredAgents.length > 0 ? filteredAgents : aiResult.agents.slice(0, 1);

    console.log(`🤖 סיווג AI: ${finalAgents.map(a => `${a.id}(${a.confidence}%)`).join(', ')}`);
    return {
      ...aiResult,
      agents: finalAgents,
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

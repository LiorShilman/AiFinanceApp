// 📁 server/agents/synthesizer.js
// מסנתז תשובות — מאחד תגובות ממספר מומחים לתשובה אחת קוהרנטית ועמוקה

const OpenAI = require('openai');
const { AVAILABLE_AGENTS } = require('./orchestrator');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * כשיש מומחה יחיד — מחזיר את התשובה כמו שהיא
 */
function wrapSingleResponse(agentId, response) {
  const agent = AVAILABLE_AGENTS[agentId];
  return {
    mode: 'single',
    agents_used: [agentId],
    sections: [
      {
        agent_id: agentId,
        agent_name: agent.name,
        agent_icon: agent.icon,
        content: response
      }
    ],
    synthesis: null,
    markdown: response
  };
}

/**
 * כשיש כמה מומחים — מאחד + מעמיק + מזהה קונפליקטים
 */
async function synthesizeMultiple(agentResponses, originalMessage) {
  const sections = agentResponses.map(r => ({
    agent_id: r.agentId,
    agent_name: r.agentName,
    agent_icon: r.agentIcon,
    content: r.content
  }));

  const expertInputs = agentResponses.map(r =>
    `=== ${r.agentIcon} ${r.agentName} ===\n${r.content}`
  ).join('\n\n---\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `אתה מסנתז פיננסי בכיר. קיבלת ניתוחים ממספר מומחים פיננסיים לאותה שאלה.

## תפקידך:

### 1. ניתוח קשרים בין-תחומיים
- זהה קשרים שכל מומחה בנפרד לא ראה (לדוגמה: ריבית גבוהה על משכנתא משפיעה על יכולת ההפרשה לפנסיה)
- הצג את "התמונה הכוללת" שנוצרת מחיבור כל הניתוחים

### 2. זיהוי וטיפול בסתירות
- אם מומחים הגיעו למסקנות שונות — הסבר למה (הנחות שונות, זווית שונה)
- כתוב בפירוש: "⚠️ שים לב: מומחה X ממליץ על A, בעוד מומחה Y מציע B — הסיבה לפער היא..."
- תן המלצה משולבת שמיישבת את הסתירה

### 3. תובנות אסטרטגיות
- מה עדיפות הפעולות המומלצת? (מה לעשות קודם)
- מהם הסיכונים הנסתרים שלא הוזכרו מספיק?
- מהי ההזדמנות שנוצרת מהחיבור בין הנושאים?

### 4. המלצה מעשית ממוקדת
- 3-5 צעדים קונקרטיים לביצוע — ממוספרים, מעשיים, ניתנים לביצוע עכשיו

## כללי פורמט:
- כתוב בעברית מקצועית וזורמת
- השתמש ב-MATHD{ }MATHD לנוסחאות בשורה נפרדת
- השתמש ב-MATHI{ }MATHI לנוסחאות בתוך טקסט
- אל תחזור על מה שהמומחים אמרו — רק הוסף ערך חדש
- אורך: 400-700 מילים
- סיים עם שאלה חכמה אחת שמאתגרת את המשתמש לחשוב על הצעד הבא`
        },
        {
          role: 'user',
          content: `שאלת המשתמש: "${originalMessage}"

ניתוחי המומחים:
${expertInputs}

כתוב סינתזה עמוקה שמחברת את כל הניתוחים ומוסיפה ערך אמיתי:`
        }
      ],
      temperature: 0.3,
      max_tokens: 2500
    });

    const synthesis = response.choices[0].message.content;
    const combinedMarkdown = buildCombinedMarkdown(sections, synthesis);

    return {
      mode: 'multi',
      agents_used: agentResponses.map(r => r.agentId),
      sections,
      synthesis,
      markdown: combinedMarkdown
    };

  } catch (error) {
    console.error('❌ שגיאה בסינתזה:', error.message);
    const fallbackMarkdown = buildCombinedMarkdown(sections, null);
    return {
      mode: 'multi',
      agents_used: agentResponses.map(r => r.agentId),
      sections,
      synthesis: null,
      markdown: fallbackMarkdown
    };
  }
}

/**
 * בונה markdown מאוחד — sections + סיכום
 */
function buildCombinedMarkdown(sections, synthesis) {
  let md = '';

  for (const section of sections) {
    md += `\n\n<div class="agent-section" data-agent="${section.agent_id}">\n\n`;
    md += `### ${section.agent_icon} ${section.agent_name}\n\n`;
    md += section.content;
    md += `\n\n</div>\n\n`;
  }

  if (synthesis) {
    md += `\n\n<div class="agent-synthesis">\n\n`;
    md += `### 🔗 ניתוח משולב — תמונה כוללת\n\n`;
    md += synthesis;
    md += `\n\n</div>\n\n`;
  }

  return md;
}

module.exports = { wrapSingleResponse, synthesizeMultiple };

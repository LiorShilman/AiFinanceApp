// 📁 server/agents/synthesizer.js
// מסנתז תשובות — מאחד תגובות ממספר מומחים לתשובה אחת קוהרנטית

const OpenAI = require('openai');
const { AVAILABLE_AGENTS } = require('./orchestrator');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * כשיש מומחה יחיד — מחזיר את התשובה כמו שהיא, עם עטיפת מטאדטה
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
 * כשיש כמה מומחים — מאחד את התשובות לתשובה אחת זורמת
 * משתמש ב-GPT-4o לסינתזה (כי נדרשת הבנה עמוקה)
 */
async function synthesizeMultiple(agentResponses, originalMessage) {
  // agentResponses: [{ agentId, agentName, agentIcon, content }, ...]

  const sections = agentResponses.map(r => ({
    agent_id: r.agentId,
    agent_name: r.agentName,
    agent_icon: r.agentIcon,
    content: r.content
  }));

  // בנה prompt לסינתזה
  const expertInputs = agentResponses.map(r =>
    `=== ${r.agentIcon} ${r.agentName} ===\n${r.content}`
  ).join('\n\n---\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `אתה מסנתז פיננסי. קיבלת ניתוחים ממספר מומחים פיננסיים לאותה שאלה.

תפקידך:
1. כתוב סיכום מתואם קצר (3-5 משפטים) שמחבר את כל הניתוחים
2. זהה קשרים בין התחומים שהמומחים לא ציינו
3. תן המלצה משולבת שמתייחסת לתמונה הכוללת
4. סיים עם שאלה חכמה אחת שמחברת בין התחומים

כללי פורמט:
- כתוב בעברית
- השתמש ב-MATHD{ }MATHD או MATHI{ }MATHI לנוסחאות
- אל תחזור על מה שהמומחים כבר אמרו — רק חבר ותן תובנות חדשות
- קצר וממוקד — לא יותר מ-300 מילים`
        },
        {
          role: 'user',
          content: `שאלת המשתמש: "${originalMessage}"

ניתוחי המומחים:
${expertInputs}

כתוב סיכום מתואם שמחבר את כל הניתוחים:`
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const synthesis = response.choices[0].message.content;

    // בנה markdown מאוחד: sections + סיכום
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
    // fallback: הצג תשובות זו אחר זו בלי סינתזה
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
 * בונה markdown מאוחד מ-sections וסיכום
 */
function buildCombinedMarkdown(sections, synthesis) {
  let md = '';

  // הצג כל section עם כותרת מומחה
  for (const section of sections) {
    md += `\n\n<div class="agent-section" data-agent="${section.agent_id}">\n\n`;
    md += `### ${section.agent_icon} ${section.agent_name}\n\n`;
    md += section.content;
    md += `\n\n</div>\n\n`;
  }

  // הוסף סיכום מתואם אם יש
  if (synthesis) {
    md += `\n\n<div class="agent-synthesis">\n\n`;
    md += `### 🔗 סיכום מתואם\n\n`;
    md += synthesis;
    md += `\n\n</div>\n\n`;
  }

  return md;
}

module.exports = { wrapSingleResponse, synthesizeMultiple };

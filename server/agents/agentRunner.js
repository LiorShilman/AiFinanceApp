// 📁 server/agents/agentRunner.js
// מריץ מומחים — בונה system prompt ומקבל תשובה מ-GPT-4o

const OpenAI = require('openai');
const { baseRules } = require('./prompts/base');
const { pensionPrompt } = require('./prompts/pension');
const { mortgagePrompt } = require('./prompts/mortgage');
const { investmentPrompt } = require('./prompts/investment');
const { taxPrompt } = require('./prompts/tax');
const { budgetPrompt } = require('./prompts/budget');
const { generalPrompt } = require('./prompts/general');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const AGENT_META = {
  pension:    { name: 'מומחה פנסיה',      icon: '🏦' },
  mortgage:   { name: 'מומחה משכנתא',     icon: '🏠' },
  investment: { name: 'מומחה השקעות',     icon: '📈' },
  tax:        { name: 'מומחה מיסוי',       icon: '🧾' },
  budget:     { name: 'מומחה תקציב',       icon: '📊' },
  general:    { name: 'יועץ פיננסי כללי', icon: '💼' }
};

const AGENT_PROMPTS = {
  pension: pensionPrompt,
  mortgage: mortgagePrompt,
  investment: investmentPrompt,
  tax: taxPrompt,
  budget: budgetPrompt,
  general: generalPrompt
};

/**
 * בונה context חכם מהיסטוריה — מעדיף הודעות אחרונות
 */
function buildAgentHistory(history) {
  if (!history || history.length === 0) return [];

  // שמור עד 12 הודעות אחרונות לשמירת context מלאה
  // אם יש יותר, חתוך מהתחלה אבל שמור את כל ה-12 האחרונות
  const maxMessages = 12;
  return history.slice(-maxMessages);
}

/**
 * מריץ מומחה יחיד עם ההיסטוריה המשותפת
 */
async function runAgent(agentId, userMessage, history = []) {
  const expertPrompt = AGENT_PROMPTS[agentId] || AGENT_PROMPTS.general;

  const systemPrompt = `${expertPrompt}

---

${baseRules}

---

[Agent: ${agentId}] [Session messages: ${history.length}]`.trim();

  const agentHistory = buildAgentHistory(history);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...agentHistory,
    { role: 'user', content: userMessage }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.25,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
    top_p: 0.9,
    max_completion_tokens: 6000,
    stream: false
  });

  return completion.choices[0].message.content;
}

/**
 * מריץ כמה מומחים במקביל
 * שדרוג: מדווח על כשלים — המשתמש יודע אם agent נכשל
 * @returns {{ responses: Array, failed: Array }}
 */
async function runAgentsInParallel(agents, userMessage, history) {
  const results = await Promise.allSettled(
    agents.map(agent =>
      runAgent(agent.id, userMessage, history)
        .then(content => ({
          agentId: agent.id,
          agentName: AGENT_META[agent.id]?.name || agent.id,
          agentIcon: AGENT_META[agent.id]?.icon || '💼',
          content,
          success: true
        }))
        .catch(err => {
          console.error(`❌ כשל agent [${agent.id}]:`, err.message);
          return {
            agentId: agent.id,
            agentName: AGENT_META[agent.id]?.name || agent.id,
            success: false,
            error: err.message
          };
        })
    )
  );

  const successful = [];
  const failed = [];

  for (const result of results) {
    const val = result.status === 'fulfilled' ? result.value : result.reason;
    if (val?.success) {
      successful.push(val);
    } else {
      failed.push({
        agentId: val?.agentId || 'unknown',
        agentName: val?.agentName || 'לא ידוע',
        reason: val?.error || 'שגיאה לא ידועה'
      });
    }
  }

  if (failed.length > 0) {
    console.warn(`⚠️ ${failed.length} agents נכשלו: ${failed.map(f => f.agentId).join(', ')}`);
  }

  return { responses: successful, failed };
}

module.exports = { runAgent, runAgentsInParallel, AGENT_META };

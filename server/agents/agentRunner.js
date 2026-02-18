// 📁 server/agents/agentRunner.js
// מריץ מומחה ספציפי — בונה את ה-system prompt שלו ומקבל תשובה מ-GPT-4o

const OpenAI = require('openai');
const { baseRules } = require('./prompts/base');
const { pensionPrompt } = require('./prompts/pension');
const { mortgagePrompt } = require('./prompts/mortgage');
const { investmentPrompt } = require('./prompts/investment');
const { taxPrompt } = require('./prompts/tax');
const { budgetPrompt } = require('./prompts/budget');
const { generalPrompt } = require('./prompts/general');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// מטאדטה של מומחים — מוגדר כאן כדי להימנע מ-circular dependency עם orchestrator
const AGENT_META = {
  pension:    { name: 'מומחה פנסיה',      icon: '🏦' },
  mortgage:   { name: 'מומחה משכנתא',     icon: '🏠' },
  investment: { name: 'מומחה השקעות',     icon: '📈' },
  tax:        { name: 'מומחה מיסוי',       icon: '🧾' },
  budget:     { name: 'מומחה תקציב',       icon: '📊' },
  general:    { name: 'יועץ פיננסי כללי', icon: '💼' }
};

// מיפוי agent ID → prompt
const AGENT_PROMPTS = {
  pension: pensionPrompt,
  mortgage: mortgagePrompt,
  investment: investmentPrompt,
  tax: taxPrompt,
  budget: budgetPrompt,
  general: generalPrompt
};

/**
 * מריץ מומחה יחיד עם ההיסטוריה המשותפת
 * @param {string} agentId - מזהה המומחה
 * @param {string} userMessage - הודעת המשתמש
 * @param {Array} history - היסטוריית השיחה המשותפת
 * @returns {string} תשובת המומחה (markdown)
 */
async function runAgent(agentId, userMessage, history = []) {
  const expertPrompt = AGENT_PROMPTS[agentId] || AGENT_PROMPTS.general;

  const systemPrompt = `
${expertPrompt}

---

${baseRules}

---

[Session context: ${Date.now()}] [Agent: ${agentId}] [History: ${history.length} messages]
`.trim();

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.25,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
    top_p: 0.9,
    max_completion_tokens: 5000,
    seed: Math.floor(Math.random() * 1000000),
    stream: false
  });

  return completion.choices[0].message.content;
}

/**
 * מריץ כמה מומחים במקביל (Promise.all)
 * @param {Array<{id, confidence, reason}>} agents - רשימת מומחים
 * @param {string} userMessage
 * @param {Array} history
 * @returns {Array<{agentId, agentName, agentIcon, content}>}
 */
async function runAgentsInParallel(agents, userMessage, history) {
  const results = await Promise.allSettled(
    agents.map(agent =>
      runAgent(agent.id, userMessage, history)
        .then(content => ({
          agentId: agent.id,
          agentName: AGENT_META[agent.id]?.name || agent.id,
          agentIcon: AGENT_META[agent.id]?.icon || '💼',
          content
        }))
    )
  );

  // סנן רק תשובות מוצלחות
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

module.exports = { runAgent, runAgentsInParallel };

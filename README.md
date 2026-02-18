# AI Finance App — יועץ פיננסי חכם

An AI-powered financial advisor with a Hebrew RTL interface. Users chat with a multi-agent AI system where specialist advisors collaborate to provide comprehensive financial analysis — complete with LaTeX math formulas, interactive Chart.js visualizations, and structured data tables.

---

## Features

- **Multi-Agent AI** — Messages are routed to specialist advisors (pension, mortgage, investments, tax, budget) that run in parallel and synthesize a unified response
- **LaTeX Math Rendering** — Financial formulas rendered via MathJax
- **Interactive Charts** — Chart.js graphs generated dynamically inside AI responses
- **Conversation Persistence** — Full conversation history saved to MongoDB Atlas
- **RTL Hebrew UI** — Dark-mode interface designed right-to-left
- **PDF Export** — Export conversations to PDF

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 20 (standalone components, SCSS, TypeScript strict) |
| Backend | Node.js + Express 5 (CommonJS) |
| AI | OpenAI GPT-4o (agents) + GPT-4o-mini (classification) |
| Database | MongoDB Atlas + Mongoose |
| Math | MathJax 3 |
| Charts | Chart.js 4 |
| Deployment | IIS (client) + Node.js (server, port 15001) |

---

## Project Structure

```
ai-finance-app/
├── client/                          # Angular 20 frontend
│   └── src/app/
│       ├── app.component.ts         # Main chat UI (~3400 lines)
│       ├── components/
│       │   ├── conversation-dialog/ # Conversation browser
│       │   └── financial-advisor/   # Chat component
│       └── services/
│           ├── conversation.service.ts
│           └── latex-fixer.service.ts
│
└── server/                          # Node.js/Express backend
    ├── index.js                     # Express server + API routes
    ├── promptEngine.js              # Multi-agent pipeline entry point
    ├── FinancialSystemPromptTemplate.js
    ├── agents/
    │   ├── orchestrator.js          # Classifies messages → routes to agents
    │   ├── agentRunner.js           # Runs agents (single or parallel)
    │   ├── synthesizer.js           # Merges responses into unified answer
    │   └── prompts/
    │       ├── base.js              # Shared rules (LaTeX, charts, format)
    │       ├── pension.js           # Pension & retirement expert
    │       ├── mortgage.js          # Mortgage & housing expert
    │       ├── investment.js        # Investments & savings expert
    │       ├── tax.js               # Israeli taxation expert
    │       ├── budget.js            # Personal budget expert
    │       └── general.js           # General financial advisor
    ├── config/database.js
    ├── models/conversation.js
    └── services/conversationService.js
```

---

## Multi-Agent Architecture

```
User Message
     │
     ▼
┌─────────────────────┐
│    Orchestrator     │  Phase 1: keyword scoring (free)
│  (orchestrator.js)  │  Phase 2: GPT-4o-mini AI classify (if needed)
└─────────────────────┘
     │
     ▼  1–3 agents selected
┌─────────────────────┐
│    Agent Runner     │  Runs specialists in parallel (Promise.allSettled)
│  (agentRunner.js)   │  Each agent gets its own GPT-4o call
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│    Synthesizer      │  Single agent → wrap response
│  (synthesizer.js)   │  Multiple agents → GPT-4o synthesis
└─────────────────────┘
     │
     ▼
  Response with agent attribution badges
```

**Available Specialists:**

| Agent | Domain |
|-------|--------|
| 🏦 מומחה פנסיה | Pension, retirement, provident funds, life insurance |
| 🏠 מומחה משכנתא | Mortgages, housing loans, buy vs. rent |
| 📈 מומחה השקעות | Investments, stock market, ETFs, savings |
| 🧾 מומחה מיסוי | Israeli income tax, capital gains, deductions |
| 📊 מומחה תקציב | Personal/family budget, debt management |
| 💼 יועץ פיננסי כללי | General financial analysis and calculations |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Angular CLI 20
- MongoDB Atlas account
- OpenAI API key

### 1. Clone the repository

```bash
git clone https://github.com/LiorShilman/AiFinanceApp.git
cd AiFinanceApp
```

### 2. Server setup

```bash
cd server
npm install
```

Create `server/.env`:

```env
OPENAI_API_KEY=your_openai_api_key
PORT=15001
MONGODB_URI=your_mongodb_atlas_connection_string
```

Start the server:

```bash
node index.js
# or with auto-reload:
npx nodemon index.js
```

Server starts at `http://localhost:15001`

### 3. Client setup

```bash
cd client
npm install
npm start        # Dev server at http://localhost:4200
npm run build    # Production build → dist/
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send message, receive multi-agent response |
| `GET` | `/api/conversations` | List saved conversations |
| `GET` | `/api/conversations/:id` | Get conversation by ID |
| `POST` | `/api/conversations` | Save conversation |
| `DELETE` | `/api/conversations/:id` | Delete conversation |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/performance` | Performance stats |

### Chat request example

```json
POST /api/chat
{
  "message": "כמה כסף אני צריך לחסוך לפנסיה?",
  "sessionId": "uuid-session-id"
}
```

### Chat response example

```json
{
  "reply": "<html with rendered content>",
  "markdown": "...",
  "agents_used": ["pension", "investment"],
  "mode": "multi",
  "sections": [
    { "agent_id": "pension", "agent_name": "מומחה פנסיה", "agent_icon": "🏦", "content": "..." },
    { "agent_id": "investment", "agent_name": "מומחה השקעות", "agent_icon": "📈", "content": "..." }
  ]
}
```

---

## Key Technical Notes

### LaTeX Format
Uses custom `MATHD{ }` (display block) and `MATHI{ }` (inline) syntax instead of standard `\[...\]` to avoid Windows backslash escaping issues.

### Chart.js Scripts
Every chart embedded in AI responses is 100% self-contained — no shared state, no external variables. Each `<canvas>` element includes its own complete Chart.js initialization script.

### Dynamic API URL
The client automatically selects the correct server URL based on `window.location.hostname`:
- `localhost` → `http://localhost:15001`
- Production → `http://shilmanlior2608.ddns.net:15001`

---

## Deployment (IIS + Node.js)

- **Client**: Built Angular app deployed to IIS, served on port 15000 at `/AiFinanceApp/`
- **Server**: Node.js API runs on port 15001 (separate from IIS)
- **Firewall**: Windows Firewall rule required for port 15001
- **Router**: Port forwarding `external:15001 → internal machine:15001`

---

## License

MIT

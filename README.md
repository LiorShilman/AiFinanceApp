# AI Finance App — יועץ פיננסי חכם

An AI-powered financial advisor with a Hebrew RTL interface. Users chat with a multi-agent AI system where specialist advisors collaborate to provide comprehensive financial analysis — complete with LaTeX math formulas, interactive Chart.js visualizations, and structured data tables.

---

## Features

- **Multi-Agent AI** — Messages are routed to specialist advisors (pension, mortgage, investments, tax, budget) that run in parallel and synthesize a unified response
- **Question Depth Detection** — Automatically classifies questions as quick/standard/deep and routes accordingly
- **LaTeX Math Rendering** — Financial formulas rendered via MathJax with auto-fixing for common syntax errors
- **Interactive Charts** — Chart.js graphs generated dynamically inside AI responses with universal `_safeChart` interceptor
- **Conversation Persistence** — Full conversation history saved to MongoDB Atlas with rich metadata
- **Modern Dark UI** — Clean SaaS-style dark theme (Linear/Vercel inspired) with RTL Hebrew layout
- **PDF Export** — Export conversations to PDF with formatted content
- **Conversation Management** — Browse, search, filter, favorite, and delete saved conversations

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
Uses custom `MATHD{ }` (display block) and `MATHI{ }` (inline) syntax instead of standard `\[...\]` to avoid Windows backslash escaping issues. The `latex-fixer.service.ts` auto-corrects common LaTeX errors like Hebrew text in formulas, invalid characters, and unbalanced brackets.

### Chart.js Rendering
AI-generated charts are intercepted via a universal `window._safeChart` wrapper (Feb 2026 fix):
- Replaces all `new Chart(...)` calls with `window._safeChart(...)` via simple string substitution
- Handles both `HTMLCanvasElement` and `CanvasRenderingContext2D` arguments
- Validates canvas exists in DOM, destroys existing charts, sets explicit dimensions
- Works for ALL code patterns (const/let/var/window assignments, single/double quotes, etc.)
- Each chart script is 100% self-contained with no external dependencies

### Dynamic API URL
Both `app.component.ts` and `conversation.service.ts` automatically select the correct server URL:
- `localhost` → `http://localhost:15001`
- Production → `http://shilmanlior2608.ddns.net:15001`

### UI Design System
- Dark SaaS theme with CSS custom properties (`:root` variables)
- Colors: `--bg-base: #0a0b0d`, `--accent: #6366f1` (indigo)
- Typography: Inter (Latin) + Assistant (Hebrew), 16px base
- RTL layout throughout with `::ng-deep` for innerHTML-injected content
- ViewEncapsulation.Emulated for scoped component styles

---

## Deployment (IIS + Node.js)

- **Client**: Built Angular app deployed to IIS at `/AiFinanceApp/` (base href configured in `angular.json`)
- **Server**: Node.js API runs on port 15001 (separate process from IIS)
- **CORS**: Configured for `shilmanlior2608.ddns.net:8080` (IIS proxy port)
- **Firewall**: Windows Firewall rule required for port 15001
- **Router**: Port forwarding `external:15001 → internal machine:15001`

### Build & Deploy

```bash
# Build client
cd client
npm run build

# Output: dist/ai-finance-app/
# Deploy: Copy contents to IIS wwwroot/AiFinanceApp/

# Start server (production)
cd server
node index.js

# Start server (development with auto-reload)
npx nodemon index.js
```

---

## Recent Improvements (Feb 2026)

- ✅ Fixed Chart.js rendering with universal `_safeChart` interceptor (replaced fragile regex)
- ✅ Fixed conversation service URL port mismatch (15000 → 15001)
- ✅ Restored Chart.js canvas rendering with explicit height and overflow fixes
- ✅ Modern SaaS UI redesign with clean dark theme and CSS design tokens
- ✅ Added question depth detection (quick/standard/deep) to AI pipeline

---

## License

MIT

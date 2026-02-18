# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered financial advisor application with a Hebrew RTL interface. Users chat with an AI advisor that provides financial analysis with LaTeX math formulas, Chart.js visualizations, and structured tables.

## Repository Structure

```
ai-finance-app/
├── client/     # Angular 20 frontend (standalone components, SCSS, TypeScript strict)
├── server/     # Node.js/Express 5 backend (CommonJS, Mongoose, OpenAI API)
```

This is a simple two-folder monorepo with no workspace manager. Each folder has its own `package.json` and `node_modules`.

## Commands

### Client (`client/` directory)
```bash
cd client
npm start          # Dev server (ng serve)
npm run build      # Production build → dist/ai-finance-app/
npm test           # Karma + Jasmine tests
```

### Server (`server/` directory)
```bash
cd server
node index.js              # Start server (port 15000)
npx nodemon index.js       # Dev with auto-reload
```

Server requires `.env` with `OPENAI_API_KEY`, `MONGODB_URI`, and `PORT`.

## Architecture

### Client
- **Main component**: `app.component.ts` (~3400 lines) — contains the chat UI, message processing, chart rendering, and PDF export logic. This is the heart of the frontend.
- **Services**:
  - `conversation.service.ts` — MongoDB API client for saving/loading/searching conversations
  - `latex-fixer.service.ts` + `latex-auto-fixer.ts` — Auto-corrects LaTeX syntax issues (Hebrew removal from formulas, currency symbol extraction, invalid character cleanup)
- **Components**:
  - `financial-advisor/` — Main advisor chat component
  - `conversation-dialog/` — Conversation browser with filtering, search, pagination, favorites

### Server
- `index.js` — Express server with all API route definitions, security middleware (helmet, rate-limit, CORS), and MongoDB connection
- `promptEngine.js` — OpenAI integration. Manages in-memory sessions (`Map`), sends messages to GPT-4o, and sanitizes AI responses (LaTeX fixing, Hebrew cleanup)
- `FinancialSystemPromptTemplate.js` — Large system prompt (~400 lines) defining the AI advisor persona, response format rules, and visualization templates
- `services/conversationService.js` — Mongoose CRUD operations for conversations
- `models/conversation.js` — Mongoose schema with messages, metadata, tags, categories, performance metrics
- `config/database.js` — MongoDB Atlas connection

### Request Flow
1. User sends message → `POST /api/chat` with `{ message, sessionId }`
2. `promptEngine.handlePrompt()` loads/creates session, appends to conversation history, calls OpenAI
3. Response is sanitized (LaTeX Hebrew removal, formula fixing) and returned as HTML
4. Client renders HTML with MathJax (LaTeX) and Chart.js (graphs), processes `<canvas>` scripts
5. Conversation auto-saves to MongoDB periodically

## Key Technical Patterns

### LaTeX Rendering
The app uses custom `MATHD{}` (display) and `MATHI{}` (inline) syntax instead of standard `\(...\)` / `\[...\]` to avoid Windows backslash issues. The system prompt instructs the AI to use this format. `latex-fixer.service.ts` handles conversion and cleanup.

### Chart.js Scripts
Every chart script in AI responses must be **100% self-contained** — no external variables or shared state. Each `<canvas>` gets its own inline `<script>` that creates a complete Chart.js instance. This is enforced via the system prompt.

### Conversation Categories (Hebrew)
Conversations are categorized: pension analysis, mortgage comparison, loan analysis, personal budget, savings/investments, buy-vs-rent, family planning, general financial, math, charts, programming.

### Deployment
- Client deploys to IIS with `web.config` for SPA routing, base href `/AiFinanceApp/`
- Server runs on port 15000
- CORS configured for `shilmanlior2608.ddns.net:8080`

## Conventions

- **Language**: All UI text, comments, and documentation are in Hebrew
- **Angular**: Standalone components (no NgModules), strict TypeScript, SCSS styling
- **Server**: CommonJS (`require`), async/await, console logging with emoji prefixes
- **Styling**: Dark mode only, RTL layout throughout
- **API prefix**: All endpoints under `/api/`

# core/ (TypeScript / Provider-Agnostic Next.js version)

**Rixie is not a chatbot.**  
She is a persistent AI assistant, creative partner, operating system companion, and memory engine at the heart of Veasna OS — orchestrating tool access across every studio (BP Studio, Art, Music, Game Dev), backed by shared private memory and a provider-agnostic LLM architecture.

## Structure

```
your-nextjs-app/
├── app/
│   ├── api/agent/route.ts   # Next.js API route wiring up the agent
│   └── agent/page.tsx       # example page rendering the chat UI
├── components/
│   └── AgentChat.tsx        # the chat console UI (Tailwind, client component)
├── core/
│   ├── agent/
│   │   ├── agent.ts          # provider-agnostic function-calling agent loop
│   │   ├── config.ts         # provider selection, system prompt, model choices
│   │   └── toolsRegistry.ts  # aggregates every studio's tools into one set
│   ├── providers/
│   │   ├── types.ts          # LLMProvider interface & standardized messages
│   │   ├── index.ts          # createProvider factory & auto-detection
│   │   ├── anthropic.ts      # Anthropic Claude provider adapter
│   │   ├── openai.ts         # OpenAI, OpenRouter, Groq, DeepSeek, Ollama provider adapter
│   │   └── gemini.ts         # Google Gemini provider adapter
│   ├── memory/
│   │   └── memoryStore.ts    # shared SQLite-backed memory, keyword search for now
│   ├── tools/
│   │   ├── types.ts              # shared ToolSchema / dispatch types
│   │   ├── bpStudioTools.ts      # idea -> scene planning -> generate -> edit -> publish
│   │   ├── memoryTools.ts        # explicit search_memory / remember tools
│   │   └── otherStudioTools.ts   # minimal starters for art / music / gamedev
│   ├── data/                 # local SQLite DB lives here (gitignored)
│   └── cli.ts                # standalone CLI for testing outside Next.js
├── package.json              # merge these deps into your existing package.json
├── tsconfig.json             # for standalone typecheck; not needed if merging into Next.js
└── .env.example
```

## Setup

This is meant to drop into your existing Next.js repo, not run as a separate app.

1. Copy `core/` and `app/api/agent/route.ts` into your project (merge the
   `app/api` folder with your existing `app/` directory).
2. Merge the `dependencies`/`devDependencies` from `package.json` into your
   project's own `package.json`, then install:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.local` (Next.js's convention) and add your
   real `ANTHROPIC_API_KEY`.

## Run

**Inside Next.js** — the example route is already wired up:
```bash
npm run dev
# POST http://localhost:3000/api/agent  { "message": "give me 5 short-video ideas about X" }
```

**With the chat UI** — visit `/agent` after `npm run dev`. `AgentChat.tsx` is a
plain client component with no extra dependencies beyond React and Tailwind
(already in your stack), so it drops in as-is. It renders each tool the agent
actually called as its own trace block above the reply — useful for seeing
what happened across studios, and handy for debugging while you wire in real
backends behind the `// TODO`s.

**Standalone CLI**, for quick testing without the Next.js dev server:
```bash
npx ts-node core/cli.ts
```

## Important: native module + runtime

`better-sqlite3` is a native Node module, so the API route explicitly sets
`export const runtime = "nodejs"` — it will **not** work on the Edge runtime.
If you deploy to a platform that defaults to Edge functions (e.g. some Vercel
configs), make sure this route stays on the Node.js runtime.

## Extending

Everything is a plain TypeScript function with a JSON schema next to it, in
`core/tools/`. To add a new capability:

1. Write the function in the right `tools/*.ts` file (or a new file per studio).
2. Add its schema (name, description, input_schema) to the `schemas` array
   returned by that module's `register*()` function.
3. Add it to the `dispatch` object in the same function.
4. Register the module in `core/agent/toolsRegistry.ts` if it's new.
5. It's automatically available to the agent — no other wiring needed.

Each BP Studio tool currently has a `// TODO` where it should call your real
backend (video-gen API, editor, platform publishing APIs). The stubs return
realistic structured output so you can build and test the whole pipeline
before any real integration is wired in.

## Memory

`memoryStore.ts` uses plain SQLite (`better-sqlite3`) with keyword search —
enough to get started with zero extra infra. When you want real semantic
recall (e.g. "find scenes similar to this mood"), swap `search()` for a
vector store (e.g. Pinecone, Qdrant) + an embeddings call, keeping the same
`add()` / `search()` interface so nothing else has to change.

## Privacy

- `.env`, `.env.local`, and `core/data/*.db` are gitignored — your API key
  and actual project content never get committed.
- Everything runs inside your own Next.js server (local or self-hosted). No
  third party ever touches your data; the only outbound call is to the
  Anthropic API for the model's reasoning.

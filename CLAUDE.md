# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Production build → dist/
npm run dev          # Development build with file-watching (re-builds on save)
```

After every build, reload the extension in Chrome at `chrome://extensions` (click the refresh icon on the MergeChat card).

## Loading the extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. The MergeChat icon appears in the toolbar

## Architecture

This is a **Manifest V3 Chrome Extension** built with React + Webpack.

### Build pipeline
`src/` (JSX source) → webpack + babel → `dist/` (Chrome loads this folder, never `src/`)

Webpack produces three independent bundles — one per Chrome context. `splitChunks` and `runtimeChunk` are both `false`; each output file must be fully self-contained because Chrome loads them in isolated contexts.

### Three Chrome contexts

| File | Chrome context | Key constraints |
|---|---|---|
| `dist/popup.js` | Extension popup window | Full DOM, React, `chrome.*` APIs |
| `dist/background.js` | Service Worker | No DOM; terminated when idle; stateless — re-reads everything on each wake |
| `dist/content.js` | Injected into claude.ai tabs | Isolated JS context; browser auto-sends cookies so all fetches are authenticated |

### Message passing
Popup and content scripts communicate with the background service worker via `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`. Every `onMessage` listener must `return true` to keep the channel open for async `sendResponse` calls.

### Security model
- All content received from claude.ai's API is treated as **untrusted**. Never `eval()`, `innerHTML`, or `dangerouslySetInnerHTML` any API response.
- **No API keys are stored.** Synthesis uses the user's existing claude.ai login session — no Anthropic API key, nothing in `chrome.storage.local`.
- Prompt injection defense is applied at the synthesis step. The synthesis prompt opens with a hardened system message that explicitly classifies transcript content as RAW USER DATA and labels any instructions found inside it as injection attacks. Transcripts are wrapped in `[CONVERSATION A]` / `[/CONVERSATION A]` and `[CONVERSATION B]` / `[/CONVERSATION B]` tags. The required output format is locked to four sections: `[DECISIONS MADE]`, `[KEY FACTS]`, `[OPEN QUESTIONS]`, `[IMPORTANT CONTEXT]`.
- Both `chrome.runtime.onMessage` listeners validate `_sender.id === chrome.runtime.id` to reject messages from other extensions.
- All content script handlers validate `orgId` and `convId` as proper UUIDs before use in URL construction.

### Merge flow

1. Popup sends `FETCH_CONVERSATIONS` → background calls content script `GET_ORG_ID` then `GET_CONVERSATIONS` → returns list to popup
2. User selects exactly 2 conversations; popup sends `MERGE` with their IDs
3. Background fetches both transcripts in parallel via `GET_TRANSCRIPT`
4. Background calls `CREATE_CONVERSATION` to make a **temporary** conversation
5. Background sends the synthesis prompt (both transcripts wrapped in delimiters) to the temp conversation via `SEND_MESSAGE`; content script streams the SSE response and returns the full assistant text
6. Background calls `CREATE_CONVERSATION` to make the **real** merged conversation
7. Background sends the memory document as the first message in the real conversation via `SEND_MESSAGE`
8. Background opens a new tab to `https://claude.ai/chat/{realConvId}`
9. Background fires-and-forgets `DELETE_CONVERSATION` to clean up the temp conversation (always runs — success and failure both)

### Content script message handlers

| Message type | What it does |
|---|---|
| `GET_ORG_ID` | `GET /api/organizations` → returns `orgs[0].uuid` |
| `PING` | No-op readiness check — returns `{ ok: true }` immediately, no network call |
| `GET_CONVERSATIONS` | `GET /api/organizations/{orgId}/chat_conversations?limit=200` |
| `GET_TRANSCRIPT` | `GET /api/organizations/{orgId}/chat_conversations/{convId}` |
| `CREATE_CONVERSATION` | `POST /api/organizations/{orgId}/chat_conversations` with `{ name: '' }` |
| `SEND_MESSAGE` | `POST /api/organizations/{orgId}/chat_conversations/{convId}/completion` — reads SSE stream, accumulates `event.completion` chunks, returns full text |
| `DELETE_CONVERSATION` | `DELETE /api/organizations/{orgId}/chat_conversations/{convId}` |

### Key files

| File | Purpose |
|---|---|
| `src/popup/Popup.jsx` | Entire popup UI — idle → loading → selecting → merging → done/error state machine |
| `src/popup/Popup.css` | All popup styles — glassmorphism design system, animations, layout |
| `src/background/index.js` | Merge orchestration, synthesis prompt builder, transcript formatter |
| `src/content/index.js` | All claude.ai internal API calls (7 handlers) |
| `webpack.config.js` | Entry points, no chunk splitting, CSS extraction |
| `manifest.json` | Permissions: `tabs`, `scripting`; host permissions: `https://claude.ai/*` only |

---

## Roadmap

- [ ] **Merge 3+ conversations** — extend synthesis prompt and UI beyond exactly 2; allow selecting up to 4–5
- [ ] **Persistent preview cache** — use `chrome.storage.session` so the cache survives popup close/reopen within the same browser session
- [ ] **Custom merge name** — let the user edit the auto-generated `"Merge: A + B"` title before confirming
- [ ] **Progress streaming** — pipe SSE synthesis events back to the popup for real step-by-step status during synthesis
- [ ] **Search by content** — filter conversations by what was said inside, not just title or date
- [ ] **Chrome Web Store listing** — public release

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## gstack

gstack is installed at `~/.claude/skills/gstack`. Use these slash commands:

| Skill | What it does |
|-------|-------------|
| `/office-hours` | Reframe the problem before writing code |
| `/plan-ceo-review` | CEO-level product rethink |
| `/plan-eng-review` | Lock architecture, data flow, edge cases |
| `/plan-design-review` | Rate and improve design |
| `/design-consultation` | Build a design system from scratch |
| `/review` | Staff engineer code review — find production bugs |
| `/investigate` | Systematic root-cause debugging |
| `/design-review` | Design audit + fixes |
| `/ship` | Sync, test, push, open PR |
| `/document-release` | Update docs after shipping |
| `/retro` | Weekly engineering retrospective |
| `/qa` | Full end-to-end browser QA |
| `/qa-only` | QA without browser setup |
| `/setup-browser-cookies` | Import browser session for QA |
| `/codex` | Second opinion from OpenAI Codex CLI |
| `/careful` | Warn before destructive commands |
| `/freeze` | Lock edits to one directory |
| `/guard` | `/careful` + `/freeze` combined |
| `/unfreeze` | Remove freeze boundary |
| `/gstack-upgrade` | Update gstack to latest |

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
- **No API keys are stored.** Synthesis uses the user's existing claude.ai login session — no Anthropic API key, no Mem0 key, nothing in `chrome.storage.local`.
- Prompt injection defense is applied at the synthesis step. The synthesis prompt opens with a hardened system message that explicitly classifies transcript content as RAW USER DATA and labels any instructions found inside it as injection attacks. Transcripts are wrapped in `[CONVERSATION A]` / `[/CONVERSATION A]` and `[CONVERSATION B]` / `[/CONVERSATION B]` tags. The required output format is locked to four sections: `[DECISIONS MADE]`, `[KEY FACTS]`, `[OPEN QUESTIONS]`, `[IMPORTANT CONTEXT]`.

### Actual merge flow (V3 — fully implemented)
1. Popup sends `FETCH_CONVERSATIONS` → background calls content script `GET_ORG_ID` then `GET_CONVERSATIONS` → returns list to popup
2. User selects exactly 2 conversations; popup sends `MERGE` with their IDs
3. Background fetches both transcripts in parallel via `GET_TRANSCRIPT`
4. Background calls `CREATE_CONVERSATION` to make a **temporary** conversation
5. Background sends the synthesis prompt (both transcripts wrapped in delimiters) to the temp conversation via `SEND_MESSAGE`; content script streams the SSE response and returns the full assistant text
6. Background calls `CREATE_CONVERSATION` to make the **real** merged conversation
7. Background sends the memory document as the first message in the real conversation via `SEND_MESSAGE`
8. Background opens a new tab to `https://claude.ai/chat/{realConvId}`
9. Background fires-and-forgets `DELETE_CONVERSATION` to clean up the temp conversation

### Content script message handlers (7 total)
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
- `src/popup/Popup.jsx` — entire popup UI (idle → loading → selecting → merging → done/error state machine)
- `src/background/index.js` — merge orchestration, synthesis prompt builder, transcript formatter
- `src/content/index.js` — all claude.ai internal API calls (6 handlers)
- `webpack.config.js` — entry points, no chunk splitting, CSS extraction
- `manifest.json` — permissions: `tabs`, `scripting`; host permissions: `https://claude.ai/*` only

### What was removed in V2/V3 (do not add back)
- Anthropic API key / `chrome.storage.local` key storage — synthesis now uses the user's session
- Mem0 REST API integration — dropped entirely
- `resolve.fallback` for Node built-ins — only needed for the Anthropic SDK, which is gone
- `api.anthropic.com` and `api.mem0.ai` host permissions — no longer needed

---

## Improvement Roadmap

Items are built one at a time and confirmed before moving to the next.

### Completed
- [x] **Item 1 — Cleanup temp conversation on failure** (`src/background/index.js`)
  Steps 4–7 of the MERGE flow are now wrapped in `try/finally`. The `finally` block always calls `DELETE_CONVERSATION` on `tempConvId` — on success AND on failure. Before this fix, any mid-merge error would permanently orphan a blank conversation in the user's claude.ai account.

- [x] **V3 — Glassmorphism UI redesign** (`src/popup/Popup.css`, `src/popup/Popup.jsx`)
  Full visual overhaul: deep warm dark background (`#0d0a07`), frosted glass cards with `backdrop-filter: blur(12px)` and `rgba(255,255,255,0.05)` base, amber/orange accent (`#e8923a`), pill-shaped glowing buttons, glass conversation list with hover glow effects. Functionality unchanged.

- [x] **Item 3 — Search / filter the conversation list** (`src/popup/Popup.jsx`, CSS)
  `filterText` + `filterMode` state added. A search input + Name/Date pill toggle appear above the list in the selecting phase. Filters conversations client-side — no new API calls. Date mode matches against the human-readable date string.

- [x] **Item 4 — Show conversation date alongside name** (`src/popup/Popup.jsx`, CSS)
  `updated_at` from the API is formatted via `Intl.RelativeTimeFormat` and shown as secondary text ("3 days ago") inside each card. Date turns amber on selected cards.

- [x] **Item 5 — Auto-name the merged conversation** (`src/popup/Popup.jsx`, `src/background/index.js`, `src/content/index.js`)
  Both source conversation names are passed through the `MERGE` message. The real conversation is created with `name: "Merge: [Title A] + [Title B]"` so merges no longer appear as "(Untitled)" in the claude.ai sidebar.

- [x] **UI polish — CSS fixes & refinements** (`src/popup/Popup.css`, `src/popup/Popup.jsx`)
  - Removed `overflow: hidden` from `.conv-item` so the `::after` ambient bloom pseudo-element renders
  - Increased `.conv-list` padding to `12px 10px` to prevent lifted-card shadow clipping
  - Replaced hard `box-shadow: 0 4px 0` 3D button with `border-bottom` press approach, then later replaced entirely with ambient glow pill style
  - Idle screen: removed redundant subtitle span; button centered vertically and horizontally with `min-width: 200px`
  - Selected card glow: 4-layer `box-shadow` with solid amber ring (`1.0` opacity), 12px inner bloom, 30px outer bloom; `::after` radial-gradient ambient light bleeds `20px` behind the card
  - Card gap: `8px` between items; `8px` padding on idle-screen body
  - Button style: `rgba(255,255,255,0.08)` background, `1px solid rgba(232,146,58,0.5)` border, triple-layer glow (tight 12px / mid 35px / wide 60px spread), Title Case text (no `text-transform: uppercase`)
  - Date typography: `font-size: 11px`, `font-weight: 300`, `opacity: 0.5`, `text-transform: none` — lowercase and clearly subordinate to the title
  - Scrollbar: amber removed, now neutral `rgba(255,255,255,0.1)`
  - Header: `24px` top padding, `8px` gap between title and subtitle
  - `.merge-bar` has `overflow: visible` so the Merge button glow isn't clipped

- [x] **Pixel art merge animation** (`src/popup/Popup.jsx`, `src/popup/Popup.css`)
  Replaced the plain spinner on the `merging` phase with a CSS-only pixel art animation. Two amber chat bubbles (sharp-cornered rectangles with CSS triangle tails) slide together, fade out, a larger merged bubble fades in with a scale pulse and amber glow, then splits back — 2s loop. Layout: `.merging-screen` vertical stack with animation on top, live status text below. The `loading` phase spinner is unchanged. Zero new files, zero libraries, zero images.

- [x] **Output Density Toggle** (`src/popup/Popup.jsx`, `src/popup/Popup.css`, `src/background/index.js`)
  3-mode toggle (Concise / Balanced / Detailed) appears above the merge bar in the selecting phase. `outputMode` state defaults to `'balanced'`; selected mode is passed in the MERGE message. Background reads it in `buildSynthesisPrompt()` and prepends a density instruction block that controls section depth and bullet count. Reuses existing `.filter-toggle` CSS with a new `.filter-toggle--three` modifier (33.33% thumb widths, `left: 0/33.33/66.66%`). `.density-row` + `.density-label` handle layout above the merge bar.

- [x] **Item 2 — Auto-open claude.ai tab when none is found** (`src/background/index.js`)
  `findClaudeTab()` opens `https://claude.ai` automatically (with `active: false` so the popup stays open), then calls `waitForContentScript()` which retries up to 10× with 500ms gaps using a no-op `PING` message until the content script responds.

- [x] **V4 — Conversation Preview on Hover** (`src/popup/Popup.jsx`, `src/popup/Popup.css`, `src/background/index.js`)
  Hover any conversation card for 500ms to see the last 2 messages inline — role-labelled (You / Claude), shimmer skeleton while loading, "Couldn't load preview" on error. Session-cached per-convId (Map in React state) so each conversation fetches only once per popup open. `FETCH_PREVIEW` background handler reuses `GET_TRANSCRIPT`; orgId is passed from popup (cached from `FETCH_CONVERSATIONS` response) to avoid a redundant round-trip.

- [x] **V4 — Code review fixes** (`src/popup/Popup.jsx`, `src/content/index.js`, `src/background/index.js`)
  Found via `/review` skill — five bugs fixed:
  - **Hover race condition**: `handleConvMouseLeave` uses functional updater `(prev) => prev === convId ? null : prev` so quickly moving between cards never collapses the wrong preview
  - **Honest merge status**: removed fake delay loop that played all 4 steps before real work started; now shows "Synthesizing conversations…" for the full duration
  - **orgId caching**: popup passes orgId cached from load-time to `FETCH_PREVIEW`, eliminating one `GET_ORG_ID` round-trip per hover
  - **SSE flush**: `decoder.decode()` called after stream `done` so the final partial chunk is never silently dropped
  - **Conversation cap**: limit raised 100→200 in `GET_CONVERSATIONS`; UI shows "Showing first 200 conversations" when hit

- [x] **V5 — Security hardening** (`src/background/index.js`, `src/content/index.js`, `manifest.json`)
  Full security audit — five issues found and fixed:
  - **Sender validation**: both `chrome.runtime.onMessage` listeners reject messages where `_sender.id !== chrome.runtime.id`, blocking cross-extension message injection
  - **Delimiter escaping**: `escapeDelimiters()` strips `[CONVERSATION A/B]` strings from transcript content before synthesis, closing a prompt-injection escape route via delimiter collision
  - **Unused permissions removed**: `storage` and `cookies` dropped from `manifest.json` — neither `chrome.storage` nor `chrome.cookies` APIs are used anywhere in the codebase
  - **PING handler**: no-op `PING` case replaces `GET_ORG_ID` as the readiness check in `waitForContentScript()`, eliminating up to 10 spurious API calls during tab load
  - **UUID validation**: all content script handlers validate `orgId` and `convId` with a UUID regex before use in URL construction

### To Do (pick up here next session)
- [ ] **Merge 3+ conversations** — extend synthesis prompt and UI beyond exactly 2; allow selecting up to 4–5
- [ ] **Persistent preview cache** — use `chrome.storage.session` so the cache survives popup close/reopen within the same browser session
- [ ] **Custom merge name** — let the user edit the auto-generated `"Merge: A + B"` title before confirming
- [ ] **Progress streaming** — pipe SSE synthesis events back to the popup for real step-by-step status during the 30–60s synthesis wait
- [ ] **Search by content** — filter conversations by what was said inside, not just title or date
- [ ] **Chrome Web Store listing** — public release

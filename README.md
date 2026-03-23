# MergeChat

**Stop re-explaining yourself to Claude. MergeChat combines two conversations into one — no API key, no setup, just your existing Claude.ai account.**

<!-- Replace this line with your GIF once recorded:
![MergeChat demo](docs/assets/demo.gif)
Record a 5-second screen capture: open popup → select 2 chats → hit Merge → new tab opens.
Tools: ShareX (Windows), Kap (Mac), or Chrome's built-in screen recorder. -->

> Pick 2 chats → get 1 merged chat that remembers everything from both.

---

## Quick Start

1. **Install** — Load the extension in Chrome (see [Installation](#installation) below)
2. **Open Claude.ai** — Make sure you're logged in to your account
3. **Click the MergeChat icon** → pick any 2 conversations → hit **Merge**

That's it. A new Claude.ai tab opens with a structured memory of both conversations as the first message.

---

## Installation

### For Users (once published)
> Chrome Web Store link coming soon.

### For Developers (load unpacked)

```bash
git clone https://github.com/your-username/MergeChat.git
cd MergeChat
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. The MergeChat icon appears in your toolbar

After any code change, run `npm run build` and click the refresh icon on the MergeChat card at `chrome://extensions`.

---

## What We Built

MergeChat is a **Chrome Extension (Manifest V3)** built with React + Webpack. It reads two conversations from your Claude.ai account, synthesizes them into a structured memory document, and opens a brand-new chat with that memory as the first message — entirely inside your existing browser session, with zero external credentials.

**Core capability:** Claude.ai conversations exist in silos. Every new chat starts cold, forcing you to re-explain context you've already worked out. MergeChat fixes that by extracting and compressing key information from two conversations — decisions made, key facts, open questions, important context — and dropping it into a fresh chat ready to continue from.

The deeper insight: **your browser session is already authenticated**. Claude.ai's internal API is available to any extension running in that context. No Anthropic API keys, no Mem0, no external services — synthesis runs through the same claude.ai session you're already logged into.

---

## How the App Looks

**Idle screen** — A centered "Load Conversations" button on a warm glassmorphism dark background.

**Selecting screen** — A frosted glass list of your conversations with:
- Search bar (filter by Name or Date)
- Relative date on every card ("3 days ago")
- Hover any card for 500ms → last 2 messages preview inline with shimmer loading
- Selected cards glow amber with a 4-layer box-shadow bloom
- Output Form toggle (Concise / Balanced / Detailed) above the merge bar
- Merge button with disabled-state tooltip showing how many more to pick

**Merging screen** — CSS-only pixel art animation: two amber chat bubbles slide together, pulse into a merged bubble, then split apart. Loops every 2 seconds while synthesis runs.

**Done screen** — "Merged! Opening new chat…" — the new tab has already opened.

---

## Security

### No API Keys — Ever
No Anthropic API keys, no Mem0 keys, nothing in `chrome.storage.local`. The browser's cookie jar handles authentication automatically through your existing claude.ai login.

### Prompt Injection Defense
Conversation content is wrapped in `[CONVERSATION A]` / `[CONVERSATION B]` delimiters. The synthesis prompt's system message explicitly classifies everything inside those tags as **RAW USER DATA** — any instruction found there is treated as an injection attack and ignored. Output format is locked to four sections: `[DECISIONS MADE]` `[KEY FACTS]` `[OPEN QUESTIONS]` `[IMPORTANT CONTEXT]`.

### No Unsafe DOM Operations
No `eval()`, no `innerHTML`, no `dangerouslySetInnerHTML`. All API responses are rendered as React text nodes only.

### Minimal Permissions
`host_permissions` covers `https://claude.ai/*` only — no `api.anthropic.com`, no third-party services. Declared permissions: `tabs`, `scripting` only — `storage` and `cookies` were audited and removed since neither `chrome.storage` nor `chrome.cookies` is ever called.

### Temp Conversation Cleanup
The merge flow creates a temporary conversation for synthesis. A `try/finally` block guarantees deletion on success **and** failure — a mid-merge crash never leaves orphaned blank chats.

---

## Tools, Agents & Repos Used to Build It

### Claude Code (CLI)
The entire project was built inside **Claude Code** — Anthropic's official agentic CLI. It read, edited, and created every file across multiple sessions, tracking tasks with a built-in todo system and preserving context between conversations with persistent memory.

### Claude Agent Skills

| Skill | What it did |
|---|---|
| `/office-hours` | Reframed the problem before writing code — challenged assumptions about what MergeChat should actually do |
| `/review` | Staff-engineer-level code review — found the hover race condition, fake status messages, redundant `GET_ORG_ID` calls, and the silent 100-conversation cap |
| `/design-review` | Visual audit — flagged contrast issues, state differentiation, and the clipped density toggle |
| `/brainstorming` | Explored 5 UX patterns for conversation preview before committing to inline expand |
| `/writing-plans` | Turned specs into task-by-task implementation plans with file targets and edge cases |
| `/executing-plans` | Subagent-driven execution with checkpoints |
| `/requesting-code-review` | Validated completed work against the spec before marking tasks done |
| `/receiving-code-review` | Processed review feedback with technical rigour — verified issues before applying fixes |

### GitHub Repos
- **[garrytan/gstack](https://github.com/garrytan/gstack)** — the skill toolkit powering all `/` slash commands above

---

## How We Built the UI/UX

React (JSX) compiled by Webpack into a single self-contained bundle. No component library. No Tailwind. Pure custom CSS.

### Design System
- **Background:** `#0d0a07` — warm dark, not pure black
- **Cards:** `rgba(255,255,255,0.05)` + `backdrop-filter: blur(12px)` frosted glass
- **Accent:** `#e8923a` amber/orange — selections, glows, active states
- **Buttons:** Pill-shaped, triple-layer glow (12px / 35px / 60px spread)
- **Selected state:** 4-layer `box-shadow` — solid amber ring + inner bloom + outer bloom + `::after` ambient light bleeding 20px behind each card
- **Typography:** Dates at `11px`, `font-weight: 300`, `opacity: 0.6` — clearly subordinate to titles

### State Machine
Six phases: `idle → loading → selecting → merging → done → error`. Each phase renders a completely different UI — no hidden elements, no `display: none`.

---

## How We Planned It

Every feature followed the same pipeline:

1. **`/office-hours`** — challenge the problem framing before touching code
2. **`/brainstorming`** — explore 3–5 design directions with trade-offs
3. **Spec** — written in `docs/superpowers/specs/` with edge cases, error states, API contracts
4. **Spec review** — 2 review rounds; 6 issues found and fixed before implementation started
5. **`/writing-plans`** — spec converted to a task-by-task plan in `docs/superpowers/plans/`
6. **`/executing-plans`** — one task at a time, with review checkpoints
7. **Build + verify** — `npm run build` → reload at `chrome://extensions`

---

## Version History

### V1 — Proof of Concept
Synthesis via the **Anthropic API** (API key stored in `chrome.storage.local`) + **Mem0** for memory persistence (second API key). Two external services, two credentials, two points of failure.

### V2 — Zero External Dependencies
Dropped the Anthropic SDK and Mem0 entirely. Realised the browser session is already authenticated — synthesis now runs through the user's own `claude.ai` session via the content script. Removed `api.anthropic.com` and `api.mem0.ai` host permissions.

### V3 — Glassmorphism UI + Feature Wave
- Full glassmorphism redesign (warm dark base, frosted glass cards, amber accents)
- Search/filter bar with Name/Date mode toggle
- Relative dates on every conversation card
- Auto-naming: merged chats appear as `"Merge: [Title A] + [Title B]"`
- CSS-only pixel art merge animation
- `try/finally` cleanup of temp conversation on failure

### V4 — Intelligence, Preview & Reliability
- **Output Density Toggle** — Concise / Balanced / Detailed controls synthesis depth via injected prompt instructions
- **Conversation Preview on Hover** — 500ms debounce, inline expand, shimmer loading, session cache per convId
- **Auto-open claude.ai tab** — extension opens one automatically if none is found, waits via no-op PING until ready
- **Bug fixes:** hover race condition (functional updater in mouseLeave), honest merge status (no fake delay loop), eliminated redundant `GET_ORG_ID` per hover, SSE buffer flush on stream end, conversation cap raised 100→200 with visible note, preview error state shows "Couldn't load preview"

### V5 — Security Hardening (Current)
Full security audit — five issues found and fixed:
- **Sender validation** — both `chrome.runtime.onMessage` listeners reject messages from other extensions (`_sender.id !== chrome.runtime.id`)
- **Delimiter escaping** — `escapeDelimiters()` strips `[CONVERSATION A/B]` tags from transcript content before synthesis, closing a prompt-injection escape route via delimiter collision
- **Unused permissions removed** — `storage` and `cookies` dropped from `manifest.json`; neither API was ever called
- **PING handler** — no-op readiness check replaces `GET_ORG_ID` ping, eliminating up to 10 spurious API calls per tab load
- **UUID validation** — all content script handlers validate `orgId`/`convId` as proper UUIDs before URL construction

---

## What's Next

- **Merge 3+ conversations** — extend synthesis prompt and UI beyond exactly 2; allow selecting up to 4–5
- **Persistent preview cache** — use `chrome.storage.session` so the cache survives popup close/reopen
- **Custom merge name** — let the user edit the auto-generated `"Merge: A + B"` title before confirming
- **Progress streaming** — pipe SSE synthesis events back to the popup for real step-by-step status during the 30–60s wait
- **Search by content** — filter conversations by what was said inside, not just title or date
- **Chrome Web Store listing** — public release

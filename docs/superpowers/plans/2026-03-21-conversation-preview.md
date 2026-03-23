# Conversation Preview on Hover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user hovers a conversation card for 500ms, the card expands inline to show the last 2 messages as a preview snippet, fetched lazily and cached per session.

**Architecture:** A new `FETCH_PREVIEW` message handler in the background calls the existing `GET_ORG_ID` + `GET_TRANSCRIPT` content script chain, extracts the last 2 non-empty messages, and returns them. The popup tracks `hoveredConvId` and `previewCache` in React state; a `useRef` holds per-card debounce timers. CSS `max-height` animation drives the expand; React state drives collapse.

**Tech Stack:** React (useState, useRef), CSS max-height transition, Chrome MV3 message passing, existing GET_TRANSCRIPT content script handler.

**Spec:** `docs/superpowers/specs/2026-03-21-conversation-preview-design.md`

---

## File Map

| File | Change |
|------|--------|
| `src/background/index.js` | Add `FETCH_PREVIEW` case |
| `src/popup/Popup.css` | Add preview + shimmer styles |
| `src/popup/Popup.jsx` | Add state, handlers, preview JSX |

No new files. No new content script handlers.

---

## Task 1: Background — `FETCH_PREVIEW` handler

**File:** `src/background/index.js`

Add the new case inside the `switch (message.type)` block in `handleMessage()`, before the `default` case.

- [ ] **Step 1: Add the FETCH_PREVIEW case**

Open `src/background/index.js`. Find the line `default:` inside `handleMessage()`. Insert the following block **immediately before** it:

```js
    case 'FETCH_PREVIEW': {
      const { convId } = message;
      const tab = await findClaudeTab();
      const orgId = await contentCall(tab.id, { type: 'GET_ORG_ID' });
      const transcript = await contentCall(tab.id, { type: 'GET_TRANSCRIPT', orgId, convId });
      const messages = transcript?.chat_messages ?? transcript?.messages ?? [];

      // Walk backwards, collect last 2 non-empty messages
      const preview = [];
      for (let i = messages.length - 1; i >= 0 && preview.length < 2; i--) {
        const msg = messages[i];
        const role = msg.sender ?? msg.role ?? 'unknown';
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        } else if (typeof msg.text === 'string') {
          text = msg.text;
        }
        text = text.trim();
        if (text) {
          preview.unshift({ role, text: text.length > 120 ? text.slice(0, 120) + '…' : text });
        }
      }

      return { ok: true, data: preview };
    }
```

- [ ] **Step 2: Build and verify no errors**

```bash
cd C:/Users/Devamsh/Desktop/Coding/MergeChat && npm run build
```

Expected: `webpack compiled successfully`. No errors.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Devamsh/Desktop/Coding/MergeChat && git add src/background/index.js && git commit -m "feat: add FETCH_PREVIEW background handler"
```

---

## Task 2: CSS — Preview styles and shimmer animation

**File:** `src/popup/Popup.css`

Append all new rules after the existing content. Do not modify existing rules.

- [ ] **Step 1: Append preview CSS**

Open `src/popup/Popup.css`. Scroll to the very end of the file. Append:

```css
/* ── Conversation preview (inline expand on hover) ── */
.conv-preview {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 6px;
  padding-top: 6px;
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition: max-height 250ms ease-out, opacity 200ms ease-out;
}

.conv-preview--visible {
  max-height: 200px;
  opacity: 1;
}

.conv-preview-msg {
  margin-bottom: 5px;
}

.conv-preview-msg:last-child {
  margin-bottom: 0;
}

.conv-preview-role {
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.conv-preview-role--you {
  color: #e8923a;
}

.conv-preview-role--claude {
  color: rgba(200, 180, 255, 0.9);
}

.conv-preview-text {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
}

/* ── Shimmer (loading state) ── */
.conv-preview-shimmer-role {
  height: 6px;
  width: 36px;
  border-radius: 3px;
  background: rgba(232, 146, 58, 0.2);
  margin-bottom: 3px;
}

.conv-preview-shimmer-role--claude {
  background: rgba(200, 180, 255, 0.15);
}

.conv-preview-shimmer-line {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.06) 25%,
    rgba(255, 255, 255, 0.13) 50%,
    rgba(255, 255, 255, 0.06) 75%
  );
  background-size: 200% 100%;
  animation: conv-shimmer 1.4s infinite;
  margin-bottom: 4px;
}

.conv-preview-shimmer-line:last-child {
  margin-bottom: 0;
}

@keyframes conv-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 2: Build and verify no errors**

```bash
cd C:/Users/Devamsh/Desktop/Coding/MergeChat && npm run build
```

Expected: `webpack compiled successfully`.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Devamsh/Desktop/Coding/MergeChat && git add src/popup/Popup.css && git commit -m "feat: add conversation preview styles and shimmer animation"
```

---

## Task 3: Popup — State, handlers, and preview JSX

**File:** `src/popup/Popup.jsx`

Three changes: (1) add `useRef` to the import, (2) add three new state variables, (3) add two handler functions, (4) wire handlers + preview JSX onto each card.

- [ ] **Step 1: Add `useRef` to the React import**

Find line 1:
```js
import React, { useState } from 'react';
```
Replace with:
```js
import React, { useState, useRef } from 'react';
```

- [ ] **Step 2: Add state variables**

Find the block of `useState` declarations (around line 16–23). After the last `useState` line (`const [outputMode, setOutputMode] ...`), add:

```js
  const [previewCache, setPreviewCache]   = useState(new Map()); // convId → [{role,text}] | 'loading' | 'error'
  const [hoveredConvId, setHoveredConvId] = useState(null);
  const hoverTimerRef                     = useRef({});
```

- [ ] **Step 3: Add hover handler functions**

Find the comment `// ── Render ──` (just before `return (`). Insert the two handler functions immediately before that comment:

```js
  // ── Preview hover handlers ────────────────────────────────────────────────

  function handleConvMouseEnter(convId) {
    setHoveredConvId(convId);
    const cached = previewCache.get(convId);
    // Already loaded or in-flight — don't dispatch another fetch
    if (Array.isArray(cached) || cached === 'loading') return;
    // 'error' or missing — schedule fetch after 500ms
    hoverTimerRef.current[convId] = setTimeout(async () => {
      setPreviewCache((prev) => new Map(prev).set(convId, 'loading'));
      try {
        const res = await chrome.runtime.sendMessage({ type: 'FETCH_PREVIEW', convId });
        setPreviewCache((prev) => new Map(prev).set(convId, res.ok ? res.data : 'error'));
      } catch {
        setPreviewCache((prev) => new Map(prev).set(convId, 'error'));
      }
    }, 500);
  }

  function handleConvMouseLeave(convId) {
    clearTimeout(hoverTimerRef.current[convId]);
    setHoveredConvId(null);
  }
```

- [ ] **Step 4: Wire handlers and add preview JSX onto each card**

Find the `<label>` that renders each conversation card. It currently looks like:

```jsx
<label key={conv.uuid} className={`conv-item ${isChecked ? 'conv-item--checked' : ''}`}>
```

Replace it with (add the two mouse handlers):

```jsx
<label
  key={conv.uuid}
  className={`conv-item ${isChecked ? 'conv-item--checked' : ''}`}
  onMouseEnter={() => handleConvMouseEnter(conv.uuid)}
  onMouseLeave={() => handleConvMouseLeave(conv.uuid)}
>
```

Then find the closing `</label>` for that card. Just **before** `</label>`, insert the preview section:

```jsx
                    {/* Inline preview — shown on hover */}
                    {(() => {
                      const preview = previewCache.get(conv.uuid);
                      const isHov   = hoveredConvId === conv.uuid;
                      if (!isHov || (!preview && preview !== 'loading')) return null;
                      return (
                        <div className={`conv-preview${isHov ? ' conv-preview--visible' : ''}`}>
                          {preview === 'loading' && (
                            <>
                              <div className="conv-preview-msg">
                                <div className="conv-preview-shimmer-role" />
                                <div className="conv-preview-shimmer-line" style={{ width: '90%' }} />
                                <div className="conv-preview-shimmer-line" style={{ width: '70%' }} />
                              </div>
                              <div className="conv-preview-msg">
                                <div className="conv-preview-shimmer-role conv-preview-shimmer-role--claude" />
                                <div className="conv-preview-shimmer-line" style={{ width: '85%' }} />
                                <div className="conv-preview-shimmer-line" style={{ width: '55%' }} />
                              </div>
                            </>
                          )}
                          {Array.isArray(preview) && preview.map((msg, i) => {
                            const isUser = msg.role === 'human' || msg.role === 'user';
                            return (
                              <div key={i} className="conv-preview-msg">
                                <div className={`conv-preview-role conv-preview-role--${isUser ? 'you' : 'claude'}`}>
                                  {isUser ? 'You' : 'Claude'}
                                </div>
                                <div className="conv-preview-text">{msg.text}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
```

- [ ] **Step 5: Build and verify no errors**

```bash
cd C:/Users/Devamsh/Desktop/Coding/MergeChat && npm run build
```

Expected: `webpack compiled successfully`. No warnings about undefined variables.

- [ ] **Step 6: Reload extension and manual test**

1. Go to `chrome://extensions`, click refresh on MergeChat
2. Open the popup, click "Load Conversations"
3. Hover a conversation card — wait 500ms — card should expand with shimmer then 2 messages
4. Move mouse away — card should collapse immediately
5. Re-hover same card — should expand instantly (cached, no shimmer)
6. Hover a different card — previous card collapses, new one expands

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Devamsh/Desktop/Coding/MergeChat && git add src/popup/Popup.jsx && git commit -m "feat: add conversation preview on hover with lazy fetch and session cache"
```

---

## Done

All three files changed. Feature complete when:
- Shimmer appears after 500ms hover, replaced by real messages when fetch resolves
- Same card re-hovered: instant expand, no shimmer
- Failed fetch: card looks normal, retry on next hover
- All existing merge functionality unaffected

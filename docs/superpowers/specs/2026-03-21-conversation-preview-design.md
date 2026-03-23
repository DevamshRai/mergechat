# Conversation Preview on Hover — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

When a user hovers a conversation card for 500ms in the selecting phase, the card expands inline to show the last 2 messages from that conversation as a preview snippet. This helps users identify which conversations to merge without relying on memory. Preview data is fetched lazily (on hover only) and cached per popup session.

---

## UI / Interaction Design

### Approach: Inline Expand

The conversation card grows downward to reveal a preview section. The list shifts to accommodate the expanded card. No tooltips, no side panels.

### States

| State | Trigger | Visual |
|-------|---------|--------|
| **Collapsed** | Default / not the hovered card | Normal card, no preview |
| **Loading** | 500ms elapsed, fetch in-flight | Shimmer animation inside expanded card |
| **Loaded** | Data received | Last 2 messages rendered |
| **Cached** | Previously fetched, re-hover | Instantly expands to loaded state (no shimmer) |
| **Error** | Fetch failed | Card looks normal — preview silently absent |

### Visual details

- Preview section separated from card title by a `1px rgba(255,255,255,0.08)` divider
- Role labels: **YOU** in amber `#e8923a`, **CLAUDE** in soft purple `rgba(200,180,255,0.9)` — both `7px`, `font-weight: 700`, uppercase
- Message text: `9px`, `rgba(255,255,255,0.7)`, truncated at 120 chars with `…`
- Expand animation: `max-height` CSS transition, `250ms ease-out`
- Collapse: immediate when `hoveredConvId` is cleared (React state, not CSS `:hover`)
- Shimmer: two rows of role + text placeholders animated with `background-position` sweep, `1.4s infinite`

---

## Data Flow

### New background message: `FETCH_PREVIEW`

```
Popup → Background: { type: 'FETCH_PREVIEW', convId }
Background → Content: GET_ORG_ID → orgId          (one call per preview, matches existing pattern)
Background → Content: GET_TRANSCRIPT (orgId, convId) → full transcript
Background extracts: last 2 messages from chat_messages array
Background → Popup: { ok: true, data: [{ role, text }] }
```

**No new content script handler.** Reuses existing `GET_TRANSCRIPT`.

**`GET_ORG_ID` on every hover** — intentional. Background is stateless (MV3 service worker). This matches the existing `FETCH_CONVERSATIONS` and `MERGE` patterns.

Background extraction logic:
- Source: `transcript.chat_messages ?? transcript.messages ?? []`
- Extract the last 2 entries that have non-empty text
- For each message: `role = msg.sender ?? msg.role ?? 'unknown'`
- Text extraction must handle three shapes (mirrors existing `formatTranscript`):
  - `msg.content` is a string → use directly
  - `msg.content` is an array → filter `b.type === 'text'`, join `b.text`
  - `msg.text` is a string → use directly
- Truncate extracted text to 120 chars with `…`

### Popup state additions

```js
const [previewCache, setPreviewCache]   = useState(new Map()); // convId → [{role,text}] | 'loading' | 'error'
const [hoveredConvId, setHoveredConvId] = useState(null);      // controls which card shows preview
const hoverTimerRef = useRef({});                              // convId → timeoutId
```

`hoveredConvId` drives both the card highlight and the preview visibility — **do not use CSS `:hover`** for preview rendering. Using React state prevents premature collapse when the cursor moves into a child element (e.g. the preview text itself).

### Hover handler (per card)

```
onMouseEnter(convId):
  setHoveredConvId(convId)
  cached = previewCache.get(convId)
  if cached is [{role,text}] array → already loaded, expand immediately, no fetch
  if cached === 'loading'          → already in-flight, do nothing (guard against double-fetch)
  if cached === 'error' OR missing → schedule fetch:
    hoverTimerRef.current[convId] = setTimeout(500ms, () => {
      // re-check in case user moused away before timer fired
      if hoveredConvId !== convId: return
      setPreviewCache(prev → new Map(prev).set(convId, 'loading'))
      chrome.runtime.sendMessage({ type: 'FETCH_PREVIEW', convId })
        .then(res → setPreviewCache(prev → new Map(prev).set(convId, res.ok ? res.data : 'error')))
        .catch(→   setPreviewCache(prev → new Map(prev).set(convId, 'error')))
    })

onMouseLeave(convId):
  clearTimeout(hoverTimerRef.current[convId])
  setHoveredConvId(null)   ← collapses preview immediately via React state
```

**Key guards:**
- `'loading'` sentinel prevents a second fetch for the same `convId` while one is in-flight.
- `'error'` sentinel is **not** treated as cached — the `onMouseEnter` handler retries on re-hover.
- Timer checks `hoveredConvId === convId` before firing to discard stale timers.

### Render logic (per card)

```
const preview = previewCache.get(conv.uuid)
const isHovered = hoveredConvId === conv.uuid

isHovered && preview === 'loading'       → render shimmer inside .conv-preview
isHovered && Array.isArray(preview)      → render messages inside .conv-preview
isHovered && (preview === 'error' || !preview) → render nothing (card looks normal)
!isHovered                               → render nothing
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Fetch fails (network / API error) | `'error'` stored in cache; preview absent; card looks normal; retry allowed on re-hover |
| Empty conversation (0 messages) | Background returns `[]`; preview section hidden |
| Mouse leaves before 500ms | Timer cancelled; no fetch; no visual change |
| Mouse leaves while fetch in-flight | `hoveredConvId` set to null; response still arrives and is cached silently; no visual change |
| Re-hover after error | Cache value is `'error'`, treated as missing — fetch retried |
| Re-hover while loading | Cache value is `'loading'` — no second fetch dispatched |

---

## Files Changed

| File | Change |
|------|--------|
| `src/popup/Popup.jsx` | Add `previewCache`, `hoveredConvId`, `hoverTimerRef` state; add `onMouseEnter`/`onMouseLeave` handlers to each `conv-item`; render `.conv-preview` section inside each card |
| `src/popup/Popup.css` | Add `.conv-preview`, `.conv-preview-msg`, `.conv-preview-role--you`, `.conv-preview-role--claude`, shimmer keyframes, `max-height` expand transition |
| `src/background/index.js` | Add `FETCH_PREVIEW` case: calls `GET_ORG_ID` + `GET_TRANSCRIPT`, extracts last 2 messages using multi-format content logic, returns `[{role, text}]` |

---

## Success Criteria

- Hovering a card for 500ms triggers a fetch; shimmer appears; messages render on arrival
- Hovering the same card a second time (after successful load) expands instantly with no fetch
- Hovering a card that previously errored triggers a fresh fetch
- Mouse leaving before 500ms cancels the timer with no fetch and no visual change
- Two rapid hover-leave-hover cycles never dispatch two concurrent fetches for the same `convId`
- Fetch failure leaves the card visually normal (no error text, no broken state)
- All existing merge functionality is unaffected

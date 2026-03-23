# MergeChat — Output Density Toggle Design

**Date:** 2026-03-19
**Status:** Approved
**Priority:** Top — user's #1 improvement request

---

## Problem

The synthesis output that opens each merged conversation varies unpredictably in length and detail. Short conversations may produce sparse, incomplete memory docs; long conversations may produce verbose ones that burn significant context window before the user types a single message. The user has no control over this trade-off.

## Goal

Give the user a simple **Concise / Balanced / Detailed** toggle before each merge, so the output density is always intentional and predictable.

---

## Design

### 1. UI — Density Toggle in Popup

**Location:** `.merge-bar` in the `selecting` phase of `Popup.jsx`, left of the selection count.

**Appearance:** 3-pill toggle, identical styling to the existing Name/Date filter toggle (`.filter-toggle` CSS class). No new styles needed. Thumb position: `left: 0%` (Concise), `left: 33.33%` (Balanced), `left: 66.66%` (Detailed) — each pill occupies one-third of the container width.

```
[ Concise | Balanced | Detailed ]   ✓ 2 selected   [ Merge → ]
```

**State:** New `outputMode` state variable in `Popup.jsx`:
```js
const [outputMode, setOutputMode] = useState('balanced');
// values: 'concise' | 'balanced' | 'detailed'
```

**Default:** `'balanced'` — closest to current behaviour, safe regression baseline.

**Thumb animation:** The existing `.filter-toggle__thumb` sliding-pill pattern works for 3 options with minor positional adjustment.

---

### 2. Synthesis Prompt — 3 Mode Variants

The 4-section output structure is preserved across all modes:
`[DECISIONS MADE]`, `[KEY FACTS]`, `[OPEN QUESTIONS]`, `[IMPORTANT CONTEXT]`

All prompt injection defences and transcript delimiters are unchanged.

Each mode prepends a density instruction block to the existing system prompt in `buildSynthesisPrompt()`:

#### Concise (~300 tokens target)
```
DENSITY: CONCISE
Be maximally dense. Every word must earn its place.
Rules:
- Bullet points only — no prose
- Max 3 bullets per section
- Cut all examples, cut all reasoning, cut all "background"
- Skip any section with nothing critical to say
- Target: under 300 tokens total
```

#### Balanced (~600 tokens target)  ← current default
```
DENSITY: BALANCED
Extract key information comprehensively but concisely.
Rules:
- Prefer bullet points; brief prose only when structure is lost without it
- Max 6 bullets per section
- Include reasoning only when the decision cannot be understood without it
- Target: 400–700 tokens total
```

#### Detailed (~1200 tokens target)
```
DENSITY: DETAILED
Provide thorough synthesis. Completeness over brevity.
Rules:
- Prose and bullets both allowed
- No bullet limit per section
- Include reasoning, nuance, edge cases, and open threads
- Target: 800–1200 tokens total
```

---

### 3. Data Flow

`outputMode` is passed from Popup → Background via the existing `MERGE` message, then into `buildSynthesisPrompt()`. No content script changes.

```
Popup
  └─ MERGE { convIds, convNames, outputMode }
       │
       ▼
Background (index.js)
  └─ buildSynthesisPrompt(transcriptA, transcriptB, outputMode)
       └─ selects density block → prepends to system prompt
       └─ sends to temp conversation via SEND_MESSAGE (unchanged)
```

---

## Files Changed

| File | Change |
|---|---|
| `src/popup/Popup.jsx` | Add `outputMode` state; render 3-pill toggle in `.merge-bar`; pass `outputMode` in `MERGE` message |
| `src/popup/Popup.css` | Adjust `.filter-toggle__thumb` positioning for 3-option variant (minor tweak) |
| `src/background/index.js` | `buildSynthesisPrompt()` accepts `outputMode` param; 3 density instruction blocks |
| `src/content/index.js` | **No changes** |

---

## Out of Scope

- Persisting the last-used mode across sessions (YAGNI — user picks fresh each merge)
- Custom user-defined prompt sections
- Token counting / validation of actual output length

---

## Success Criteria

1. Toggle renders correctly in the selecting phase with Balanced pre-selected
2. Concise merge produces a noticeably shorter memory doc than Detailed
3. Balanced mode uses the same prompt rules as the pre-toggle baseline (verified by diffing the prompt string sent when `outputMode === 'balanced'` against the original)
4. `npm run build` passes with no warnings
5. No changes to loading, merging animation, or done/error phases

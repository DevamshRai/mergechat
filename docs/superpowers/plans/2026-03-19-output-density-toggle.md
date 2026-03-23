# Output Density Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Concise / Balanced / Detailed 3-pill toggle to the popup so users control the synthesis output density before every merge.

**Architecture:** `outputMode` state lives in `Popup.jsx`, flows into the `MERGE` message, and is consumed by `buildSynthesisPrompt()` in `background/index.js` which prepends a density instruction block to the existing system prompt. No content script changes. CSS reuses the existing `.filter-toggle` component with a `--three` modifier for 3-option sizing.

**Tech Stack:** React, CSS keyframes, Webpack/Babel, Chrome Extension MV3

---

## File Map

| File | What Changes |
|---|---|
| `src/background/index.js` | `buildSynthesisPrompt()` gets `outputMode` param + 3 density blocks; MERGE handler destructures and passes it |
| `src/popup/Popup.jsx` | New `outputMode` state; `density-row` JSX above `.merge-bar`; `outputMode` in MERGE message |
| `src/popup/Popup.css` | `.filter-toggle--three` width override; `.filter-toggle__thumb--mid` position; `.density-row` layout |

---

## Task 1: Add density blocks and update `buildSynthesisPrompt` in background

**Files:**
- Modify: `src/background/index.js`

- [ ] **Step 1: Add the three density instruction constants just above `buildSynthesisPrompt`**

  Insert immediately before `function buildSynthesisPrompt(`:

  ```js
  const DENSITY_CONCISE = `DENSITY: CONCISE
  Be maximally dense. Every word must earn its place.
  Rules:
  - Bullet points only — no prose
  - Max 3 bullets per section
  - Cut all examples, cut all reasoning, cut all "background"
  - Skip any section with nothing critical to say
  - Target: under 300 tokens total`;

  const DENSITY_BALANCED = `DENSITY: BALANCED
  Extract key information comprehensively but concisely.
  Rules:
  - Prefer bullet points; brief prose only when structure is lost without it
  - Max 6 bullets per section
  - Include reasoning only when the decision cannot be understood without it
  - Target: 400–700 tokens total`;

  const DENSITY_DETAILED = `DENSITY: DETAILED
  Provide thorough synthesis. Completeness over brevity.
  Rules:
  - Prose and bullets both allowed
  - No bullet limit per section
  - Include reasoning, nuance, edge cases, and open threads
  - Target: 800–1200 tokens total`;
  ```

- [ ] **Step 2: Update `buildSynthesisPrompt` signature and prepend density block**

  Change the function signature and system prompt line:

  ```js
  // BEFORE:
  function buildSynthesisPrompt(transcriptA, transcriptB) {
    const textA = formatTranscript(transcriptA);
    const textB = formatTranscript(transcriptB);

    return `You are a memory synthesis engine...

  // AFTER:
  function buildSynthesisPrompt(transcriptA, transcriptB, outputMode = 'balanced') {
    const densityBlocks = {
      concise:  DENSITY_CONCISE,
      balanced: DENSITY_BALANCED,
      detailed: DENSITY_DETAILED,
    };
    const densityBlock = densityBlocks[outputMode] ?? DENSITY_BALANCED;

    const textA = formatTranscript(transcriptA);
    const textB = formatTranscript(transcriptB);

    return `${densityBlock}

  You are a memory synthesis engine...
  ```

  The full first argument to the template literal becomes `${densityBlock}\n\nYou are a memory synthesis engine...`

---

## Task 2: Thread `outputMode` through the MERGE handler

**Files:**
- Modify: `src/background/index.js` (line ~40)

- [ ] **Step 1: Destructure `outputMode` from the MERGE message**

  Change line 40 from:
  ```js
  const { convIds, convNames = [] } = message;
  ```
  To:
  ```js
  const { convIds, convNames = [], outputMode = 'balanced' } = message;
  ```

- [ ] **Step 2: Pass `outputMode` into `buildSynthesisPrompt`**

  Change line ~59 from:
  ```js
  const prompt = buildSynthesisPrompt(transcriptA, transcriptB);
  ```
  To:
  ```js
  const prompt = buildSynthesisPrompt(transcriptA, transcriptB, outputMode);
  ```

- [ ] **Step 3: Build to verify background changes compile**

  ```bash
  cd "C:/Users/Devamsh/Desktop/Coding/MergeChat" && npm run build
  ```
  Expected: `compiled successfully` — no errors, no warnings.

---

## Task 3: Add `outputMode` state to Popup and pass it in the MERGE message

**Files:**
- Modify: `src/popup/Popup.jsx`

- [ ] **Step 1: Add `outputMode` state alongside the other state declarations (line ~22)**

  After:
  ```js
  const [filterMode, setFilterMode]     = useState('name'); // 'name' | 'date'
  ```
  Add:
  ```js
  const [outputMode, setOutputMode]     = useState('balanced'); // 'concise' | 'balanced' | 'detailed'
  ```

- [ ] **Step 2: Pass `outputMode` in the MERGE message inside `handleMerge` (line ~82)**

  Change:
  ```js
  const res = await chrome.runtime.sendMessage({ type: 'MERGE', convIds: selected, convNames });
  ```
  To:
  ```js
  const res = await chrome.runtime.sendMessage({ type: 'MERGE', convIds: selected, convNames, outputMode });
  ```

---

## Task 4: Add the density toggle JSX above the merge-bar

**Files:**
- Modify: `src/popup/Popup.jsx`

- [ ] **Step 1: Insert the `density-row` div immediately before `<div className="merge-bar">`**

  Insert this block:
  ```jsx
  <div className="density-row">
    <span className="density-label">Output</span>
    <div className="filter-toggle filter-toggle--three">
      <div className={`filter-toggle__thumb${
        outputMode === 'balanced' ? ' filter-toggle__thumb--mid' :
        outputMode === 'detailed' ? ' filter-toggle__thumb--right' : ''
      }`} />
      <button
        className={`filter-toggle__option${outputMode === 'concise' ? ' filter-toggle__option--active' : ''}`}
        onClick={() => setOutputMode('concise')}
      >Concise</button>
      <button
        className={`filter-toggle__option${outputMode === 'balanced' ? ' filter-toggle__option--active' : ''}`}
        onClick={() => setOutputMode('balanced')}
      >Balanced</button>
      <button
        className={`filter-toggle__option${outputMode === 'detailed' ? ' filter-toggle__option--active' : ''}`}
        onClick={() => setOutputMode('detailed')}
      >Detailed</button>
    </div>
  </div>
  ```

  So the block order inside the `selecting` fragment becomes:
  1. `filter-row` (search + Name/Date toggle) — unchanged
  2. `conv-list` — unchanged
  3. **`density-row`** ← new
  4. `merge-bar` — unchanged

---

## Task 5: Add CSS for the 3-option toggle variant

**Files:**
- Modify: `src/popup/Popup.css`

- [ ] **Step 1: Add the 3-option modifier and new thumb position classes**

  Append after the existing `.filter-toggle__thumb--right` rule (around line 221):

  ```css
  /* ── 3-option toggle variant (Concise / Balanced / Detailed) ── */
  .filter-toggle--three .filter-toggle__thumb {
    width: calc(33.33% - 2px);
  }

  .filter-toggle__thumb--mid {
    transform: translateX(100%);
  }

  .filter-toggle--three .filter-toggle__thumb--right {
    transform: translateX(200%);
  }

  /* ── Density row ── */
  .density-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 4px 2px 8px;
  }

  .density-label {
    font-size: 11px;
    font-weight: 300;
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 0.4px;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  ```

  > **Note:** The existing `.filter-toggle__thumb--right` rule (`transform: translateX(100%)`) is untouched — it still works correctly for the 2-option Name/Date filter toggle. The 3-option override only applies inside `.filter-toggle--three`.

---

## Task 6: Build and verify

**Files:** none

- [ ] **Step 1: Run the production build**

  ```bash
  cd "C:/Users/Devamsh/Desktop/Coding/MergeChat" && npm run build
  ```
  Expected: `compiled successfully` — zero errors, zero warnings.

- [ ] **Step 2: Reload the extension**

  Go to `chrome://extensions` → click the refresh icon on the MergeChat card.

- [ ] **Step 3: Verify the toggle renders**

  Open the popup → click Load Conversations → confirm the density row appears above the merge bar with **Balanced** pre-selected (amber thumb in the centre position).

- [ ] **Step 4: Verify all three positions work**

  Click Concise → thumb slides to left. Click Detailed → thumb slides to right. Click Balanced → thumb returns to centre. No layout break on the Name/Date filter above.

- [ ] **Step 5: Verify Balanced is a no-regression baseline**

  With Balanced selected, trigger a merge and inspect the synthesis prompt sent — it must contain `DENSITY: BALANCED` and the same 4-section structure as before.

- [ ] **Step 6: Verify density difference**

  Merge the same two conversations twice — once with Concise, once with Detailed. Concise output should be noticeably shorter.

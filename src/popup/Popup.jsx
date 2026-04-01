import React, { useState, useRef, useEffect } from 'react';

/**
 * MergeChat Popup
 *
 * State machine:
 *   idle      → show "Load Conversations" button
 *   loading   → spinner while fetching conversation list
 *   selecting → show list with checkboxes; Merge button enabled when exactly 2 selected
 *   merging   → step-by-step status messages
 *   done      → success message (new tab already opened)
 *   error     → error banner with retry option
 */

export default function Popup() {
  const [phase, setPhase]               = useState('idle');
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected]         = useState([]); // array of up to 2 uuids (oldest first)
  const [statusMsg, setStatusMsg]       = useState('');
  const [errorMsg, setErrorMsg]         = useState('');
  const [filterText, setFilterText]     = useState('');
  const [filterMode, setFilterMode]     = useState('name'); // 'name' | 'date'
  const [outputMode, setOutputMode]     = useState('balanced'); // 'concise' | 'balanced' | 'detailed'
  const [previewCache, setPreviewCache]   = useState(new Map()); // convId → [{role,text}] | 'loading' | 'error'
  const [hoveredConvId, setHoveredConvId] = useState(null);
  const [orgId, setOrgId]               = useState(null);
  const hoverTimerRef                     = useRef({});

  useEffect(() => () => { Object.values(hoverTimerRef.current).forEach(clearTimeout); }, []);

  // Listen for status pushes from the background during a merge (e.g. chunking notice)
  useEffect(() => {
    function onMessage(message) {
      if (message.type === 'MERGE_STATUS') {
        setStatusMsg(message.message);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // ── Load conversations ──────────────────────────────────────────────────────

  async function handleLoad() {
    setPhase('loading');
    setErrorMsg('');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'FETCH_CONVERSATIONS' });
      if (!res.ok) throw new Error(res.error || 'Failed to load conversations');
      setConversations(res.data ?? []);
      setOrgId(res.orgId || null);
      setSelected([]);
      setFilterText('');
      setFilterMode('name');
      setPhase('selecting');
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setPhase('error');
    }
  }

  // ── Checkbox toggle ─────────────────────────────────────────────────────────

  function handleCheck(uuid) {
    setSelected((prev) => {
      if (prev.includes(uuid)) {
        // Uncheck
        return prev.filter((id) => id !== uuid);
      }
      if (prev.length < 2) {
        return [...prev, uuid];
      }
      // Already 2 selected — drop the oldest (first in array), add new one
      return [prev[1], uuid];
    });
  }

  // ── Merge ───────────────────────────────────────────────────────────────────

  async function handleMerge() {
    setPhase('merging');
    setStatusMsg('Synthesizing conversations…');
    setErrorMsg('');
    try {
      const convNames = selected.map((id) => conversations.find((c) => c.uuid === id)?.name || '');
      const res = await chrome.runtime.sendMessage({ type: 'MERGE', convIds: selected, convNames, outputMode });
      if (!res.ok) throw new Error(res.error || 'Merge failed');
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setPhase('error');
    }
  }

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
        const res = await chrome.runtime.sendMessage({ type: 'FETCH_PREVIEW', convId, orgId });
        setPreviewCache((prev) => new Map(prev).set(convId, res.ok ? res.data : 'error'));
      } catch {
        setPreviewCache((prev) => new Map(prev).set(convId, 'error'));
      }
    }, 500);
  }

  function handleConvMouseLeave(convId) {
    clearTimeout(hoverTimerRef.current[convId]);
    setHoveredConvId((prev) => prev === convId ? null : prev);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="popup">
      <header className="popup__header">
        <h1>MergeChat</h1>
        <p>Pick 2 conversations to merge.</p>
      </header>

      <main className="popup__body">

        {/* IDLE */}
        {phase === 'idle' && (
          <div className="idle-screen">
            <button className="btn btn--primary" onClick={handleLoad}>
              Load Conversations
            </button>
          </div>
        )}

        {/* LOADING */}
        {phase === 'loading' && (
          <div className="status-row">
            <span className="spinner" />
            <span>Loading conversations…</span>
          </div>
        )}

        {/* SELECTING */}
        {phase === 'selecting' && (
          <>
            <div className="filter-row">
              <input
                className="filter-input"
                type="text"
                placeholder={filterMode === 'name' ? 'Search by name…' : 'Search by date…'}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              <div className="filter-toggle">
                <div className={`filter-toggle__thumb ${filterMode === 'date' ? 'filter-toggle__thumb--right' : ''}`} />
                <button
                  className={`filter-toggle__option ${filterMode === 'name' ? 'filter-toggle__option--active' : ''}`}
                  onClick={() => { setFilterMode('name'); setFilterText(''); }}
                >Name</button>
                <button
                  className={`filter-toggle__option ${filterMode === 'date' ? 'filter-toggle__option--active' : ''}`}
                  onClick={() => { setFilterMode('date'); setFilterText(''); }}
                >Date</button>
              </div>
            </div>
            <div className="conv-list">
              {conversations.length === 0 && (
                <p className="empty-msg">No conversations found.</p>
              )}
              {conversations.length >= 200 && (
                <p className="empty-msg" style={{ fontSize: '11px', opacity: 0.5 }}>Showing first 200 conversations</p>
              )}
              {conversations
                .filter((conv) => {
                  if (!filterText) return true;
                  const q = filterText.toLowerCase();
                  if (filterMode === 'name') {
                    return (conv.name || '').toLowerCase().includes(q);
                  }
                  // date mode — match against human-readable date string
                  const dateStr = conv.updated_at
                    ? new Date(conv.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                    : '';
                  return dateStr.toLowerCase().includes(q);
                })
                .map((conv) => {
                const isChecked = selected.includes(conv.uuid);
                return (
                  <label
                    key={conv.uuid}
                    className={`conv-item ${isChecked ? 'conv-item--checked' : ''}`}
                    onMouseEnter={() => handleConvMouseEnter(conv.uuid)}
                    onMouseLeave={() => handleConvMouseLeave(conv.uuid)}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleCheck(conv.uuid)}
                    />
                    <span className="conv-info">
                      <span className="conv-name">{conv.name || '(Untitled conversation)'}</span>
                      {conv.updated_at && (
                        <span className="conv-date">{relativeDate(conv.updated_at)}</span>
                      )}
                    </span>
                    {/* Inline preview — shown on hover */}
                    {(() => {
                      const preview = previewCache.get(conv.uuid);
                      const isHov   = hoveredConvId === conv.uuid;
                      if (!isHov || preview == null) return null;
                      return (
                        <div className="conv-preview conv-preview--visible">
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
                          {preview === 'error' && (
                            <div className="conv-preview-msg">
                              <div className="conv-preview-text" style={{ opacity: 0.5 }}>Couldn't load preview</div>
                            </div>
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
                  </label>
                );
              })}
            </div>

            <div className="density-row">
              <span className="density-label">Output Form</span>
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

            <div className="merge-bar">
              <span className={`sel-count ${selected.length === 2 ? 'sel-count-ready' : ''}`}>
                {selected.length === 2
                  ? '✓ 2 selected'
                  : `${selected.length} / 2 selected`}
              </span>
              <button
                className="btn btn--primary"
                disabled={selected.length !== 2}
                title={selected.length !== 2 ? `Select ${2 - selected.length} more conversation${selected.length === 1 ? '' : 's'}` : 'Merge selected conversations'}
                onClick={handleMerge}
              >
                Merge
              </button>
            </div>
          </>
        )}

        {/* MERGING */}
        {phase === 'merging' && (
          <div className="merging-screen">
            <div className="pixel-merger">
              <div className="pm-bubble pm-bubble--left">
                <div className="pm-tail pm-tail--left" />
              </div>
              <div className="pm-bubble pm-bubble--right">
                <div className="pm-tail pm-tail--right" />
              </div>
              <div className="pm-bubble--merged">
                <svg width="48" height="36" viewBox="-1 -1 13 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 0 H9 V2 H11 V4 H9 V8 H7 V6 H4 V8 H2 V4 H0 V2 H2 Z" fill="#c07151" stroke="white" strokeWidth="0.5" strokeLinejoin="miter" />
                  <rect x="3" y="2.5" width="1" height="1" fill="black" />
                  <rect x="7" y="2.5" width="1" height="1" fill="black" />
                </svg>
              </div>
            </div>
            <span className="merging-status">Status: {statusMsg}</span>
          </div>
        )}

        {/* DONE */}
        {phase === 'done' && (
          <div className="banner banner--ok">
            Merged! Opening new chat…
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <>
            <div className="banner banner--err">{errorMsg}</div>
            <button className="btn btn--ghost btn--full" onClick={() => setPhase('idle')}>
              Retry
            </button>
          </>
        )}

      </main>
    </div>
  );
}

function relativeDate(isoString) {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diff = new Date(isoString) - Date.now(); // negative = in the past
  const seconds = diff / 1000;
  const minutes = seconds / 60;
  const hours   = minutes / 60;
  const days    = hours / 24;
  const weeks   = days / 7;
  const months  = days / 30.4;
  const years   = days / 365;

  if (Math.abs(years)  >= 1) return rtf.format(Math.round(years),   'year');
  if (Math.abs(months) >= 1) return rtf.format(Math.round(months),  'month');
  if (Math.abs(weeks)  >= 1) return rtf.format(Math.round(weeks),   'week');
  if (Math.abs(days)   >= 1) return rtf.format(Math.round(days),    'day');
  if (Math.abs(hours)  >= 1) return rtf.format(Math.round(hours),   'hour');
  return rtf.format(Math.round(minutes), 'minute');
}

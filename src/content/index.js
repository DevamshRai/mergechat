/**
 * MergeChat — Content Script
 *
 * Injected into every https://claude.ai/* page.
 * Runs in an isolated JS context. The browser automatically sends claude.ai
 * cookies with every fetch(), so all requests are authenticated.
 *
 * Handles 6 message types sent by the background service worker via
 * chrome.tabs.sendMessage(). Each returns { ok: true, data } or { ok: false, error }.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(id) { return typeof id === 'string' && UUID_RE.test(id); }

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (_sender.id !== chrome.runtime.id) return; // reject messages from other extensions
  handleMessage(message).then(sendResponse).catch((err) => {
    sendResponse({ ok: false, error: err.message || String(err) });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {

    case 'GET_ORG_ID': {
      const res = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
      if (!res.ok) throw new Error(`organizations API returned ${res.status}`);
      const orgs = await res.json();
      if (!orgs || orgs.length === 0) throw new Error('No organizations found');
      return { ok: true, data: orgs[0].uuid };
    }

    case 'PING':
      return { ok: true };

    case 'GET_CONVERSATIONS': {
      const { orgId } = message;
      if (!isUuid(orgId)) throw new Error('Invalid orgId');
      const res = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations?limit=200`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`conversations API returned ${res.status}`);
      const data = await res.json();
      // API may return array directly or wrapped in a key
      const list = Array.isArray(data) ? data : (Array.isArray(data.conversations) ? data.conversations : []);
      return { ok: true, data: list };
    }

    case 'GET_TRANSCRIPT': {
      const { orgId, convId } = message;
      if (!isUuid(orgId) || !isUuid(convId)) throw new Error('Invalid orgId or convId');
      const res = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`transcript API returned ${res.status}`);
      const data = await res.json();
      return { ok: true, data };
    }

    case 'CREATE_CONVERSATION': {
      const { orgId } = message;
      if (!isUuid(orgId)) throw new Error('Invalid orgId');
      const res = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: message.name || '' }),
        }
      );
      if (!res.ok) throw new Error(`create conversation API returned ${res.status}`);
      const data = await res.json();
      return { ok: true, data };
    }

    case 'SEND_MESSAGE': {
      const { orgId, convId, text } = message;
      if (!isUuid(orgId) || !isUuid(convId)) throw new Error('Invalid orgId or convId');
      const res = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}/completion`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: text,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            attachments: [],
            files: [],
          }),
        }
      );
      if (!res.ok) throw new Error(`completion API returned ${res.status}`);

      // Collect SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (!done) {
          buffer += decoder.decode(value, { stream: true });
        } else {
          // Flush any remaining bytes when the stream closes
          buffer += decoder.decode();
        }
        const lines = buffer.split('\n');
        buffer = done ? '' : lines.pop(); // keep incomplete last line unless stream is done
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') continue;
          try {
            const event = JSON.parse(raw);
            if (typeof event.completion === 'string') {
              fullText += event.completion;
            }
          } catch {
            // Ignore malformed lines
          }
        }
        if (done) break;
      }

      return { ok: true, data: fullText };
    }

    case 'DELETE_CONVERSATION': {
      const { orgId, convId } = message;
      if (!isUuid(orgId) || !isUuid(convId)) throw new Error('Invalid orgId or convId');
      const res = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}`,
        { method: 'DELETE', credentials: 'include' }
      );
      // 204 No Content is success; non-2xx is an error but we fire-and-forget anyway
      return { ok: res.ok };
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}

// Uses Chrome DevTools Protocol input so Google Docs receives browser-level text input.
const sessions = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'essay-typer-background') return;
  if (msg.action === 'start') {
    startTyping(msg).then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'pause') {
    const s = sessions.get(msg.tabId);
    if (s) { s.paused = true; clearTimeout(s.timer); }
    sendResponse({ ok: !!s }); return;
  }
  if (msg.action === 'resume') {
    const s = sessions.get(msg.tabId);
    if (s) { s.paused = false; scheduleNext(msg.tabId); }
    sendResponse({ ok: !!s }); return;
  }
  if (msg.action === 'stop') {
    stopTyping(msg.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function startTyping(msg) {
  const tabId = msg.tabId;
  if (!Number.isInteger(tabId)) throw new Error('No Google Docs tab selected.');
  await stopTyping(tabId);
  const text = String(msg.text || '');
  if (!text.trim()) throw new Error('Paste an essay first.');
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
  } catch (e) {
    throw new Error('Chrome could not attach to the document. Close DevTools for this tab and try again.');
  }
  const state = {
    text, pos: 0, mode: msg.mode || 'human',
    baseDelay: Number.isFinite(Number(msg.baseDelay)) ? Math.max(5, Number(msg.baseDelay)) : 15,
    variation: Number.isFinite(Number(msg.variation)) ? Number(msg.variation) : 0,
    paused: false, timer: null, started: false, nextDue: null,
  };
  sessions.set(tabId, state);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });
  // A short delay lets the user return to the document after pressing Start.
  state.nextDue = Date.now() + (Number(msg.startDelay) || 2500);
  state.timer = setTimeout(() => {
    const current = sessions.get(tabId);
    if (!current) return;
    current.nextDue = Date.now() + delayFor(current, current.text[current.pos] || '');
    scheduleNext(tabId);
  }, Number(msg.startDelay) || 2500);
}

function delayFor(s, char) {
  const d = Math.max(5, s.baseDelay);
  if (s.mode === 'robot') return Math.round(d);
  if (s.mode === 'burst') {
    // Burst mode is intentionally quick, with occasional longer gaps.
    return Math.max(5, Math.round(Math.random() < 0.04 ? d * 2.5 : d * 0.5));
  }

  // Human mode: variation is the only source of timing randomness. At 0%,
  // the interval stays fixed (punctuation does not secretly slow it down).
  const variation = Math.max(0, Math.min(100, s.variation)) / 100;
  const randomized = d * (1 + (Math.random() * 2 - 1) * variation);
  let adjusted = randomized;
  if (variation > 0 && '.!?'.includes(char)) adjusted += d * 0.5 * variation;
  else if (variation > 0 && ',;:'.includes(char)) adjusted += d * 0.2 * variation;
  if (variation > 0 && Math.random() < 0.005 * variation) adjusted += d * variation;
  return Math.max(5, Math.round(adjusted));
}

async function insertChar(tabId, char) {
  if (char === '\n') {
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'char', key: 'Enter', text: '\n', unmodifiedText: '\n', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  } else {
    await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: char });
  }
}

function scheduleNext(tabId) {
  const s = sessions.get(tabId);
  if (!s || s.paused) return;
  if (s.pos >= s.text.length) {
    chrome.runtime.sendMessage({ action: 'done', tabId, total: s.text.length }).catch(() => {});
    stopTyping(tabId);
    return;
  }
  const char = s.text[s.pos];
  // Schedule against a target timeline rather than adding the CDP command's
  // execution time to every character. This makes the selected speed steadier.
  const wait = Math.max(0, (s.nextDue || Date.now()) - Date.now());
  s.timer = setTimeout(async () => {
    const current = sessions.get(tabId);
    if (!current || current.paused) return;
    try {
      await insertChar(tabId, char);
      current.pos++;
      if (current.pos % 5 === 0 || current.pos === current.text.length) {
        chrome.runtime.sendMessage({ action: 'progress', tabId, pos: current.pos, total: current.text.length }).catch(() => {});
      }
      if (current.pos < current.text.length) {
        // Keep an absolute target timeline. If a command runs late, don't add its
        // latency to every following character; this preserves the selected speed.
        current.nextDue = (current.nextDue || Date.now()) + delayFor(current, current.text[current.pos]);
      }
      scheduleNext(tabId);
    } catch (e) {
      chrome.runtime.sendMessage({ action: 'error', tabId, message: 'Typing stopped: ' + (e.message || 'Google Docs did not accept input.') }).catch(() => {});
      stopTyping(tabId);
    }
  }, wait);
}

async function stopTyping(tabId, detach = true) {
  const s = sessions.get(tabId);
  if (s) { clearTimeout(s.timer); sessions.delete(tabId); }
  if (detach) {
    try { await chrome.debugger.detach({ tabId }); } catch (_) {}
  }
}

chrome.debugger.onDetach.addListener(source => {
  if (source.tabId != null) {
    const s = sessions.get(source.tabId);
    if (s) clearTimeout(s.timer);
    sessions.delete(source.tabId);
    chrome.runtime.sendMessage({ action: 'error', tabId: source.tabId, message: 'Chrome detached the typing session. Press Start to try again.' }).catch(() => {});
  }
});

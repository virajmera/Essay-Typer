/**
 * Essay Typer – Content Script
 * 
 * Google Docs renders inside a canvas-like iframe. We find the correct
 * event target by looking for the .docs-texteventtarget-iframe, then
 * dispatching InputEvents directly to its body.
 */

let typingState = null;

// ── Message listener ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'start') {
    stopTyping();
    typingState = {
      text: msg.text,
      pos: 0,
      mode: msg.mode,
      baseDelay: msg.baseDelay,
      variation: msg.variation,
      paused: false,
      timer: null,
    };
    sendResponse({ ok: true });

    // Small delay to let user land on the doc after tab switch
    setTimeout(scheduleNext, Number.isFinite(msg.startDelay) ? msg.startDelay : 800);
  }

  if (msg.action === 'pause' && typingState) {
    typingState.paused = true;
    clearTimeout(typingState.timer);
  }

  if (msg.action === 'resume' && typingState) {
    typingState.paused = false;
    scheduleNext();
  }

  if (msg.action === 'stop') {
    stopTyping();
  }

  return true;
});

function stopTyping() {
  if (typingState) {
    clearTimeout(typingState.timer);
    typingState = null;
  }
}

// ── Find the correct event target inside Google Docs ──────────
function getDocTarget() {
  // Method 1: the hidden key-capture iframe Google Docs uses
  const iframe = document.querySelector('.docs-texteventtarget-iframe');
  if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
    return iframe.contentDocument.body;
  }

  // Method 2: any focused editable iframe
  const iframes = document.querySelectorAll('iframe');
  for (const f of iframes) {
    try {
      const doc = f.contentDocument;
      if (doc && doc.body) {
        const el = doc.activeElement;
        if (el && (el.isContentEditable || el.tagName === 'BODY')) {
          return doc.body;
        }
      }
    } catch(e) {}
  }

  // Method 3: fallback to main document body
  return document.body;
}

// ── Scheduling ────────────────────────────────────────────────
function scheduleNext() {
  if (!typingState || typingState.paused) return;

  if (typingState.pos >= typingState.text.length) {
    chrome.runtime.sendMessage({ action: 'done', total: typingState.text.length });
    typingState = null;
    return;
  }

  const char = typingState.text[typingState.pos];
  const delay = getDelay(char);

  typingState.timer = setTimeout(() => {
    typeChar(char);
    typingState.pos++;

    if (typingState.pos % 5 === 0 || typingState.pos === typingState.text.length) {
      chrome.runtime.sendMessage({
        action: 'progress',
        pos: typingState.pos,
        total: typingState.text.length,
      });
    }

    scheduleNext();
  }, delay);
}

// ── Delay logic ───────────────────────────────────────────────
function getDelay(char) {
  const { mode, baseDelay, variation } = typingState;
  if (mode === 'robot') return baseDelay;

  let d = baseDelay;
  const varAmt = (variation / 100) * baseDelay;

  if (mode === 'human') {
    d += (Math.random() * 2 - 1) * varAmt;
    if ('.!?'.includes(char))      d += baseDelay * 3.5;
    else if (',;:'.includes(char)) d += baseDelay * 1.8;
    else if (char === '\n')        d += baseDelay * 5;
    else if (char === ' ')         d += baseDelay * 0.4;
    if (Math.random() < 0.02)     d += baseDelay * 8;
  }

  if (mode === 'burst') {
    if (Math.random() < 0.04) d += baseDelay * 18;
    else d = baseDelay * 0.25 + Math.random() * baseDelay * 0.35;
  }

  return Math.max(10, Math.round(d));
}

// ── Type a single character ───────────────────────────────────
function typeChar(char) {
  const target = getDocTarget();

  try { target.focus(); } catch (e) {}

  if (char === '\n') {
    ['keydown', 'keypress', 'keyup'].forEach(type => {
      target.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true,
      }));
    });
    return;
  }

  // Works for many editable surfaces; Google Docs may reject synthetic input.
  try {
    const doc = target.ownerDocument || document;
    if (doc.execCommand('insertText', false, char)) return;
  } catch (e) {}

  try {
    target.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, composed: true,
      data: char, inputType: 'insertText',
    }));
    target.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: false, composed: true,
      data: char, inputType: 'insertText',
    }));
  } catch (e) {}
}

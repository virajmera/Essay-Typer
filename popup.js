let mode = 'robot';
let baseDelay = 15;
let speedLevel = 85;
let variation = 0;
let startTime = null;
let elapsedInterval = null;
let isTyping = false;
let activeTabId = null;

// ── UI helpers ────────────────────────────────────────────────
function setStatus(s) {
  const el = document.getElementById('statusTag');
  const map = {
    ready:   ['Ready',   'tag-ready'],
    waiting: ['Waiting', 'tag-waiting'],
    typing:  ['Typing',  'tag-typing'],
    paused:  ['Paused',  'tag-paused'],
    done:    ['Done',    'tag-done'],
    error:   ['Error',   'tag-error'],
  };
  el.className = map[s][1];
  el.textContent = map[s][0];
}

function setMsg(msg, isError = false) {
  const el = document.getElementById('msgBox');
  el.textContent = msg;
  el.style.color = isError ? 'var(--red)' : 'var(--text-dim)';
}

function updateSpeed() {
  // The slider is intuitive: moving right means faster, so the per-character
  // interval gets shorter. Quadratic mapping gives useful control at both ends.
  speedLevel = +document.getElementById('speedSlider').value;
  const fraction = (100 - speedLevel) / 99;
  baseDelay = Math.round(5 + 245 * fraction * fraction);
  document.getElementById('speedVal').textContent = speedLevel + '%';
}

function updateVari() {
  variation = +document.getElementById('variSlider').value;
  document.getElementById('variVal').textContent = variation + '%';
}

function setMode(m) {
  mode = m;
  ['Human', 'Robot', 'Burst'].forEach(n => {
    document.getElementById('mode' + n).classList.remove('active');
  });
  document.getElementById('mode' + m.charAt(0).toUpperCase() + m.slice(1)).classList.add('active');
}

function updateStats(pos, total) {
  document.getElementById('statChars').textContent = pos;
  document.getElementById('statWords').textContent =
    pos > 0 ? essayText().slice(0, pos).trim().split(/\s+/).filter(Boolean).length : 0;
  const pct = total ? Math.round((pos / total) * 100) : 0;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = pos + ' / ' + total + ' chars';
  document.getElementById('progressPct').textContent = pct + '%';
}

function essayText() {
  return document.getElementById('essayInput').value;
}

function startElapsed() {
  startTime = Date.now();
  elapsedInterval = setInterval(() => {
    const s = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    document.getElementById('statTime').textContent = m + ':' + String(sec).padStart(2, '0');
  }, 500);
}

function stopElapsed() {
  clearInterval(elapsedInterval);
  elapsedInterval = null;
}

// ── Button actions ────────────────────────────────────────────
async function startTyping() {
  const text = essayText();
  if (!text.trim()) { setMsg('Paste an essay first.', true); return; }
  setMsg('Connecting to Google Docs…');
  setStatus('waiting');
  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnPause').disabled = true;
  document.getElementById('btnStop').disabled = false;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://docs.google.com/document/*' });
    if (!tabs.length) {
      setMsg('No Google Doc tab found. Open one first.', true);
      setStatus('error'); resetButtons(); return;
    }
    const tab = tabs.find(t => t.active) || tabs[0];
    activeTabId = tab.id;
    // Use the background service worker + Chrome DevTools Protocol. The old
    // version sent synthetic DOM events from the content script, which Docs ignores.
    const response = await chrome.runtime.sendMessage({
      target: 'essay-typer-background', action: 'start', tabId: tab.id,
      text, mode, baseDelay, variation, startDelay: 2200
    });
    if (!response || !response.ok) throw new Error(response?.error || 'Chrome did not start the typing session.');
    isTyping = true;
    setStatus('typing');
    setMsg('Typing started. Watch the purple progress bar.');
    document.getElementById('btnPause').disabled = false;
    startElapsed();
  } catch (err) {
    setMsg(err.message || 'Could not start typing. Reload the extension and Google Doc.', true);
    setStatus('error'); resetButtons();
  }
}

async function pauseTyping() {
  if (activeTabId == null) return;
  const isPaused = document.getElementById('btnPause').textContent.includes('Resume') || document.getElementById('btnPause').textContent.includes('▶');
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'essay-typer-background', action: isPaused ? 'resume' : 'pause', tabId: activeTabId
    });
    if (!response?.ok) throw new Error('No active typing session.');
    if (isPaused) {
      setStatus('typing'); setMsg('Typing in progress…');
      document.getElementById('btnPause').textContent = '⏸'; startElapsed();
    } else {
      setStatus('paused'); setMsg('Paused. Press resume to continue.');
      document.getElementById('btnPause').textContent = '▶ Resume'; stopElapsed();
    }
  } catch (err) { setMsg(err.message, true); }
}

async function stopTyping() {
  if (activeTabId != null) {
    try { await chrome.runtime.sendMessage({ target: 'essay-typer-background', action: 'stop', tabId: activeTabId }); } catch (_) {}
  }
  stopElapsed(); setStatus('ready'); setMsg(''); resetButtons();
  updateStats(0, 0); document.getElementById('statTime').textContent = '0:00';
}

function resetButtons() {
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnPause').disabled = true;
  document.getElementById('btnPause').textContent = '⏸';
  document.getElementById('btnStop').disabled = true;
  isTyping = false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Listen for progress updates from content script ───────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target === 'essay-typer-background' || (activeTabId != null && msg.tabId != null && msg.tabId !== activeTabId)) return;
  if (msg.action === 'progress') {
    updateStats(msg.pos, msg.total);
  }
  if (msg.action === 'done') {
    stopElapsed();
    setStatus('done');
    setMsg('Typing finished. Check that the text is visible in your document.');
    resetButtons();
    activeTabId = null;
    updateStats(msg.total, msg.total);
  }
  if (msg.action === 'error') {
    stopElapsed();
    setStatus('error');
    setMsg(msg.message, true);
    resetButtons();
    activeTabId = null;
  }
});

// ── Wire up all event listeners (no inline onclick allowed in extensions) ──
document.addEventListener('DOMContentLoaded', () => {
  // Buttons
  document.getElementById('btnStart').addEventListener('click', startTyping);
  document.getElementById('btnPause').addEventListener('click', pauseTyping);
  document.getElementById('btnStop').addEventListener('click', stopTyping);

  // Mode buttons
  document.getElementById('modeHuman').addEventListener('click', () => setMode('human'));
  document.getElementById('modeRobot').addEventListener('click', () => setMode('robot'));
  document.getElementById('modeBurst').addEventListener('click', () => setMode('burst'));

  // Sliders
  document.getElementById('speedSlider').addEventListener('input', updateSpeed);
  document.getElementById('variSlider').addEventListener('input', updateVari);

  // Robot is the default: steady timing, with variation controlled separately in Human mode.
  setMode('robot');
  updateSpeed();
  updateVari();
});

ESSAY TYPER FOR GOOGLE DOCS — Chrome Extension
===============================================

INSTALL (takes 30 seconds):
1. Open Chrome and go to:  chrome://extensions
2. Toggle ON "Developer mode" (top-right corner)
3. Click "Load unpacked"
4. Select this folder (essay-typer-extension)
5. The extension icon appears in your toolbar ✓

HOW TO USE:
1. Click the Essay Typer icon in your toolbar
2. Paste your essay into the text box
3. Set your speed and typing mode
4. Open a Google Doc in another tab
5. Click in the Doc where you want typing to begin
6. Click ▶ Start — the extension switches to the Doc tab and waits 3 seconds
7. Watch it type!

MODES:
- Human  → natural rhythm with pauses at punctuation and occasional hesitations
- Robot  → perfectly even, mechanical timing
- Burst  → fast bursts with longer random pauses between them

CONTROLS:
- Speed slider  → base delay between keystrokes (10ms = fast, 250ms = slow)
- Variation     → how much randomness to add to timing

NOTE: Keep the Google Doc tab open and don't click away while typing is in progress.
      Google Docs may ignore synthetic keystrokes in some versions; reliable insertion
      into every Docs editor is not guaranteed.
      You can pause/resume at any time from the popup.


FIXED VERSION NOTES
- This version uses Chrome's browser-level input interface because Google Docs often ignores synthetic content-script events.
- Chrome will show a debugger-access warning when this extension starts typing; that permission is required for browser-level input.
- Open a Google Doc, click the exact insertion point in the document, then start typing. Keep the document tab open.
- If Chrome says debugging is already in use, close DevTools for that tab and retry.


FIXED VERSION NOTES
- This version sends browser-level text input through Chrome DevTools Protocol.
- Chrome displays a debugger permission warning because this input method requires it.
- Click inside the Google Docs page at the insertion point before pressing Start.
- The purple accent and progress bar are the new theme.
- Test with a short sentence first. Google Docs/Chrome behavior can vary.


SPEED NOTES
- Robot mode is the default and aims for a steady interval per character.
- The speed slider sets the target delay in milliseconds per character. Lower is faster.
- Human mode intentionally adds punctuation pauses and timing variation.
- Actual speed still depends on Chrome, Google Docs, and system load.


Speed slider update: The Speed slider is now 1–100%, with higher values meaning faster typing. It maps to a 250 ms to 5 ms target interval per character. Robot mode uses a steady interval. Human mode uses the Variation slider; 0% means no added timing variation. Scheduling uses an absolute timeline to avoid adding command latency to every character. Browser/Google Docs processing still places a practical limit on maximum speed.

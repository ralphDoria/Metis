// All CSS for the in-page overlay lives here as a string so the content
// script can inject it into a shadow root with one <style> tag. Includes
// minimal layout for BrainView's class names since the webapp's stylesheet
// isn't available in the extension context.

export const OVERLAY_CSS = `
:host { all: initial; font-family: 'Inter', system-ui, sans-serif; }
* { box-sizing: border-box; }

.metis-overlay__panel {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(160deg, rgba(11,11,18,0.92) 0%, rgba(5,5,5,0.86) 100%);
  border: 1px solid rgba(138, 43, 226, 0.35);
  box-shadow: 0 18px 60px -12px rgba(138, 43, 226, 0.45), 0 4px 24px -6px rgba(0,0,0,0.6);
  color: #f5f3ff;
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 220ms ease, transform 220ms ease;
  max-height: calc(100vh - 48px);
  overflow: hidden;
}
.metis-overlay__panel--show { opacity: 1; transform: translateY(0); }

.metis-overlay__brain-wrap {
  width: 100%;
  height: 240px;
  border-radius: 14px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 40%, rgba(138,43,226,0.18) 0%, rgba(0,0,0,0) 70%);
  border: 1px solid rgba(255,255,255,0.05);
  position: relative;
}

.metis-overlay__header {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 4px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.metis-overlay__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(245,243,255,0.4); box-shadow: none;
}
.metis-overlay__dot--recording { background: #ef4444; box-shadow: 0 0 0 4px rgba(239,68,68,0.22); animation: metis-pulse 1.2s ease-in-out infinite; }
.metis-overlay__dot--analyzing { background: #fbbf24; box-shadow: 0 0 0 4px rgba(251,191,36,0.22); animation: metis-pulse 1.6s ease-in-out infinite; }

.metis-overlay__badge-text {
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(245,243,255,0.7); flex: 1;
}
.metis-overlay__brand {
  font-size: 12px; font-weight: 600;
  color: rgba(245,243,255,0.85);
  letter-spacing: 0.04em;
}

.metis-overlay__list {
  display: flex; flex-direction: column; gap: 8px;
  max-height: calc(100vh - 360px); overflow-y: auto; padding-right: 2px;
}
.metis-overlay__list::-webkit-scrollbar { width: 6px; }
.metis-overlay__list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 999px; }
.metis-overlay__empty {
  font-size: 12px;
  color: rgba(245,243,255,0.55);
  padding: 6px 4px;
}

.metis-overlay__card {
  border-radius: 12px; padding: 10px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  animation: metis-slidein 280ms ease;
}
.metis-overlay__card--high { border-color: rgba(239,68,68,0.45); background: rgba(239,68,68,0.08); }
.metis-overlay__card--elevated { border-color: rgba(255,140,0,0.4); background: rgba(255,140,0,0.07); }
.metis-overlay__card--failed { border-color: rgba(245,243,255,0.12); background: rgba(255,255,255,0.03); opacity: 0.75; }

.metis-overlay__card-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 4px;
}
.metis-overlay__card-label {
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(245,243,255,0.55);
}
.metis-overlay__card-action {
  font-size: 10px; padding: 2px 6px; border-radius: 999px;
  background: rgba(255,255,255,0.06); color: rgba(245,243,255,0.7);
}
.metis-overlay__card-action--skipped { background: rgba(160,107,240,0.18); color: #d6c2ff; }
.metis-overlay__card-action--failed { background: rgba(239,68,68,0.18); color: #fecaca; }
.metis-overlay__card-title { font-size: 13px; font-weight: 600; margin: 2px 0; }
.metis-overlay__card-feedback { font-size: 12px; color: rgba(245,243,255,0.72); line-height: 1.35; }
.metis-overlay__meter { margin-top: 8px; height: 3px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
.metis-overlay__meter > span { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, #a06bf0, #f472b6, #ff8c00); transition: width 320ms ease; }

/* Minimal styles for BrainView's classes — the webapp's full CSS isn't
   available inside the extension, so we provide just enough so the canvas
   renders at the wrap's full size and the slider sits at the bottom. */
.metis-brainview {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  position: relative;
}
.metis-brainview__canvas-wrap {
  flex: 1;
  width: 100%;
  position: relative;
  min-height: 0;
}
.metis-brainview__canvas-wrap canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
.metis-brainview__empty {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: rgba(245,243,255,0.55);
  letter-spacing: 0.08em; text-transform: uppercase;
  pointer-events: none;
}
.metis-brainview__controls {
  display: none; /* compact in-overlay: skip slider chrome */
}
.metis-brainview__legend { display: none; }
.metis-error { color: #fecaca; font-size: 11px; padding: 6px; }

@keyframes metis-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.6; transform: scale(1.18); }
}
@keyframes metis-slidein {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
`

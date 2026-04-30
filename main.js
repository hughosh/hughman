// Fluid-smoke ASCII hero that idles as the word "HUGH" and disperses on input.
// Forked from https://somnai-dreams.github.io/pretext-demos/fluid-smoke.{html,js}
// — recolored neon-pink, with a letterform mask blended into the density field.

import { prepareWithSegments } from "./vendor/pretext.js";

// ── constants ────────────────────────────────────────────────────────────────
const FONT_SIZE = 12;
const LINE_HEIGHT = 14;
const PROP_FAMILY = 'Georgia, Palatino, "Times New Roman", serif';
const CHARSET = " .,:;!+-=*#@%&abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const WEIGHTS = [300, 500, 800];
const FONT_STYLES = ["normal", "italic"];

const NARROW_VIEWPORT = 600;
let MAX_COLS = window.innerWidth < NARROW_VIEWPORT ? 120 : 220;
let MAX_ROWS = 90;

const WORD = "HUGH";
const WORD_FONT = '900 SCALEpx Helvetica, "Helvetica Neue", Arial, sans-serif';
const WORD_TARGET_WIDTH = 1.00; // fraction of grid width
const WORD_LETTER_SPACING = 0.08; // extra gap between letters, as fraction of mean letter width
const WORD_VERTICAL_FILL = 0.95; // max font size as fraction of grid height

const ATTRACT_K = 0.22;
// Activity drives dispersal: pointer/touch/gyroscope motion adds activity,
// idle decays it. Activity 0 → letters formed; 1 → pure smoke.
// The deadband keeps small/incidental mouse moves from disturbing HUGH —
// dispersal only kicks in past ACTIVITY_DEADBAND.
const POINTER_SENSITIVITY = 0.0018; // per CSS pixel of movement
const MOTION_SENSITIVITY = 0.025; // per m/s² of device acceleration
const ACTIVITY_DECAY_PER_SEC = 0.06; // fraction remaining after 1 s idle
const ACTIVITY_DEADBAND = 0.18;

// Directional mouse impulse: injects a transient velocity vector at the
// pointer position so smoke is shoved in the direction of motion.
const IMPULSE_RADIUS_CELLS = 14;     // gaussian falloff radius
const IMPULSE_STRENGTH = 1.2;        // multiplier on raw cell-space velocity
const IMPULSE_DECAY_PER_SEC = 0.02;  // fraction remaining after 1 s idle

// ── DOM ──────────────────────────────────────────────────────────────────────
const artEl = document.getElementById("art");
const statsEl = document.getElementById("stats");
const showStats = new URLSearchParams(location.search).has("stats");
if (showStats) statsEl.hidden = false;

// ── palette ──────────────────────────────────────────────────────────────────
const bCvs = document.createElement("canvas");
bCvs.width = bCvs.height = 28;
const bCtx = bCvs.getContext("2d", { willReadFrequently: true });

function estimateBrightness(ch, font) {
  bCtx.clearRect(0, 0, 28, 28);
  bCtx.font = font;
  bCtx.fillStyle = "#fff";
  bCtx.textBaseline = "middle";
  bCtx.fillText(ch, 1, 14);
  const d = bCtx.getImageData(0, 0, 28, 28).data;
  let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i];
  return sum / (255 * 784);
}

let palette = [];
let avgCharW = 0;
let aspect = 0;
let aspect2 = 0;
const spaceW = FONT_SIZE * 0.27;

function buildPalette() {
  palette = [];
  for (const style of FONT_STYLES) {
    for (const weight of WEIGHTS) {
      const font = `${style === "italic" ? "italic " : ""}${weight} ${FONT_SIZE}px ${PROP_FAMILY}`;
      for (const ch of CHARSET) {
        if (ch === " ") continue;
        const p = prepareWithSegments(ch, font);
        const width = p.widths.length > 0 ? p.widths[0] : 0;
        if (width <= 0) continue;
        palette.push({ char: ch, weight, style, width, brightness: estimateBrightness(ch, font) });
      }
    }
  }
  const maxB = Math.max(...palette.map((p) => p.brightness));
  if (maxB > 0) for (const p of palette) p.brightness /= maxB;
  palette.sort((a, b) => a.brightness - b.brightness);
  avgCharW = palette.reduce((s, p) => s + p.width, 0) / palette.length;
  aspect = avgCharW / LINE_HEIGHT;
  aspect2 = aspect * aspect;
}

function findBest(targetB, targetW) {
  let lo = 0, hi = palette.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (palette[mid].brightness < targetB) lo = mid + 1;
    else hi = mid;
  }
  let bestScore = Infinity, best = palette[lo];
  for (let i = Math.max(0, lo - 15); i < Math.min(palette.length, lo + 15); i++) {
    const p = palette[i];
    const score = Math.abs(p.brightness - targetB) * 2.5 + Math.abs(p.width - targetW) / targetW;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

function esc(c) {
  if (c === "&") return "&amp;";
  if (c === "<") return "&lt;";
  if (c === ">") return "&gt;";
  return c;
}

function wCls(w, s) {
  const wc = w === 300 ? "w3" : w === 500 ? "w5" : "w8";
  return s === "italic" ? wc + " it" : wc;
}

// ── letterform mask ──────────────────────────────────────────────────────────
// Render WORD onto a canvas sized so 1 canvas pixel ≈ 1 final-display CSS
// pixel (cols × avgCharW wide, rows × LINE_HEIGHT tall). That preserves the
// natural letter aspect after downsampling — without it, square pixels in a
// cols×rows canvas turn into tall-skinny cells on screen and "HUGH" comes out
// as illegible vertical bars. Letters are placed individually with a gap so
// they read as separate glyphs even at low grid resolutions.
function buildMask(cols, rows) {
  const cellW = avgCharW;
  const cellH = LINE_HEIGHT;
  const W = Math.max(1, Math.round(cols * cellW));
  const H = Math.max(1, Math.round(rows * cellH));
  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const letters = WORD.split("");
  // On narrow (portrait) viewports the single horizontal row leaves HUGH
  // tiny and most of the screen blank. Switch to a 2×2 grid so each letter
  // gets roughly 3× the area.
  const portrait = W / H < 0.85;
  const layout = portrait
    ? { cols: 2, rows: 2, slots: [[0, 0], [1, 0], [0, 1], [1, 1]] }
    : { cols: letters.length, rows: 1, slots: letters.map((_, i) => [i, 0]) };

  const slotW = W / layout.cols;
  const slotH = H / layout.rows;
  const targetLetterW = slotW * WORD_TARGET_WIDTH;
  const maxSize = Math.floor(slotH * WORD_VERTICAL_FILL);
  const gapFrac = WORD_LETTER_SPACING; // applied between letters within a row

  // Pick a font size so each letter fills ~targetLetterW horizontally without
  // exceeding maxSize vertically. Iterate to converge.
  let size = Math.min(maxSize, Math.floor(slotH * 0.8));
  let widths = [];
  for (let iter = 0; iter < 4; iter++) {
    ctx.font = WORD_FONT.replace("SCALE", size);
    widths = letters.map((l) => ctx.measureText(l).width);
    const meanW = widths.reduce((a, b) => a + b, 0) / widths.length;
    if (meanW <= 0) break;
    // Effective per-letter advance includes a slice of the gap.
    const advance = meanW * (1 + gapFrac);
    const ratio = targetLetterW / advance;
    if (Math.abs(ratio - 1) < 0.02) break;
    size = Math.max(8, Math.min(maxSize, Math.round(size * ratio)));
  }
  ctx.font = WORD_FONT.replace("SCALE", size);
  widths = letters.map((l) => ctx.measureText(l).width);

  for (let i = 0; i < letters.length; i++) {
    const [col, row] = layout.slots[i];
    const x = (col + 0.5) * slotW - widths[i] / 2;
    const y = (row + 0.5) * slotH;
    ctx.fillText(letters[i], x, y);
  }

  // Downsample by averaging alpha over each cell's [cellW × cellH] block.
  const data = ctx.getImageData(0, 0, W, H).data;
  const mask = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor(r * cellH);
    const y1 = Math.min(H, Math.floor((r + 1) * cellH));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * cellW);
      const x1 = Math.min(W, Math.floor((c + 1) * cellW));
      let sum = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        const rowOff = y * W * 4 + 3;
        for (let x = x0; x < x1; x++) {
          sum += data[rowOff + x * 4];
          count++;
        }
      }
      // Gamma 0.5 sharpens edge cells so outlines stay readable as letters scale up.
      const a = count > 0 ? sum / (255 * count) : 0;
      mask[r * cols + c] = Math.sqrt(a);
    }
  }
  return mask;
}

// ── interaction-driven form factor ───────────────────────────────────────────
// activity ∈ [0, 1]: pointer/touch/gyroscope motion adds, idle decays. The
// scene idles at activity = 0 (HUGH formed) and disperses toward 1 (smoke).
// The impulse vector tracks the latest pointer velocity in grid-cell space
// and is added to the advection field so smoke is shoved in the direction
// of motion (like swatting at a real cloud).
let activity = 0;
let lastPX = null, lastPY = null, lastPTime = null;
const impulse = { c: 0, r: 0, vx: 0, vy: 0 };

function bumpFromPointer(x, y, time) {
  if (!COLS || !ROWS) return; // grid not initialized yet
  const c = (x / window.innerWidth) * COLS;
  const r = (y / window.innerHeight) * ROWS;
  if (lastPX !== null && lastPTime !== null) {
    const dPx = Math.hypot(x - lastPX, y - lastPY);
    activity = Math.min(1, activity + dPx * POINTER_SENSITIVITY);
    const dt = Math.max(1, time - lastPTime);
    // velocity in cells per simulation step (~1/60 s)
    impulse.vx = ((c - impulse.c) / dt) * 16.67;
    impulse.vy = ((r - impulse.r) / dt) * 16.67;
  }
  impulse.c = c;
  impulse.r = r;
  lastPX = x;
  lastPY = y;
  lastPTime = time;
}
window.addEventListener("mousemove", (e) => bumpFromPointer(e.clientX, e.clientY, e.timeStamp));
window.addEventListener("touchmove", (e) => {
  const t = e.touches[0];
  if (t) bumpFromPointer(t.clientX, t.clientY, e.timeStamp);
}, { passive: true });
window.addEventListener("touchend", () => {
  lastPX = lastPY = lastPTime = null;
  impulse.vx = impulse.vy = 0;
});
window.addEventListener("devicemotion", (e) => {
  const a = e.acceleration;
  if (!a) return;
  const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
  activity = Math.min(1, activity + mag * MOTION_SENSITIVITY);
});

// ── simulation ───────────────────────────────────────────────────────────────
let COLS = 0, ROWS = 0;
const rowEls = [];
let density, tempDen;
let mask = new Float32Array(0);

const emitters = [
  { cx: 0.25, cy: 0.4,  orbitR: 0.14, freq: 0.30, phase: 0,   strength: 0.18 },
  { cx: 0.70, cy: 0.35, orbitR: 0.10, freq: 0.25, phase: 2.1, strength: 0.15 },
  { cx: 0.45, cy: 0.65, orbitR: 0.16, freq: 0.35, phase: 4.2, strength: 0.20 },
  { cx: 0.80, cy: 0.60, orbitR: 0.08, freq: 0.40, phase: 1,   strength: 0.14 },
];

const IMPULSE_R2 = IMPULSE_RADIUS_CELLS * IMPULSE_RADIUS_CELLS;
function getVel(c, r, t) {
  const nx = c / COLS, ny = r / ROWS;
  let vx = Math.sin(ny * 6.28 + t * 0.3) * 2
         + Math.cos((nx + ny) * 12.5 + t * 0.55) * 0.7
         + Math.sin(nx * 25 + ny * 18 + t * 0.8) * 0.25;
  let vy = Math.cos(nx * 5 + t * 0.4) * 1.5
         + Math.sin((nx - ny) * 10 + t * 0.4) * 0.8
         + Math.cos(nx * 18 - ny * 25 + t * 0.7) * 0.25;
  vy *= aspect;
  // Mouse impulse: gaussian falloff around pointer cell, scales the recent
  // pointer velocity so smoke advects in the direction the mouse is moving.
  if (impulse.vx !== 0 || impulse.vy !== 0) {
    const dc = c - impulse.c;
    const dr = (r - impulse.r) / aspect;
    const d2 = dc * dc + dr * dr;
    if (d2 < IMPULSE_R2 * 4) {
      const fall = Math.exp(-d2 / IMPULSE_R2);
      vx += impulse.vx * IMPULSE_STRENGTH * fall;
      vy += impulse.vy * IMPULSE_STRENGTH * fall * aspect;
    }
  }
  return [vx, vy];
}

function stepSim(t, f) {
  // Advect: semi-Lagrangian backtrace + bilinear sample.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const [vx, vy] = getVel(c, r, t);
      const sx = Math.max(0, Math.min(COLS - 1.001, c - vx));
      const sy = Math.max(0, Math.min(ROWS - 1.001, r - vy));
      const x0 = sx | 0, y0 = sy | 0;
      const x1 = Math.min(x0 + 1, COLS - 1);
      const y1 = Math.min(y0 + 1, ROWS - 1);
      const fx = sx - x0, fy = sy - y0;
      tempDen[r * COLS + c] =
        density[y0 * COLS + x0] * (1 - fx) * (1 - fy) +
        density[y0 * COLS + x1] * fx * (1 - fy) +
        density[y1 * COLS + x0] * (1 - fx) * fy +
        density[y1 * COLS + x1] * fx * fy;
    }
  }
  [density, tempDen] = [tempDen, density];

  // Diffuse: one Jacobi pass with aspect-corrected vertical neighbors.
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const i = r * COLS + c;
      const avg = (density[i - 1] + density[i + 1]
                + (density[i - COLS] + density[i + COLS]) * aspect2)
                / (2 + 2 * aspect2);
      tempDen[i] = density[i] * 0.92 + avg * 0.08;
    }
  }
  [density, tempDen] = [tempDen, density];

  // Emit: orbital sources. Damped while letters are formed (low activity),
  // full strength while dispersed — keeps idle scene clean, dispersal smoky.
  const boost = 0.4 + 0.6 * (1 - f);
  const spread = 4;
  for (const e of emitters) {
    const ex = (e.cx + Math.cos(t * e.freq + e.phase) * e.orbitR) * COLS;
    const ey = (e.cy + Math.sin(t * e.freq * 0.7 + e.phase) * e.orbitR * 0.8) * ROWS;
    const ec = ex | 0, er = ey | 0;
    const strength = e.strength * boost;
    for (let dr = -spread; dr <= spread; dr++) {
      for (let dc = -spread; dc <= spread; dc++) {
        const rr = er + dr, cc = ec + dc;
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const drScaled = dr / aspect;
          const dist = Math.sqrt(drScaled * drScaled + dc * dc);
          const s = Math.max(0, 1 - dist / (spread + 1));
          density[rr * COLS + cc] = Math.min(1, density[rr * COLS + cc] + s * strength);
        }
      }
    }
  }

  // Global decay.
  for (let i = 0; i < COLS * ROWS; i++) density[i] *= 0.984;

  // Mask attractor: gentle pull toward the letterform; preserves turbulent edges.
  if (f > 0 && mask.length === density.length) {
    const k = f * ATTRACT_K;
    for (let i = 0; i < density.length; i++) {
      density[i] += (mask[i] - density[i]) * k;
    }
  }
}

// ── render ───────────────────────────────────────────────────────────────────
// Centering uses a fixed canvasW = COLS · avgCharW (set once per initGrid).
// That keeps each row's center anchored regardless of how its content varies
// across frames; using max(rowWidths) instead caused the whole grid to reflow
// horizontally whenever density (and therefore character widths) shifted.
function render(now, t) {
  const tcw = window.innerWidth / COLS;
  const rowWidths = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    let html = "", tw = 0;
    for (let c = 0; c < COLS; c++) {
      const b = density[r * COLS + c];
      if (b < 0.025) {
        html += " ";
        tw += spaceW;
      } else {
        const m = findBest(b, tcw);
        const ai = Math.max(1, Math.min(10, Math.round(b * 10)));
        html += `<span class="${wCls(m.weight, m.style)} a${ai}">${esc(m.char)}</span>`;
        tw += m.width;
      }
    }
    rowEls[r].innerHTML = html;
    rowWidths[r] = tw;
  }
  const blockOffset = Math.max(0, (window.innerWidth - canvasW) / 2);
  for (let r = 0; r < ROWS; r++) {
    rowEls[r].style.paddingLeft = blockOffset + (canvasW - rowWidths[r]) / 2 + "px";
  }
}

// ── grid init ────────────────────────────────────────────────────────────────
let canvasW = 0;
function initGrid() {
  COLS = Math.min(MAX_COLS, Math.max(8, Math.floor(window.innerWidth / avgCharW)));
  ROWS = Math.min(MAX_ROWS, Math.max(4, Math.floor(window.innerHeight / LINE_HEIGHT)));
  canvasW = COLS * avgCharW;
  density = new Float32Array(COLS * ROWS);
  tempDen = new Float32Array(COLS * ROWS);
  artEl.innerHTML = "";
  rowEls.length = 0;
  for (let r = 0; r < ROWS; r++) {
    const div = document.createElement("div");
    div.className = "r";
    artEl.appendChild(div);
    rowEls.push(div);
  }
  mask = buildMask(COLS, ROWS);
}

// ── boot ─────────────────────────────────────────────────────────────────────
const startTime = performance.now();
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

await document.fonts.ready;
buildPalette();
initGrid();

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    MAX_COLS = window.innerWidth < NARROW_VIEWPORT
      ? Math.min(100, MAX_COLS)
      : MAX_COLS;
    initGrid();
  }, 150);
});

if (reduceMotion) {
  // Render a single still frame: build a smoke field, then let the attractor
  // settle into the letterform before painting once.
  for (let i = 0; i < 80; i++) stepSim(i * 0.05, 0);
  for (let i = 0; i < 60; i++) stepSim((80 + i) * 0.05, 1);
  render(performance.now(), 0);
} else {
  // FPS adaptation: 60-frame rolling mean of frame deltas.
  // If sustained sub-30fps for 2s, halve grid resolution once.
  const FRAME_WINDOW = 60;
  const frameDeltas = [];
  let lastFrameTime = startTime;
  let lowFpsAccum = 0;
  let degraded = false;

  let fc = 0;
  let lastFps = 0;
  let dispFps = 0;

  function loop(now) {
    const dt = now - lastFrameTime;
    lastFrameTime = now;
    if (frameDeltas.length >= FRAME_WINDOW) frameDeltas.shift();
    frameDeltas.push(dt);
    const meanDt = frameDeltas.reduce((s, x) => s + x, 0) / frameDeltas.length;
    const meanFps = 1000 / meanDt;
    // Conservative adaptation: only halve the grid for genuinely slow devices.
    // Earlier 30 fps / 2 s threshold tripped on desktops at the larger grid
    // and HUGH would visibly shrink a few seconds after load.
    if (!degraded && frameDeltas.length === FRAME_WINDOW && meanFps < 18) {
      lowFpsAccum += dt;
      if (lowFpsAccum >= 5000) {
        degraded = true;
        MAX_COLS = Math.max(60, Math.floor(MAX_COLS * 0.7));
        MAX_ROWS = Math.max(30, Math.floor(MAX_ROWS * 0.7));
        initGrid();
      }
    } else if (meanFps >= 22) {
      lowFpsAccum = 0;
    }

    const t = (now - startTime) / 1000;
    const decay = Math.pow(ACTIVITY_DECAY_PER_SEC, dt / 1000);
    activity *= decay;
    const impDecay = Math.pow(IMPULSE_DECAY_PER_SEC, dt / 1000);
    impulse.vx *= impDecay;
    impulse.vy *= impDecay;
    const eff = Math.max(0, (activity - ACTIVITY_DEADBAND) / (1 - ACTIVITY_DEADBAND));
    const f = 1 - eff;
    stepSim(t, f);
    render(now, t);

    fc++;
    if (showStats && now - lastFps > 500) {
      dispFps = Math.round(fc / ((now - lastFps) / 1000));
      fc = 0;
      lastFps = now;
      statsEl.textContent =
        `${COLS}×${ROWS} | ${palette.length} variants | ${dispFps} fps | act=${activity.toFixed(2)}`
        + (degraded ? " | degraded" : "");
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

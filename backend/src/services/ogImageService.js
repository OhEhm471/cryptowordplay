// ============================================================
// OG IMAGE GENERATOR
// Produces dynamic 1200×630 PNG share cards using @napi-rs/canvas
// Three card types: daily challenge preview, result share, player profile
// ============================================================

let Canvas;
try {
  Canvas = require("@napi-rs/canvas");
} catch {
  Canvas = null; // graceful fallback — return placeholder redirect
}

const COLORS = {
  bg:      "#060608",
  surface: "#0d0d12",
  border:  "#1e1e2a",
  green:   "#00e676",
  greenDim:"#00432a",
  yellow:  "#ffd60a",
  yellowDim:"#3d3300",
  gray:    "#2a2a35",
  grayText:"#666680",
  text:    "#c8c8e0",
  bright:  "#e8e8ff",
  red:     "#ff4560",
  accent:  "#7b61ff",
};

const W = 1200;
const H = 630;

function isAvailable() { return !!Canvas; }

// ────────────────────────────────────────────────────────────
// DAILY CHALLENGE CARD
// Used as the fc:frame image / og:image for the main app embed
// ────────────────────────────────────────────────────────────
async function generateDailyCard({ date, wordLength = 5 }) {
  if (!Canvas) return null;
  const { createCanvas } = Canvas;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // Background
  _fillRect(ctx, 0, 0, W, H, COLORS.bg);

  // Scanline texture
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = "rgba(0, 230, 118, 0.012)";
    ctx.fillRect(0, y, W, 2);
  }

  // Left panel decorative border
  _fillRect(ctx, 0, 0, 6, H, COLORS.green);

  // Top left: logo
  ctx.font         = "bold 52px monospace";
  ctx.fillStyle    = COLORS.green;
  ctx.fillText("⚡ CRYPTO", 80, 100);
  ctx.fillStyle    = COLORS.yellow;
  ctx.fillText("PLAY", 80 + ctx.measureText("⚡ CRYPTO ").width - 10, 100);

  // Tagline
  ctx.font      = "24px monospace";
  ctx.fillStyle = COLORS.grayText;
  ctx.fillText("DAILY CRYPTO WORD CHALLENGE", 80, 148);

  // Center: example board (blurred/teaser — 5 rows, all gray)
  const tileSize = 72;
  const gap      = 10;
  const cols     = wordLength;
  const boardW   = cols * tileSize + (cols - 1) * gap;
  const boardX   = (W - boardW) / 2;
  const boardY   = 220;

  const TEASE_COLORS = [
    [COLORS.green, COLORS.greenDim],
    [COLORS.yellow, COLORS.yellowDim],
    [COLORS.gray, COLORS.surface],
    [COLORS.gray, COLORS.surface],
  ];

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < cols; col++) {
      const x       = boardX + col * (tileSize + gap);
      const y       = boardY + row * (tileSize + gap);
      const [border, fill] = TEASE_COLORS[Math.min(row, TEASE_COLORS.length - 1)];
      _roundRect(ctx, x, y, tileSize, tileSize, 6, fill, border, 2);
      // Show "?" only on first row
      if (row === 0) {
        ctx.font      = `bold ${tileSize * 0.5}px monospace`;
        ctx.fillStyle = COLORS.grayText;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", x + tileSize / 2, y + tileSize / 2);
        ctx.textAlign    = "left";
        ctx.textBaseline = "alphabetic";
      }
    }
  }

  // CTA badge
  const badgeX = boardX;
  const badgeY = boardY + 4 * (tileSize + gap) + 24;
  _roundRect(ctx, badgeX, badgeY, boardW, 56, 4, COLORS.greenDim, COLORS.green, 2);
  ctx.font      = "bold 26px monospace";
  ctx.fillStyle = COLORS.green;
  ctx.textAlign = "center";
  ctx.fillText(`GUESS TODAY'S ${wordLength}-LETTER CRYPTO WORD`, W / 2, badgeY + 36);
  ctx.textAlign = "left";

  // Bottom stats bar
  _fillRect(ctx, 0, H - 80, W, 80, COLORS.surface);
  _drawLine(ctx, 0, H - 80, W, H - 80, COLORS.border);
  ctx.font      = "22px monospace";
  ctx.fillStyle = COLORS.grayText;
  ctx.fillText(`📅 ${date}`, 80, H - 38);
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.yellow;
  ctx.fillText("4 ATTEMPTS · FREE TO PLAY · ON FARCASTER", W - 80, H - 38);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

// ────────────────────────────────────────────────────────────
// RESULT SHARE CARD
// Generated after game completion — used for cast sharing
// ────────────────────────────────────────────────────────────
async function generateResultCard({ evaluations, won, attempts, score, username, wordLength, date }) {
  if (!Canvas) return null;
  const { createCanvas } = Canvas;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  _fillRect(ctx, 0, 0, W, H, COLORS.bg);
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = "rgba(0, 230, 118, 0.015)";
    ctx.fillRect(0, y, W, 2);
  }

  // Accent left bar
  _fillRect(ctx, 0, 0, 6, H, won ? COLORS.green : COLORS.red);

  // Logo small
  ctx.font      = "bold 28px monospace";
  ctx.fillStyle = COLORS.green;
  ctx.fillText("⚡ CRYPTO", 60, 60);
  ctx.fillStyle = COLORS.yellow;
  ctx.fillText("PLAY", 60 + ctx.measureText("⚡ CRYPTO ").width - 8, 60);

  // Result headline
  ctx.font      = "bold 72px monospace";
  ctx.fillStyle = won ? COLORS.green : COLORS.red;
  ctx.fillText(won ? "WAGMI! 🚀" : "REKT 😔", 60, 165);

  // Solved/failed info
  ctx.font      = "28px monospace";
  ctx.fillStyle = COLORS.grayText;
  const resultLine = won
    ? `Solved in ${attempts}/4 attempts`
    : `Failed — Better luck tomorrow`;
  ctx.fillText(resultLine, 60, 215);

  // Emoji grid — centered right side
  const EMOJI_SIZE = 58;
  const EMOJI_GAP  = 10;
  const EMOJI_MAP  = { green: COLORS.green, yellow: COLORS.yellow, gray: COLORS.gray };
  const FILL_MAP   = { green: COLORS.greenDim, yellow: COLORS.yellowDim, gray: "#111118" };

  const gridW = wordLength * (EMOJI_SIZE + EMOJI_GAP) - EMOJI_GAP;
  const gridX = W - 80 - gridW;
  const gridY = 80;

  (evaluations || []).forEach((row, ri) => {
    row.forEach((state, ci) => {
      const x = gridX + ci * (EMOJI_SIZE + EMOJI_GAP);
      const y = gridY + ri * (EMOJI_SIZE + EMOJI_GAP);
      _roundRect(ctx, x, y, EMOJI_SIZE, EMOJI_SIZE, 5, FILL_MAP[state], EMOJI_MAP[state], 2);
    });
  });

  // Score badge
  _roundRect(ctx, 60, 250, 280, 90, 8, COLORS.surface, COLORS.border, 1);
  ctx.font      = "bold 52px monospace";
  ctx.fillStyle = COLORS.green;
  ctx.fillText(`+${score}`, 80, 315);
  ctx.font      = "18px monospace";
  ctx.fillStyle = COLORS.grayText;
  ctx.fillText("POINTS", 80, 335);

  // Username
  if (username) {
    ctx.font      = "24px monospace";
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(`@${username}`, 60, 378);
  }

  // Date + word length tag
  _roundRect(ctx, 60, 405, 180, 40, 4, COLORS.surface, COLORS.border, 1);
  ctx.font      = "18px monospace";
  ctx.fillStyle = COLORS.yellow;
  ctx.textAlign = "center";
  ctx.fillText(`${wordLength}-LETTER  ·  ${date}`, 60 + 90, 430);
  ctx.textAlign = "left";

  // Bottom bar
  _fillRect(ctx, 0, H - 70, W, 70, COLORS.surface);
  _drawLine(ctx, 0, H - 70, W, H - 70, COLORS.border);
  ctx.font      = "20px monospace";
  ctx.fillStyle = COLORS.grayText;
  ctx.fillText("cryptowordplay.xyz · Play on Farcaster", 60, H - 28);

  return canvas.toBuffer("image/png");
}

// ────────────────────────────────────────────────────────────
// PLAYER PROFILE CARD
// ────────────────────────────────────────────────────────────
async function generateProfileCard({ username, stats, achievements = [] }) {
  if (!Canvas) return null;
  const { createCanvas } = Canvas;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  _fillRect(ctx, 0, 0, W, H, COLORS.bg);
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = "rgba(0, 230, 118, 0.012)";
    ctx.fillRect(0, y, W, 2);
  }
  _fillRect(ctx, 0, 0, 6, H, COLORS.accent);

  // Logo
  ctx.font = "bold 28px monospace"; ctx.fillStyle = COLORS.green;
  ctx.fillText("⚡ CRYPTOPLAY", 60, 60);

  // Username
  ctx.font      = "bold 64px monospace";
  ctx.fillStyle = COLORS.bright;
  ctx.fillText(`@${username}`, 60, 155);

  // Stats grid — 2×2
  const statItems = [
    { label: "WINS",   value: stats.total_wins   || 0, color: COLORS.green },
    { label: "STREAK", value: `${stats.current_streak || 0}🔥`, color: COLORS.yellow },
    { label: "PLAYED", value: stats.total_played || 0, color: COLORS.text },
    { label: "BEST",   value: stats.best_score   || 0, color: COLORS.accent },
  ];
  statItems.forEach((s, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x   = 60 + col * 300, y = 210 + row * 130;
    _roundRect(ctx, x, y, 260, 110, 6, COLORS.surface, COLORS.border, 1);
    ctx.font      = "bold 44px monospace";
    ctx.fillStyle = s.color;
    ctx.fillText(s.value, x + 20, y + 62);
    ctx.font      = "18px monospace";
    ctx.fillStyle = COLORS.grayText;
    ctx.fillText(s.label, x + 20, y + 90);
  });

  // Achievements preview (up to 6 most recent)
  const unlocked = achievements.filter(a => a.unlocked).slice(0, 6);
  if (unlocked.length) {
    ctx.font      = "22px monospace";
    ctx.fillStyle = COLORS.grayText;
    ctx.fillText("ACHIEVEMENTS", 700, 220);
    unlocked.forEach((a, i) => {
      const x = 700 + (i % 3) * 140;
      const y = 250 + Math.floor(i / 3) * 130;
      _roundRect(ctx, x, y, 120, 110, 6, COLORS.surface, COLORS.border, 1);
      ctx.font = "36px monospace"; ctx.textAlign = "center";
      ctx.fillText(a.emoji, x + 60, y + 54);
      ctx.font = "13px monospace"; ctx.fillStyle = COLORS.grayText;
      ctx.fillText(a.name.slice(0, 10), x + 60, y + 90);
      ctx.textAlign = "left"; ctx.fillStyle = COLORS.text;
    });
  }

  _fillRect(ctx, 0, H - 70, W, 70, COLORS.surface);
  _drawLine(ctx, 0, H - 70, W, H - 70, COLORS.border);
  ctx.font = "20px monospace"; ctx.fillStyle = COLORS.grayText;
  ctx.fillText("cryptowordplay.xyz", 60, H - 28);

  return canvas.toBuffer("image/png");
}

// ────────────────────────────────────────────────────────────
// CANVAS HELPERS
// ────────────────────────────────────────────────────────────
function _fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function _drawLine(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function _roundRect(ctx, x, y, w, h, radius, fill, stroke, strokeWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
}

module.exports = {
  isAvailable,
  generateDailyCard,
  generateResultCard,
  generateProfileCard,
};

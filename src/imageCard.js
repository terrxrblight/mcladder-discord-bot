// Рендер PNG-карточки матча: фон — заблюренная картинка карты + тёмная вуаль,
// поверх — головы игроков, ники и изменение ELO. Возвращает Buffer или null
// (если canvas недоступен/карта не загрузилась — лента откатится на текстовый эмбед).
//
// @napi-rs/canvas ставится из npm готовым бинарником (без системных libs).
// Требуется выполнить `npm install` после добавления зависимости.
const path = require("node:path");
const { config } = require("./config");

// Ленивая загрузка: если пакет не установлен — карточки просто будут текстовыми,
// бот не падает.
let C = null;
try {
  C = require("@napi-rs/canvas");
} catch {
  console.error("[imageCard] @napi-rs/canvas недоступен — карточки матчей будут текстом. Сделай npm install.");
}

// Шрифт бандлим, чтобы не зависеть от системных шрифтов сервера.
let FONT = "sans-serif";
if (C) {
  try {
    const p = path.join(__dirname, "..", "assets", "Minecraft.ttf");
    if (C.GlobalFonts.registerFromPath(p, "Mc")) FONT = "Mc";
  } catch {
    /* останется sans-serif */
  }
}

const headCache = new Map(); // uuid|name -> Image|null
const mapCache = new Map(); //  slug      -> Image|null

async function fetchImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return C.loadImage(Buffer.from(await res.arrayBuffer()));
}

async function getHead(idOrName) {
  const key = String(idOrName);
  if (headCache.has(key)) return headCache.get(key);
  const img = await fetchImage(
    `https://mc-heads.net/avatar/${encodeURIComponent(key)}/64.png`
  ).catch(() => null);
  headCache.set(key, img);
  return img;
}

async function getMap(slug) {
  if (!slug) return null;
  if (mapCache.has(slug)) return mapCache.get(slug);
  const img = await fetchImage(`${config.siteBase}/maps/${slug}.jpg`).catch(() => null);
  mapCache.set(slug, img);
  return img;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Рисует img так, чтобы покрыть прямоугольник (object-fit: cover), по центру.
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function renderMatchCard(match, { seasonTitle } = {}) {
  if (!C) return null;
  const { createCanvas } = C;

  const players = Array.isArray(match.players) ? match.players : [];
  const winners = players.filter((p) => p.result === "WIN");
  const losers = players.filter((p) => p.result === "LOSS");
  const rows = [...winners, ...losers];
  if (!rows.length) return null;

  const W = 660;
  const PAD = 22;
  const HEADER_H = 40;
  const ROW_H = 58;
  const H = PAD + HEADER_H + rows.length * ROW_H + PAD;
  const RADIUS = 20;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Скруглённая маска всей плашки.
  roundRect(ctx, 0, 0, W, H, RADIUS);
  ctx.clip();

  // Фон: заблюренная карта (или тёмный, если карты нет).
  const mapImg = await getMap(match.map_name);
  if (mapImg) {
    // Плавный гауссов блюр (Skia). Оверскан, чтобы размытые края не темнели по углам.
    ctx.filter = "blur(7px)";
    drawCover(ctx, mapImg, -36, -36, W + 72, H + 72);
    ctx.filter = "none";
  } else {
    ctx.fillStyle = "#1e1f24";
    ctx.fillRect(0, 0, W, H);
  }

  // Тёмная вуаль + лёгкий нижний градиент для читаемости текста.
  ctx.fillStyle = "rgba(12,13,16,0.58)";
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0.10)");
  grad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "middle";

  // Заголовок: слева название сезона (или "RANKED")[· 2v2], справа — карта (как в БД).
  const mode = match.end_meta?.mode || "SOLO";
  const header = (seasonTitle || "RANKED") + (mode === "DUO" ? " · 2v2" : "");
  ctx.font = `20px "${FONT}"`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(header, PAD, PAD + HEADER_H / 2);

  ctx.font = `16px "${FONT}"`;
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  const mapLabel = `${match.map_name || "unknown"} · ${match.short_id}`;
  ctx.fillText(mapLabel, W - PAD - ctx.measureText(mapLabel).width, PAD + HEADER_H / 2);

  // Строки игроков.
  let y = PAD + HEADER_H;
  for (const p of rows) {
    const isWin = p.result === "WIN";
    const midY = y + ROW_H / 2;

    // Зелёная плашка-подложка под победителя — чтобы выделялся явно.
    if (isWin) {
      ctx.fillStyle = "rgba(87,220,120,0.14)";
      roundRect(ctx, PAD - 6, y + 5, W - 2 * (PAD - 6), ROW_H - 10, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(87,220,120,0.60)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, PAD - 6, y + 5, W - 2 * (PAD - 6), ROW_H - 10, 12);
      ctx.stroke();
    }

    // Голова (пиксель-арт — без сглаживания), с тёмной подложкой.
    const headSize = 40;
    const headX = PAD + 16;
    const headY = y + (ROW_H - headSize) / 2;
    const head = await getHead(p.uuid || p.name);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, headX - 3, headY - 3, headSize + 6, headSize + 6, 6);
    ctx.fill();
    if (head) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(head, headX, headY, headSize, headSize);
      ctx.imageSmoothingEnabled = true;
    }

    // Ник (победитель — зелёным).
    ctx.font = `19px "${FONT}"`;
    ctx.fillStyle = isWin ? "#5BE08A" : "#FFFFFF";
    ctx.fillText(p.name, headX + headSize + 16, midY);

    // ELO + дельта у правого края.
    const before = p.elo_before;
    const after = p.elo_after ?? before;
    const d = after - before;
    const deltaStr = (d > 0 ? "+" : "") + d;
    ctx.font = `18px "${FONT}"`;

    ctx.fillStyle = d > 0 ? "#5BE08A" : d < 0 ? "#FF7A7A" : "#CCCCCC";
    const dw = ctx.measureText(deltaStr).width;
    ctx.fillText(deltaStr, W - PAD - dw, midY);

    ctx.fillStyle = "#FFFFFF";
    const eloStr = String(after);
    const ew = ctx.measureText(eloStr).width;
    ctx.fillText(eloStr, W - PAD - dw - 14 - ew, midY);

    y += ROW_H;
  }

  return await canvas.encode("png");
}

module.exports = { renderMatchCard };

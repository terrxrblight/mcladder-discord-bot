// Лестница рангов. Источник правды — сайт: GET /api/meta/ranks (синк в
// index.js — при старте и раз в час). Значения ниже — фолбэк на случай
// недоступности API при старте; вручную синхронизировать их больше не нужно.
// Цвета храним int'ами для EmbedBuilder (hex-строки API конвертим при синке).

const DEFAULTS = {
  eloPerDivision: 50,
  divisions: ["I", "II", "III", "IV", "V"],
  unrankedColor: 0x888888,
  ranks: [
    { name: "Wood", color: 0xd2b48c, minElo: 350 },
    { name: "Stone", color: 0xa8a8a8, minElo: 600 },
    { name: "Copper", color: 0xd98a4e, minElo: 850 },
    { name: "Iron", color: 0xc0c0c0, minElo: 1100 },
    { name: "Gold", color: 0xffd700, minElo: 1350 },
    { name: "Diamond", color: 0x00ffff, minElo: 1600 },
    { name: "Netherite", color: 0xc47aab, minElo: 1850 },
  ],
};

// Живое состояние. RANKS обновляется НА МЕСТЕ (splice), чтобы модули,
// державшие ссылку на массив (roles.js), всегда видели свежую лестницу.
const RANKS = DEFAULTS.ranks.map((r) => ({ ...r }));
let DIVISIONS = DEFAULTS.divisions;
let ELO_PER_DIVISION = DEFAULTS.eloPerDivision;
let UNRANKED_COLOR = DEFAULTS.unrankedColor;

// "#RRGGBB" → int; null, если строка не похожа на цвет.
function hexToInt(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || "").trim());
  return m ? parseInt(m[1], 16) : null;
}

// Применить payload /api/meta/ranks. Невалидный ответ игнорируем (false) —
// остаёмся на текущей лестнице.
function applyRanksMeta(meta) {
  if (!meta || !Array.isArray(meta.ranks) || meta.ranks.length === 0) return false;

  const next = [];
  for (const r of meta.ranks) {
    if (!r || typeof r.name !== "string" || !Number.isFinite(Number(r.minElo))) return false;
    next.push({
      name: r.name,
      color: hexToInt(r.color) ?? UNRANKED_COLOR,
      minElo: Number(r.minElo),
    });
  }
  next.sort((a, b) => a.minElo - b.minElo);

  RANKS.splice(0, RANKS.length, ...next);
  if (Array.isArray(meta.divisions) && meta.divisions.length > 0) {
    DIVISIONS = meta.divisions.map(String);
  }
  if (Number.isFinite(Number(meta.eloPerDivision)) && Number(meta.eloPerDivision) > 0) {
    ELO_PER_DIVISION = Number(meta.eloPerDivision);
  }
  const unranked = hexToInt(meta.unrankedColor);
  if (unranked !== null) UNRANKED_COLOR = unranked;
  return true;
}

// Подтянуть лестницу с API (см. index.js). Ошибку сети пробрасываем — вызывающий
// решает, как логировать; лестница при этом остаётся прежней (фолбэк/последняя).
async function syncFromApi(api) {
  const meta = await api.getRanksMeta();
  if (applyRanksMeta(meta)) {
    console.log(`[ranks] synced ${RANKS.length} ranks from API`);
  } else {
    console.warn("[ranks] /meta/ranks вернул неожиданный формат — остаюсь на текущей лестнице");
  }
}

function getRankAndTier(elo) {
  if (elo === null || elo === undefined || elo < RANKS[0].minElo) {
    return { rankName: "Unranked", tier: "", display: "Unranked", color: UNRANKED_COLOR };
  }

  let rank = RANKS[0];
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (elo >= RANKS[i].minElo) {
      rank = RANKS[i];
      break;
    }
  }

  // Дивизион внутри ранга; в верхнем ранге ELO не ограничен сверху, поэтому
  // индекс зажимается последним дивизионом (V).
  const tierIndex = Math.floor((elo - rank.minElo) / ELO_PER_DIVISION);
  const tier = DIVISIONS[Math.min(tierIndex, DIVISIONS.length - 1)];

  return {
    rankName: rank.name,
    tier,
    display: `${rank.name} ${tier}`,
    color: rank.color,
  };
}

module.exports = { RANKS, getRankAndTier, syncFromApi };

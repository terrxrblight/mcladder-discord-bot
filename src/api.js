// Тонкий клиент публичного API mcladder (https://mcladder.com/api).
// Никаких кред БД — только read-эндпоинты. fetch встроен в Node 18+.
const { config } = require("./config");

const TIMEOUT_MS = 10_000;
const UA = "mcladder-discord-bot/1.0 (+https://mcladder.com)";

async function apiGet(pathname) {
  const url = config.apiBase + pathname;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (res.status === 404) return null; // игрок/сезон не найден — не ошибка
    if (!res.ok) throw new Error(`GET ${pathname} → HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// /version — дешёвый «отпечаток» свежести данных: { v, serverTime }.
const getVersion = () => apiGet("/version");

// /meta/ranks — канонические определения лестницы рангов (пороги ELO, цвета,
// дивизионы). Единый источник правды; применяется через ranks.syncFromApi.
const getRanksMeta = () => apiGet("/meta/ranks");

// /stats — { totalPlayers, matchesPlayed }.
const getStats = () => apiGet("/stats");

// /leaderboard — массив игроков, отсортированных по rank.
const getLeaderboard = (limit = 10) =>
  apiGet(`/leaderboard?limit=${encodeURIComponent(limit)}`);

// /matches — { items: [...], total, ... }. Последние матчи (победитель/проигравший,
// elo_delta, карта, players[] с elo_before/after, end_meta с mode/team_a/team_b).
const getMatches = (limit = 15) =>
  apiGet(`/matches?limit=${encodeURIComponent(limit)}`);

// /player/:name — полный профиль (rank, badges, ban, presence) или null.
const getPlayer = (name) => apiGet(`/player/${encodeURIComponent(name)}`);

// /season/current — активный сезон или null.
const getCurrentSeason = async () => {
  const r = await apiGet("/season/current");
  return r ? r.season : null;
};

// POST /integrations/discord/boosters — server-to-server (защищён BOT_SYNC_SECRET).
// Шлём ПОЛНЫЙ snapshot бустящих сейчас discord-uid; сайт сам резолвит в mc_uuid и
// выставляет/снимает флаг бустера. Без секрета — тихо пропускаем (фича выключена).
async function postBoosters(discordUids) {
  if (!config.botSyncSecret) return null;
  const url = config.apiBase + "/integrations/discord/boosters";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Bot-Secret": config.botSyncSecret,
      },
      body: JSON.stringify({ boosters: discordUids }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`POST /integrations/discord/boosters → HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  apiGet,
  getVersion,
  getRanksMeta,
  getStats,
  getLeaderboard,
  getMatches,
  getPlayer,
  getCurrentSeason,
  postBoosters,
};

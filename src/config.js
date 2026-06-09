// Загрузка и валидация конфигурации из .env.
// Секреты Discord нужны только самому боту; публичные настройки (apiBase/siteBase)
// имеют дефолты, поэтому api.js / render.js можно дёргать и в dry-run без .env.
require("dotenv").config();

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

// Терпимый разбор булевых env: true/1/yes/on (любой регистр). Пусто → default.
function truthy(v, def = false) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (s === "") return def;
  return ["true", "1", "yes", "on"].includes(s);
}

const config = {
  // Секреты Discord
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.DISCORD_CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",
  leaderboardChannelId: process.env.LEADERBOARD_CHANNEL_ID || "",
  // Канал ленты результатов матчей. Пусто → лента выключена (бот работает без неё).
  matchResultsChannelId: process.env.MATCH_RESULTS_CHANNEL_ID || "",
  // Канал мод-лога банов (#mod-logs). Пусто → мод-лог выключен.
  modLogChannelId: process.env.MOD_LOG_CHANNEL_ID || "",

  // Postgres (ranked_read) — привязка Discord↔MC, авто-роли, баны, онлайн.
  // Пусто → БД-фичи выключены, остальной бот работает.
  db: {
    host: process.env.DB_HOST || "",
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME || "rankedmc",
    user: process.env.DB_USER || "",
    password: process.env.DB_PASS || "",
    ssl: String(process.env.DB_SSL || "false") === "true",
  },

  // Авто-роли по рангу + Verified (нужны Server Members Intent + Manage Roles).
  roleSync: truthy(process.env.ROLE_SYNC, false),
  roleSyncMinutes: clampInt(process.env.ROLE_SYNC_MINUTES, 5, 1, 60),
  roleAutocreate: truthy(process.env.ROLE_AUTOCREATE, true),
  verifiedRoleName: process.env.VERIFIED_ROLE_NAME || "Verified",

  // Авто-бейдж Discord-бустера: бот шлёт на сайт список бустящих сейчас, сайт
  // выставляет/снимает players.discord_booster. Требует Server Members Intent
  // (как и роли) и общий секрет BOT_SYNC_SECRET (== тот же в .env API).
  boosterSync: truthy(process.env.BOOSTER_SYNC, false),
  botSyncSecret: process.env.BOT_SYNC_SECRET || "",

  // Публичные настройки (есть дефолты)
  apiBase: (process.env.API_BASE || "https://mcladder.com/api").replace(/\/+$/, ""),
  siteBase: (process.env.SITE_BASE || "https://mcladder.com").replace(/\/+$/, ""),
  leaderboardLimit: clampInt(process.env.LEADERBOARD_LIMIT, 10, 1, 25),
  pollIntervalMs: Math.max(Number(process.env.POLL_INTERVAL_MS || 15000), 5000),

  // Фирменный цвет эмбедов (розовый топ-1 с сайта)
  brandColor: 0xe0a0cc,
};

// Вызывается только ботом (не dry-run / не deploy-commands без нужды).
function assertBotConfig() {
  const labels = {
    token: "DISCORD_TOKEN",
    clientId: "DISCORD_CLIENT_ID",
    guildId: "GUILD_ID",
    leaderboardChannelId: "LEADERBOARD_CHANNEL_ID",
  };
  const missing = Object.keys(labels).filter((k) => !config[k]);
  if (missing.length) {
    console.error(
      "[config] Не заданы обязательные переменные: " +
        missing.map((k) => labels[k]).join(", ") +
        "  (см. .env.example)"
    );
    process.exit(1);
  }
}

module.exports = { config, assertBotConfig };

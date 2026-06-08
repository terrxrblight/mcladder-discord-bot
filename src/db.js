// Доступ к Postgres под ranked_read (read-only). Нужен для привязки Discord↔MC
// (user_identities), авто-ролей, мод-лога банов и счётчика онлайна.
// Если креды БД не заданы — модуль «выключен», все функции отдают пусто, а бот
// продолжает работать без БД-зависимых фич.
const { Pool } = require("pg");
const { config } = require("./config");

const enabled = !!(config.db.host && config.db.user && config.db.password);

let pool = null;
if (enabled) {
  pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });
  pool.on("error", (e) => console.error("[db] pool error:", e.message || e));
}

async function q(text, params) {
  if (!pool) return { rows: [] };
  return pool.query(text, params);
}

// Discord-ID → привязанный MC-аккаунт (из user_identities, которую пишет сайт).
async function linkByDiscordId(discordId) {
  const r = await q(
    `SELECT u.mc_uuid, p.name
       FROM user_identities ui
       JOIN users u ON u.id = ui.user_id
       LEFT JOIN players p ON p.uuid = u.mc_uuid
      WHERE ui.provider = 'discord' AND ui.provider_uid = $1
      LIMIT 1`,
    [String(discordId)]
  );
  return r.rows[0] || null;
}

// Все привязки Discord→MC (для синхронизации ролей).
async function allDiscordLinks() {
  const r = await q(
    `SELECT ui.provider_uid AS discord_id, u.mc_uuid
       FROM user_identities ui
       JOIN users u ON u.id = ui.user_id
      WHERE ui.provider = 'discord'`
  );
  return r.rows;
}

// uuid → { name, elo, hidden } для набора игроков.
async function playersByUuids(uuids) {
  const map = new Map();
  if (!uuids || !uuids.length) return map;
  const r = await q(
    `SELECT uuid, name, elo, hidden FROM players WHERE uuid = ANY($1::uuid[])`,
    [uuids]
  );
  for (const row of r.rows) map.set(String(row.uuid), row);
  return map;
}

// Живой онлайн / в матче из player_presence (heartbeat ≤ 30с — как на сайте).
async function onlineCounts() {
  const r = await q(
    `SELECT
       COUNT(*) FILTER (WHERE online AND updated_at > now() - interval '30 seconds')::int AS online,
       COUNT(*) FILTER (WHERE online AND status = 'MATCH' AND updated_at > now() - interval '30 seconds')::int AS in_match
     FROM player_presence`
  );
  return r.rows[0] || { online: 0, in_match: 0 };
}

// — Баны (мод-лог) —
async function maxBanId() {
  const r = await q(`SELECT COALESCE(MAX(id), 0)::bigint AS id FROM bans`);
  return Number(r.rows[0]?.id || 0);
}
async function maxUnbanAt() {
  // ::text — полная (микросекундная) точность; JS Date обрезал бы до мс и ломал
  // сравнение водяного знака (разбан репостился бы по кругу).
  const r = await q(`SELECT MAX(unbanned_at)::text AS ts FROM bans`);
  return r.rows[0]?.ts || null;
}
async function bansAfterId(id) {
  const r = await q(
    `SELECT id, uuid, name, reason, banned_by, created_at, expires_at
       FROM bans WHERE id > $1 ORDER BY id ASC LIMIT 25`,
    [id]
  );
  return r.rows;
}
async function unbansAfter(ts) {
  // Водяной знак ts — точная строка времени (см. maxUnbanAt). unbanned_at_txt
  // отдаём тоже строкой полной точности, чтобы класть его в водяной знак.
  const r = await q(
    `SELECT id, uuid, name, unbanned_by, unbanned_at, unbanned_at::text AS unbanned_at_txt
       FROM bans
      WHERE unbanned_at IS NOT NULL
        AND ($1::timestamptz IS NULL OR unbanned_at > $1::timestamptz)
      ORDER BY unbanned_at ASC LIMIT 25`,
    [ts]
  );
  return r.rows;
}

module.exports = {
  enabled,
  linkByDiscordId,
  allDiscordLinks,
  playersByUuids,
  onlineCounts,
  maxBanId,
  maxUnbanAt,
  bansAfterId,
  unbansAfter,
};

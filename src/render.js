// Построение эмбедов Discord из данных API. Чистые функции — их же дёргает dry-run.
const { EmbedBuilder } = require("discord.js");
const { config } = require("./config");
const { getRankAndTier } = require("./ranks");
const { rankEmoji, guildEmoji } = require("./emojis");

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Юникод-фолбэк на случай, если кастом-эмодзи бейджа нет в гильдии.
// Сначала пробуем кастом-эмодзи гильдии с тем же именем, что у бейджа.
const BADGE_FALLBACK = {
  owner: "👑",
  developer: "🛠️",
  moderator: "🛡️",
  helper: "🤝",
  verified: "✅",
  sponsor: "💎",
  youtube: "▶️",
  twitch: "🟣",
  tiktok: "🎵",
};

function escapeMd(s) {
  return String(s).replace(/([\\`*_~|>])/g, "\\$1");
}

// Скрытые игроком бейджи (hidden=true) не показываем. Публичный API их и так
// вырезает, но фильтруем защитно — на случай иной версии API на проде.
function badgesStr(badges) {
  if (!Array.isArray(badges) || !badges.length) return "";
  const e = badges
    .filter((b) => b && b.hidden !== true)
    .map((b) => guildEmoji(b.badge) || BADGE_FALLBACK[b.badge] || "")
    .filter(Boolean);
  return e.length ? " " + e.join("") : "";
}

function winrate(wins, losses) {
  const g = (wins || 0) + (losses || 0);
  if (!g) return "—";
  return ((wins / g) * 100).toFixed(0) + "%";
}

function headUrl(idOrName) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(idOrName)}/128`;
}

function rankLabel(rank) {
  return MEDALS[rank] || `\`#${rank}\``;
}

// Ссылка на профиль игрока — по UUID (сайт принимает и uuid, и ник; uuid не
// «протухает» при смене ника). Текст ссылки — отображаемый ник.
function playerUrl(p) {
  const id = (p && (p.uuid || p.name)) || "";
  return `${config.siteBase}/${encodeURIComponent(id)}`;
}
function profileLink(p) {
  return `[**${escapeMd(p.name)}**](${playerUrl(p)})`;
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function prettyCause(v) {
  return String(v || "").toLowerCase().replaceAll("_", " ");
}

// ── Лидерборд ──────────────────────────────────────────────────────────────
// updatedAt — момент последнего РЕАЛЬНОГО изменения данных (его держит апдейтер),
// чтобы строка «Updated … ago» отражала реальную свежесть, а не каждую перерисовку.
function buildLeaderboardEmbed(rows, { season, stats, updatedAt } = {}) {
  const when = updatedAt instanceof Date ? updatedAt : new Date();

  const lines = rows.map((p) => {
    const rt = getRankAndTier(p.elo);
    const re = rankEmoji(rt.rankName);
    return (
      `${rankLabel(p.rank)} ${profileLink(p)}${badgesStr(p.badges)} — ` +
      `\`${p.elo}\` ELO · ${p.wins}W/${p.losses}L · ${winrate(p.wins, p.losses)} · ` +
      `${re ? re + " " : ""}${rt.display}`
    );
  });

  const updated = `\n\n-# 🔄 Updated <t:${Math.floor(when.getTime() / 1000)}:R> · synced with mcladder.com`;

  const embed = new EmbedBuilder()
    .setColor(config.brandColor)
    .setTitle("🏆 MCLadder — Top " + rows.length)
    .setURL(`${config.siteBase}/leaderboard`)
    .setDescription((lines.join("\n") || "_No ranked players yet._") + updated)
    .setTimestamp(when);

  const footer = [];
  if (season && season.title) footer.push(`Season: ${season.title}`);
  if (stats && typeof stats.totalPlayers === "number")
    footer.push(`${stats.totalPlayers} players`);
  if (footer.length) embed.setFooter({ text: footer.join(" · ") });

  return embed;
}

// ── Статус присутствия ─────────────────────────────────────────────────────
function presenceStr(presence) {
  if (!presence || !presence.online) return "🔴 Offline";
  switch (presence.status) {
    case "MATCH":
      return `⚔️ In match${presence.map ? ` · ${presence.map}` : ""}`;
    case "MATCH_STARTING":
      return "⏳ Match starting";
    case "QUEUE":
      return "🔎 In queue";
    case "LOBBY":
      return "🟢 In lobby";
    default:
      return "🟢 Online";
  }
}

// ── Профиль игрока (/stats) ─────────────────────────────────────────────────
function buildStatsEmbed(p) {
  const rt = getRankAndTier(p.elo);
  const re = rankEmoji(rt.rankName);
  const games = (p.wins || 0) + (p.losses || 0);

  const embed = new EmbedBuilder()
    .setColor(rt.color)
    .setAuthor({ name: `${p.name} — stats`, iconURL: headUrl(p.uuid || p.name), url: playerUrl(p) })
    .setThumbnail(headUrl(p.uuid || p.name))
    .addFields(
      { name: "Rank", value: p.rank ? `#${p.rank}` : "Unranked", inline: true },
      { name: "ELO", value: `${p.elo} (peak ${p.peak_elo})`, inline: true },
      { name: "Tier", value: `${re ? re + " " : ""}${rt.display}`, inline: true },
      { name: "Record", value: `${p.wins}W / ${p.losses}L`, inline: true },
      { name: "Games", value: String(games), inline: true },
      { name: "Winrate", value: winrate(p.wins, p.losses), inline: true },
      { name: "Status", value: presenceStr(p.presence), inline: true },
      {
        name: "Since",
        value: p.first_join ? `<t:${Math.floor(new Date(p.first_join).getTime() / 1000)}:D>` : "—",
        inline: true,
      }
    )
    .setTimestamp(new Date());

  if (p.ban) {
    const reason = p.ban.reason ? ` · ${p.ban.reason}` : "";
    const value = p.ban.permanent
      ? `Permanent${reason}`
      : `Until <t:${Math.floor(new Date(p.ban.expires_at).getTime() / 1000)}:R>${reason}`;
    embed.addFields({ name: "⛔ Banned", value, inline: false });
  }

  const bs = badgesStr(p.badges).trim();
  if (bs) embed.addFields({ name: "Badges", value: bs, inline: false });

  return embed;
}

// ── Причина исхода матча (перенос логики web/app/admin/EndCause.tsx) ─────────
function matchReasonText(match) {
  const meta = match.end_meta || {};
  const cause = String(match.end_cause || meta.cause || "").toUpperCase();
  const players = Array.isArray(match.players) ? match.players : [];
  const nameByUuid = new Map(players.map((p) => [String(p.uuid).toLowerCase(), p.name]));
  const nm = (u) => nameByUuid.get(String(u || "").toLowerCase()) || null;

  const who = nm(meta.who) || nm(match.loser_uuid) || "Player";
  // damage_cause "KILL" не показываем как причину — это обычное PvP-добивание.
  const dmg =
    meta.damage_cause && String(meta.damage_cause).toUpperCase() !== "KILL"
      ? prettyCause(meta.damage_cause)
      : null;

  if (meta.draw === true) return "Draw";

  if (cause === "DEATH") {
    const killerUuid = meta.killer || meta.killer_uuid;
    const killerName = meta.killer_name;
    const killerType = meta.killer_type;

    let killer = (killerUuid && nm(killerUuid)) || null;
    if (!killer && String(killerType || "").toUpperCase() === "PLAYER" && killerName) {
      killer = killerName;
    }
    if (!killer && (killerName || killerType)) killer = prettyCause(killerName || killerType);
    // PvP-добивание без явного киллера в meta: в 1v1 это победитель.
    if (!killer && ["KILL", "ENTITY_ATTACK", "PROJECTILE"].includes(String(meta.damage_cause).toUpperCase())) {
      const ws = players.filter((p) => p.result === "WIN");
      if (ws.length === 1) killer = ws[0].name;
    }

    const tail = dmg ? ` (${dmg})` : "";
    return killer ? `${who} was killed by ${killer}${tail}` : `${who} died${tail}`;
  }
  if (cause === "SURRENDER") return `${who} surrendered`;
  if (cause === "QUIT") return `${who} quit`;
  if (cause === "TIMEOUT") return "Time is up";
  if (cause === "CHALLENGES") {
    const w =
      nm(meta.who) ||
      nm(match.winner_uuid) ||
      players.find((p) => p.result === "WIN")?.name ||
      "Player";
    return `${w} completed all challenges`;
  }
  return cause ? cause.charAt(0) + cause.slice(1).toLowerCase() : "Match end";
}

// ── Карточка результата матча (#match-results) ──────────────────────────────
function eloLine(p) {
  const before = p.elo_before;
  const after = p.elo_after ?? before;
  const d = after - before;
  const sign = d > 0 ? `+${d}` : `${d}`;
  const dot = d >= 0 ? "🟢" : "🔴";
  const re = rankEmoji(getRankAndTier(after).rankName);
  return `${re ? re + " " : ""}${profileLink(p)} \`${before} → ${after}\` ${dot} ${sign}`;
}

// detailed=false → без ELO-блока и без миниатюры (вся инфа на картинке-карточке,
// в тексте оставляем кликабельные ники + причину).
// seasonTitle подставляется вместо слова "Ranked" в заголовке.
function buildMatchEmbed(match, { detailed = true, seasonTitle } = {}) {
  const players = Array.isArray(match.players) ? match.players : [];
  const winners = players.filter((p) => p.result === "WIN");
  const losers = players.filter((p) => p.result === "LOSS");
  const mode = match.end_meta?.mode || "SOLO";

  const wNames = winners.map((p) => profileLink(p)).join(" + ") || "Winner";
  const lNames = losers.map((p) => profileLink(p)).join(" + ") || "Loser";
  const headline = `🏆 ${wNames} defeated ${lNames}`;
  const reason = matchReasonText(match);
  const eloBlock = [...winners, ...losers].map(eloLine).join("\n");

  const color = winners[0]
    ? getRankAndTier(winners[0].elo_after ?? winners[0].elo_before).color
    : 0x57f287;

  const label = seasonTitle || "Ranked";
  const title = `⚔️ ${label}${mode === "DUO" ? " · 2v2" : ""} · ${match.map_name || "unknown"} · ${match.short_id}`;
  const desc = detailed
    ? `${headline}${reason ? `\n-# ${reason}` : ""}\n\n${eloBlock}`
    : `${headline}${reason ? `\n-# ${reason}` : ""}`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setURL(`${config.siteBase}/match/${match.short_id}`)
    .setDescription(desc)
    .setFooter({ text: `⏱ ${fmtDuration(match.duration_sec)}` })
    .setTimestamp(match.ended_at ? new Date(match.ended_at) : new Date());

  if (detailed && winners[0]) embed.setThumbnail(headUrl(winners[0].uuid || winners[0].name));

  return embed;
}

module.exports = {
  buildLeaderboardEmbed,
  buildStatsEmbed,
  buildMatchEmbed,
  presenceStr,
  winrate,
  escapeMd,
};

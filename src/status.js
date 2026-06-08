// Rich Presence бота: в списке участников — «Playing mcladder», а в карточке
// профиля (поповер) — лого + details/state + время работы, как у игровой активности.
//
// Картинка-лого: art-asset, ЗАЛИТЫЙ в Developer Portal → [приложение бота] →
// Rich Presence → Art Assets с ключом ASSET_KEY (см. ниже). Ключи Discord приводит
// к нижнему регистру. Без залитого ассета карточка покажется без картинки.
//
// Почему «сырой» gateway-пакет: discord.js.setPresence НЕ передаёт assets/details/
// timestamps для бота — режет их. Поэтому шлём presence (op 3) напрямую через шард.
// Если внутренний API шарда отличается на твоей версии — срабатывает фолбэк через
// setPresence (без картинки, но «Playing mcladder» + текст останутся).
const { ActivityType } = require("discord.js");
const { config } = require("./config");
const db = require("./db");
const api = require("./api");

const REFRESH_MS = 30_000;          // как часто обновлять данные в presence
const APP_NAME = "mcladder";        // имя активности → «Playing mcladder»
const ASSET_KEY = "mcladder";       // ключ art-asset в Dev Portal (нижний регистр!)
const LARGE_TEXT = "mcladder.com";  // подпись при наведении на лого

class StatusUpdater {
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.startedAt = Date.now(); // для «elapsed» в карточке
    this.warned = false;
  }

  async start() {
    await this.tick().catch(() => {});
    this.timer = setInterval(() => this.tick().catch(() => {}), REFRESH_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    const { details, state, isOnline } = await this.collect();
    this.apply(details, state, isOnline);
  }

  // Готовит две строки карточки: details (онлайн/в матче) и state (топ-1).
  async collect() {
    let online = null;
    let inMatch = 0;
    if (db.enabled) {
      const c = await db.onlineCounts().catch(() => null);
      if (c) {
        online = c.online;
        inMatch = c.in_match;
      }
    }

    const [rows, stats] = await Promise.all([
      api.getLeaderboard(1).catch(() => null),
      online == null ? api.getStats().catch(() => null) : Promise.resolve(null),
    ]);
    const top = Array.isArray(rows) && rows[0] ? rows[0] : null;

    let details;
    if (online != null) {
      details = `${online > 0 ? "🟢" : "💤"} ${online} online` +
        (inMatch > 0 ? ` · ⚔️ ${inMatch} in match` : "");
    } else if (stats && typeof stats.totalPlayers === "number") {
      details = `👥 ${stats.totalPlayers} players`;
    } else {
      details = "Ranked Minecraft PvP";
    }

    const state = top && top.name ? `🏆 #1 ${top.name} · ${top.elo} ELO` : "mcladder.com";

    return { details, state, isOnline: (online ?? 0) > 0 };
  }

  apply(details, state, isOnline) {
    if (!this.client.user) return;
    const status = isOnline ? "online" : "idle";

    // Основной путь: сырой presence с лого/details/timestamps.
    if (this.sendRawPresence(details, state, status)) return;

    // Фолбэк: хотя бы «Playing mcladder» + текст (без картинки/details — их
    // discord.js не передаёт; самое важное кладём в state).
    this.client.user
      .setPresence({
        status,
        activities: [{ name: APP_NAME, type: ActivityType.Playing, state: `${details} · ${state}` }],
      })
      .catch(() => {});
  }

  // Шлёт presence (gateway op 3) напрямую через шард(ы). true — отправлено.
  sendRawPresence(details, state, status) {
    try {
      const shards = this.client.ws && this.client.ws.shards;
      if (!shards || shards.size === 0) return false;

      const d = {
        since: null,
        afk: false,
        status,
        activities: [
          {
            name: APP_NAME,
            type: 0, // Playing
            application_id: config.clientId || undefined,
            details: details || undefined,
            state: state || undefined,
            assets: { large_image: ASSET_KEY, large_text: LARGE_TEXT },
            timestamps: { start: this.startedAt },
          },
        ],
      };

      let sent = false;
      for (const shard of shards.values()) {
        if (typeof shard.send === "function") {
          shard.send({ op: 3, d });
          sent = true;
        }
      }
      if (!sent && !this.warned) {
        console.error("[status] shard.send unavailable on this discord.js build — using setPresence fallback (no rich-presence image)");
        this.warned = true;
      }
      return sent;
    } catch (e) {
      if (!this.warned) {
        console.error("[status] raw presence failed, falling back to setPresence:", e.message || e);
        this.warned = true;
      }
      return false;
    }
  }
}

module.exports = { StatusUpdater };

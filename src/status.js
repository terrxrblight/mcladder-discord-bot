// Rich Presence бота (как у игр): в списке — «Playing mcladder.com», а в карточке —
// лого + жирное «mcladder.com» + строка-сводка (details) + нижняя строка (state),
// которая РОТИРУЕТСЯ каждые 30с (online → in match → топ-1), плюс таймер «elapsed».
//
// ВАЖНО про лого: кастомную картинку (large_image) в presence бот показать НЕ может —
// это ограничение Discord, проверено всеми путями (art-asset по имени и по ID не
// рендерятся; внешний URL → «Bots cannot use this endpoint»). Логотип mcladder и так
// виден как АВАТАРКА бота сверху в карточке.
//
// discord.js.setPresence режет assets/details/timestamps, поэтому presence (op 3)
// шлём через штатный client.ws.broadcast.
const { config } = require("./config");
const db = require("./db");
const api = require("./api");

const REFRESH_MS = 30_000;
const APP_NAME = "mcladder.com";          // «игра» (жирным; «Playing mcladder.com»)
const TAGLINE = "Ranked Minecraft PvP";   // верхняя строка карточки (details)

class StatusUpdater {
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.frame = 0;
    this.startedAt = Date.now();
    this.warned = false;
  }

  async start() {
    console.log(
      `[status] rich presence: Playing ${APP_NAME} · app_id=${config.clientId ? "set" : "MISSING"} · ` +
        `broadcast=${typeof this.client.ws?.broadcast === "function" ? "ok" : "MISSING"}`
    );
    await this.tick().catch((e) => console.error("[status] start:", e?.message || e));
    this.timer = setInterval(
      () => this.tick().catch((e) => console.error("[status] tick:", e?.message || e)),
      REFRESH_MS
    );
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    const { rotation, isOnline } = await this.collect();
    const state = rotation[this.frame % rotation.length];
    this.frame = (this.frame + 1) % 1_000_000;
    this.apply(state, isOnline);
  }

  // Строки ротации нижней строки карточки: живой онлайн/матчи (БД), топ-1 и всего игроков (API).
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

    const rotation = [];
    if (online != null) rotation.push(`🟢 ${online} online`);
    else if (stats && typeof stats.totalPlayers === "number") rotation.push(`👥 ${stats.totalPlayers} players`);
    if (inMatch > 0) rotation.push(`⚔️ ${inMatch} in match`);
    if (top && top.name) rotation.push(`🏆 #1 ${top.name} · ${top.elo} ELO`);
    if (rotation.length === 0) rotation.push("🌐 mcladder.com");

    return { rotation, isOnline: (online ?? 0) > 0 };
  }

  apply(state, isOnline) {
    const ws = this.client.ws;
    if (!ws || typeof ws.broadcast !== "function") {
      if (!this.warned) {
        console.error("[status] client.ws.broadcast недоступен — rich presence не отправить");
        this.warned = true;
      }
      return;
    }

    const payload = {
      op: 3, // Presence Update
      d: {
        since: null,
        afk: false,
        status: isOnline ? "online" : "idle",
        activities: [
          {
            name: APP_NAME,
            type: 0, // Playing
            application_id: config.clientId || undefined,
            details: TAGLINE,
            state,
            timestamps: { start: this.startedAt },
          },
        ],
      },
    };

    try {
      ws.broadcast(payload);
    } catch (e) {
      if (!this.warned) {
        console.error("[status] broadcast failed:", e?.message || e);
        this.warned = true;
      }
    }
  }
}

module.exports = { StatusUpdater };

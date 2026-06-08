// Rich Presence бота (как у игр): в списке — «Playing mcladder.com», а в карточке
// профиля — лого + жирное «mcladder.com» + строка-сводка (details) + нижняя строка
// (state), которая РОТИРУЕТСЯ каждые 30с (online → in match → топ-1), плюс таймер.
//
// Картинка-лого: art-asset, залитый в Developer Portal → [приложение бота] →
// Rich Presence → Art Assets с ключом ASSET_KEY (нижний регистр). Для резолва ассета
// в presence обязателен application_id = DISCORD_CLIENT_ID того же приложения.
//
// Почему «сырой» gateway-пакет: discord.js.setPresence передаёт только name/type/
// state/url и РЕЖЕТ assets/details/timestamps. Поэтому presence (op 3) шлём напрямую
// через client.ws.broadcast — это штатный метод WebSocketManager в discord.js v14.
const { config } = require("./config");
const db = require("./db");
const api = require("./api");

const REFRESH_MS = 30_000;          // период обновления/ротации
const APP_NAME = "mcladder.com";    // имя «игры» (жирным в карточке, «Playing mcladder.com»)
const TAGLINE = "Ranked Minecraft PvP"; // верхняя строка карточки (details)
const ASSET_KEY = "mcladder";       // ключ art-asset в Dev Portal (нижний регистр!)
const LARGE_TEXT = "mcladder.com";  // подпись при наведении на лого

class StatusUpdater {
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.frame = 0;              // индекс ротации нижней строки
    this.startedAt = Date.now(); // для «elapsed» в карточке
    this.warned = false;
  }

  async start() {
    if (!config.clientId) {
      console.warn("[status] DISCORD_CLIENT_ID не задан — лого-ассет не подхватится");
    }
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

  // Готовит строки ротации нижней строки карточки из живого онлайна/матчей (БД),
  // топ-1 и всего игроков (API). Всегда есть хотя бы один элемент.
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
            assets: { large_image: ASSET_KEY, large_text: LARGE_TEXT },
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

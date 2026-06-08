// Rich Presence бота (как у игр): в списке — «Playing mcladder.com», а в карточке —
// лого + жирное «mcladder.com» + строка-сводка (details) + нижняя строка (state),
// которая РОТИРУЕТСЯ каждые 30с (online → in match → топ-1), плюс таймер «elapsed».
//
// Лого: залитые в Dev Portal art-assets ботам в presence НЕ рисуются (ограничение
// Discord). Рабочий путь — ВНЕШНЯЯ картинка по URL через медиа-прокси Discord:
// один раз дёргаем /applications/{id}/external-assets (токен у REST-клиента бота есть),
// получаем mp:-ссылку и кладём её в assets.large_image.
//
// Почему «сырой» gateway-пакет: discord.js.setPresence режет assets/details/timestamps,
// поэтому presence (op 3) шлём через штатный client.ws.broadcast.
const { config } = require("./config");
const db = require("./db");
const api = require("./api");

const REFRESH_MS = 30_000;
const APP_NAME = "mcladder.com";          // «игра» (жирным; «Playing mcladder.com»)
const TAGLINE = "Ranked Minecraft PvP";   // верхняя строка карточки (details)
const LOGO_URL = "https://mcladder.com/discord-avatar.png"; // та же картинка, что аватарка
const LARGE_TEXT = "mcladder.com";        // подпись при наведении на лого

class StatusUpdater {
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.frame = 0;
    this.startedAt = Date.now();
    this.largeImage = undefined; // undefined = ещё не резолвили; string|null = результат
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
    const largeImage = await this.resolveLargeImage();
    const state = rotation[this.frame % rotation.length];
    this.frame = (this.frame + 1) % 1_000_000;
    this.apply(state, isOnline, largeImage);
  }

  // Превращает URL логотипа в mp:-ссылку через external-assets. Резолвим один раз и кэшируем.
  async resolveLargeImage() {
    if (this.largeImage !== undefined) return this.largeImage;
    this.largeImage = null; // помечаем «попытка была», чтобы не дёргать API на каждом тике
    try {
      if (!config.clientId) return null;
      const res = await this.client.rest.post(
        `/applications/${config.clientId}/external-assets`,
        { body: { urls: [LOGO_URL] } }
      );
      const path = Array.isArray(res) && res[0] && res[0].external_asset_path;
      this.largeImage = path ? `mp:${path}` : null;
      console.log("[status] logo:", this.largeImage || "external-assets вернул пусто");
    } catch (e) {
      console.error("[status] external-assets failed:", e?.message || e);
    }
    return this.largeImage;
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

  apply(state, isOnline, largeImage) {
    const ws = this.client.ws;
    if (!ws || typeof ws.broadcast !== "function") {
      if (!this.warned) {
        console.error("[status] client.ws.broadcast недоступен — rich presence не отправить");
        this.warned = true;
      }
      return;
    }

    const assets = { large_text: LARGE_TEXT };
    if (largeImage) assets.large_image = largeImage;

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
            assets,
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

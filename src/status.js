// Статус бота: ротация коротких строк с эмодзи-иконкой (online / in match / топ-1 /
// домен), плюс цвет точки: зелёная когда есть онлайн, idle когда пусто.
// Онлайн берём из player_presence (через БД); без БД — фолбэк на /api/stats.
//
// Шлём через штатный client.user.setPresence (надёжно обновляется). Тип Custom
// (type 4) даёт «чистый» вид: эмодзи как иконка, без префикса Playing/Watching.
// Если у твоего бота Custom-статус не отображается — поменяй ACTIVITY_TYPE ниже на
// ActivityType.Watching (или Playing/Competing): ротация та же, добавится префикс.
//
// Большого лого в карточке тут НЕТ: rich-presence с картинкой (type 0) исключает
// ротацию (строка жёстко «Playing <name>») и требует сырого gateway-пакета, который
// оказался ненадёжным. Если захочешь лого вместо ротации — это отдельный вариант.
const { ActivityType } = require("discord.js");
const db = require("./db");
const api = require("./api");

const ROTATE_MS = 30_000;                  // период смены строки (безопасно по rate-limit)
const ACTIVITY_TYPE = ActivityType.Custom; // ← переключатель вида статуса (см. шапку)

class StatusUpdater {
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.frame = 0; // индекс текущей строки ротации
  }

  async start() {
    await this.tick().catch((e) => console.error("[status] start:", e?.message || e));
    this.timer = setInterval(
      () => this.tick().catch((e) => console.error("[status] tick:", e?.message || e)),
      ROTATE_MS
    );
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    const { lines, online } = await this.collect();
    const list = lines.length ? lines : ["🌐 mcladder.com"];
    const line = list[this.frame % list.length];
    this.frame = (this.frame + 1) % 1_000_000;
    this.apply(line, online > 0);
  }

  // Собирает доступные строки ротации: живой онлайн/в матче (БД), топ-1 и всего
  // игроков (API). Включаем только те строки, по которым есть данные.
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

    const lines = [];
    if (online != null) {
      lines.push(`${online > 0 ? "🟢" : "💤"} ${online} online`);
    } else if (stats && typeof stats.totalPlayers === "number") {
      lines.push(`👥 ${stats.totalPlayers} players`);
    }
    if (inMatch > 0) lines.push(`⚔️ ${inMatch} in match`);
    if (top && top.name) lines.push(`🏆 #1 ${top.name} · ${top.elo} ELO`);
    lines.push("🌐 mcladder.com");

    return { lines, online: online ?? 0 };
  }

  apply(line, isOnline) {
    if (!this.client.user) return;
    this.client.user.setPresence({
      status: isOnline ? "online" : "idle",
      // name и state дублируем: разные типы активности читают разное поле.
      activities: [{ name: line, type: ACTIVITY_TYPE, state: line }],
    });
  }
}

module.exports = { StatusUpdater };

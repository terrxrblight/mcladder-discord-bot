// Статус бота: «Watching N online · M in match». Онлайн берём из player_presence
// (через БД). Без БД — фолбэк на число игроков из /api/stats.
const { ActivityType } = require("discord.js");
const db = require("./db");
const api = require("./api");

class StatusUpdater {
  constructor(client) {
    this.client = client;
    this.timer = null;
  }

  async start() {
    await this.tick().catch(() => {});
    this.timer = setInterval(() => this.tick().catch(() => {}), 60_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    let text;
    if (db.enabled) {
      const c = await db.onlineCounts();
      text = `${c.online} online${c.in_match ? ` · ${c.in_match} in match` : ""}`;
    } else {
      const s = await api.getStats().catch(() => null);
      text = s ? `${s.totalPlayers} players` : "mcladder.com";
    }
    if (this.client.user) this.client.user.setActivity(text, { type: ActivityType.Watching });
  }
}

module.exports = { StatusUpdater };

// Живой лидерборд: каждые pollIntervalMs тянет топ и перерисовывает ОДНО
// закреплённое сообщение-эмбед — но только если содержимое реально изменилось
// (сравниваем «сигнатуру» строк топа, сезона и числа игроков). Так подхватываются
// и изменения, не отражённые в /api/version: скрытие/показ бейджей, смена ника и т.п.
// ID сообщения хранится в общем data/state.json (state.js), чтобы переживать рестарт.
const { config } = require("./config");
const api = require("./api");
const { buildLeaderboardEmbed } = require("./render");
const { readState, writeState } = require("./state");

function signature(rows, season, stats) {
  return JSON.stringify({
    r: rows.map((p) => [
      p.rank,
      p.name,
      p.elo,
      p.wins,
      p.losses,
      (p.badges || []).filter((b) => b && b.hidden !== true).map((b) => b.badge),
    ]),
    s: (season && season.title) || null,
    n: (stats && stats.totalPlayers) ?? null,
  });
}

class LeaderboardUpdater {
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.busy = false;
    this.lastSig = null;
    this.lastUpdatedAt = new Date();
  }

  async start() {
    await this.tick(true); // первая отрисовка сразу
    this.timer = setInterval(
      () => this.tick(false).catch((e) => console.error("[leaderboard]", e.message || e)),
      config.pollIntervalMs
    );
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(force) {
    if (this.busy) return;
    this.busy = true;
    try {
      const [rows, season, stats] = await Promise.all([
        api.getLeaderboard(config.leaderboardLimit),
        api.getCurrentSeason().catch(() => null),
        api.getStats().catch(() => null),
      ]);
      if (!Array.isArray(rows)) return;

      const sig = signature(rows, season, stats);
      // Данные не изменились — сообщение не трогаем (и «Updated … ago» не сбрасываем).
      if (!force && sig === this.lastSig) return;

      this.lastUpdatedAt = new Date();
      const embed = buildLeaderboardEmbed(rows, { season, stats, updatedAt: this.lastUpdatedAt });
      await this.publish(embed);
      this.lastSig = sig;
    } finally {
      this.busy = false;
    }
  }

  async publish(embed) {
    const channel = await this.client.channels.fetch(config.leaderboardChannelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error("LEADERBOARD_CHANNEL_ID не указывает на текстовый канал");
    }

    const state = readState();
    let msg = null;
    if (state.messageId && state.channelId === config.leaderboardChannelId) {
      msg = await channel.messages.fetch(state.messageId).catch(() => null);
    }

    if (msg) {
      await msg.edit({ embeds: [embed] });
    } else {
      const sent = await channel.send({ embeds: [embed] });
      writeState({ channelId: config.leaderboardChannelId, messageId: sent.id });
      try {
        await sent.pin();
      } catch {
        /* нет права Manage Messages — не критично */
      }
    }
  }
}

module.exports = { LeaderboardUpdater };

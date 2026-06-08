// Лента результатов матчей: периодически читает /api/matches и постит карточки
// новых ЗАВЕРШЁННЫХ рейтинговых каток в публичный канал #match-results.
// Бэкфилла нет — при первом запуске запоминает «водяной знак» (время последнего
// матча) и постит только то, что завершилось ПОЗЖЕ. Фича включается только если
// задан MATCH_RESULTS_CHANNEL_ID.
const { AttachmentBuilder } = require("discord.js");
const { config } = require("./config");
const api = require("./api");
const { buildMatchEmbed } = require("./render");
const { renderMatchCard } = require("./imageCard");
const { readState, writeState } = require("./state");

class MatchFeed {
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.busy = false;
    this.channel = null;
    this.lastEndedAt = null; // постим только матчи, завершившиеся позже этого времени
    this.season = null; // текущий сезон (для заголовка карточки), обновляется в tick
  }

  async start() {
    if (!config.matchResultsChannelId) return; // фича выключена

    this.channel = await this.client.channels.fetch(config.matchResultsChannelId);
    if (!this.channel || !this.channel.isTextBased()) {
      console.error("[matches] MATCH_RESULTS_CHANNEL_ID не текстовый канал — лента отключена");
      return;
    }

    // Инициализация водяного знака: продолжаем с сохранённого, иначе берём самый
    // свежий завершённый матч и старые НЕ постим (без бэкфилла).
    const saved = readState().matchFeed?.lastEndedAt;
    if (saved) {
      this.lastEndedAt = saved;
    } else {
      const data = await api.getMatches(5).catch(() => null);
      const newest = (data?.items || []).find((m) => m.ended_at);
      this.lastEndedAt = newest ? newest.ended_at : new Date().toISOString();
      writeState({ matchFeed: { lastEndedAt: this.lastEndedAt } });
    }

    await this.tick();
    this.timer = setInterval(
      () => this.tick().catch((e) => console.error("[matches]", e.message || e)),
      config.pollIntervalMs
    );
    console.log("✅ Match-results feed started");
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const [data, season] = await Promise.all([
        api.getMatches(15).catch(() => null),
        api.getCurrentSeason().catch(() => null),
      ]);
      if (season) this.season = season;
      const items = data?.items;
      if (!Array.isArray(items)) return;

      // Только завершённые и более свежие, чем водяной знак; от старых к новым.
      const fresh = items
        .filter((m) => m.ended_at && (!this.lastEndedAt || m.ended_at > this.lastEndedAt))
        .sort((a, b) => new Date(a.ended_at) - new Date(b.ended_at));

      for (const m of fresh) {
        await this.postMatch(m);
        this.lastEndedAt = m.ended_at;
        writeState({ matchFeed: { lastEndedAt: this.lastEndedAt } });
      }
    } finally {
      this.busy = false;
    }
  }

  // Карточка-картинка (фон — заблюренная карта) + кликабельные ники в тексте.
  // Если рендер картинки не удался — откатываемся на подробный текстовый эмбед.
  async postMatch(m) {
    const seasonTitle = this.season?.title;
    let buf = null;
    try {
      buf = await renderMatchCard(m, { seasonTitle });
    } catch (e) {
      console.error("[matches] card render failed:", e.message || e);
    }

    const embed = buildMatchEmbed(m, { detailed: !buf, seasonTitle });
    const payload = { embeds: [embed] };
    if (buf) {
      embed.setImage("attachment://match.png");
      payload.files = [new AttachmentBuilder(buf, { name: "match.png" })];
    }
    await this.channel.send(payload);
  }
}

module.exports = { MatchFeed };

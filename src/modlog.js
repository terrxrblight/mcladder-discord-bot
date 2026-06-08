// Мод-лог банов: новые баны/разбаны из таблицы bans (её пишет сайт-админка) →
// эмбеды в админский #mod-logs. Без бэкфилла: при старте запоминает текущие
// «водяные знаки» (макс. id бана и макс. unbanned_at) и постит только новое.
const { EmbedBuilder } = require("discord.js");
const { config } = require("./config");
const db = require("./db");
const { readState, writeState } = require("./state");

class BanFeed {
  constructor(client) {
    this.client = client;
    this.channel = null;
    this.timer = null;
    this.busy = false;
    this.lastBanId = 0;
    this.lastUnbanAt = null;
  }

  async start() {
    if (!config.modLogChannelId) return;
    if (!db.enabled) {
      console.warn("[modlog] канал задан, но БД не настроена — пропускаю");
      return;
    }
    this.channel = await this.client.channels.fetch(config.modLogChannelId);
    if (!this.channel || !this.channel.isTextBased()) {
      console.error("[modlog] MOD_LOG_CHANNEL_ID не текстовый канал");
      return;
    }

    const st = readState().modLog || {};
    this.lastBanId = st.lastBanId != null ? st.lastBanId : await db.maxBanId();
    this.lastUnbanAt = st.lastUnbanAt != null ? st.lastUnbanAt : await db.maxUnbanAt();
    this.persist();

    await this.tick();
    this.timer = setInterval(
      () => this.tick().catch((e) => console.error("[modlog]", e.message || e)),
      config.pollIntervalMs
    );
    console.log("✅ Ban mod-log started");
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  persist() {
    writeState({ modLog: { lastBanId: this.lastBanId, lastUnbanAt: this.lastUnbanAt } });
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const b of await db.bansAfterId(this.lastBanId)) {
        await this.postBan(b);
        this.lastBanId = Number(b.id);
        this.persist();
      }
      for (const u of await db.unbansAfter(this.lastUnbanAt)) {
        await this.postUnban(u);
        this.lastUnbanAt = u.unbanned_at_txt; // точная строка времени (без обрезки до мс)
        this.persist();
      }
    } finally {
      this.busy = false;
    }
  }

  head(uuid) {
    return `https://mc-heads.net/avatar/${uuid}/64.png`;
  }

  async postBan(b) {
    const perm = b.expires_at == null;
    const dur = perm
      ? "Permanent"
      : `Until <t:${Math.floor(new Date(b.expires_at).getTime() / 1000)}:f>`;
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setAuthor({
        name: `${b.name || b.uuid} banned`,
        iconURL: this.head(b.uuid),
        url: `${config.siteBase}/${b.uuid}`,
      })
      .setDescription(
        `**Reason:** ${b.reason || "—"}\n**By:** ${b.banned_by}\n**Duration:** ${dur}`
      )
      .setTimestamp(new Date(b.created_at));
    await this.channel.send({ embeds: [embed] });
  }

  async postUnban(u) {
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setAuthor({
        name: `${u.name || u.uuid} unbanned`,
        iconURL: this.head(u.uuid),
        url: `${config.siteBase}/${u.uuid}`,
      })
      .setDescription(`**By:** ${u.unbanned_by || "—"}`)
      .setTimestamp(new Date(u.unbanned_at));
    await this.channel.send({ embeds: [embed] });
  }
}

module.exports = { BanFeed };

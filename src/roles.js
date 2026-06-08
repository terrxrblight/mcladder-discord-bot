// Авто-роли: Verified (тем, кто привязал MC на сайте) + роль по тиру (Wood..Netherite).
// Привязку читаем из user_identities (её ведёт сайт — отдельный /link не нужен).
// Нужны: Server Members Intent (включить в Dev Portal), право Manage Roles,
// и роль бота ВЫШЕ управляемых ролей в иерархии. Недостающие роли бот создаёт сам
// (с цветом тира) при roleAutocreate=true.
const { config } = require("./config");
const db = require("./db");
const api = require("./api");
const { RANKS, getRankAndTier } = require("./ranks");

const VERIFIED_COLOR = 0x57f287;

// Роли за место в публичном топе. Цвета как у NPC в игре.
const POSITIONS = [
  { rank: 1, name: "1ST", color: 0xe0a0cc },
  { rank: 2, name: "2ND", color: 0xa0efef },
  { rank: 3, name: "3RD", color: 0xffd700 },
];

class RoleSync {
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.guild = null;
    this.roleByName = new Map(); // name(lower) -> Role
  }

  async start() {
    if (!config.roleSync) {
      console.log("[roles] ROLE_SYNC=false — авто-роли не запущены");
      return;
    }
    if (!db.enabled) {
      console.warn("[roles] ROLE_SYNC включён, но БД не настроена (DB_* в .env) — пропускаю");
      return;
    }
    this.guild = await this.client.guilds.fetch(config.guildId);
    await this.ensureRoles();
    await this.sync().catch((e) => console.error("[roles]", e.message || e));
    this.timer = setInterval(
      () => this.sync().catch((e) => console.error("[roles]", e.message || e)),
      config.roleSyncMinutes * 60 * 1000
    );
    console.log(`✅ Role sync started (every ${config.roleSyncMinutes} min)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Имена управляемых тир-ролей (lower).
  tierNames() {
    return RANKS.map((r) => r.name.toLowerCase());
  }

  async ensureRoles() {
    const existing = await this.guild.roles.fetch();
    const byName = new Map();
    for (const role of existing.values()) byName.set(role.name.toLowerCase(), role);

    const want = [
      { name: config.verifiedRoleName, color: VERIFIED_COLOR, hoist: false },
      ...RANKS.map((r) => ({ name: r.name, color: r.color, hoist: false })),
      ...POSITIONS.map((p) => ({ name: p.name, color: p.color, hoist: true })),
    ];

    let created = 0;
    for (const w of want) {
      let role = byName.get(w.name.toLowerCase());
      if (!role && config.roleAutocreate) {
        try {
          role = await this.guild.roles.create({
            name: w.name,
            color: w.color,
            hoist: w.hoist,
            mentionable: false,
            reason: "mcladder auto-roles",
          });
          created++;
        } catch (e) {
          console.error(`[roles] create "${w.name}" failed:`, e.message || e);
        }
      }
      if (role) this.roleByName.set(w.name.toLowerCase(), role);
    }
    console.log(
      `[roles] ensured ${this.roleByName.size}/${want.length} roles (${created} created, autocreate=${config.roleAutocreate})`
    );
  }

  async sync() {
    if (!this.guild) return;

    const links = await db.allDiscordLinks();
    const mcByDiscord = new Map(links.map((l) => [String(l.discord_id), String(l.mc_uuid)]));
    const players = await db.playersByUuids([...new Set([...mcByDiscord.values()])]);

    const verified = this.roleByName.get(config.verifiedRoleName.toLowerCase());
    const tierIds = new Set(
      this.tierNames().map((n) => this.roleByName.get(n)?.id).filter(Boolean)
    );
    const posIds = new Set(
      POSITIONS.map((p) => this.roleByName.get(p.name.toLowerCase())?.id).filter(Boolean)
    );

    // Топ-3 публичного лидерборда: uuid → место (1..3).
    const top = await api.getLeaderboard(3).catch(() => null);
    const posByUuid = new Map();
    if (Array.isArray(top)) {
      for (const p of top) {
        if (p.rank >= 1 && p.rank <= 3) posByUuid.set(String(p.uuid), p.rank);
      }
    }

    const members = await this.guild.members.fetch(); // нужен GuildMembers intent
    for (const member of members.values()) {
      if (member.user.bot) continue;
      const mcUuid = mcByDiscord.get(member.id);
      const linked = !!mcUuid;

      // Verified
      if (verified) {
        const has = member.roles.cache.has(verified.id);
        if (linked && !has) await safe(() => member.roles.add(verified));
        else if (!linked && has) await safe(() => member.roles.remove(verified));
      }

      // Целевой тир
      let targetTierId = null;
      if (linked) {
        const p = players.get(mcUuid);
        if (p && p.elo != null) {
          const rt = getRankAndTier(Number(p.elo));
          if (rt.rankName !== "Unranked") {
            targetTierId = this.roleByName.get(rt.rankName.toLowerCase())?.id || null;
          }
        }
      }
      for (const id of tierIds) {
        const has = member.roles.cache.has(id);
        if (id === targetTierId && !has) await safe(() => member.roles.add(id));
        else if (id !== targetTierId && has) await safe(() => member.roles.remove(id));
      }

      // Место в топе: 1ST / 2ND / 3RD (только привязанным игрокам из топ-3).
      let targetPosId = null;
      if (linked) {
        const rank = posByUuid.get(mcUuid);
        const pos = rank ? POSITIONS.find((p) => p.rank === rank) : null;
        if (pos) targetPosId = this.roleByName.get(pos.name.toLowerCase())?.id || null;
      }
      for (const id of posIds) {
        const has = member.roles.cache.has(id);
        if (id === targetPosId && !has) await safe(() => member.roles.add(id));
        else if (id !== targetPosId && has) await safe(() => member.roles.remove(id));
      }
    }
  }
}

async function safe(fn) {
  try {
    await fn();
  } catch (e) {
    console.error("[roles] role op failed:", e.message || e);
  }
}

module.exports = { RoleSync };

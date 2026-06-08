// /stats — профиль игрока. Источник на выбор:
//   player:<ник>     — по нику в Minecraft (работает всегда; ведущий '@' убираем);
//   user:@кто-то     — по Discord-юзеру, ЕСЛИ он привязал MC на сайте;
//   без аргументов   — своя стата, если ты сам привязал аккаунт.
const { SlashCommandBuilder } = require("discord.js");
const api = require("../api");
const db = require("../db");
const { buildStatsEmbed } = require("../render");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show ranked stats — by nickname, by @user (if linked), or your own")
    .addStringOption((o) =>
      o.setName("player").setDescription("Minecraft nickname").setRequired(false)
    )
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("Discord user who linked their MC account on the site")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const nameOpt = interaction.options.getString("player");
    const userOpt = interaction.options.getUser("user");

    // Discord-ID → MC uuid через привязку (user_identities). При неудаче сам шлёт
    // ответ и возвращает null.
    const byDiscord = async (discordId, label) => {
      if (!db.enabled) {
        await interaction.editReply("⚠️ Account-link lookup isn't configured.");
        return null;
      }
      const link = await db.linkByDiscordId(discordId).catch(() => null);
      if (!link) {
        await interaction.editReply(
          `❌ ${label} hasn't linked a Minecraft account. Use the in-game nickname: \`/stats player:<nick>\`.`
        );
        return null;
      }
      return link.mc_uuid;
    };

    let lookup = null;

    if (nameOpt) {
      const s = nameOpt.trim().replace(/^@/, ""); // убрать случайный ведущий '@'
      const mention = s.match(/^<@!?(\d+)>$/); // в поле ника вставили Discord-упоминание
      if (mention) {
        lookup = await byDiscord(mention[1], "That user");
        if (!lookup) return;
      } else if (!s) {
        await interaction.editReply("Specify a nickname: `/stats player:<nick>`.");
        return;
      } else {
        lookup = s;
      }
    } else if (userOpt) {
      lookup = await byDiscord(userOpt.id, `**${userOpt.username}**`);
      if (!lookup) return;
    } else {
      if (!db.enabled) {
        await interaction.editReply("Specify a nickname: `/stats player:<nick>`.");
        return;
      }
      const link = await db.linkByDiscordId(interaction.user.id).catch(() => null);
      if (!link) {
        await interaction.editReply(
          "Link your Minecraft account on mcladder.com to use `/stats` on yourself, or specify `/stats player:<nick>`."
        );
        return;
      }
      lookup = link.mc_uuid;
    }

    const player = await api.getPlayer(lookup).catch(() => null);
    if (!player) {
      await interaction.editReply(`❌ Player **${nameOpt ? nameOpt.trim() : lookup}** not found.`);
      return;
    }
    await interaction.editReply({ embeds: [buildStatsEmbed(player)] });
  },
};

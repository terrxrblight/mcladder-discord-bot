// /refreshboard — принудительно перерисовать лидерборд сейчас (только для админов).
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("refreshboard")
    .setDescription("Force-refresh the leaderboard now (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, { leaderboard }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await leaderboard.tick(true);
    await interaction.editReply("✅ Leaderboard refreshed.");
  },
};

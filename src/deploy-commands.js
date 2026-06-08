// Регистрация слэш-команд в конкретной гильдии (появляются мгновенно, в отличие
// от глобальных). Запускать один раз после изменения набора команд:
//   npm run deploy-commands
const { REST, Routes } = require("discord.js");
const { config } = require("./config");
const { commands } = require("./commands");

async function main() {
  if (!config.token || !config.clientId || !config.guildId) {
    console.error("Нужны DISCORD_TOKEN, DISCORD_CLIENT_ID, GUILD_ID (см. .env.example)");
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(config.token);
  const body = commands.map((c) => c.data.toJSON());

  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body,
  });
  console.log(`✅ Зарегистрировано команд: ${body.length} (гильдия ${config.guildId})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

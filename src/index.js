// Точка входа бота: логин в Discord, загрузка эмодзи рангов, запуск апдейтера
// лидерборда, ленты матчей, статуса, авто-ролей, мод-лога; роутинг слэш-команд.
const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
} = require("discord.js");
const { config, assertBotConfig } = require("./config");
const { loadGuildEmojis } = require("./emojis");
const { LeaderboardUpdater } = require("./leaderboard");
const { MatchFeed } = require("./matches");
const { StatusUpdater } = require("./status");
const { RoleSync } = require("./roles");
const { BanFeed } = require("./modlog");
const { byName } = require("./commands");

assertBotConfig();

// GuildMembers — привилегированный интент, нужен только для авто-ролей.
// Включаем его, лишь когда roleSync=true (иначе Discord отвергнет логин).
const intents = [GatewayIntentBits.Guilds];
if (config.roleSync) intents.push(GatewayIntentBits.GuildMembers);

const client = new Client({ intents });

const leaderboard = new LeaderboardUpdater(client);
const matchFeed = new MatchFeed(client);
const status = new StatusUpdater(client);
const roleSync = new RoleSync(client);
const banFeed = new BanFeed(client);

async function startSafely(label, fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`[${label}] start failed:`, e.message || e);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  await loadGuildEmojis(client, config.guildId);

  await startSafely("status", () => status.start());
  await startSafely("leaderboard", async () => {
    await leaderboard.start();
    console.log("✅ Leaderboard updater started");
  });
  await startSafely("matches", () => matchFeed.start());
  await startSafely("roles", () => roleSync.start());
  await startSafely("modlog", () => banFeed.start());
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = byName.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction, { leaderboard, matchFeed });
  } catch (e) {
    console.error(`[cmd ${interaction.commandName}]`, e);
    const content = "⚠️ Something went wrong.";
    if (interaction.deferred || interaction.replied) {
      interaction.editReply(content).catch(() => {});
    } else {
      interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

// Аккуратное завершение под PM2.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    leaderboard.stop();
    matchFeed.stop();
    status.stop();
    roleSync.stop();
    banFeed.stop();
    client.destroy();
    process.exit(0);
  });
}

client.login(config.token);

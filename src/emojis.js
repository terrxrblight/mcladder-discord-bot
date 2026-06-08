// Кастом-эмодзи рангов из гильдии. Бот НЕ может писать ":netherite:" как обычный
// юзер — ему нужен формат "<:netherite:ID>". Поэтому при старте подтягиваем эмодзи
// гильдии по именам и кешируем готовые строки.
// Имена эмодзи в Discord совпадают с файлами иконок:
//   unrated, wood, stone, copper, iron, gold, diamond, netherite
let cache = {};

async function loadGuildEmojis(client, guildId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const coll = await guild.emojis.fetch();
    const next = {};
    for (const e of coll.values()) next[e.name.toLowerCase()] = e.toString();
    cache = next;
    console.log(`✅ Loaded ${coll.size} guild emojis`);
  } catch (e) {
    console.error("[emojis] load failed:", e.message || e);
  }
  return cache;
}

// Имя ранга (Wood..Netherite / Unranked) → строка эмодзи "<:name:id>" или "" если нет.
function rankEmoji(rankName) {
  const key = rankName === "Unranked" ? "unrated" : String(rankName).toLowerCase();
  return cache[key] || "";
}

// Кастом-эмодзи гильдии по точному имени (для бейджей: owner, verified, …).
function guildEmoji(name) {
  return cache[String(name).toLowerCase()] || "";
}

module.exports = { loadGuildEmojis, rankEmoji, guildEmoji };

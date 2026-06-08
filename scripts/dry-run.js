// Прогон логики без Discord: тянет ЖИВОЙ API и печатает, что попадёт в эмбеды.
// Эмодзи рангов в dry-run не резолвятся (нет клиента гильдии) — рендер падает на
// текстовый тир, это нормально.
//   npm run dry-run
const api = require("../src/api");
const {
  buildLeaderboardEmbed,
  buildStatsEmbed,
  buildMatchEmbed,
} = require("../src/render");

async function main() {
  const [rows, season, stats] = await Promise.all([
    api.getLeaderboard(10),
    api.getCurrentSeason().catch(() => null),
    api.getStats().catch(() => null),
  ]);

  if (!Array.isArray(rows)) {
    console.error("Не удалось получить лидерборд:", rows);
    process.exit(1);
  }

  console.log("=== LEADERBOARD EMBED ===");
  console.log(JSON.stringify(buildLeaderboardEmbed(rows, { season, stats }).toJSON(), null, 2));

  if (rows[0]) {
    const p = await api.getPlayer(rows[0].name);
    console.log(`\n=== STATS EMBED (${rows[0].name}) ===`);
    console.log(JSON.stringify(buildStatsEmbed(p).toJSON(), null, 2));
  }

  const matches = await api.getMatches(1).catch(() => null);
  const m = matches?.items?.find((x) => x.ended_at);
  if (m) {
    console.log(`\n=== MATCH EMBED (${m.short_id}) ===`);
    console.log(JSON.stringify(buildMatchEmbed(m).toJSON(), null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

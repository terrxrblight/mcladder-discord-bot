// Порт web/app/lib/ranks.ts — держим в синхроне с сайтом.
// Ранг по ELO + дивизион (I..V по 50 ELO). Цвета в виде int для EmbedBuilder.
const RANKS = [
  { name: "Wood", color: 0xd2b48c, minElo: 350 },
  { name: "Stone", color: 0xa8a8a8, minElo: 600 },
  { name: "Copper", color: 0xd98a4e, minElo: 850 },
  { name: "Iron", color: 0xc0c0c0, minElo: 1100 },
  { name: "Gold", color: 0xffd700, minElo: 1350 },
  { name: "Diamond", color: 0x00ffff, minElo: 1600 },
  { name: "Netherite", color: 0xc47aab, minElo: 1850 },
];

const DIVISIONS = ["I", "II", "III", "IV", "V"];
const ELO_PER_DIVISION = 50;

function getRankAndTier(elo) {
  if (elo === null || elo === undefined || elo < RANKS[0].minElo) {
    return { rankName: "Unranked", tier: "", display: "Unranked", color: 0x888888 };
  }

  let rank = RANKS[0];
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (elo >= RANKS[i].minElo) {
      rank = RANKS[i];
      break;
    }
  }

  const eloInRank = elo - rank.minElo;
  const tierIndex = Math.floor(eloInRank / ELO_PER_DIVISION);

  let tier;
  if (rank.name === "Netherite" && elo >= 2050) tier = "V";
  else tier = DIVISIONS[Math.min(tierIndex, 4)];

  return {
    rankName: rank.name,
    tier,
    display: `${rank.name} ${tier}`,
    color: rank.color,
  };
}

module.exports = { RANKS, getRankAndTier };

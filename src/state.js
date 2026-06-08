// Общее персистентное состояние бота в data/state.json.
// Пишем через merge, чтобы разные модули (лидерборд, лента матчей) не затирали
// ключи друг друга.
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "..", "data", "state.json");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(patch) {
  const next = { ...readState(), ...patch };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { readState, writeState };

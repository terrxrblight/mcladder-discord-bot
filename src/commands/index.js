// Реестр слэш-команд. Добавляешь файл команды — импортируешь его здесь.
const stats = require("./stats");
const refreshboard = require("./refreshboard");

const commands = [stats, refreshboard];
const byName = new Map(commands.map((c) => [c.data.name, c]));

module.exports = { commands, byName };

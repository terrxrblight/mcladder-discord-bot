#!/bin/bash
set -e

cd /var/www/mcladder-bot

# Запомним где сейчас HEAD (до pull'а)
OLD_HEAD=$(git rev-parse HEAD)

echo "📥 Pulling from GitHub..."
git pull --ff-only origin main

NEW_HEAD=$(git rev-parse HEAD)

# Если новых коммитов нет — на этом всё
if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  echo "✅ Уже актуально, делать нечего."
  exit 0
fi

# Список изменённых файлов между старым и новым HEAD
CHANGED=$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")
echo ""
echo "📋 Изменилось:"
echo "$CHANGED" | sed 's/^/  • /'
echo ""

# Флаги — что трогать
DEPS_CHANGED=false   # package.json / lock → npm install
CMDS_CHANGED=false   # слэш-команды → перерегистрировать в Discord
CODE_CHANGED=false   # любой код → рестарт pm2

while IFS= read -r file; do
  case "$file" in
    package.json|package-lock.json)
      DEPS_CHANGED=true; CODE_CHANGED=true ;;
    src/commands/*|src/deploy-commands.js)
      CMDS_CHANGED=true; CODE_CHANGED=true ;;
    src/*|ecosystem.config.js)
      CODE_CHANGED=true ;;
  esac
done <<< "$CHANGED"

# === Зависимости ===
if $DEPS_CHANGED; then
  echo "📦 Зависимости менялись → npm install"
  npm install --omit=dev
fi

# === Слэш-команды (регистрация в Discord) ===
if $CMDS_CHANGED; then
  echo "🔧 Слэш-команды менялись → регистрирую в Discord..."
  npm run deploy-commands
fi

# === Рестарт бота ===
if $CODE_CHANGED; then
  echo "🔄 Restarting bot (pm2)..."
  pm2 startOrReload ecosystem.config.js
else
  echo "ℹ️  Только инфраструктурные файлы (README/.gitignore/деплой-скрипт и т.п.) — рестарт не нужен."
fi

echo ""
echo "✅ Done."

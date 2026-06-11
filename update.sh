#!/bin/bash

# Compatibilidad para versiones antiguas de Docker API
export DOCKER_API_VERSION=1.41

echo "Obteniendo las últimas actualizaciones de GitHub..."
# Forzar la cancelación de cualquier rebase o merge pendiente
git rebase --abort 2>/dev/null || true
git merge --abort 2>/dev/null || true

# Buscar cambios y sobreescribir completamente cualquier cambio local
git fetch origin main
git reset --hard origin/main
git clean -fd

echo "Reconstruyendo el contenedor de Docker..."
docker-compose up -d --build

echo "¡Actualización completada con éxito!"

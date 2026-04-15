#!/bin/bash

# Compatibilidad para versiones antiguas de Docker API
export DOCKER_API_VERSION=1.41

echo "Obteniendo las últimas actualizaciones de GitHub..."
git pull origin main

echo "Reconstruyendo el contenedor de Docker..."
docker-compose up -d --build

echo "¡Actualización completada con éxito!"

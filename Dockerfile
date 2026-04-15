FROM node:20-alpine

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar configuración de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Construir la aplicación para producción (Vite)
RUN npm run build

# Establecer variables de entorno
ENV NODE_ENV=production
ENV PORT=3000

# Exponer el puerto
EXPOSE 3000

# Iniciar la aplicación usando el script de inicio de producción
CMD ["npm", "start"]

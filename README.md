<p align="center">
  <a href="https://builderbot.vercel.app/">
    <picture>
      <img src="https://builderbot.vercel.app/assets/thumbnail-vector.png" height="80">
    </picture>
    <h2 align="center">TechAura Intelligent Bot</h2>
  </a>
</p>

<p align="center">
  <a aria-label="NPM version" href="https://www.npmjs.com/package/@builderbot/bot">
    <img alt="" src="https://img.shields.io/npm/v/@builderbot/bot?color=%2300c200&label=%40bot-whatsapp">
  </a>
  <a aria-label="Join the community on GitHub" href="https://link.codigoencasa.com/DISCORD">
    <img alt="" src="https://img.shields.io/discord/915193197645402142?logo=discord">
  </a>
</p>

## TechAura Intelligent Bot v2.1

Sistema inteligente de ventas y atención al cliente con IA integrada, personalización avanzada y administración completa.

## Características Principales

- 🤖 **Inteligencia Artificial**: Integración con Gemini AI para respuestas contextuales
- 💬 **WhatsApp Bot**: Automatización completa de conversaciones
- 📊 **Panel de Administración**: Interface completa para gestión
- 🎯 **Sistema Inteligente**: Router con clasificación de intenciones
- 📈 **Análisis y Métricas**: Dashboard en tiempo real
- 🔄 **Sistema de Seguimiento**: Follow-ups automatizados y personalizados
- 🚫 **Sistema Anti-Spam**: Respeta preferencias de usuario (ver [FOLLOWUP_SYSTEM.md](./FOLLOWUP_SYSTEM.md))
  - ✅ Máximo 1 seguimiento por día por usuario
  - ✅ Detección automática de opt-out
  - ✅ Clasificación inteligente de respuestas
  - ✅ Soporte español e inglés

## Instalación

```bash
npm install
# or
pnpm install
```

## Configuración

### 1. Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto basado en `.env.example`:

```bash
cp .env.example .env
```

Edita el archivo `.env` y configura las siguientes variables **requeridas**:

```env
# Base de Datos MySQL (REQUERIDO)
MYSQL_DB_HOST=localhost
MYSQL_DB_PORT=3306
MYSQL_DB_USER=tu_usuario_mysql
MYSQL_DB_PASSWORD=tu_password_mysql
MYSQL_DB_NAME=techaura_bot

# Compatibilidad con server.js
DB_HOST=localhost
DB_USER=tu_usuario_mysql
DB_PASS=tu_password_mysql
DB_NAME=techaura_bot

# Puerto del servidor
PORT=3006

# API Keys de IA (REQUERIDO)
GEMINI_API_KEY=tu_gemini_api_key

# Email para notificaciones (opcional)
MAIL_USER=tu_email@gmail.com
MAIL_PASS=tu_app_password
```

### 2. Base de Datos

#### Instalación de MySQL

Asegúrate de tener MySQL instalado y corriendo:

```bash
# En Ubuntu/Debian
sudo apt-get install mysql-server

# En macOS con Homebrew
brew install mysql

# En Windows
# Descarga e instala desde https://dev.mysql.com/downloads/mysql/
```

#### Crear Base de Datos

```bash
mysql -u root -p
```

```sql
CREATE DATABASE techaura_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'techaura_user'@'localhost' IDENTIFIED BY 'tu_password_seguro';
GRANT ALL PRIVILEGES ON techaura_bot.* TO 'techaura_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### Ejecutar Migraciones

Las migraciones crean y actualizan las tablas de la base de datos:

```bash
# Instalar dependencias primero
npm install

# Ejecutar migraciones
npx knex migrate:latest

# Ver estado de migraciones
npx knex migrate:status

# Rollback (si es necesario)
npx knex migrate:rollback
```

**Importante**: Las migraciones deben ejecutarse **antes** de iniciar la aplicación por primera vez.

### 3. Instalación de Dependencias

```bash
npm install
# or
pnpm install
```

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm run build
npm run start:prod
```

### Verificación de Integridad
Verifica que el sistema esté correctamente configurado:
```bash
npm run verify
```

Este comando verificará:
- ✅ Variables de entorno configuradas
- ✅ Conexión a base de datos
- ✅ Servicio de IA disponible
- ✅ Clasificador de intenciones funcionando

### Migraciones de Base de Datos 🆕

Ejecutar migraciones para crear las tablas del sistema de validación:

```bash
# Ejecutar migraciones pendientes
npx knex migrate:latest --knexfile knexfile.js

# Ver estado de migraciones
npx knex migrate:status --knexfile knexfile.js

# Rollback última migración (si es necesario)
npx knex migrate:rollback --knexfile knexfile.js
```

O usando el endpoint API:
```bash
curl -X POST http://localhost:3006/v1/admin/migrate
```

Las migraciones crearán:
- ✅ Tabla `customers` - Gestión de clientes
- ✅ Tabla `orders` (actualizada) - Pedidos con validación
- ✅ Tabla `processing_jobs` - Seguimiento de trabajos
- ✅ Tabla `file_uploads` - Seguimiento de archivos

## Acceso a Interfaces

Una vez iniciado el sistema, puedes acceder a:

### Panel de Administración
```
http://localhost:3006/admin
```
Interface completa para:
- Ver estadísticas y métricas
- Gestionar pedidos
- Administrar contenido
- Monitorear el chatbot
- Configurar el sistema

### Gestión de Pedidos (Nuevo) 🆕
```
http://localhost:3006/order-management.html
```
Interfaz moderna para:
- ✅ Crear pedidos con validación en tiempo real
- ✅ Importar pedidos desde archivos CSV/Excel/JSON
- ✅ Ver y filtrar pedidos existentes
- ✅ Validación automática de datos
- ✅ Procesamiento por lotes
- 📚 Ver [Documentación Completa](VALIDATION_SYSTEM_DOCS.md)

### Autenticación WhatsApp
```
http://localhost:3006/auth
```
Página para conectar WhatsApp mediante código QR.

### Estado del Sistema
```
http://localhost:3006/status
```
Dashboard de monitoreo en tiempo real que muestra:
- Estado de conexión WhatsApp
- Estado de base de datos
- Estado del servicio de IA
- Métricas del sistema
- Auto-actualización cada 10 segundos

## Endpoints API Disponibles

### 🆕 Validación y Persistencia de Datos

#### Clientes
- `POST /api/customers` - Crear nuevo cliente con validación
- `GET /api/customers/:id` - Obtener cliente por ID
- `GET /api/customers/phone/:phone` - Obtener cliente por teléfono
- `GET /api/customers` - Listar clientes (con paginación y filtros)
- `PUT /api/customers/:id` - Actualizar cliente

#### Órdenes
- `POST /api/orders` - Crear nueva orden con validación
- `GET /api/orders/:id` - Obtener orden por ID
- `GET /api/orders` - Listar órdenes (con paginación y filtros)
- `PATCH /api/orders/:id/status` - Actualizar estado de orden
- `GET /api/orders/stats` - Estadísticas de órdenes

#### Carga de Archivos
- `POST /api/upload/orders` - Validar archivo CSV/Excel/JSON
- `POST /api/upload/orders/process` - Procesar y persistir registros

📚 **Documentación Completa**: Ver [VALIDATION_SYSTEM_DOCS.md](VALIDATION_SYSTEM_DOCS.md)

### Health & Status
- `GET /v1/health` - Estado de salud del sistema
- `GET /v1/dashboard` - Dashboard con métricas
- `GET /v1/analytics` - Análisis del sistema

### Admin API
- `GET /api/admin/dashboard` - Dashboard administrativo
- `GET /api/admin/orders` - Lista de pedidos
- `GET /api/admin/content/*` - Gestión de contenido
- `GET /api/admin/analytics/*` - Análisis y métricas

### AI & Intelligence
- `GET /v1/ai/stats` - Estadísticas de IA
- `GET /v1/router/stats` - Estadísticas del router
- `POST /v1/test/intent` - Probar clasificación de intenciones
- `POST /v1/test/ai-response` - Probar respuestas de IA

### User Management
- `GET /v1/user/:phone` - Información de usuario
- `GET /v1/recommendations/:phone` - Recomendaciones
- `POST /v1/send-message` - Enviar mensaje

Para ver la lista completa de endpoints, inicia el servidor y revisa los logs.

## Arquitectura del Sistema

### Componentes Principales

1. **Sistema de Logging Unificado** (`src/utils/unifiedLogger.ts`)
   - Niveles: debug, info, warn, error
   - Categorías: system, chatbot, database, ai, whatsapp, api
   - Correlation IDs para rastreo de sesiones
   - Formato con colores y timestamps

2. **Adaptador de Base de Datos** (`src/utils/dbAdapter.ts`)
   - Llamadas seguras con verificación de métodos
   - Manejo automático de errores
   - Logging integrado

3. **Middleware de Errores** (`src/middleware/errorHandler.ts`)
   - Manejo global de errores
   - Handler 404 personalizado
   - Request logging automático

4. **Script de Verificación** (`src/scripts/verifyIntegrity.ts`)
   - Verificación de variables de entorno
   - Test de conexión a BD
   - Validación de servicios de IA
   - Prueba de clasificador de intenciones

### Servidor HTTP y Socket.IO

**Importante**: Este proyecto usa Builderbot con Baileys para WhatsApp. La arquitectura de servidor sigue un patrón específico:

#### Inicio del Servidor
- El servidor HTTP se inicia usando la función `httpServer(PORT)` de Builderbot
- Esta función retorna una instancia de `http.Server` que ya está escuchando en el puerto especificado
- **No crear un segundo servidor HTTP** - esto causará conflictos con el provider de WhatsApp

#### Integración de Socket.IO
- Socket.IO se adjunta directamente a la instancia retornada por `httpServer(PORT)`
- Los eventos de WhatsApp (QR, ready, auth_failure) se emiten a través de Socket.IO
- El último código QR se almacena y se reenvía automáticamente a nuevos clientes que se conecten
- Eventos emitidos: `qr`, `ready`, `auth_success`, `connection_update`, `auth_failure`

#### Endpoints HTTP (Polka vs Express)
- Builderbot usa **Polka** internamente, no Express
- Las rutas registradas en `adapterProvider.server` usan objetos de respuesta nativos de Node.js
- **No usar** `res.json()` o `res.status().json()` - usar en su lugar:
  ```typescript
  // Usar helper sendJson()
  sendJson(res, 200, { success: true, data: result });
  
  // O manualmente:
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
  ```

#### Compatibilidad de Baileys
- Builderbot 1.3.5 requiere `baileys@7.0.0-rc.5` específicamente
- La versión está fijada en `pnpm.overrides` para evitar problemas de dependencias
- Otras versiones de Baileys pueden causar errores como `makeWASocketOther is not a function`

### Flujos de Conversación

- `mainFlow` - Flujo principal de entrada
- `menuFlow` - Menú de opciones
- `flowUsb` - Flujo de USBs personalizadas
- `musicUsb` - Personalización de música
- `moviesUsb` - Personalización de películas
- `customizationFlow` - Flujo de personalización
- `orderFlow` - Gestión de pedidos

### Servicios de IA

- **aiService**: Servicio principal de IA con Gemini
- **enhancedAIService**: Servicio mejorado con fallbacks y cache
- **intelligentRouter**: Router con clasificación NLP
- **intentClassifier**: Clasificación de intenciones
- **persuasionEngine**: Motor de persuasión contextual

## Scripts Disponibles

- `npm run dev` - Modo desarrollo con hot reload
- `npm run start` - Inicio normal
- `npm run build` - Compilar TypeScript
- `npm run verify` - Verificar integridad del sistema
- `npm run lint` - Ejecutar linter
- `npm test` - Ejecutar tests

## Solución de Problemas

### El panel de admin no carga
- Verifica que el servidor esté corriendo
- Comprueba que los archivos estáticos estén en `/public`
- Revisa los logs del servidor para errores

### Error de conexión a base de datos
- Verifica las credenciales en `.env`
- Asegúrate de que MySQL esté corriendo
- Ejecuta `npm run verify` para diagnosticar

### IA no responde
- Verifica que `GEMINI_API_KEY` esté configurada
- Comprueba tu cuota de API de Gemini
- Ejecuta `npm run verify` para verificar el servicio

### WhatsApp no conecta
- Visita `/auth` para escanear el código QR
- Asegúrate de tener WhatsApp Web activo
- Revisa los logs de Baileys en consola

## Desarrollo

### Estructura del Proyecto
```
techaura_full_automatic-main/
├── src/
│   ├── app.ts                    # Aplicación principal
│   ├── flows/                    # Flujos de conversación
│   ├── services/                 # Servicios (IA, router, etc.)
│   ├── utils/                    # Utilidades
│   ├── middleware/               # Middleware de Express
│   ├── admin/                    # Panel de administración
│   └── scripts/                  # Scripts de utilidad
├── public/
│   ├── admin/                    # Frontend del admin
│   ├── auth/                     # Frontend de auth
│   └── status/                   # Frontend de status
├── package.json
└── tsconfig.json
```

## Getting Started

With this library, you can build automated conversation flows agnostic to the WhatsApp provider, set up automated responses for frequently asked questions, receive and respond to messages automatically, and track interactions with customers. Additionally, you can easily set up triggers to expand functionalities limitlessly.

```
npm create builderbot@latest
```

## Documentation

Visit [builderbot](https://builderbot.vercel.app/) to view the full documentation.

## Official Course

If you want to discover all the functions and features offered by the library you can take the course.
[View Course](https://app.codigoencasa.com/courses/builderbot?refCode=LEIFER)

## Contact Us
- [💻 Discord](https://link.codigoencasa.com/DISCORD)
- [👌 𝕏 (Twitter)](https://twitter.com/leifermendez)
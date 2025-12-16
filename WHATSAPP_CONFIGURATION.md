# Configuración de WhatsApp para TechAura Bot

## Descripción General

El bot de TechAura utiliza WhatsApp Business API a través de la biblioteca Baileys para conectarse con WhatsApp Web. Esta guía explica cómo configurar y mantener la conexión activa.

## Requisitos Previos

1. **Node.js** versión 18.0.0 o superior
2. **NPM** versión 8.0.0 o superior
3. **Cuenta de WhatsApp** dedicada para el bot (se recomienda usar un número separado)
4. **Conexión a internet estable**

## Proceso de Configuración Inicial

### 1. Instalación de Dependencias

```bash
npm install
```

### 2. Variables de Entorno

Asegúrate de tener configurado el archivo `.env` con las siguientes variables:

```env
# Base de datos
MYSQL_DB_HOST=localhost
MYSQL_DB_USER=tu_usuario
MYSQL_DB_PASSWORD=tu_contraseña
MYSQL_DB_NAME=techaura_bot
MYSQL_DB_PORT=3306

# API Keys
GEMINI_API_KEY=tu_clave_gemini

# Puerto del servidor
PORT=3009
```

### 3. Inicio del Bot

```bash
npm start
```

O para desarrollo:

```bash
npm run dev
```

## Autenticación con WhatsApp

### Primera Vez - Escanear Código QR

1. **Ejecuta el bot**: Al iniciar el bot por primera vez, se generará un código QR en la consola.

2. **Abre WhatsApp**: En tu teléfono, abre WhatsApp y ve a:
   - **Android**: Menú (⋮) → Dispositivos vinculados → Vincular un dispositivo
   - **iPhone**: Configuración → Dispositivos vinculados → Vincular un dispositivo

3. **Escanea el QR**: Apunta la cámara de tu teléfono al código QR mostrado en la consola.

4. **Confirmación**: Una vez escaneado exitosamente, verás un mensaje de confirmación en la consola:
   ```
   ✅ WhatsApp conectado exitosamente
   📱 Número: +57XXXXXXXXXX
   ```

### Reconexión Automática

El bot guarda las credenciales de sesión en el directorio `baileys_store_xxxx/`. Esto permite:

- **Reconexión automática** después de reinicios
- **No necesitar escanear el QR** en cada inicio
- **Mantener la sesión activa** entre reinicios del servidor

## Problemas Comunes y Soluciones

### Error: "Se requiere escanear código QR"

**Causa**: La sesión de WhatsApp ha expirado o no existe.

**Solución**:
1. Detén el bot (Ctrl+C)
2. Elimina el directorio de sesión: `rm -rf baileys_store_*`
3. Reinicia el bot: `npm start`
4. Escanea el nuevo código QR

### Error: "WhatsApp desconectado"

**Causas posibles**:
- Internet inestable
- WhatsApp Web fue desvinculado desde el teléfono
- Sesión expirada

**Soluciones**:
1. Verifica tu conexión a internet
2. Revisa en WhatsApp móvil si el dispositivo sigue vinculado
3. Si fue desvinculado, elimina la sesión y vuelve a escanear el QR

### El bot no responde a mensajes

**Verificaciones**:
1. Confirma que WhatsApp esté conectado:
   ```bash
   # Verifica los logs del bot
   tail -f logs/app.log
   ```

2. Revisa el estado del bot en el panel de control:
   ```
   http://localhost:3009/admin
   ```

3. Verifica que no haya errores de rate limiting:
   - El bot tiene límites de mensajes para evitar ser bloqueado
   - Revisa `/v1/followup/stats` para ver el estado

## Mantenimiento de la Conexión

### Monitoreo de Estado

El bot incluye endpoints para monitorear el estado de WhatsApp:

1. **Estado General**:
   ```
   GET http://localhost:3009/status
   ```

2. **Estadísticas del Bot**:
   ```
   GET http://localhost:3009/v1/followup/stats
   ```

### Logs del Sistema

Los logs se guardan en:
- `logs/app.log` - Log general de la aplicación
- Consola - Salida en tiempo real con colores

### Respaldo de Sesión

**Recomendación**: Hacer backup periódico del directorio `baileys_store_*` para:
- Evitar tener que re-escanear el QR después de fallos
- Recuperación rápida en caso de problemas
- Migración a otro servidor

```bash
# Crear backup
tar -czf whatsapp_session_backup_$(date +%Y%m%d).tar.gz baileys_store_*

# Restaurar backup
tar -xzf whatsapp_session_backup_YYYYMMDD.tar.gz
```

## Mejores Prácticas

### 1. Uso de Número Dedicado
- Usa un número de WhatsApp exclusivo para el bot
- No uses este número para conversaciones personales
- Evita tener WhatsApp Web abierto en otros navegadores

### 2. Gestión de Límites
El bot implementa límites para evitar bloqueos:
- **Máximo 100 mensajes por hora** a un mismo número
- **Máximo 500 mensajes diarios** en total
- **Delay de 1-2 segundos** entre mensajes

### 3. Monitoreo Regular
- Revisa los logs diariamente
- Monitorea el panel de administración
- Verifica las estadísticas de seguimiento

### 4. Manejo de Errores
El bot maneja automáticamente:
- Reconexión en caso de desconexión
- Reintentos de mensajes fallidos
- Limpieza de sesiones inválidas

## Arquitectura de Conexión

```
┌─────────────────┐
│  TechAura Bot   │
│   (Node.js)     │
└────────┬────────┘
         │
         │ Baileys Provider
         │
┌────────▼────────┐
│  WhatsApp Web   │
│     Client      │
└────────┬────────┘
         │
         │ WebSocket
         │
┌────────▼────────┐
│   WhatsApp      │
│    Servers      │
└────────┬────────┘
         │
         │
┌────────▼────────┐
│  Teléfono con   │
│    WhatsApp     │
└─────────────────┘
```

## Características de Seguridad

1. **Encriptación End-to-End**: Todos los mensajes están encriptados
2. **Sesión Persistente**: Las credenciales se guardan de forma segura
3. **Validación de Teléfono**: El bot valida números antes de enviar mensajes
4. **Rate Limiting**: Previene spam y bloqueos

## Soporte y Troubleshooting

### Logs Importantes

Busca estos mensajes en los logs:

**✅ Conexión exitosa**:
```
[INFO] [whatsapp] WhatsApp conectado exitosamente
✅ WhatsApp conectado exitosamente
```

**❌ Error de conexión**:
```
[ERROR] [whatsapp] Error en conexión WhatsApp
❌ Error al conectar WhatsApp
```

**⚠️ QR requerido**:
```
[WARN] [whatsapp] Escanea el código QR para conectar WhatsApp
🔄 Generando código QR...
```

### Comandos Útiles

```bash
# Ver logs en tiempo real
npm start

# Verificar estado del bot
curl http://localhost:3009/status

# Ver estadísticas de seguimiento
curl http://localhost:3009/v1/followup/stats

# Limpiar sesiones inválidas
curl -X POST http://localhost:3009/v1/followup/cleanup
```

## Integración con el Sistema

El bot de WhatsApp está integrado con:

1. **Sistema de Flujos**: 29 flujos registrados incluyendo:
   - capacityMusic, capacityVideo
   - musicUsb, videosUsb, moviesUsb
   - customizationFlow, orderFlow
   - Y más...

2. **Base de Datos MySQL**: Almacena:
   - Órdenes de clientes
   - Historial de conversaciones
   - Estadísticas de uso

3. **Panel de Administración**: Accesible en `/admin`
   - Dashboard con estadísticas
   - Gestión de órdenes
   - Análisis de conversaciones

## Contacto y Ayuda

Para problemas o preguntas:
1. Revisa los logs del sistema
2. Consulta este documento
3. Verifica el estado en `/admin`
4. Contacta al equipo de desarrollo

---

**Última actualización**: Diciembre 2024
**Versión del documento**: 1.0

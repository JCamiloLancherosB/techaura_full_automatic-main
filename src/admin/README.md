# Admin Panel Quick Start Guide

## Acceso Rápido

Una vez que el servidor esté corriendo, accede al panel de administración en:

```
http://localhost:3006/admin
```

## Pestañas Principales

### 📊 Dashboard
Vista general con estadísticas en tiempo real de pedidos y conversiones.

### 📦 Pedidos
Gestión completa de pedidos:
- Ver todos los pedidos
- Filtrar por estado, tipo, fecha
- Confirmar o cancelar pedidos
- Agregar notas administrativas

### 🎵 Catálogo
Exploración del catálogo de contenido disponible:
- Música organizada por géneros y artistas
- Videos, películas y series
- Búsqueda de contenido

### ⚙️ Procesamiento
Monitoreo del sistema de copiado automático:
- Cola de trabajos
- Progreso en tiempo real
- Logs de actividad

### 📈 Análisis
Estadísticas detalladas del chatbot:
- Conversaciones activas
- Contenido más popular
- Horarios pico

### ⚙️ Configuración
Configuración del sistema:
- Precios por capacidad
- Rutas de contenido
- Herramientas de backup

## Primeros Pasos

1. **Iniciar el servidor**:
   ```bash
   npm run dev
   ```

2. **Abrir el panel**:
   Navegar a `http://localhost:3006/admin`

3. **Ver pedidos pendientes**:
   - Click en pestaña "Pedidos"
   - Filtrar por estado "Pendiente"

4. **Confirmar un pedido**:
   - Click en "Ver" en cualquier pedido
   - Click en "Confirmar"

5. **Monitorear procesamiento**:
   - Click en pestaña "Procesamiento"
   - Ver trabajos activos con progreso en tiempo real

## Características Destacadas

✅ **Actualización en tiempo real** via Socket.io
✅ **Responsive** - funciona en desktop y móvil
✅ **Interfaz intuitiva** con diseño moderno
✅ **Búsqueda y filtros** avanzados
✅ **Sin necesidad de recargar** - todo dinámico

## Documentación Completa

Ver [ADMIN_PANEL_DOCS.md](./ADMIN_PANEL_DOCS.md) para documentación detallada.

# TechAura Admin Panel - Documentación

## Descripción General

El Panel de Administración de TechAura es una interfaz web completa para gestionar el sistema de chatbot y procesador automático de USBs personalizadas. Permite administrar pedidos, navegar el catálogo de contenido, monitorear el procesamiento automático, y analizar estadísticas del chatbot.

## Características Principales

### 1. Dashboard Principal
- **Vista general de estadísticas**: Total de pedidos, pendientes, en proceso y completados
- **Métricas de conversión**: Tasa de conversión, tiempo promedio de respuesta
- **Gráficos interactivos**: Distribución por tipo de contenido y capacidad
- **Top contenidos**: Géneros, artistas y películas más solicitados
- **Actualización automática**: Dashboard se actualiza cada 30 segundos

### 2. Gestión de Pedidos
- **Listado completo**: Todos los pedidos con filtros avanzados
- **Filtros disponibles**:
  - Por estado (Pendiente, Confirmado, En Proceso, Completado, Cancelado)
  - Por tipo de contenido (Música, Videos, Películas, Series, Mixto)
  - Por fecha
  - Búsqueda por texto
- **Acciones sobre pedidos**:
  - Ver detalles completos
  - Confirmar pedidos
  - Cancelar pedidos con razón
  - Editar información
  - Agregar notas administrativas
- **Estados de pedido**:
  - `pending`: Pedido recibido, esperando confirmación
  - `confirmed`: Confirmado por admin, listo para procesar
  - `processing`: En proceso de preparación
  - `completed`: USB completada y entregada
  - `cancelled`: Pedido cancelado

### 3. Catálogo de Contenido
- **Navegación por carpetas**: Estructura organizada por tipo de contenido
- **Categorías**:
  - Música: Por géneros y artistas
  - Videos: Videoclips, conciertos, karaoke
  - Películas: Por géneros y sagas
  - Series: Por temporadas
- **Búsqueda de archivos**: Buscar contenido específico en todo el catálogo
- **Estadísticas**: Cantidad de archivos y tamaño total por categoría
- **Vista de géneros disponibles**: Lista de todos los géneros/categorías disponibles

### 4. Procesamiento Automático
- **Cola de procesamiento**: Visualización de pedidos en espera
- **Trabajos activos**: Monitoreo de USBs en preparación con barra de progreso
- **Logs de actividad**: Registro detallado de todas las operaciones
- **Control de trabajos**: Cancelar trabajos en proceso si es necesario
- **Actualización en tiempo real**: Via Socket.io

### 5. Análisis y Estadísticas del Chatbot
- **Métricas de conversaciones**:
  - Conversaciones activas
  - Total de conversaciones
  - Tasa de conversión
  - Tiempo promedio de respuesta
- **Análisis de intenciones**: Intenciones más detectadas
- **Popularidad de contenido**:
  - Géneros más solicitados
  - Artistas más pedidos
  - Películas más populares
- **Horarios pico**: Gráfico de actividad por hora del día
- **Usuarios nuevos vs recurrentes**

### 6. Configuración y Herramientas
- **Configuración del chatbot**:
  - Habilitar/deshabilitar respuestas automáticas
  - Ajustar retraso de respuesta
- **Configuración de precios**: Precios por capacidad (8GB, 32GB, 64GB, 128GB, 256GB)
- **Rutas de contenido**: Visualización de rutas de origen para cada tipo de contenido
- **Herramientas**:
  - Exportar reportes
  - Backup de datos

## Arquitectura Técnica

### Backend (TypeScript)

#### Tipos y Interfaces (`src/admin/types/AdminTypes.ts`)
Define todas las interfaces TypeScript para:
- Pedidos administrativos
- Archivos de contenido
- Estructura de carpetas
- Estadísticas del dashboard
- Analíticas del chatbot
- Items de la cola de procesamiento
- Configuración del sistema

#### Servicios (`src/admin/services/`)

**OrderService.ts**
- Gestión de pedidos (CRUD completo)
- Actualización de estados
- Confirmación/cancelación de pedidos
- Gestión de notas administrativas
- Integración con businessDB

**ContentService.ts**
- Exploración de estructura de carpetas
- Búsqueda de archivos
- Obtención de géneros disponibles
- Estadísticas de contenido
- Validación de extensiones de archivo

**AnalyticsService.ts**
- Estadísticas de dashboard
- Métricas del chatbot
- Análisis de popularidad de contenido
- Cálculo de tasas de conversión
- Métricas de tiempo

**CopyService.ts**
- Preparación automática de USBs
- Copiado de archivos según preferencias
- Monitoreo de progreso
- Validación de integridad
- Generación de reportes de contenido

#### Controlador Principal (`src/admin/AdminPanel.ts`)
- Integra todos los servicios
- Proporciona endpoints API
- Manejo de errores
- Validación de requests

### Frontend (HTML/CSS/JavaScript)

#### Interfaz (`public/admin/index.html`)
- Diseño con pestañas (Tab-based UI)
- 6 pestañas principales completamente funcionales
- Modal para detalles de pedidos
- Formularios de filtros
- Tablas de datos
- Gráficos (Canvas)

#### Estilos (`public/admin/styles.css`)
- Tema oscuro profesional
- Diseño responsive (mobile-first)
- Variables CSS para fácil personalización
- Componentes reutilizables
- Animaciones suaves

#### Lógica (`public/admin/admin.js`)
- Gestión de pestañas
- Conexión Socket.io para actualizaciones en tiempo real
- Llamadas a API REST
- Renderizado dinámico de datos
- Manejo de filtros y paginación
- Gestión de modal

### Integración con Sistema Existente

#### Base de Datos
- Usa `businessDB` existente para pedidos
- Compatible con esquema actual
- Extiende funcionalidad sin modificar estructura

#### AutoProcessor
- Se integra con `autoProcessor` existente
- Monitorea cola de procesamiento
- Proporciona control adicional

#### Socket.io
- Reutiliza conexión Socket.io existente
- Eventos en tiempo real:
  - `orderUpdate`: Actualización de pedidos
  - `processingUpdate`: Actualización de procesamiento

## API Endpoints

### Dashboard
```
GET /api/admin/dashboard
```
Retorna estadísticas completas del dashboard.

### Pedidos
```
GET /api/admin/orders?page=1&limit=50&status=pending&contentType=music
GET /api/admin/orders/:orderId
PUT /api/admin/orders/:orderId
POST /api/admin/orders/:orderId/confirm
POST /api/admin/orders/:orderId/cancel
POST /api/admin/orders/:orderId/note
```

### Catálogo de Contenido
```
GET /api/admin/content/structure/:category?maxDepth=3
GET /api/admin/content/search?category=music&searchTerm=rock
GET /api/admin/content/genres/:category
GET /api/admin/content/stats/:category
```

### Analíticas
```
GET /api/admin/analytics/chatbot
```

### Procesamiento
```
GET /api/admin/processing/queue
GET /api/admin/processing/progress/:jobId
POST /api/admin/processing/cancel/:jobId
```

### Configuración
```
GET /api/admin/settings
PUT /api/admin/settings
```

## Instalación y Uso

### Requisitos
- Node.js >= 18.0.0
- npm >= 8.0.0
- MySQL/MariaDB
- Acceso a las rutas de contenido configuradas

### Instalación
```bash
# Instalar dependencias
npm install

# O con pnpm
pnpm install
```

### Ejecución
```bash
# Desarrollo
npm run dev

# Producción
npm run start:prod
```

### Acceso
Una vez iniciado el servidor, acceder a:
```
http://localhost:3006/admin
```

## Rutas de Contenido

El sistema espera las siguientes rutas de contenido (configurables en `src/config.ts`):

```
MUSIC_ROOT = 'D:/MUSICA3/'
VIDEO_ROOT = 'E:/VIDEOS/'
MOVIES_ROOT = 'D:/PELICULAS/'
SERIES_ROOT = 'D:/SERIES/'
```

## Seguridad

### Consideraciones
- **Autenticación**: Actualmente sin autenticación (agregar según necesidades)
- **Autorización**: Todos los endpoints son públicos
- **Validación**: Todas las entradas son validadas
- **SQL Injection**: Protegido por uso de prepared statements
- **XSS**: Protegido por sanitización de entradas

### Recomendaciones de Seguridad
1. Implementar autenticación (JWT, OAuth, etc.)
2. Agregar roles y permisos
3. Usar HTTPS en producción
4. Implementar rate limiting
5. Auditoría de acciones administrativas

## Personalización

### Modificar Colores
Editar variables CSS en `public/admin/styles.css`:
```css
:root {
    --primary-color: #2563eb;
    --success-color: #22c55e;
    --danger-color: #ef4444;
    /* etc. */
}
```

### Agregar Nueva Pestaña
1. Agregar botón en HTML:
```html
<button class="tab-button" data-tab="nueva">
    <span class="tab-icon">🆕</span>
    Nueva
</button>
```

2. Agregar contenido:
```html
<div id="nueva" class="tab-content">
    <!-- Contenido aquí -->
</div>
```

3. Agregar lógica en `admin.js`:
```javascript
case 'nueva':
    loadNuevaTab();
    break;
```

### Modificar Precios por Defecto
Editar en `AdminPanel.ts`:
```typescript
pricing: {
    '8GB': 15000,
    '32GB': 25000,
    // etc.
}
```

## Solución de Problemas

### Panel no carga
1. Verificar que el servidor esté corriendo
2. Verificar la ruta: `http://localhost:PORT/admin`
3. Revisar logs del servidor
4. Verificar que las rutas estén configuradas en `app.ts`

### No se muestran pedidos
1. Verificar conexión a base de datos
2. Revisar tabla de pedidos en DB
3. Verificar logs del servidor
4. Probar endpoint directamente: `/api/admin/orders`

### Error al buscar contenido
1. Verificar que las rutas de contenido existan
2. Verificar permisos de lectura
3. Revisar logs del servidor

### Socket.io desconectado
1. Verificar que Socket.io esté correctamente configurado
2. Revisar firewall y proxy
3. Verificar logs del navegador (F12 → Console)

## Próximas Mejoras

### Corto Plazo
- [ ] Implementar autenticación de usuarios
- [ ] Agregar exportación de reportes en PDF/Excel
- [ ] Mejorar gráficos con librería Chart.js
- [ ] Agregar notificaciones push
- [ ] Implementar búsqueda avanzada de pedidos

### Mediano Plazo
- [ ] Dashboard personalizable (drag & drop widgets)
- [ ] Historial de cambios en pedidos
- [ ] Sistema de comentarios/chat entre admins
- [ ] Gestión de inventario de USBs
- [ ] Integración con sistemas de pago

### Largo Plazo
- [ ] App móvil (React Native / Flutter)
- [ ] API pública con documentación Swagger
- [ ] Sistema de plugins/extensiones
- [ ] Machine Learning para predicción de demanda
- [ ] Multi-tenancy para múltiples tiendas

## Soporte

Para reportar bugs o solicitar funcionalidades:
1. Crear issue en el repositorio
2. Incluir detalles del problema
3. Adjuntar logs si es posible
4. Especificar versión del sistema

## Licencia

ISC

## Autores

TechAura Team

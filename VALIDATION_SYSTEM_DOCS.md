# Sistema de Validación y Persistencia de Datos

Este documento describe el nuevo sistema implementado para validación, persistencia y procesamiento de datos en TechAura.

## Tabla de Contenidos

1. [Arquitectura](#arquitectura)
2. [Validación de Datos](#validación-de-datos)
3. [Persistencia en Base de Datos](#persistencia-en-base-de-datos)
4. [Procesamiento de Archivos](#procesamiento-de-archivos)
5. [API Endpoints](#api-endpoints)
6. [Interfaz de Usuario](#interfaz-de-usuario)
7. [Migraciones](#migraciones)
8. [Uso](#uso)

## Arquitectura

El sistema sigue un patrón de arquitectura en capas:

```
├── Presentation Layer (UI)
│   └── public/order-management.html
├── Application Layer (Routes)
│   └── src/routes/validationRoutes.ts
├── Business Logic Layer (Services)
│   ├── src/validation/
│   └── src/services/fileProcessing/
├── Data Access Layer (Repositories)
│   └── src/repositories/
└── Database Layer
    └── MySQL con Knex
```

## Validación de Datos

### Schemas de Validación

El sistema utiliza **Zod** para validación type-safe de datos:

- **customerSchema**: Validación de datos de clientes
- **orderSchema**: Validación de órdenes
- **customizationSchema**: Validación de personalizaciones
- **fileUploadSchema**: Validación de archivos subidos

Ubicación: `src/validation/schemas.ts`

### Reglas de Validación

#### Cliente
- **Nombre**: 2-100 caracteres
- **Teléfono**: Formato colombiano (+57 3XXXXXXXXX)
- **Email**: Formato válido de email
- **País**: Por defecto "Colombia"

#### Orden
- **Tipo de Contenido**: music, videos, movies, series, mixed, documentaries, custom
- **Capacidad**: 64GB, 128GB, 256GB, 512GB
- **Precio**: Mayor a 0, máximo 10,000,000 COP
- **Estado**: pending, confirmed, processing, completed, cancelled

### Normalización

Todos los datos son normalizados automáticamente:

- **Strings**: Trim de espacios en blanco
- **Emails**: Convertidos a lowercase
- **Teléfonos**: Formato estandarizado
- **Arrays**: Eliminación de elementos vacíos

Ubicación: `src/validation/validator.ts`

## Persistencia en Base de Datos

### Tablas Creadas

#### `customers`
Almacena información de clientes:

```sql
- id (UUID)
- name (VARCHAR 100)
- phone (VARCHAR 20, UNIQUE)
- email (VARCHAR 100)
- address, city, country
- preferences (JSON)
- notes (TEXT)
- total_orders, total_spent
- vip_status (BOOLEAN)
- created_at, updated_at, last_interaction, last_order_date
```

#### `orders` (actualizada)
Almacena órdenes con campos adicionales:

```sql
- customer_id (UUID, FK a customers)
- preferences (JSON)
- customization (JSON)
- payment_status
- admin_notes (JSON)
- completed_at
```

#### `processing_jobs`
Rastrea trabajos de procesamiento:

```sql
- id, order_id, job_type, status
- progress, total_files, processed_files
- errors (JSON), metadata (JSON)
- started_at, completed_at
```

#### `file_uploads`
Rastrea archivos subidos:

```sql
- id, processing_job_id, filename, mimetype, size
- validation_errors (JSON)
- total_records, valid_records, invalid_records
```

### Repositorios

#### CustomerRepository
- `create()`: Crear cliente
- `findById()`, `findByPhone()`, `findByEmail()`: Buscar clientes
- `update()`: Actualizar cliente
- `list()`: Listar con filtros y paginación
- `findOrCreate()`: Buscar o crear cliente

#### OrderRepository
- `create()`: Crear orden
- `findById()`, `findByOrderNumber()`: Buscar órdenes
- `updateStatus()`: Actualizar estado
- `list()`: Listar con filtros y paginación
- `getStats()`: Estadísticas de órdenes
- `addNote()`: Agregar nota administrativa

Ubicación: `src/repositories/`

## Procesamiento de Archivos

### Formatos Soportados

- **CSV**: Delimitado por comas
- **Excel**: .xlsx, .xls
- **JSON**: Array de objetos

### Validaciones de Archivos

- Tamaño máximo: 10MB
- MIME types permitidos
- Estructura de columnas requeridas
- Validación de cada registro

### Flujo de Procesamiento

1. **Upload**: Cliente sube archivo
2. **Validación**: Verifica tipo, tamaño y estructura
3. **Parsing**: Convierte archivo a registros
4. **Validación de Registros**: Valida cada fila
5. **Procesamiento**: Crea clientes y órdenes
6. **Feedback**: Retorna resultados con errores detallados

Ubicación: `src/services/fileProcessing/FileUploadService.ts`

## API Endpoints

### Clientes

#### `POST /api/customers`
Crear nuevo cliente.

**Body:**
```json
{
  "name": "Juan Pérez",
  "phone": "+573001234567",
  "email": "juan@example.com",
  "city": "Bogotá",
  "country": "Colombia"
}
```

#### `GET /api/customers/:id`
Obtener cliente por ID.

#### `GET /api/customers/phone/:phone`
Obtener cliente por teléfono.

#### `GET /api/customers`
Listar clientes con paginación.

**Query Params:**
- `page`: Número de página (default: 1)
- `limit`: Registros por página (default: 50)
- `search`: Término de búsqueda
- `vipOnly`: true/false

#### `PUT /api/customers/:id`
Actualizar cliente.

### Órdenes

#### `POST /api/orders`
Crear nueva orden.

**Body:**
```json
{
  "customer_id": "uuid",
  "content_type": "music",
  "capacity": "128GB",
  "price": 50000,
  "notes": "Géneros: Rock, Pop"
}
```

#### `GET /api/orders/:id`
Obtener orden por ID.

#### `GET /api/orders`
Listar órdenes con filtros.

**Query Params:**
- `page`, `limit`: Paginación
- `status`: Estado de orden
- `contentType`: Tipo de contenido
- `customerPhone`: Filtrar por teléfono
- `searchTerm`: Búsqueda general
- `dateFrom`, `dateTo`: Rango de fechas

#### `PATCH /api/orders/:id/status`
Actualizar estado de orden.

**Body:**
```json
{
  "status": "processing"
}
```

#### `GET /api/orders/stats`
Obtener estadísticas de órdenes.

### Carga de Archivos

#### `POST /api/upload/orders`
Validar y procesar archivo.

**Form Data:**
- `file`: Archivo CSV/Excel/JSON

**Respuesta:**
```json
{
  "success": true,
  "totalRecords": 100,
  "validRecords": 95,
  "invalidRecords": 5,
  "errors": ["Fila 12: Teléfono inválido", ...]
}
```

#### `POST /api/upload/orders/process`
Procesar y persistir registros del archivo.

## Interfaz de Usuario

### Order Management (`/order-management.html`)

Interfaz moderna con tres pestañas:

#### 1. Crear Pedido
- Formulario con validación en tiempo real
- Feedback inmediato de errores
- Indicadores de carga
- Auto-guardado de estado

#### 2. Importar Archivo
- Drag & drop de archivos
- Barra de progreso
- Resultados detallados del procesamiento
- Resumen de errores

#### 3. Ver Pedidos
- Tabla paginada de pedidos
- Búsqueda con debounce
- Filtros por estado y tipo
- Actualización automática

### Características UX

- **Validación inline**: Feedback inmediato al escribir
- **Loading states**: Indicadores durante operaciones
- **Debouncing**: Optimización de búsquedas
- **Paginación**: Manejo eficiente de grandes volúmenes
- **Error handling**: Mensajes claros y accionables
- **Progress tracking**: Barras de progreso visuales

## Migraciones

### Ejecutar Migraciones

```bash
# Con Knex CLI
npx knex migrate:latest --knexfile knexfile.js

# O usando el endpoint API
POST /v1/admin/migrate
```

### Archivos de Migración

- `20240810000000_create_tables.js`: Tablas iniciales
- `20241217000000_add_customers_and_validation.js`: Sistema de validación

### Rollback

```bash
npx knex migrate:rollback --knexfile knexfile.js
```

## Uso

### Ejemplo 1: Crear Cliente y Orden

```javascript
// 1. Crear cliente
const customerResponse = await fetch('/api/customers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'María García',
    phone: '+573001234567',
    email: 'maria@example.com'
  })
});

const { data: customer } = await customerResponse.json();

// 2. Crear orden
const orderResponse = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer_id: customer.id,
    content_type: 'music',
    capacity: '128GB',
    price: 50000,
    customization: {
      genres: ['Rock', 'Pop'],
      artists: ['Queen', 'The Beatles']
    }
  })
});
```

### Ejemplo 2: Importar Archivo CSV

Estructura del CSV:
```csv
customer_name,customer_phone,customer_email,content_type,capacity,price,notes
Juan Pérez,+573001234567,juan@example.com,music,128GB,50000,Rock y Pop
María García,+573009876543,maria@example.com,videos,256GB,80000,Documentales
```

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/upload/orders/process', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(`Procesados: ${result.data.processed}`);
console.log(`Errores: ${result.data.failed}`);
```

### Ejemplo 3: Buscar y Filtrar Órdenes

```javascript
const params = new URLSearchParams({
  page: '1',
  limit: '20',
  status: 'pending',
  contentType: 'music',
  searchTerm: 'García'
});

const response = await fetch(`/api/orders?${params}`);
const { data, pagination } = await response.json();

console.log(`Mostrando ${data.length} de ${pagination.total}`);
```

## Mejores Prácticas

### Validación
- Siempre validar en cliente y servidor
- Usar schemas de Zod para consistencia
- Proporcionar mensajes de error claros

### Persistencia
- Usar transacciones para operaciones múltiples
- Implementar manejo de errores robusto
- Mantener índices en columnas frecuentemente consultadas

### Archivos
- Validar archivos antes de procesarlos
- Limitar tamaño de archivos
- Proporcionar feedback detallado de errores

### Performance
- Implementar paginación en listados
- Usar debouncing en búsquedas
- Cachear cuando sea apropiado
- Optimizar queries con índices

## Troubleshooting

### Error: "Database connection failed"
- Verificar variables de entorno en `.env`
- Asegurar que MySQL esté corriendo
- Verificar credenciales de base de datos

### Error: "Table does not exist"
- Ejecutar migraciones: `npx knex migrate:latest`
- Verificar que las migraciones se ejecutaron correctamente

### Error: "File upload failed"
- Verificar tamaño del archivo (máx. 10MB)
- Asegurar formato de archivo soportado
- Revisar estructura del archivo

### Error: "Validation failed"
- Revisar formato de datos
- Consultar documentación de schemas
- Verificar mensajes de error específicos

## Soporte

Para problemas o preguntas:
1. Revisar esta documentación
2. Verificar logs del servidor
3. Consultar el código fuente en `src/validation/` y `src/repositories/`
4. Contactar al equipo de desarrollo

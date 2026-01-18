# Test Scenarios - Log Errors and Metrics Fix

## 🧪 Escenarios de Prueba

### Escenario 1: Migración Automática de Columna

**Objetivo:** Verificar que la columna `total_orders` se crea automáticamente

**Pre-condición:**
- Base de datos sin columna `total_orders` en tabla `user_sessions`

**Pasos:**
1. Iniciar la aplicación
2. Verificar logs de inicio

**Resultado esperado:**
```
✅ user_sessions actualizado: columna total_orders agregada
```

**Criterio de éxito:** 
- ✅ Aplicación inicia sin errores
- ✅ Columna `total_orders` existe en `user_sessions`
- ✅ Valor por defecto es 0 para registros existentes

---

### Escenario 2: Limpieza de Sesiones Inactivas

**Objetivo:** Verificar que `cleanInactiveSessions()` funciona sin errores

**Pre-condición:**
- Base de datos con sesiones antiguas (>7 días sin interacción)

**Pasos:**
1. Esperar al ciclo de mantenimiento automático (cada 2 horas)
2. O ejecutar manualmente: `businessDB.cleanInactiveSessions(168)`

**Resultado esperado:**
```
✅ Sesiones inactivas limpiadas: X
```

**Criterio de éxito:**
- ✅ No hay error "Unknown column 'total_orders'"
- ✅ Sesiones con `total_orders = 0` y `message_count < 3` son eliminadas
- ✅ Logs muestran cantidad de sesiones eliminadas

---

### Escenario 3: Métricas Después de Reinicio

**Objetivo:** Verificar que métricas muestran datos reales después de reiniciar

**Pre-condición:**
- Base de datos con pedidos reales (tabla `orders` con registros)
- Base de datos con usuarios activos (tabla `user_sessions` con registros)

**Pasos:**
1. Obtener métricas actuales: `await getBusinessMetrics()`
2. Anotar valores de:
   - `totalOrders`
   - `completedOrders`
   - `totalRevenue`
   - `activeUsers`
3. Reiniciar la aplicación
4. Obtener métricas nuevamente: `await getBusinessMetrics()`

**Resultado esperado:**
- Métricas post-reinicio ≥ métricas pre-reinicio
- No se muestran ceros si hay datos en base de datos

**Criterio de éxito:**
- ✅ `totalOrders` refleja datos de tabla `orders`
- ✅ `totalRevenue` muestra suma de pedidos completados
- ✅ `activeUsers` muestra usuarios con actividad reciente
- ✅ No hay valores en cero si existen datos reales

---

### Escenario 4: Creación de Pedido y Actualización de total_orders

**Objetivo:** Verificar que `total_orders` se actualiza al crear pedidos

**Pre-condición:**
- Usuario con teléfono conocido en `user_sessions`
- `total_orders` inicial = 0

**Pasos:**
1. Crear pedido: `businessDB.createOrder({ customerPhone: '573001234567', ... })`
2. Verificar logs
3. Consultar `user_sessions`: `SELECT total_orders FROM user_sessions WHERE phone = '573001234567'`

**Resultado esperado:**
```
✅ Orden ORD-XXX creada exitosamente
```

**Criterio de éxito:**
- ✅ Campo `total_orders` incrementa en 1
- ✅ Valor refleja cantidad de pedidos completados/en proceso
- ✅ No se cuentan pedidos pendientes o fallidos

---

### Escenario 5: Métricas con Datos en Memoria y Base de Datos

**Objetivo:** Verificar que se usa el valor mayor entre memoria y DB

**Setup:**
- Tabla `orders` con 10 pedidos completados
- Memoria (Map userSessions) con 2 pedidos recientes

**Pasos:**
1. Llamar `await getBusinessMetrics()`
2. Verificar que se consulta base de datos
3. Verificar que se combina con datos en memoria

**Resultado esperado:**
```javascript
{
  totalOrders: 10,  // Max(2 memoria, 10 DB)
  completedOrders: 10,
  totalRevenue: 1199000,  // Suma real de base de datos
  activeUsers: ...,
  totalUsers: ...,
  conversionRate: ...
}
```

**Criterio de éxito:**
- ✅ Se ejecutan consultas SQL a `orders` y `user_sessions`
- ✅ Resultado usa `Math.max(memoria, db)` para cada métrica
- ✅ No hay valores en cero si existen datos en DB

---

### Escenario 6: Fallback en Caso de Error de DB

**Objetivo:** Verificar que el sistema funciona si falla consulta a DB

**Setup:**
- Simular error de conexión a base de datos
- Datos en memoria disponibles

**Pasos:**
1. Desconectar base de datos temporalmente
2. Llamar `await getBusinessMetrics()`
3. Verificar logs de error

**Resultado esperado:**
```
❌ Error querying database for metrics: [error details]
```

**Criterio de éxito:**
- ✅ No se rompe la aplicación
- ✅ Retorna datos de memoria
- ✅ Log de error registrado
- ✅ Aplicación continúa funcionando

---

## 🔍 Verificaciones Post-Deploy

### Checklist de Producción

- [ ] **Logs de inicio**
  - Buscar: "✅ user_sessions actualizado: columna total_orders agregada"
  - O: No aparece (si ya existía la columna)

- [ ] **Logs de mantenimiento**
  - Buscar: "✅ Sesiones inactivas limpiadas: X"
  - Verificar: No hay "Error: Unknown column 'total_orders'"

- [ ] **Panel de control**
  - Verificar: Total de pedidos > 0 (si hay pedidos reales)
  - Verificar: Ingresos totales > 0 (si hay pedidos completados)
  - Verificar: Usuarios activos > 0 (si hay actividad reciente)

- [ ] **Base de datos**
  - Ejecutar: `DESC user_sessions;`
  - Verificar: Columna `total_orders` existe con tipo `INT` y default `0`

- [ ] **Métricas después de reinicio**
  - Anotar métricas actuales
  - Reiniciar aplicación
  - Verificar: Métricas siguen mostrando valores similares (no regresan a cero)

---

## 🐛 Debugging Tips

### Si aparece error "Unknown column 'total_orders'"

**Causas posibles:**
1. Migración no se ejecutó (error en `ensureUserSessionsSchema`)
2. Múltiples bases de datos (verificar `DB_CONFIG.database`)
3. Usuario sin permisos ALTER TABLE

**Solución:**
```sql
-- Ejecutar manualmente:
ALTER TABLE user_sessions ADD COLUMN total_orders INT DEFAULT 0;
```

### Si métricas muestran ceros

**Verificar:**
1. ¿Hay datos en tabla `orders`?
   ```sql
   SELECT COUNT(*) FROM orders;
   ```

2. ¿Hay pedidos completados?
   ```sql
   SELECT COUNT(*) FROM orders WHERE processing_status = 'completed';
   ```

3. ¿La consulta se ejecuta correctamente?
   - Buscar logs: "❌ Error querying database for metrics"

4. ¿businessDB está inicializado?
   - Verificar logs de inicio: "✅ MySQL Connected"

---

## 📊 Queries Útiles para Verificación

### Verificar estructura de tabla
```sql
DESC user_sessions;
-- Debe incluir: total_orders INT DEFAULT 0
```

### Verificar datos de métricas
```sql
-- Total de pedidos por estado
SELECT processing_status, COUNT(*) as total, SUM(price) as revenue
FROM orders
GROUP BY processing_status;

-- Usuarios con pedidos
SELECT phone, total_orders
FROM user_sessions
WHERE total_orders > 0
ORDER BY total_orders DESC
LIMIT 10;

-- Usuarios activos en últimas 24h
SELECT COUNT(*) as active_users
FROM user_sessions
WHERE last_activity >= DATE_SUB(NOW(), INTERVAL 24 HOUR);
```

### Verificar sincronización de total_orders
```sql
-- Comparar total_orders con pedidos reales
SELECT 
    us.phone,
    us.total_orders as column_value,
    COUNT(o.id) as actual_orders,
    us.total_orders - COUNT(o.id) as difference
FROM user_sessions us
LEFT JOIN orders o ON o.phone_number = us.phone 
    AND o.processing_status IN ('processing', 'completed')
GROUP BY us.phone, us.total_orders
HAVING difference != 0;
-- Resultado esperado: 0 filas (perfecta sincronización)
```

---

## ✅ Criterios de Aceptación

El PR se considera exitoso si:

1. ✅ No hay errores "Unknown column 'total_orders'" en logs
2. ✅ Métricas muestran datos reales (no ceros) después de reiniciar
3. ✅ Columna `total_orders` se crea automáticamente si no existe
4. ✅ `total_orders` se actualiza correctamente al crear pedidos
5. ✅ Panel de control muestra valores consistentes
6. ✅ Sistema funciona correctamente con y sin datos en memoria
7. ✅ No hay vulnerabilidades de seguridad (CodeQL: 0 alertas)
8. ✅ Backward compatible con código existente

---

**Última actualización:** 2026-01-18  
**Estado de pruebas:** Documentado - Listo para validación

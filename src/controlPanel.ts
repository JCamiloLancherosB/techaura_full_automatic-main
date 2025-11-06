// ====== SEPARADOR: controlPanel.ts - INICIO ======
import express, { Request, Response } from 'express';
import { usbManager } from './usbManager';
import { adapterDB } from './mysql-database';
import { autoProcessor } from './autoProcessor';
import { businessDB } from './mysql-database';

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Endpoint para obtener estado del sistema (USBs, cola, estadísticas)
app.get('/api/status', async (req, res) => {
    try {
        const usbStatus = await usbManager.getUSBStatus();
        const queueStatus = autoProcessor.getQueueStatus();
        const stats = await businessDB.getOrderStatistics();

        res.json({
            success: true,
            data: {
                usbs: usbStatus,
                queue: queueStatus,
                statistics: stats,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// Endpoint para obtener pedidos pendientes
app.get('/api/orders/pending', async (req, res) => {
    try {
        const orders = await businessDB.getPendingOrders();
        res.json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// Endpoint para forzar procesamiento de pedido (admin)
app.post('/api/orders/:orderNumber/process', async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const success = await autoProcessor.forceProcessOrder(orderNumber);
        if (success) {
            res.json({ success: true, message: `Pedido ${orderNumber} movido al inicio de la cola` });
        } else {
            res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// Endpoint para obtener información detallada de USBs
app.get('/api/usbs', async (req, res) => {
    try {
        const devices = await usbManager.detectUSBDevices();
        res.json({ success: true, data: devices }); 
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// Endpoint para formatear USB específica
app.post('/api/usbs/:devicePath/format', async (req: Request, res: Response) => {
    try {
        const { devicePath } = req.params;
        const { customerPhone } = req.body;

        const devices = await usbManager.detectUSBDevices();
        const device = devices.find(d => d.devicePath === decodeURIComponent(devicePath));

        if (!device) {
            return res.status(404).json({ success: false, error: 'USB no encontrada' });
        }

        const success = await usbManager.formatUSB(device, customerPhone);

        if (success) {
            res.json({ success: true, message: 'USB formateada exitosamente', label: device.label });
        } else {
            res.status(500).json({ success: false, error: 'Error formateando USB' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// Página web del panel de control
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Panel de Control USB</title>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; }
            .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .status { display: flex; justify-content: space-between; align-items: center; }
            .usb-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .usb-item { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
            .usb-empty { border-color: #4CAF50; background: #f0f8f0; }
            .usb-used { border-color: #ff9800; background: #fff8f0; }
            .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
            .btn-primary { background: #2196F3; color: white; }
            .btn-success { background: #4CAF50; color: white; }
            .btn-warning { background: #ff9800; color: white; }
            .progress { width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden; }
            .progress-bar { height: 100%; background: #4CAF50; transition: width 0.3s; }
            .refresh { position: fixed; top: 20px; right: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔌 Panel de Control USB - Sistema Automático</h1>
            <div class="card">
                <h2>📊 Estado del Sistema</h2>
                <div id="system-status">Cargando...</div>
            </div>
            <div class="card">
                <h2>🔌 USBs Conectadas</h2>
                <div id="usb-list">Cargando...</div>
            </div>
            <div class="card">
                <h2>📋 Cola de Procesamiento</h2>
                <div id="queue-status">Cargando...</div>
            </div>
            <div class="card">
                <h2>📈 Estadísticas</h2>
                <div id="statistics">Cargando...</div>
            </div>
        </div>
        <button class="btn btn-primary refresh" onclick="loadData()">🔄 Actualizar</button>
        <script>
            async function loadData() {
                try {
                    const response = await fetch('/api/status');
                    const data = await response.json();
                    if (data.success) {
                        updateSystemStatus(data.data);
                        updateUSBList(data.data.usbs.devices);
                        updateQueueStatus(data.data.queue);
                        updateStatistics(data.data.statistics);
                    }
                } catch (error) {
                    console.error('Error loading data:', error);
                }
            }
            function updateSystemStatus(data) {
                const html = \`
                    <div class="status">
                        <div>🔌 USBs Conectadas: <strong>\${data.usbs.connected}</strong></div>
                        <div>📦 USBs Vacías: <strong>\${data.usbs.empty}</strong></div>
                        <div>⏳ Cola: <strong>\${data.queue.queueLength}</strong></div>
                        <div>🔄 Procesando: <strong>\${data.queue.processing ? 'Sí' : 'No'}</strong></div>
                    </div>
                \`;
                document.getElementById('system-status').innerHTML = html;
            }
            function updateUSBList(devices) {
                const html = devices.map(device => \`
                    <div class="usb-item \${device.isEmpty ? 'usb-empty' : 'usb-used'}">
                        <h3>\${device.isEmpty ? '✅' : '📦'} \${device.label}</h3>
                        <p><strong>Capacidad:</strong> \${formatBytes(device.size)}</p>
                        <p><strong>Espacio Libre:</strong> \${formatBytes(device.freeSpace)}</p>
                        <p><strong>Sistema:</strong> \${device.fileSystem}</p>
                        <p><strong>Ruta:</strong> \${device.devicePath}</p>
                        <div class="progress">
                            <div class="progress-bar" style="width: \${(device.usedSpace / device.size) * 100}%"></div>
                        </div>
                        <p><small>\${((device.usedSpace / device.size) * 100).toFixed(1)}% usado</small></p>
                    </div>
                \`).join('');
                document.getElementById('usb-list').innerHTML = html;
            }
            function updateQueueStatus(queue) {
                const html = \`
                    <p><strong>Estado:</strong> \${queue.processing ? '🔄 Procesando' : '⏸️ Esperando'}</p>
                    <p><strong>Pedidos en Cola:</strong> \${queue.queueLength}</p>
                    \${queue.nextOrder ? \`<p><strong>Siguiente:</strong> \${queue.nextOrder}</p>\` : ''}
                \`;
                document.getElementById('queue-status').innerHTML = html;
            }
            function updateStatistics(stats) {
                const html = \`
                    <div class="status">
                        <div>📋 Total Pedidos: <strong>\${stats.total_orders || 0}</strong></div>
                        <div>✅ Completados: <strong>\${stats.completed_orders || 0}</strong></div>
                        <div>⏳ Pendientes: <strong>\${stats.pending_orders || 0}</strong></div>
                        <div>💰 Ingresos: <strong>$\${(stats.total_revenue || 0).toLocaleString()}</strong></div>
                    </div>
                \`;
                document.getElementById('statistics').innerHTML = html;
            }
            function formatBytes(bytes) {
                const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
                if (bytes === 0) return '0 Bytes';
                const i = Math.floor(Math.log(bytes) / Math.log(1024));
                return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
            }
            loadData();
            setInterval(loadData, 10000);
        </script>
    </body>
    </html>
    `);
});

// Inicializar servidor
export function startControlPanel(port: number = 3021): void {
    app.listen(port, () => {
        console.log(`🎛️ Panel de control disponible en http://localhost:${port}`);
    });
}
// ====== SEPARADOR: controlPanel.ts - FIN ======
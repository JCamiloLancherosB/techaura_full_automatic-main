import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { autoProcessor, autoProcessorEvents } from './autoProcessor';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    // Estado inicial
    socket.emit('queue', autoProcessor.getQueueStatus());

    // Suscribirse a eventos
    autoProcessorEvents.on('queueUpdated', (queue) => {
        socket.emit('queue', autoProcessor.getQueueStatus());
    });
    autoProcessorEvents.on('orderCompleted', (order) => {
        socket.emit('orderCompleted', order);
    });
    autoProcessorEvents.on('orderError', (order, error) => {
        socket.emit('orderError', { order, error });
    });
    autoProcessorEvents.on('processingStarted', (order) => {
        socket.emit('processingStarted', order);
    });
    autoProcessorEvents.on('usbStatus', (status) => {
        socket.emit('usbStatus', status);
    });
    autoProcessorEvents.on('systemReport', (report) => {
        socket.emit('systemReport', report);
    });
    autoProcessorEvents.on('paused', () => {
        socket.emit('paused');
    });
    autoProcessorEvents.on('resumed', () => {
        socket.emit('resumed');
    });

    // Acciones desde la UI
    socket.on('addOrder', async (order) => {
        await autoProcessor.addOrderToQueue(order);
    });
    socket.on('forceOrder', async (orderNumber) => {
        await autoProcessor.forceProcessOrder(orderNumber);
    });
    socket.on('pause', () => autoProcessor.pause());
    socket.on('resume', () => autoProcessor.resume());
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`🖥️  Interfaz visual disponible en http://localhost:${PORT}/autoProcessorUI.html`);
}); 
import { addKeyword } from '@builderbot/bot';
import { aiService } from '../services/aiService';
import { getUserSession, ExtendedContext } from '../flows/userTrackingSystem';

const aiAdminFlow = addKeyword(['!admin', '!test'])
.addAction(async (ctx: ExtendedContext, { flowDynamic }) => {
    try {
        // Verificar si es administrador (puedes agregar tu lógica de verificación aquí)
        const adminNumbers = ['573008602789']; // Agrega los números de admin
        
        if (!adminNumbers.includes(ctx.from)) {
            await flowDynamic(['❌ No tienes permisos de administrador']);
            return;
        }

        await flowDynamic([
            '🔧 *Panel de Administración AI*',
            '',
            'Comandos disponibles:',
            '• `!stats` - Estadísticas del servicio',
            '• `!test [mensaje]` - Probar respuesta de IA',
            '• `!reset` - Reiniciar servicio de IA',
            '• `!health` - Estado del sistema'
        ]);

    } catch (error) {
        console.error('❌ Error en aiAdminFlow:', error);
        await flowDynamic(['❌ Error en el panel de administración']);
    }
})
.addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic }) => {
    try {
        const command = ctx.body.toLowerCase().trim();
        const adminNumbers = ['573008602789'];
        
        if (!adminNumbers.includes(ctx.from)) {
            await flowDynamic(['❌ No tienes permisos de administrador']);
            return;
        }

        // Comando de estadísticas
        if (command === '!stats') {
            const stats = aiService.getStats();
            await flowDynamic([
                '📊 *Estadísticas del Servicio de IA*',
                '',
                `✅ Estado: ${stats.isAvailable ? 'Activo' : 'Inactivo'}`,
                `📈 Solicitudes totales: ${stats.requestCount}`,
                `❌ Errores: ${stats.errorCount}`,
                `🎯 Tasa de éxito: ${stats.successRate.toFixed(1)}%`,
                `⏰ Último error: ${stats.lastError ? stats.lastError.toLocaleString() : 'Ninguno'}`
            ]);
            return;
        }

        // Comando de prueba
        if (command.startsWith('!test ')) {
            const testMessage = command.replace('!test ', '');
            const session = await getUserSession(ctx.from);
            
            await flowDynamic(['🧪 Probando respuesta de IA...']);
            
            // ✅ CORRECCIÓN: generateResponse ahora devuelve solo string
            const testResponse = await aiService.generateResponse(testMessage, session);
            
            await flowDynamic([
                '🤖 *Resultado de la Prueba*',
                '',
                `📝 Mensaje: "${testMessage}"`,
                `💬 Respuesta: ${testResponse}`, // ← Solo string ahora
                `✅ Estado: ${aiService.isAvailable() ? 'IA Activa' : 'Usando Fallback'}`
            ]);
            return;
        }

        // Comando de reinicio
        if (command === '!reset') {
            await flowDynamic(['🔄 Reiniciando servicio de IA...']);
            
            try {
                // Reinicializar el servicio (esto requiere agregar un método público)
                await aiService.reinitialize();
                await flowDynamic(['✅ Servicio de IA reiniciado correctamente']);
            } catch (error) {
                await flowDynamic(['❌ Error al reiniciar el servicio']);
                console.error('Error reiniciando IA:', error);
            }
            return;
        }

        // Comando de salud del sistema
        if (command === '!health') {
            const stats = aiService.getStats();
            const healthStatus = stats.isAvailable && stats.successRate > 80 ? '🟢 Excelente' : 
                               stats.isAvailable && stats.successRate > 60 ? '🟡 Bueno' : '🔴 Crítico';
            
            await flowDynamic([
                '🏥 *Estado de Salud del Sistema*',
                '',
                `${healthStatus}`,
                `🔋 Servicio: ${stats.isAvailable ? 'Operativo' : 'Fuera de línea'}`,
                `📊 Rendimiento: ${stats.successRate.toFixed(1)}%`,
                `🔄 Solicitudes: ${stats.requestCount}`,
                '',
                stats.successRate > 80 ? '✅ Todo funcionando perfectamente' :
                stats.successRate > 60 ? '⚠️ Rendimiento aceptable' : '🚨 Requiere atención'
            ]);
            return;
        }

        // Comando no reconocido
        await flowDynamic([
            '❓ Comando no reconocido',
            '',
            'Comandos disponibles:',
            '• `!stats` - Ver estadísticas',
            '• `!test [mensaje]` - Probar IA',
            '• `!reset` - Reiniciar servicio',
            '• `!health` - Estado del sistema'
        ]);

    } catch (error) {
        console.error('❌ Error procesando comando admin:', error);
        await flowDynamic(['❌ Error procesando comando']);
    }
});

export default aiAdminFlow;

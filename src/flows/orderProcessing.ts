import { addKeyword, EVENTS } from '@builderbot/bot';

// Definir PaymentMethod interface
interface PaymentMethod {
    id: string;
    name: string;
    description: string;
    icon: string;
    available: boolean;
}

// Definir los métodos de pago como constante
const PAYMENT_METHODS: PaymentMethod[] = [
    {
        id: 'efectivo',
        name: 'Efectivo',
        description: 'Pago en efectivo al momento de la entrega',
        icon: '',
        available: true
    },
    {
        id: 'transferencia',
        name: 'Transferencia Bancaria',
        description: 'Transferencia a cuenta bancaria',
        icon: '',
        available: true
    },
    {
        id: 'tarjeta',
        name: 'Tarjeta de Crédito/Débito',
        description: 'Pago con tarjeta',
        icon: '',
        available: true
    }
];

// Flujo de métodos de pago
export const paymentMethodsData = addKeyword(['pago', 'como pagar', 'metodos de pago'])
    .addAnswer(
        '*Métodos de Pago Disponibles:*\n\n' +
        PAYMENT_METHODS.map(
            (method, index) =>
                `${index + 1}. ${method.icon} *${method.name}*\n   ${method.description}`
        ).join('\n\n') +
        '\n\n' +
        `Escribe el número del método que prefieres (1-${PAYMENT_METHODS.length})`
    )
    .addAction({ capture: true }, async (ctx, { flowDynamic /*, state */ }) => {
        const choice = parseInt((ctx.body || '').trim(), 10);

        if (choice >= 1 && choice <= PAYMENT_METHODS.length) {
            const selectedMethod = PAYMENT_METHODS[choice - 1];

            // Si usas state middleware:
            // await state.update({ selectedPaymentMethod: selectedMethod });

            await flowDynamic(
                `Has seleccionado: ${selectedMethod.icon} *${selectedMethod.name}*`
            );
        } else {
            await flowDynamic(
                'Opción inválida. Por favor selecciona un número válido.'
            );
        }
    });

// Flow principal de procesamiento de órdenes (plantilla genérica)
export const orderProcessingFlow = addKeyword(['confirmar_orden'])
    .addAction(async (ctx, { flowDynamic, state /*, provider */ }) => {
        try {
            // Obtener datos del estado (si usas state middleware)
            const orderData = (await state.get('orderData')) || {};
            const userSession = (await state.get('userSession')) || {};

            // Generar datos de la orden
            const orderNumber = `ORD-${Date.now()}`;
            const from = ctx.from || '';
            const customerName = userSession.name || 'Cliente';
            const productType = orderData.productType || 'music';
            const capacity = orderData.capacity || '32GB';
            const finalPrice = orderData.price || 0;
            const customization = orderData.customization || {};

            // Crear objeto de orden completo
            const fullOrder = {
                orderNumber,
                phoneNumber: from,
                customerName,
                productType: productType as 'music' | 'video' | 'movies' | 'series',
                capacity,
                price: finalPrice,
                customization,
                status: 'pending' as const,
                createdAt: new Date(),
                estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                paymentMethod: 'pending',
                shippingAddress: '',
                usbLabel: `${String(productType).toUpperCase()}_${capacity}_${Date.now()}`,
                notes: ''
            };

            // Guardar en estado
            await state.update({ currentOrder: fullOrder });

            // Mostrar resumen
            await flowDynamic([
                '*RESUMEN DE TU ORDEN*',
                `Producto: ${String(productType).toUpperCase()} USB ${capacity}`,
                `Precio: $${finalPrice.toLocaleString('es-CO')}`,
                `Número de orden: ${orderNumber}`,
                '',
                '¿Deseas continuar con el pago?',
                '1 Sí, continuar',
                '2 Modificar orden',
                '3 Cancelar'
            ]);
        } catch (error) {
            console.error('Error procesando orden:', error);
            await flowDynamic('Error procesando la orden. Intenta nuevamente.');
        }
    });

export default orderProcessingFlow;

import { addKeyword, EVENTS } from '@builderbot/bot';
// import { MemoryDB as Database } from '@builderbot/bot';
// import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
// import { TFlow } from '@builderbot/bot/lib/types';

// Definir PaymentMethod interface
interface PaymentMethod {
    id: string;
    name: string;
    description: string;
    icon: string;
    available: boolean;
}

// Definir los m�todos de pago como constante
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
        name: 'Tarjeta de Cr�dito/D�bito',
        description: 'Pago con tarjeta',
        icon: '',
        available: true
    }
];

export const paymentMethodsData = addKeyword(['pago', 'como pagar', 'metodos de pago'])
    .addAnswer(' *M�todos de Pago Disponibles:*\n\n' +
        PAYMENT_METHODS.map((method, index) =>
            `${index + 1}. ${method.icon} *${method.name}*\n   ${method.description}`
        ).join('\n\n') + '\n\n' +
        `Escribe el n�mero del m�todo que prefieres (1-${PAYMENT_METHODS.length})`
    )
    .addAction(async (ctx, { flowDynamic, state, gotoFlow }) => {
        const choice = parseInt(ctx.body);
        
        if (choice >= 1 && choice <= PAYMENT_METHODS.length) {
            const selectedMethod = PAYMENT_METHODS[choice - 1];
            await state.update({ selectedPaymentMethod: selectedMethod });
            await flowDynamic(` Has seleccionado: ${selectedMethod.icon} *${selectedMethod.name}*`);
        } else {
            await flowDynamic(' Opci�n inv�lida. Por favor selecciona un n�mero v�lido.');
        }
    });

// Flow principal de procesamiento de �rdenes
export const orderProcessingFlow = addKeyword(['confirmar_orden'])
    .addAction(async (ctx, { flowDynamic, state, provider }) => {
        try {
            // Obtener datos del estado
            const orderData = await state.get('orderData') || {};
            const userSession = await state.get('userSession') || {};
            
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
                orderNumber: orderNumber,
                phoneNumber: from,
                customerName: customerName,
                productType: productType as 'music' | 'video' | 'movies' | 'series',
                capacity: capacity,
                price: finalPrice,
                customization: customization,
                status: 'pending' as const,
                createdAt: new Date(),
                estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                paymentMethod: 'pending',
                shippingAddress: '',
                usbLabel: `${productType.toUpperCase()}_${capacity}_${Date.now()}`,
                notes: ''
            };
            
            // Guardar en estado
            await state.update({ currentOrder: fullOrder });
            
            // Mostrar resumen
            await flowDynamic([
                ` *RESUMEN DE TU ORDEN*`,
                ` Producto: ${productType.toUpperCase()} USB ${capacity}`,
                ` Precio: $${finalPrice}`,
                ` N�mero de orden: ${orderNumber}`,
                '',
                '�Deseas continuar con el pago?',
                '1 S�, continuar',
                '2 Modificar orden',
                '3 Cancelar'
            ]);
            
        } catch (error) {
            console.error('Error procesando orden:', error);
            await flowDynamic(' Error procesando la orden. Intenta nuevamente.');
        }
    });

export default orderProcessingFlow;

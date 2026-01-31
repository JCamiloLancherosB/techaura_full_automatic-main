import { addKeyword, EVENTS } from '@builderbot/bot';
import { customerDataExtractor } from '../services/CustomerDataExtractor';
import { businessDB } from '../mysql-database';
import { ExtendedContext } from './userTrackingSystem';

const MIN_MESSAGE_LENGTH_FOR_EXTRACTION = 3;

export const dataRegistrationMiddleware = async (
    ctx: ExtendedContext,
    { state, flowDynamic }: { state: any; flowDynamic: any }
) => {
    const message = ctx.body;
    const phone = ctx.from;
    
    // Skip if message is a command or greeting
    if (message.startsWith('/') || message.length < MIN_MESSAGE_LENGTH_FOR_EXTRACTION) {
        return;
    }
    
    // Extract data from message
    const extracted = await customerDataExtractor.extractData(message);
    
    if (!extracted || extracted.confidence < 70 || extracted.type === 'unknown') {
        return; // Let normal flow handle it
    }
    
    // Get or create user session
    let session = await businessDB.getUserSession(phone);
    if (!session) {
        session = await businessDB.createUserSession(phone);
    }
    
    // Store extracted data based on type
    switch (extracted.type) {
        case 'name':
            await businessDB.updateUserSession(phone, {
                customer_name: extracted.value,
                name_confirmed: true
            });
            console.log(`📝 Registered name for ${phone}: ${extracted.value}`);
            break;
            
        case 'address':
            await businessDB.updateUserSession(phone, {
                shipping_address: extracted.value,
                address_confirmed: true
            });
            console.log(`📝 Registered address for ${phone}: ${extracted.value}`);
            break;
            
        case 'phone':
            // Additional phone (shipping phone different from WhatsApp)
            await businessDB.updateUserSession(phone, {
                shipping_phone: extracted.value
            });
            console.log(`📝 Registered shipping phone for ${phone}: ${extracted.value}`);
            break;
            
        case 'capacity':
            await businessDB.updateUserSession(phone, {
                selected_capacity: extracted.value,
                capacity_confirmed: true
            });
            console.log(`📝 Registered capacity for ${phone}: ${extracted.value}`);
            break;
            
        case 'content_preference':
            const currentPrefs = session.preferences || {};
            const extractedPrefs = JSON.parse(extracted.value);
            const newPrefs = { ...currentPrefs, ...extractedPrefs };
            await businessDB.updateUserSession(phone, {
                preferences: newPrefs
            });
            console.log(`📝 Registered preferences for ${phone}`);
            break;
            
        case 'payment_method':
            await businessDB.updateUserSession(phone, {
                payment_method: extracted.value
            });
            console.log(`📝 Registered payment method for ${phone}: ${extracted.value}`);
            break;
    }
    
    // Update state for current conversation
    await state.update({
        [`${extracted.type}_registered`]: true,
        [`${extracted.type}_value`]: extracted.value
    });
};

// Export as flow that captures all messages
export const dataRegistrationFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, ctxFn) => {
        await dataRegistrationMiddleware(ctx as ExtendedContext, ctxFn);
    });

/**
 * Test file for SlotExtractor
 * Tests the extraction capabilities with realistic user messages
 */

import { slotExtractor } from './src/core/SlotExtractor';
import { shippingValidators } from './src/core/validators/shipping';

console.log('🧪 Testing SlotExtractor...\n');

// Test case 1: Complete data in one message (acceptance criteria)
console.log('Test 1: Complete shipping data in one message');
console.log('Message: "Soy Juan, vivo en Soacha, barrio X, cra 10 # 20-30 casa 4"');
const result1 = slotExtractor.extractFromMessage('Soy Juan, vivo en Soacha, barrio X, cra 10 # 20-30 casa 4');
console.log('Extracted slots:', JSON.stringify(result1.slots, null, 2));
console.log('Completeness:', result1.completeness);
console.log('Confidence:', result1.confidence);
console.log('Missing fields:', result1.missingRequired);
console.log('Is complete:', slotExtractor.isComplete(result1));
console.log('');

// Test case 2: Partial data - name and city only
console.log('Test 2: Partial data - name and city');
console.log('Message: "Me llamo María García, soy de Bogotá"');
const result2 = slotExtractor.extractFromMessage('Me llamo María García, soy de Bogotá');
console.log('Extracted slots:', JSON.stringify(result2.slots, null, 2));
console.log('Completeness:', result2.completeness);
console.log('Missing message:', slotExtractor.getMissingFieldsMessage(result2));
console.log('');

// Test case 3: Address and city
console.log('Test 3: Address and city');
console.log('Message: "Vivo en Medellín, Calle 45 # 67-89 apto 301"');
const result3 = slotExtractor.extractFromMessage('Vivo en Medellín, Calle 45 # 67-89 apto 301');
console.log('Extracted slots:', JSON.stringify(result3.slots, null, 2));
console.log('Completeness:', result3.completeness);
console.log('Missing message:', slotExtractor.getMissingFieldsMessage(result3));
console.log('');

// Test case 4: Phone number extraction
console.log('Test 4: Phone number extraction');
console.log('Message: "Mi teléfono es 3123456789"');
const result4 = slotExtractor.extractFromMessage('Mi teléfono es 3123456789');
console.log('Extracted slots:', JSON.stringify(result4.slots, null, 2));
console.log('');

// Test case 5: Payment method and delivery time
console.log('Test 5: Payment method and delivery time');
console.log('Message: "Pago con Nequi, prefiero entrega en la tarde"');
const result5 = slotExtractor.extractFromMessage('Pago con Nequi, prefiero entrega en la tarde');
console.log('Extracted slots:', JSON.stringify(result5.slots, null, 2));
console.log('');

// Test case 6: Validation
console.log('Test 6: Validation of extracted data');
const validationData = {
    name: result1.slots.name?.value,
    phone: '+573123456789',
    city: result1.slots.city?.value,
    address: result1.slots.address?.value
};
const validation = shippingValidators.validateShippingData(validationData);
console.log('Validation result:', validation);
console.log('');

// Test case 7: Normalization
console.log('Test 7: Data normalization');
const normalized = shippingValidators.normalizeShippingData(validationData);
console.log('Normalized data:', normalized);
console.log('');

// Test case 8: Multi-message extraction (simulate conversation)
console.log('Test 8: Merging data from multiple messages');
const message1 = 'Soy Pedro López';
const message2 = 'Mi dirección es Carrera 15 # 23-45';
const message3 = 'Vivo en Cali, barrio Granada';

const extract1 = slotExtractor.extractFromMessage(message1);
const extract2 = slotExtractor.extractFromMessage(message2);
const extract3 = slotExtractor.extractFromMessage(message3);

// Merge all extracted data
let mergedSlots = extract1.slots;
Object.assign(mergedSlots, extract2.slots);
Object.assign(mergedSlots, extract3.slots);

console.log('Message 1:', message1);
console.log('Message 2:', message2);
console.log('Message 3:', message3);
console.log('Merged slots:', JSON.stringify(mergedSlots, null, 2));

// Calculate final result
const filledSlots = Object.values(mergedSlots).filter(slot => slot !== undefined);
const requiredFilled = ['name', 'phone', 'city', 'address'].filter(
    slotName => mergedSlots[slotName as keyof typeof mergedSlots] !== undefined
);
const finalCompleteness = requiredFilled.length / 4;
console.log('Final completeness:', finalCompleteness);
console.log('');

// Test case 9: Invalid/edge cases
console.log('Test 9: Edge cases - short input');
const result9 = slotExtractor.extractFromMessage('Hola');
console.log('Message: "Hola"');
console.log('Extracted slots:', JSON.stringify(result9.slots, null, 2));
console.log('Missing message:', slotExtractor.getMissingFieldsMessage(result9));
console.log('');

// Test case 10: Address with reference
console.log('Test 10: Address with reference/landmark');
console.log('Message: "Carrera 7 # 12-34, cerca del centro comercial"');
const result10 = slotExtractor.extractFromMessage('Carrera 7 # 12-34, cerca del centro comercial');
console.log('Extracted slots:', JSON.stringify(result10.slots, null, 2));
console.log('');

console.log('✅ SlotExtractor tests completed!');

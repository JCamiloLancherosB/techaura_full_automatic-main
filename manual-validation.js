#!/usr/bin/env node

/**
 * Manual Validation Script for Chatbot Improvements
 * Run this to validate the 4 key improvements:
 * 1. Follow-up messages work correctly
 * 2. Persuasive messages work correctly
 * 3. Chatbot never stops or leaves user without response
 * 4. Chatbot always responds according to conversation context
 */

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  Manual Validation: Chatbot Improvements                  ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function validate() {
    console.log('Este script te guiará para validar manualmente las mejoras.\n');
    
    // Test 1: Follow-up Messages
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST 1: Sistema de Seguimiento (Follow-up Messages)');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('Pasos para validar:');
    console.log('1. Inicia el bot: npm run dev');
    console.log('2. Envía un mensaje de WhatsApp al bot');
    console.log('3. NO respondas durante 10+ minutos');
    console.log('4. El bot debe enviarte un seguimiento automático');
    console.log('5. Responde "no me interesa"');
    console.log('6. El bot NO debe enviarte más seguimientos\n');
    
    const test1 = await ask('¿El sistema de seguimiento funciona correctamente? (si/no): ');
    
    // Test 2: Persuasive Messages
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 2: Mensajes Persuasivos');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('Pasos para validar:');
    console.log('1. Envía: "quiero una USB"');
    console.log('2. Verifica que la respuesta sea persuasiva (emojis, valor)');
    console.log('3. Envía: "es muy caro"');
    console.log('4. Verifica que maneje la objeción de precio');
    console.log('5. Verifica que todos los mensajes sean < 200 caracteres\n');
    
    const test2 = await ask('¿Los mensajes persuasivos funcionan correctamente? (si/no): ');
    
    // Test 3: Guaranteed Response
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 3: Respuesta Garantizada');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('Pasos para validar:');
    console.log('1. Envía mensajes diversos al bot');
    console.log('2. Intenta casos extremos: "asdfghjkl", "???", "123"');
    console.log('3. Verifica que SIEMPRE recibes una respuesta');
    console.log('4. Ningún mensaje debe quedar sin respuesta\n');
    
    const test3 = await ask('¿El bot SIEMPRE responde sin fallar? (si/no): ');
    
    // Test 4: Contextual Responses
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 4: Respuestas Contextuales');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('Pasos para validar:');
    console.log('1. Envía: "quiero USB de música"');
    console.log('2. Bot debe preguntar sobre géneros/artistas');
    console.log('3. Envía: "rock y salsa"');
    console.log('4. Bot debe continuar con el contexto (no preguntar qué USB)');
    console.log('5. Envía: "cuanto cuesta"');
    console.log('6. Bot debe dar precios de MÚSICA (no genéricos)\n');
    
    const test4 = await ask('¿Las respuestas mantienen el contexto correctamente? (si/no): ');
    
    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('RESUMEN DE VALIDACIÓN');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const results = {
        'Sistema de Seguimiento': test1.toLowerCase() === 'si',
        'Mensajes Persuasivos': test2.toLowerCase() === 'si',
        'Respuesta Garantizada': test3.toLowerCase() === 'si',
        'Respuestas Contextuales': test4.toLowerCase() === 'si'
    };
    
    let allPassed = true;
    Object.entries(results).forEach(([name, passed]) => {
        const status = passed ? '✓ PASS' : '✗ FAIL';
        const color = passed ? '\x1b[32m' : '\x1b[31m';
        console.log(`${color}${status}\x1b[0m ${name}`);
        if (!passed) allPassed = false;
    });
    
    console.log('\n═══════════════════════════════════════════════════════════\n');
    
    if (allPassed) {
        console.log('\x1b[32m✓ Todas las validaciones pasaron!\x1b[0m');
        console.log('El chatbot está funcionando correctamente.\n');
    } else {
        console.log('\x1b[33m⚠ Algunas validaciones fallaron.\x1b[0m');
        console.log('Revisa los logs del bot para más detalles.\n');
    }
    
    rl.close();
}

validate().catch(error => {
    console.error('Error:', error);
    rl.close();
    process.exit(1);
});

// test-gemini.js
require('dotenv').config();

console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Configurada ✅' : 'No encontrada ❌');

if (process.env.GEMINI_API_KEY) {
    console.log('Primeros 10 caracteres:', process.env.GEMINI_API_KEY.substring(0, 10) + '...');
}

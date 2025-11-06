// // scripts/start.js
// const { exec } = require('child_process');
// const path = require('path');

// console.log('🚀 Iniciando ChatBot...');
// console.log('📦 Compilando TypeScript...');

// exec('npm run build', (error, stdout, stderr) => {
//     if (error) {
//         console.error('❌ Error en compilación:', error);
//         return;
//     }
    
//     if (stderr) {
//         console.warn('⚠️ Advertencias:', stderr);
//     }
    
//     console.log('✅ Compilación exitosa');
//     console.log('🤖 Iniciando bot...');
    
//     // Iniciar la aplicación
//     require('../dist/src/app.js');
// });

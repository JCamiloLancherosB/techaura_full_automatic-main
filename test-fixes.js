/**
 * Test script to verify admin analytics and catalog fixes
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Admin Analytics & Catalog Fixes\n');

// Test 1: Check JSON files exist
console.log('Test 1: Checking JSON data files...');
try {
    const userCustomizationPath = path.join(__dirname, 'src/data/userCustomizationState.json');
    const userSessionsPath = path.join(__dirname, 'data/user_sessions.json');
    
    if (fs.existsSync(userCustomizationPath)) {
        const customizationData = JSON.parse(fs.readFileSync(userCustomizationPath, 'utf8'));
        const userCount = Object.keys(customizationData).length;
        console.log(`✓ userCustomizationState.json found with ${userCount} users`);
        
        // Sample user data
        const sampleUser = Object.values(customizationData)[0];
        if (sampleUser) {
            console.log(`  Sample user data:`, {
                selectedGenres: sampleUser.selectedGenres || [],
                mentionedArtists: sampleUser.mentionedArtists || [],
                selectedCategory: sampleUser.selectedCategory
            });
        }
    } else {
        console.log(`✗ userCustomizationState.json not found at ${userCustomizationPath}`);
    }
    
    if (fs.existsSync(userSessionsPath)) {
        const sessionsData = JSON.parse(fs.readFileSync(userSessionsPath, 'utf8'));
        const sessionCount = Array.isArray(sessionsData) ? sessionsData.length : 0;
        console.log(`✓ user_sessions.json found with ${sessionCount} sessions`);
    } else {
        console.log(`✗ user_sessions.json not found at ${userSessionsPath}`);
    }
} catch (error) {
    console.error('✗ Error reading JSON files:', error.message);
}

// Test 2: Check catalog folders
console.log('\nTest 2: Checking catalog folder structure...');
try {
    const musicFallback = path.join(__dirname, 'Nueva carpeta');
    
    if (fs.existsSync(musicFallback)) {
        const genres = fs.readdirSync(musicFallback)
            .filter(item => fs.statSync(path.join(musicFallback, item)).isDirectory());
        console.log(`✓ Music fallback folder found with ${genres.length} genres`);
        console.log(`  Genres: ${genres.slice(0, 10).join(', ')}${genres.length > 10 ? '...' : ''}`);
        
        // Count files in each genre
        let totalFiles = 0;
        genres.slice(0, 3).forEach(genre => {
            const genrePath = path.join(musicFallback, genre);
            const files = fs.readdirSync(genrePath)
                .filter(file => file.endsWith('.mp3'));
            totalFiles += files.length;
            console.log(`  ${genre}: ${files.length} files`);
        });
        console.log(`  Total files (sampled): ${totalFiles}`);
    } else {
        console.log(`✗ Music fallback folder not found at ${musicFallback}`);
    }
} catch (error) {
    console.error('✗ Error reading catalog folders:', error.message);
}

// Test 3: Check configuration
console.log('\nTest 3: Checking configuration...');
try {
    const configPath = path.join(__dirname, 'src/config.ts');
    if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const hasNuevaCarpeta = configContent.includes('Nueva carpeta');
        console.log(hasNuevaCarpeta 
            ? '✓ Config updated to use "Nueva carpeta" as fallback' 
            : '✗ Config not updated for "Nueva carpeta"');
    }
} catch (error) {
    console.error('✗ Error checking configuration:', error.message);
}

// Test 4: Check key files modified
console.log('\nTest 4: Checking modified files...');
const filesToCheck = [
    'src/admin/services/AnalyticsService.ts',
    'src/services/controlPanelAPI.ts',
    'src/config.ts'
];

filesToCheck.forEach(filePath => {
    const fullPath = path.join(__dirname, filePath);
    if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        if (filePath.includes('AnalyticsService')) {
            const hasJSONReader = content.includes('userCustomizationState.json');
            const hasExtractMethod = content.includes('extractPopularFromJSON');
            console.log(hasJSONReader && hasExtractMethod 
                ? '✓ AnalyticsService updated to read from JSON files' 
                : '✗ AnalyticsService may not be properly updated');
        }
        
        if (filePath.includes('controlPanelAPI')) {
            const hasWhatsAppStatus = content.includes('whatsappStatus');
            console.log(hasWhatsAppStatus 
                ? '✓ ControlPanelAPI includes WhatsApp status detection' 
                : '✗ ControlPanelAPI missing WhatsApp status');
        }
        
        if (filePath.includes('config.ts')) {
            const hasNuevaCarpeta = content.includes('Nueva carpeta');
            console.log(hasNuevaCarpeta 
                ? '✓ Config.ts updated with Nueva carpeta fallback' 
                : '✗ Config.ts not updated');
        }
    } else {
        console.log(`✗ File not found: ${filePath}`);
    }
});

console.log('\n✅ Test verification complete!\n');

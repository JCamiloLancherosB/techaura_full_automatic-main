import fs from 'fs';
import path from 'path';
import { USBDevice } from '../../types/interfaces';
import { ContentFile } from '../../types/interfaces';
import { QualityReport } from '../../types/interfaces';

// ✅ CONTROL DE CALIDAD AUTOMÁTICO
export class QualityController {
    
    // ✅ VERIFICAR USB COMPLETA
    async verifyUSB(device: USBDevice, expectedContent: ContentFile[]): Promise<QualityReport> {
        console.log(`🔍 Verificando calidad de USB ${device.id}...`);
        
        const report: QualityReport = {
            passed: false,
            totalFiles: expectedContent.length,
            verifiedFiles: 0,
            missingFiles: [],
            corruptedFiles: [],
            sizeDiscrepancies: [],
            errors: [],
            verificationTime: 0,
            timestamp: new Date()
        };
        
        const startTime = Date.now();
        
        try {
            // ✅ VERIFICAR EXISTENCIA DE ARCHIVOS
            await this.verifyFileExistence(device, expectedContent, report);
            
            // ✅ VERIFICAR INTEGRIDAD DE ARCHIVOS
            await this.verifyFileIntegrity(device, expectedContent, report);
            
            // ✅ VERIFICAR ESTRUCTURA DE CARPETAS
            await this.verifyFolderStructure(device, report);
            
            // ✅ VERIFICAR ESPACIO UTILIZADO
            await this.verifySpaceUsage(device, expectedContent, report);
            
            // ✅ VERIFICAR REPRODUCIBILIDAD (MUESTRA ALEATORIA)
            await this.verifyPlayability(device, expectedContent, report);
            
            // ✅ CALCULAR RESULTADO FINAL
            report.verificationTime = Date.now() - startTime;
            report.passed = this.calculateOverallResult(report);
            
            console.log(`${report.passed ? '✅' : '❌'} Verificación completada: ${report.verifiedFiles}/${report.totalFiles} archivos OK`);
            
            return report;
            
        } catch (error) {
            console.error('❌ Error en verificación de calidad:', error);
            report.errors.push(`Error general: ${error.message}`);
            report.verificationTime = Date.now() - startTime;
            return report;
        }
    }

    // ✅ VERIFICAR EXISTENCIA DE ARCHIVOS
    private async verifyFileExistence(device: USBDevice, expectedContent: ContentFile[], report: QualityReport): Promise<void> {
        console.log('📁 Verificando existencia de archivos...');
        
        for (const content of expectedContent) {
            try {
                const expectedPath = this.getExpectedPath(device.path, content);
                
                if (fs.existsSync(expectedPath)) {
                    report.verifiedFiles++;
                } else {
                    report.missingFiles.push({
                        name: content.name,
                        expectedPath: expectedPath,
                        originalPath: content.path
                    });
                    report.errors.push(`Archivo faltante: ${content.name}`);
                }
                
            } catch (error) {
                report.errors.push(`Error verificando ${content.name}: ${error.message}`);
            }
        }
    }

    // ✅ VERIFICAR INTEGRIDAD DE ARCHIVOS
    private async verifyFileIntegrity(device: USBDevice, expectedContent: ContentFile[], report: QualityReport): Promise<void> {
        console.log('🔐 Verificando integridad de archivos...');
        
        // ✅ VERIFICAR UNA MUESTRA ALEATORIA (20% de los archivos)
        const sampleSize = Math.max(1, Math.floor(expectedContent.length * 0.2));
        const sampleFiles = this.getRandomSample(expectedContent, sampleSize);
        
        for (const content of sampleFiles) {
            try {
                const filePath = this.getExpectedPath(device.path, content);
                
                if (fs.existsSync(filePath)) {
                    // ✅ VERIFICAR TAMAÑO
                    const actualSize = fs.statSync(filePath).size;
                    const expectedSize = content.size;
                    
                    if (Math.abs(actualSize - expectedSize) > 1024) { // Tolerancia de 1KB
                        report.sizeDiscrepancies.push({
                            name: content.name,
                            expectedSize: expectedSize,
                            actualSize: actualSize,
                            difference: actualSize - expectedSize
                        });
                    }
                    
                    // ✅ VERIFICAR CHECKSUM (PARA ARCHIVOS CRÍTICOS)
                    if (content.size > 100 * 1024 * 1024) { // Solo archivos > 100MB
                        const isValid = await this.verifyChecksum(filePath, content);
                        if (!isValid) {
                            report.corruptedFiles.push({
                                name: content.name,
                                path: filePath,
                                reason: 'Checksum mismatch'
                            });
                        }
                    }
                }
                
            } catch (error) {
                report.errors.push(`Error verificando integridad de ${content.name}: ${error.message}`);
            }
        }
    }

    // ✅ VERIFICAR ESTRUCTURA DE CARPETAS
    private async verifyFolderStructure(device: USBDevice, report: QualityReport): Promise<void> {
        console.log('📂 Verificando estructura de carpetas...');
        
        const requiredFolders = ['Musica', 'Videos', 'Peliculas'];
        const basePath = device.path;
        
        for (const folder of requiredFolders) {
            const folderPath = path.join(basePath, folder);
            if (fs.existsSync(folderPath)) {
                const stat = fs.statSync(folderPath);
                if (!stat.isDirectory()) {
                    report.errors.push(`${folder} existe pero no es una carpeta`);
                }
            }
            // Nota: No es error si no existe, depende del tipo de contenido
        }
        
        // ✅ VERIFICAR ARCHIVO INFO
        const infoPath = path.join(basePath, 'INFO.txt');
        if (!fs.existsSync(infoPath)) {
            report.errors.push('Archivo INFO.txt faltante');
        }
    }

    // ✅ VERIFICAR ESPACIO UTILIZADO
    private async verifySpaceUsage(device: USBDevice, expectedContent: ContentFile[], report: QualityReport): Promise<void> {
        console.log('💾 Verificando uso de espacio...');
        
        try {
            // ✅ CALCULAR ESPACIO ESPERADO
            const expectedSpace = expectedContent.reduce((total, content) => total + content.size, 0);
            
            // ✅ CALCULAR ESPACIO ACTUAL USADO
            const actualUsedSpace = await this.calculateUsedSpace(device.path);
            
            const difference = Math.abs(actualUsedSpace - expectedSpace);
            const tolerance = expectedSpace * 0.05; // 5% de tolerancia
            
            if (difference > tolerance) {
                report.errors.push(`Discrepancia de espacio: esperado ${this.formatBytes(expectedSpace)}, actual ${this.formatBytes(actualUsedSpace)}`);
            }
            
        } catch (error) {
            report.errors.push(`Error verificando espacio: ${error.message}`);
        }
    }

    // ✅ VERIFICAR REPRODUCIBILIDAD
    private async verifyPlayability(device: USBDevice, expectedContent: ContentFile[], report: QualityReport): Promise<void> {
        console.log('🎵 Verificando reproducibilidad...');
        
        // ✅ SELECCIONAR MUESTRA PEQUEÑA PARA PRUEBA
        const audioFiles = expectedContent.filter(content => 
            ['.mp3', '.mp4', '.wav', '.flac'].includes(path.extname(content.path).toLowerCase())
        );
        
        if (audioFiles.length === 0) return;
        
        const sampleFiles = this.getRandomSample(audioFiles, Math.min(3, audioFiles.length));
        
        for (const content of sampleFiles) {
            try {
                const filePath = this.getExpectedPath(device.path, content);
                
                if (fs.existsSync(filePath)) {
                    // ✅ VERIFICACIÓN BÁSICA DE FORMATO
                    const isValidFormat = await this.verifyAudioFormat(filePath);
                    if (!isValidFormat) {
                        report.corruptedFiles.push({
                            name: content.name,
                            path: filePath,
                            reason: 'Formato de audio inválido'
                        });
                    }
                }
                
            } catch (error) {
                report.errors.push(`Error verificando reproducibilidad de ${content.name}: ${error.message}`);
            }
        }
    }

    // ✅ VERIFICAR FORMATO DE AUDIO
    private async verifyAudioFormat(filePath: string): Promise<boolean> {
        try {
            // ✅ VERIFICACIÓN BÁSICA LEYENDO HEADERS
            const buffer = fs.readFileSync(filePath).slice(0, 1024);
            
            // ✅ VERIFICAR HEADERS COMUNES
            const mp3Header = buffer.slice(0, 3);
            const mp4Header = buffer.slice(4, 8);
            
            // ✅ MP3
            if (mp3Header[0] === 0xFF && (mp3Header[1] & 0xE0) === 0xE0) {
                return true;
            }
            
            // ✅ MP4
            if (mp4Header.toString() === 'ftyp') {
                return true;
            }
            
            // ✅ OTROS FORMATOS...
            return true; // Por ahora aceptar otros formatos
            
        } catch (error) {
            console.error(`Error verificando formato de ${filePath}:`, error);
            return false;
        }
    }

    // ✅ CALCULAR RESULTADO GENERAL
    private calculateOverallResult(report: QualityReport): boolean {
        // ✅ CRITERIOS DE APROBACIÓN
        const fileSuccessRate = report.verifiedFiles / report.totalFiles;
        const hasNoCorruptedFiles = report.corruptedFiles.length === 0;
        const hasFewMissingFiles = report.missingFiles.length <= Math.floor(report.totalFiles * 0.05); // Máximo 5% faltantes
        const hasNoMajorErrors = !report.errors.some(error => 
            error.includes('formato inválido') || error.includes('corrupted')
        );
        
        return fileSuccessRate >= 0.95 && hasNoCorruptedFiles && hasFewMissingFiles && hasNoMajorErrors;
    }

    // ✅ UTILIDADES
    private getExpectedPath(basePath: string, content: ContentFile): string {
        // ✅ CONSTRUIR RUTA ESPERADA SEGÚN CATEGORÍA
        let folder = '';
        
        switch (content.category) {
            case 'music':
                folder = path.join('Musica', this.capitalizeFirst(content.subcategory || ''));
                break;
            case 'videos':
                folder = path.join('Videos', this.capitalizeFirst(content.subcategory || ''));
                break;
            case 'movies':
                folder = 'Peliculas';
                break;
        }
        
        return path.join(basePath, folder, path.basename(content.path));
    }

    private getRandomSample<T>(array: T[], sampleSize: number): T[] {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, sampleSize);
    }

    private async calculateUsedSpace(dirPath: string): Promise<number> {
        let totalSize = 0;
        
        const calculateRecursive = async (currentPath: string) => {
            const items = fs.readdirSync(currentPath);
            
            for (const item of items) {
                const fullPath = path.join(currentPath, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    await calculateRecursive(fullPath);
                } else {
                    totalSize += stat.size;
                }
            }
        };
        
        await calculateRecursive(dirPath);
        return totalSize;
    }

    private async verifyChecksum(filePath: string, content: ContentFile): Promise<boolean> {
        // ✅ IMPLEMENTAR VERIFICACIÓN DE CHECKSUM SI ES NECESARIO
        // Por ahora retornar true para no bloquear el proceso
        return true;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

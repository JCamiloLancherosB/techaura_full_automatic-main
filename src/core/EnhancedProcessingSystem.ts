/**
 * Enhanced Processing System with proper repository integration
 * Handles file validation, copying, and verification with detailed logging
 */

import { processingJobRepository, ProcessingJob as RepoJob } from '../repositories/ProcessingJobRepository';
import { jobLogRepository } from '../repositories/JobLogRepository';
import path from 'path';
import fsp from 'fs/promises';
import fs from 'fs';

export interface FileValidationResult {
    valid: boolean;
    errors: Array<{
        file: string;
        error: string;
        code: string;
    }>;
    totalSize: number;
    fileCount: number;
}

export interface VerificationConfig {
    strategy: 'full' | 'sampling';
    samplePercentage?: number; // For sampling strategy (e.g., 10 for 10%)
    minSampleSize?: number; // Minimum files to verify even with sampling
}

export interface ProcessingResult {
    success: boolean;
    filesProcessed: number;
    totalSize: number;
    errors: string[];
    verificationResult?: {
        verified: number;
        failed: number;
        skipped: number;
    };
}

export class EnhancedProcessingSystem {
    private defaultVerificationConfig: VerificationConfig = {
        strategy: 'sampling',
        samplePercentage: 20,
        minSampleSize: 10
    };

    /**
     * Validate files before copying
     */
    async validateFiles(
        files: Array<{ path: string; size?: number }>,
        jobId: number
    ): Promise<FileValidationResult> {
        const errors: Array<{ file: string; error: string; code: string }> = [];
        let totalSize = 0;
        let validCount = 0;

        await jobLogRepository.create({
            job_id: jobId,
            level: 'info',
            category: 'validation',
            message: `Starting validation of ${files.length} files`
        });

        for (const file of files) {
            try {
                // Check if file exists
                await fsp.access(file.path, fs.constants.R_OK);

                // Get file stats
                const stats = await fsp.stat(file.path);

                if (!stats.isFile()) {
                    errors.push({
                        file: file.path,
                        error: 'Not a file',
                        code: 'NOT_FILE'
                    });
                    continue;
                }

                // Check if file is readable
                if (stats.size === 0) {
                    errors.push({
                        file: file.path,
                        error: 'File is empty',
                        code: 'EMPTY_FILE'
                    });
                    continue;
                }

                totalSize += stats.size;
                validCount++;

            } catch (error: any) {
                const errorCode = error.code === 'ENOENT' ? 'NOT_FOUND' :
                    error.code === 'EACCES' ? 'NO_PERMISSION' : 'UNKNOWN';

                errors.push({
                    file: file.path,
                    error: error.message,
                    code: errorCode
                });

                await jobLogRepository.create({
                    job_id: jobId,
                    level: 'error',
                    category: 'validation',
                    message: `File validation failed: ${path.basename(file.path)}`,
                    file_path: file.path,
                    error_code: errorCode,
                    details: { error: error.message }
                });
            }
        }

        const result: FileValidationResult = {
            valid: errors.length === 0,
            errors,
            totalSize,
            fileCount: validCount
        };

        await jobLogRepository.create({
            job_id: jobId,
            level: errors.length > 0 ? 'warning' : 'info',
            category: 'validation',
            message: `Validation complete: ${validCount}/${files.length} files valid, ${errors.length} errors`,
            details: { validCount, totalCount: files.length, errors: errors.length }
        });

        return result;
    }

    /**
     * Check if destination has enough space
     */
    async validateSpaceAvailability(
        destinationPath: string,
        requiredBytes: number,
        jobId: number
    ): Promise<boolean> {
        try {
            const stats = await fsp.statfs(destinationPath);
            const availableBytes = stats.bavail * stats.bsize;
            const hasSpace = availableBytes >= requiredBytes;

            await jobLogRepository.create({
                job_id: jobId,
                level: hasSpace ? 'info' : 'error',
                category: 'validation',
                message: hasSpace
                    ? `Space check passed: ${this.formatBytes(availableBytes)} available, ${this.formatBytes(requiredBytes)} required`
                    : `Insufficient space: ${this.formatBytes(availableBytes)} available, ${this.formatBytes(requiredBytes)} required`,
                details: {
                    available: availableBytes,
                    required: requiredBytes,
                    hasSpace
                }
            });

            return hasSpace;
        } catch (error: any) {
            await jobLogRepository.create({
                job_id: jobId,
                level: 'error',
                category: 'validation',
                message: `Failed to check space: ${error.message}`,
                error_code: 'SPACE_CHECK_FAILED'
            });
            return false;
        }
    }

    /**
     * Copy files with error handling and progress tracking
     */
    async copyFiles(
        files: Array<{ path: string; destination: string }>,
        jobId: number,
        onProgress?: (progress: number) => void
    ): Promise<ProcessingResult> {
        let filesProcessed = 0;
        let totalSize = 0;
        const errors: string[] = [];

        await processingJobRepository.updateProgress(
            jobId,
            0,
            'Starting file copy operation'
        );

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = path.basename(file.path);

            try {
                // Ensure destination directory exists
                await fsp.mkdir(path.dirname(file.destination), { recursive: true });

                // Get source file size
                const stats = await fsp.stat(file.path);
                const fileSize = stats.size;

                // Copy file
                await fsp.copyFile(file.path, file.destination);

                // Verify copy was successful
                const destStats = await fsp.stat(file.destination);
                if (destStats.size !== fileSize) {
                    throw new Error('Size mismatch after copy');
                }

                filesProcessed++;
                totalSize += fileSize;

                // Update progress
                const progress = Math.round(((i + 1) / files.length) * 100);
                await processingJobRepository.updateProgress(jobId, progress);

                if (onProgress) {
                    onProgress(progress);
                }

                // Log success every 10 files to avoid log spam
                if (filesProcessed % 10 === 0) {
                    await jobLogRepository.create({
                        job_id: jobId,
                        level: 'info',
                        category: 'copy',
                        message: `Copied ${filesProcessed}/${files.length} files (${this.formatBytes(totalSize)})`,
                        details: { filesProcessed, totalSize }
                    });
                }

            } catch (error: any) {
                const errorMsg = `Failed to copy ${fileName}: ${error.message}`;
                errors.push(errorMsg);

                await jobLogRepository.create({
                    job_id: jobId,
                    level: 'error',
                    category: 'copy',
                    message: errorMsg,
                    file_path: file.path,
                    file_size: 0,
                    error_code: error.code || 'COPY_FAILED',
                    details: { source: file.path, destination: file.destination, error: error.message }
                });
            }
        }

        await jobLogRepository.create({
            job_id: jobId,
            level: errors.length > 0 ? 'warning' : 'info',
            category: 'copy',
            message: `Copy operation complete: ${filesProcessed}/${files.length} files (${this.formatBytes(totalSize)}), ${errors.length} errors`,
            details: { filesProcessed, totalFiles: files.length, totalSize, errorCount: errors.length }
        });

        return {
            success: errors.length === 0,
            filesProcessed,
            totalSize,
            errors
        };
    }

    /**
     * Verify copied files with configurable strategy
     */
    async verifyFiles(
        files: Array<{ source: string; destination: string }>,
        jobId: number,
        config: VerificationConfig = this.defaultVerificationConfig
    ): Promise<ProcessingResult['verificationResult']> {
        await processingJobRepository.update({
            id: jobId,
            status: 'verifying'
        });

        let filesToVerify: typeof files;

        if (config.strategy === 'sampling') {
            const sampleSize = Math.max(
                config.minSampleSize || 10,
                Math.ceil((files.length * (config.samplePercentage || 20)) / 100)
            );

            // Random sampling
            filesToVerify = this.randomSample(files, Math.min(sampleSize, files.length));

            await jobLogRepository.create({
                job_id: jobId,
                level: 'info',
                category: 'verify',
                message: `Using sampling strategy: verifying ${filesToVerify.length} of ${files.length} files (${config.samplePercentage}%)`,
                details: { strategy: 'sampling', sampleSize: filesToVerify.length, totalFiles: files.length }
            });
        } else {
            filesToVerify = files;

            await jobLogRepository.create({
                job_id: jobId,
                level: 'info',
                category: 'verify',
                message: `Using full verification: checking all ${files.length} files`,
                details: { strategy: 'full', totalFiles: files.length }
            });
        }

        let verified = 0;
        let failed = 0;
        const skipped = files.length - filesToVerify.length;

        for (const file of filesToVerify) {
            try {
                const sourceStats = await fsp.stat(file.source);
                const destStats = await fsp.stat(file.destination);

                if (sourceStats.size !== destStats.size) {
                    failed++;

                    await jobLogRepository.create({
                        job_id: jobId,
                        level: 'error',
                        category: 'verify',
                        message: `Size mismatch: ${path.basename(file.destination)}`,
                        file_path: file.destination,
                        error_code: 'SIZE_MISMATCH',
                        details: {
                            sourceSize: sourceStats.size,
                            destSize: destStats.size,
                            source: file.source,
                            destination: file.destination
                        }
                    });
                } else {
                    verified++;
                }
            } catch (error: any) {
                failed++;

                await jobLogRepository.create({
                    job_id: jobId,
                    level: 'error',
                    category: 'verify',
                    message: `Verification failed: ${path.basename(file.destination)}`,
                    file_path: file.destination,
                    error_code: error.code || 'VERIFY_FAILED',
                    details: { error: error.message }
                });
            }
        }

        const result = { verified, failed, skipped };

        await jobLogRepository.create({
            job_id: jobId,
            level: failed > 0 ? 'warning' : 'info',
            category: 'verify',
            message: `Verification complete: ${verified} verified, ${failed} failed, ${skipped} skipped`,
            details: result
        });

        return result;
    }

    /**
     * Random sample selection
     */
    private randomSample<T>(array: T[], size: number): T[] {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, size);
    }

    /**
     * Format bytes to human-readable string
     */
    private formatBytes(bytes: number): string {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// Export singleton instance
export const enhancedProcessingSystem = new EnhancedProcessingSystem();

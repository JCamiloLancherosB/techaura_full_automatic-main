/**
 * Copy Service - Handles automatic file copying for USB preparation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { MUSIC_ROOT, VIDEO_ROOT, MOVIES_ROOT, SERIES_ROOT, PROCESSING_CONFIG } from '../../config';
import type { AdminOrder, ProcessingLog } from '../types/AdminTypes';
import { unifiedLogger } from '../../utils/unifiedLogger';

export interface CopyProgress {
    totalFiles: number;
    copiedFiles: number;
    totalBytes: number;
    copiedBytes: number;
    currentFile: string;
    percentage: number;
}

export class CopyService extends EventEmitter {
    private activeCopies: Map<string, CopyProgress> = new Map();

    /**
     * Prepare USB with content from order
     */
    async prepareUSB(order: AdminOrder, usbPath: string): Promise<boolean> {
        const jobId = order.id;
        
        try {
            unifiedLogger.info('system', `Starting USB preparation for order ${jobId}`, { orderId: jobId, usbPath });
            this.emit('started', { jobId, order });
            
            // Initialize progress
            const progress: CopyProgress = {
                totalFiles: 0,
                copiedFiles: 0,
                totalBytes: 0,
                copiedBytes: 0,
                currentFile: '',
                percentage: 0
            };
            this.activeCopies.set(jobId, progress);

            // Create base directory structure
            await this.createBaseStructure(usbPath);
            unifiedLogger.info('system', `Created base directory structure for order ${jobId}`);

            // Copy content based on order customization
            if (order.customization.genres || order.customization.artists) {
                unifiedLogger.info('system', `Copying music for order ${jobId}`, { 
                    genres: order.customization.genres?.length || 0,
                    artists: order.customization.artists?.length || 0
                });
                await this.copyMusic(order, usbPath, jobId);
            }

            if (order.customization.videos) {
                unifiedLogger.info('system', `Copying videos for order ${jobId}`, { 
                    count: order.customization.videos.length 
                });
                await this.copyVideos(order, usbPath, jobId);
            }

            if (order.customization.movies) {
                unifiedLogger.info('system', `Copying movies for order ${jobId}`, { 
                    count: order.customization.movies.length 
                });
                await this.copyMovies(order, usbPath, jobId);
            }

            if (order.customization.series) {
                unifiedLogger.info('system', `Copying series for order ${jobId}`, { 
                    count: order.customization.series.length 
                });
                await this.copySeries(order, usbPath, jobId);
            }

            // Mark as complete
            this.activeCopies.delete(jobId);
            unifiedLogger.info('system', `USB preparation completed for order ${jobId}`);
            this.emit('completed', { jobId, order });
            
            return true;
        } catch (error) {
            unifiedLogger.error('system', `Error preparing USB for order ${jobId}`, { error, orderId: jobId });
            console.error('Error preparing USB:', error);
            this.activeCopies.delete(jobId);
            this.emit('error', { jobId, order, error });
            throw error;
        }
    }

    /**
     * Get copy progress for a job
     */
    getProgress(jobId: string): CopyProgress | null {
        return this.activeCopies.get(jobId) || null;
    }

    /**
     * Cancel ongoing copy operation
     */
    cancelCopy(jobId: string): boolean {
        if (this.activeCopies.has(jobId)) {
            this.activeCopies.delete(jobId);
            this.emit('cancelled', { jobId });
            return true;
        }
        return false;
    }

    // ========================================
    // Private helper methods
    // ========================================

    private async createBaseStructure(usbPath: string): Promise<void> {
        const folders = ['MUSICA', 'VIDEOS', 'PELICULAS', 'SERIES', 'EXTRAS'];
        
        for (const folder of folders) {
            await fs.mkdir(path.join(usbPath, folder), { recursive: true });
        }
    }

    private async copyMusic(order: AdminOrder, usbPath: string, jobId: string): Promise<void> {
        const musicDir = path.join(usbPath, 'MUSICA');
        const copiedFiles = new Set<string>();

        // Copy by genres
        if (order.customization.genres) {
            for (const genre of order.customization.genres) {
                const genreDir = path.join(musicDir, genre.toUpperCase());
                const files = await this.findFilesByName(MUSIC_ROOT, genre, this.getMusicExtensions());
                await this.copyFiles(files, genreDir, copiedFiles, jobId);
            }
        }

        // Copy by artists
        if (order.customization.artists) {
            for (const artist of order.customization.artists) {
                const artistDir = path.join(musicDir, 'ARTISTAS', artist.toUpperCase());
                const files = await this.findFilesByName(MUSIC_ROOT, artist, this.getMusicExtensions());
                await this.copyFiles(files, artistDir, copiedFiles, jobId);
            }
        }
    }

    private async copyVideos(order: AdminOrder, usbPath: string, jobId: string): Promise<void> {
        const videosDir = path.join(usbPath, 'VIDEOS');
        const copiedFiles = new Set<string>();

        if (order.customization.videos) {
            for (const video of order.customization.videos) {
                const files = await this.findFilesByName(VIDEO_ROOT, video, this.getVideoExtensions());
                await this.copyFiles(files, videosDir, copiedFiles, jobId);
            }
        }
    }

    private async copyMovies(order: AdminOrder, usbPath: string, jobId: string): Promise<void> {
        const moviesDir = path.join(usbPath, 'PELICULAS');
        const copiedFiles = new Set<string>();

        if (order.customization.movies) {
            for (const movie of order.customization.movies) {
                const files = await this.findFilesByName(MOVIES_ROOT, movie, this.getVideoExtensions());
                await this.copyFiles(files, moviesDir, copiedFiles, jobId);
            }
        }
    }

    private async copySeries(order: AdminOrder, usbPath: string, jobId: string): Promise<void> {
        const seriesDir = path.join(usbPath, 'SERIES');
        const copiedFiles = new Set<string>();

        if (order.customization.series) {
            for (const serie of order.customization.series) {
                const files = await this.findFilesByName(SERIES_ROOT, serie, this.getVideoExtensions());
                await this.copyFiles(files, seriesDir, copiedFiles, jobId);
            }
        }
    }

    private async findFilesByName(
        rootPath: string,
        searchTerm: string,
        validExtensions: string[]
    ): Promise<string[]> {
        const found: string[] = [];
        
        try {
            await fs.access(rootPath);
        } catch {
            return found;
        }

        await this.searchRecursive(rootPath, searchTerm, validExtensions, found);
        return found;
    }

    private async searchRecursive(
        dirPath: string,
        searchTerm: string,
        validExtensions: string[],
        results: string[]
    ): Promise<void> {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    await this.searchRecursive(entryPath, searchTerm, validExtensions, results);
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (
                        validExtensions.includes(ext) &&
                        entry.name.toLowerCase().includes(searchTerm.toLowerCase())
                    ) {
                        results.push(entryPath);
                    }
                }
            }
        } catch (error) {
            console.error(`Error searching in ${dirPath}:`, error);
        }
    }

    private async copyFiles(
        files: string[],
        destDir: string,
        copiedFiles: Set<string>,
        jobId: string
    ): Promise<void> {
        await fs.mkdir(destDir, { recursive: true });

        for (const file of files) {
            const basename = path.basename(file);
            
            // Skip if already copied
            if (copiedFiles.has(basename)) {
                unifiedLogger.debug('system', `Skipping duplicate file: ${basename}`, { jobId });
                continue;
            }

            const destPath = path.join(destDir, basename);
            
            try {
                // Validate file exists and get stats
                const stats = await fs.stat(file);
                if (!stats.isFile()) {
                    unifiedLogger.warn('system', `Skipping non-file entry: ${file}`, { jobId });
                    continue;
                }
                
                // Validate file size is reasonable (not 0, not > 100GB)
                if (stats.size === 0) {
                    unifiedLogger.warn('system', `Skipping empty file: ${basename}`, { jobId });
                    continue;
                }
                if (stats.size > 100 * 1024 * 1024 * 1024) {
                    unifiedLogger.warn('system', `Skipping excessively large file: ${basename} (${stats.size} bytes)`, { jobId });
                    continue;
                }
                
                // Update progress
                const progress = this.activeCopies.get(jobId);
                if (progress) {
                    progress.currentFile = basename;
                    this.emit('progress', { jobId, progress });
                }

                // Copy file with logging
                unifiedLogger.debug('system', `Copying file: ${basename} (${stats.size} bytes)`, { jobId });
                await fs.copyFile(file, destPath);
                copiedFiles.add(basename);
                unifiedLogger.info('system', `Successfully copied: ${basename}`, { jobId, size: stats.size });

                // Update progress counters
                if (progress) {
                    progress.copiedFiles++;
                    progress.copiedBytes += stats.size;
                    progress.percentage = progress.totalBytes > 0
                        ? (progress.copiedBytes / progress.totalBytes) * 100
                        : 0;
                }
            } catch (error) {
                unifiedLogger.error('system', `Error copying file ${file}`, { error, jobId, basename });
                console.error(`Error copying file ${file}:`, error);
                this.emit('fileError', { jobId, file, error });
            }
        }
    }

    private getMusicExtensions(): string[] {
        return PROCESSING_CONFIG.VALID_EXTENSIONS.music || ['.mp3', '.m4a', '.wav', '.flac'];
    }

    private getVideoExtensions(): string[] {
        return PROCESSING_CONFIG.VALID_EXTENSIONS.video || ['.mp4', '.mkv', '.avi', '.mov'];
    }

    /**
     * Verify copied content integrity
     */
    async verifyContent(sourcePath: string, destPath: string): Promise<boolean> {
        try {
            const [sourceStat, destStat] = await Promise.all([
                fs.stat(sourcePath),
                fs.stat(destPath)
            ]);

            return sourceStat.size === destStat.size;
        } catch (error) {
            console.error('Error verifying content:', error);
            return false;
        }
    }

    /**
     * Generate content report
     */
    async generateReport(usbPath: string): Promise<{
        folders: string[];
        files: number;
        totalSize: number;
    }> {
        const folders: string[] = [];
        let files = 0;
        let totalSize = 0;

        try {
            const entries = await fs.readdir(usbPath, { withFileTypes: true });

            for (const entry of entries) {
                const entryPath = path.join(usbPath, entry.name);

                if (entry.isDirectory()) {
                    folders.push(entry.name);
                    const stats = await this.countFilesInDir(entryPath);
                    files += stats.files;
                    totalSize += stats.size;
                }
            }
        } catch (error) {
            console.error('Error generating report:', error);
        }

        return { folders, files, totalSize };
    }

    private async countFilesInDir(dirPath: string): Promise<{ files: number; size: number }> {
        let files = 0;
        let size = 0;

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    const stats = await this.countFilesInDir(entryPath);
                    files += stats.files;
                    size += stats.size;
                } else {
                    files++;
                    const stat = await fs.stat(entryPath);
                    size += stat.size;
                }
            }
        } catch (error) {
            console.error(`Error counting files in ${dirPath}:`, error);
        }

        return { files, size };
    }
}

// Singleton instance
export const copyService = new CopyService();

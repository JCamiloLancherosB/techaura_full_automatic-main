/**
 * Content Service - Manages content catalog operations
 * Updated to handle local disk paths with fallback support
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MUSIC_ROOT, VIDEO_ROOT, MOVIES_ROOT, SERIES_ROOT, PROCESSING_CONFIG, CONTENT_PATHS } from '../../config';
import type { ContentFile, ContentFolder, ContentSearchFilter, ContentType } from '../types/AdminTypes';

export class ContentService {
    private readonly contentRoots = {
        music: MUSIC_ROOT,
        videos: VIDEO_ROOT,
        movies: MOVIES_ROOT,
        series: SERIES_ROOT
    };

    private readonly fallbackRoots = {
        music: CONTENT_PATHS.MUSIC_FALLBACK,
        videos: CONTENT_PATHS.VIDEO_FALLBACK,
        movies: CONTENT_PATHS.MOVIES_FALLBACK,
        series: './content/series/' // Add fallback for series
    };

    // Cache for validated paths to avoid repeated filesystem checks
    private pathCache = new Map<ContentType, string>();

    /**
     * Get the actual available path for a category (primary or fallback)
     */
    private async getAvailablePath(category: ContentType): Promise<string> {
        // Check cache first
        if (this.pathCache.has(category)) {
            return this.pathCache.get(category)!;
        }

        const primaryPath = this.contentRoots[category];
        const fallbackPath = this.fallbackRoots[category];

        // Try primary path first
        try {
            await fs.access(primaryPath);
            console.log(`✓ Using primary path for ${category}: ${primaryPath}`);
            this.pathCache.set(category, primaryPath);
            return primaryPath;
        } catch {
            console.warn(`⚠️ Primary path not accessible for ${category}: ${primaryPath}`);
        }

        // Try fallback path
        try {
            await fs.access(fallbackPath);
            console.log(`✓ Using fallback path for ${category}: ${fallbackPath}`);
            this.pathCache.set(category, fallbackPath);
            return fallbackPath;
        } catch {
            console.warn(`⚠️ Fallback path not accessible for ${category}: ${fallbackPath}`);
        }

        // If neither exists, try to create fallback directory
        try {
            await fs.mkdir(fallbackPath, { recursive: true });
            console.log(`✓ Created fallback directory for ${category}: ${fallbackPath}`);
            this.pathCache.set(category, fallbackPath);
            return fallbackPath;
        } catch (error) {
            console.error(`❌ Failed to create fallback directory for ${category}:`, error);
            // Return fallback path anyway as last resort
            this.pathCache.set(category, fallbackPath);
            return fallbackPath;
        }
    }

    /**
     * Get content folder structure
     * Updated to use available paths with fallbacks
     */
    async getFolderStructure(category: ContentType, maxDepth: number = 3): Promise<ContentFolder> {
        try {
            if (!category || !(category in this.contentRoots)) {
                throw new Error(`Invalid category: ${category}`);
            }

            const rootPath = await this.getAvailablePath(category);

            // Check if path exists and is accessible
            try {
                await fs.access(rootPath);
                const stats = await fs.stat(rootPath);
                
                if (!stats.isDirectory()) {
                    console.warn(`Path is not a directory: ${rootPath}`);
                    return {
                        name: category.toUpperCase(),
                        path: rootPath,
                        category,
                        fileCount: 0,
                        totalSize: 0,
                        subfolders: [],
                        error: 'Path exists but is not a directory'
                    };
                }
            } catch (error) {
                // Path doesn't exist or is not accessible, return empty structure
                console.warn(`Path not accessible for ${category}: ${rootPath}`, error);
                return {
                    name: category.toUpperCase(),
                    path: rootPath,
                    category,
                    fileCount: 0,
                    totalSize: 0,
                    subfolders: [],
                    error: 'Path not accessible'
                };
            }

            return await this.buildFolderStructure(rootPath, category, 0, maxDepth);
        } catch (error) {
            console.error('Error getting folder structure:', error);
            // Return error structure instead of throwing
            return {
                name: category.toUpperCase(),
                path: this.contentRoots[category] || '',
                category,
                fileCount: 0,
                totalSize: 0,
                subfolders: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Search for content files
     */
    async searchContent(filters: ContentSearchFilter): Promise<ContentFile[]> {
        try {
            const results: ContentFile[] = [];
            
            if (filters.category) {
                const categoryResults = await this.searchInCategory(filters);
                results.push(...categoryResults);
            } else {
                // Search in all categories
                for (const category of Object.keys(this.contentRoots) as ContentType[]) {
                    const categoryResults = await this.searchInCategory({
                        ...filters,
                        category
                    });
                    results.push(...categoryResults);
                }
            }

            // Apply sorting
            return this.sortResults(results, filters.sortBy, filters.sortOrder);
        } catch (error) {
            console.error('Error searching content:', error);
            throw error;
        }
    }

    /**
     * Get content by path
     */
    async getContentByPath(filePath: string): Promise<ContentFile | null> {
        try {
            const stats = await fs.stat(filePath);
            
            if (!stats.isFile()) {
                return null;
            }

            const category = this.detectCategory(filePath);
            if (!category) return null;

            return {
                id: this.generateFileId(filePath),
                name: path.basename(filePath),
                path: filePath,
                category,
                subcategory: this.detectSubcategory(filePath, category),
                size: stats.size,
                extension: path.extname(filePath),
                lastModified: stats.mtime,
                metadata: await this.extractMetadata(filePath, category)
            };
        } catch (error) {
            console.error('Error getting content by path:', error);
            return null;
        }
    }

    /**
     * Get available genres/categories
     * Updated to use available paths
     */
    async getAvailableGenres(category: ContentType): Promise<string[]> {
        try {
            const rootPath = await this.getAvailablePath(category);

            try {
                await fs.access(rootPath);
                const stats = await fs.stat(rootPath);
                
                if (!stats.isDirectory()) {
                    console.warn(`Path is not a directory: ${rootPath}`);
                    return [];
                }
            } catch {
                console.warn(`Path not accessible for genres: ${rootPath}`);
                return [];
            }

            const entries = await fs.readdir(rootPath, { withFileTypes: true });
            const genres: string[] = [];

            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    genres.push(entry.name);
                }
            }

            return genres.sort();
        } catch (error) {
            console.error('Error getting genres:', error);
            return [];
        }
    }

    /**
     * Get content statistics
     * Updated to use available paths
     */
    async getContentStats(category: ContentType): Promise<{
        totalFiles: number;
        totalSize: number;
        byExtension: { [ext: string]: number };
    }> {
        try {
            const rootPath = await this.getAvailablePath(category);

            try {
                await fs.access(rootPath);
                const stats = await fs.stat(rootPath);
                
                if (!stats.isDirectory()) {
                    console.warn(`Path is not a directory: ${rootPath}`);
                    return { totalFiles: 0, totalSize: 0, byExtension: {} };
                }
            } catch {
                console.warn(`Path not accessible for stats: ${rootPath}`);
                return { totalFiles: 0, totalSize: 0, byExtension: {} };
            }

            return await this.calculateStats(rootPath);
        } catch (error) {
            console.error('Error getting content stats:', error);
            return { totalFiles: 0, totalSize: 0, byExtension: {} };
        }
    }
            return { totalFiles: 0, totalSize: 0, byExtension: {} };
        }
    }

    // ========================================
    // Private helper methods
    // ========================================

    private async buildFolderStructure(
        folderPath: string,
        category: ContentType,
        currentDepth: number,
        maxDepth: number
    ): Promise<ContentFolder> {
        const stats = await fs.stat(folderPath);
        let fileCount = 0;
        let totalSize = 0;
        const subfolders: ContentFolder[] = [];

        try {
            const entries = await fs.readdir(folderPath, { withFileTypes: true });

            for (const entry of entries) {
                const entryPath = path.join(folderPath, entry.name);

                if (entry.isDirectory() && currentDepth < maxDepth) {
                    const subfolder = await this.buildFolderStructure(
                        entryPath,
                        category,
                        currentDepth + 1,
                        maxDepth
                    );
                    subfolders.push(subfolder);
                    fileCount += subfolder.fileCount;
                    totalSize += subfolder.totalSize;
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    const validExts = this.getValidExtensions(category);
                    
                    if (validExts.includes(ext)) {
                        fileCount++;
                        try {
                            const fileStats = await fs.stat(entryPath);
                            totalSize += fileStats.size;
                        } catch {
                            // Skip if can't read file stats
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error reading folder ${folderPath}:`, error);
        }

        return {
            name: path.basename(folderPath),
            path: folderPath,
            category,
            fileCount,
            totalSize,
            subfolders
        };
    }

    private async searchInCategory(filters: ContentSearchFilter): Promise<ContentFile[]> {
        const category = filters.category!;
        const rootPath = await this.getAvailablePath(category);

        try {
            await fs.access(rootPath);
            const stats = await fs.stat(rootPath);
            
            if (!stats.isDirectory()) {
                console.warn(`Search path is not a directory: ${rootPath}`);
                return [];
            }
        } catch {
            console.warn(`Search path not accessible: ${rootPath}`);
            return [];
        }

        const results: ContentFile[] = [];
        await this.searchRecursive(rootPath, category, filters, results);
        return results;
    }

    private async searchRecursive(
        dirPath: string,
        category: ContentType,
        filters: ContentSearchFilter,
        results: ContentFile[],
        currentDepth: number = 0,
        maxDepth: number = 10
    ): Promise<void> {
        try {
            // Limit recursion depth to prevent infinite loops
            if (currentDepth > maxDepth) {
                console.warn(`Max search depth reached at ${dirPath}`);
                return;
            }

            // Limit total results to prevent memory issues
            const MAX_RESULTS = 10000;
            if (results.length >= MAX_RESULTS) {
                console.warn(`Max search results reached (${MAX_RESULTS})`);
                return;
            }

            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                // Skip hidden files/folders
                if (entry.name.startsWith('.')) {
                    continue;
                }

                const entryPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Check subcategory filter
                    if (filters.subcategory && entry.name !== filters.subcategory) {
                        continue;
                    }
                    await this.searchRecursive(entryPath, category, filters, results, currentDepth + 1, maxDepth);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    const validExts = this.getValidExtensions(category);
                    
                    if (!validExts.includes(ext)) continue;

                    // Check search term
                    if (filters.searchTerm) {
                        const searchLower = filters.searchTerm.toLowerCase();
                        if (!entry.name.toLowerCase().includes(searchLower)) {
                            continue;
                        }
                    }

                    try {
                        const stats = await fs.stat(entryPath);
                        
                        // Validate file size is reasonable (not corrupted, not impossibly large)
                        if (stats.size > 0 && stats.size < 100 * 1024 * 1024 * 1024) { // Max 100GB per file
                            results.push({
                                id: this.generateFileId(entryPath),
                                name: entry.name,
                                path: entryPath,
                                category,
                                subcategory: this.detectSubcategory(entryPath, category),
                                size: stats.size,
                                extension: ext,
                                lastModified: stats.mtime
                            });
                        }
                    } catch (statError) {
                        console.warn(`Could not stat file ${entryPath}:`, statError);
                    }
                }
            }
        } catch (error) {
            console.error(`Error searching in ${dirPath}:`, error);
        }
    }

    private async calculateStats(
        dirPath: string,
        currentDepth: number = 0,
        maxDepth: number = 10
    ): Promise<{
        totalFiles: number;
        totalSize: number;
        byExtension: { [ext: string]: number };
    }> {
        let totalFiles = 0;
        let totalSize = 0;
        const byExtension: { [ext: string]: number } = {};

        try {
            // Limit recursion depth
            if (currentDepth > maxDepth) {
                console.warn(`Max stats depth reached at ${dirPath}`);
                return { totalFiles, totalSize, byExtension };
            }

            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                // Skip hidden files/folders
                if (entry.name.startsWith('.')) {
                    continue;
                }

                const entryPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    const subStats = await this.calculateStats(entryPath, currentDepth + 1, maxDepth);
                    totalFiles += subStats.totalFiles;
                    totalSize += subStats.totalSize;
                    
                    for (const [ext, count] of Object.entries(subStats.byExtension)) {
                        byExtension[ext] = (byExtension[ext] || 0) + count;
                    }
                } else if (entry.isFile()) {
                    try {
                        const stats = await fs.stat(entryPath);
                        
                        // Validate file size is reasonable
                        if (stats.size > 0 && stats.size < 100 * 1024 * 1024 * 1024) { // Max 100GB
                            totalFiles++;
                            totalSize += stats.size;
                            
                            const ext = path.extname(entry.name).toLowerCase();
                            byExtension[ext] = (byExtension[ext] || 0) + 1;
                        }
                    } catch (statError) {
                        console.warn(`Could not stat file ${entryPath}:`, statError);
                    }
                }
            }
        } catch (error) {
            console.error(`Error calculating stats for ${dirPath}:`, error);
        }

        // Validate totals are reasonable
        const MAX_FILES = 1000000; // 1 million files max
        const MAX_SIZE = 100 * 1024 * 1024 * 1024 * 1024; // 100 TB max
        
        if (totalFiles > MAX_FILES) {
            console.warn(`Suspiciously high file count: ${totalFiles}, capping at ${MAX_FILES}`);
            totalFiles = MAX_FILES;
        }
        
        if (totalSize > MAX_SIZE) {
            console.warn(`Suspiciously high total size: ${totalSize}, capping at ${MAX_SIZE}`);
            totalSize = MAX_SIZE;
        }

        return { totalFiles, totalSize, byExtension };
    }

    private getValidExtensions(category: ContentType): string[] {
        const config = PROCESSING_CONFIG.VALID_EXTENSIONS;
        
        switch (category) {
            case 'music':
                return config.music || ['.mp3', '.m4a', '.wav', '.flac'];
            case 'videos':
                return config.video || ['.mp4', '.mkv', '.avi', '.mov'];
            case 'movies':
                return config.movies || ['.mp4', '.mkv', '.avi'];
            case 'series':
                return config.movies || ['.mp4', '.mkv', '.avi']; // Same as movies
            default:
                return [];
        }
    }

    private detectCategory(filePath: string): ContentType | null {
        for (const [category, rootPath] of Object.entries(this.contentRoots)) {
            if (filePath.startsWith(rootPath)) {
                return category as ContentType;
            }
        }
        return null;
    }

    private detectSubcategory(filePath: string, category: ContentType): string | undefined {
        const rootPath = this.contentRoots[category];
        if (!rootPath) return undefined;

        const relativePath = filePath.replace(rootPath, '');
        const parts = relativePath.split(path.sep).filter(p => p);
        
        return parts.length > 0 ? parts[0] : undefined;
    }

    private generateFileId(filePath: string): string {
        // Generate a simple hash-like ID from file path
        return Buffer.from(filePath).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    }

    private async extractMetadata(filePath: string, category: ContentType): Promise<any> {
        // Placeholder for metadata extraction
        // In production, use libraries like ffprobe for media files
        return {};
    }

    private sortResults(
        results: ContentFile[],
        sortBy?: 'name' | 'date' | 'size',
        sortOrder?: 'asc' | 'desc'
    ): ContentFile[] {
        const order = sortOrder === 'desc' ? -1 : 1;

        return results.sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'date':
                    comparison = a.lastModified.getTime() - b.lastModified.getTime();
                    break;
                case 'size':
                    comparison = a.size - b.size;
                    break;
                default:
                    comparison = a.name.localeCompare(b.name);
            }

            return comparison * order;
        });
    }
}

// Singleton instance
export const contentService = new ContentService();

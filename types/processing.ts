export interface USBDevice {
    id: string;
    path: string;
    size: number;
    freeSpace: number;
    volumeName: string;
    isAvailable: boolean;
    lastUsed: Date | null;
    currentJob: string | null;
}

export interface ContentFile {
    id: string;
    name: string;
    path: string;
    size: number;
    category: 'music' | 'videos' | 'movies';
    subcategory: string;
    extension: string;
    lastModified: Date;
    metadata?: any;
}

export type JobStatus = 
    | 'pending'
    | 'preparing'
    | 'awaiting_payment'
    | 'payment_pending'
    | 'awaiting_usb'
    | 'copying'
    | 'verifying'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'paused';

export interface ProcessingEvent {
    type: string;
    job?: any;
    data?: any;
    timestamp: Date;
}

// export interface ContentPaths {
//     music: {
//         crossover: string;
//         rock: string;
//         salsa: string;
//         pop: string;
//         reggaeton: string;
//         electronica: string;
//         [key: string]: string;
//     };
//     videos: {
//         musicVideos: string;
//         concerts: string;
//         documentaries: string;
//         [key: string]: string;
//     };
//     movies: {
//         action: string;
//         comedy: string;
//         drama: string;
//         thriller: string;
//         [key: string]: string;
//     };
//     series: string;
//     apps: string;
//     others: string;
// }

export interface ContentPaths {
    music: string;
    movies: string;
    series: string;
    videos: string;
    apps: string;
}

export interface ContentPlan {
    finalContent: ContentFile[];
    missingContent: string[];
    totalSize: number;
    estimatedCopyTime: number;
}

export interface QualityReport {
    passed: boolean;
    totalFiles: number;
    verifiedFiles: number;
    missingFiles: MissingFileEntry[];
    corruptedFiles: CorruptedFileEntry[];
    sizeDiscrepancies: SizeDiscrepancyEntry[];
    errors: string[];
    verificationTime: number;
    timestamp: Date;
}

export interface MissingFileEntry {
    name: string;
    expectedPath: string;
    originalPath: string;
}

export interface CorruptedFileEntry {
    name: string;
    path: string;
    reason: string;
}

export interface SizeDiscrepancyEntry {
    name: string;
    expectedSize: number;
    actualSize: number;
    difference: number;
}

export interface NotificationData {
    jobId: string;
    type: string;
    channel: string;
    message: string;
    sentAt: Date;
    status: string;
}

export interface Attachment {
    type: 'image' | 'pdf' | 'document' | 'other';
    path: string;
}

export interface ParsedOrder {
    isValid: boolean;
    preferences: string[];
    contentList: string[];
    customizations: any;
    errors: string[];
    contentType: 'music' | 'videos' | 'movies' | 'mixed';
    estimatedFiles: number;
    estimatedSize: number;
}

export interface DownloadTask {
    id: string;
    contentName: string;
    jobId: string;
    status: 'queued' | 'downloading' | 'completed' | 'error';
    progress: number;
    downloadUrl: string;
    destinationPath: string;
    createdAt: Date;
    metadata?: any;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
}

export interface SearchResult {
    found: boolean;
    url: string;
    metadata: any;
}

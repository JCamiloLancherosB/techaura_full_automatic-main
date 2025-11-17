export interface UserSession {
    phone: string;
    name?: string;
    stage?: string;
    buyingIntent?: number;
    lastInteraction?: Date;
    lastFollowUp?: Date;
    followUpCount?: number;
    priorityScore?: number;
    urgencyLevel?: 'high' | 'medium' | 'low';
}

export interface FollowUpConfig {
    intervals: {
        mainCycle: number;
        maintenance: number;
        userDelay: number;
    };
    limits: {
        maxDailyFollowUps: number;
        spamProtectionHours: number;
        maxConcurrentProcessing: number;
    };
    urgencyRules: {
        [key: string]: {
            minDelayHours: number;
            maxDaily: number;
            buyingIntentThreshold: number;
        };
    };
}

export type ContentCategory = 'music' | 'videos' | 'movies';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'error';

export interface ContentPaths {
  music: Record<string, string>;   // e.g. { rock: 'D:/...', salsa: 'D:/...' }
  videos: Record<string, string>;
  movies: Record<string, string>;
}

export interface ContentMetadata {
  title?: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
  source?: string;
  [k: string]: any;
}

export interface ContentFile {
  id: string;
  name: string;
  path: string;
  category: ContentCategory;
  subcategory?: string;
  size: number;
  extension: string;
  lastModified: Date;
  metadata?: ContentMetadata;
}

export interface ContentPlan {
  finalContent: ContentFile[];
  missingContent: string[];    // nombres buscables
  totalSize: number;
  estimatedCopyTime: number;   // en segundos
}

export interface ProcessingLog {
  step: string;
  timestamp: Date;
  message: string;
}

export interface USBDevice {
  id: string;           // ej: "E:"
  path: string;         // ej: "E:\\"
  size: number;         // bytes
  freeSpace: number;    // bytes
  volumeName?: string;
  isAvailable: boolean;
  lastUsed: Date | null;
  currentJob: string | null;
}

export interface ProcessingJob {
  id: string;
  orderId: string;
  customerPhone: string;
  customerName: string;
  capacity: string;           // "32GB" | "16GB" | "8000MB"
  contentType: ContentCategory | 'mixed';
  preferences: string[];
  contentList: string[];
  customizations: Record<string, any>;
  priority: number;
  status: JobStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedTime: number;      // segundos
  progress: number;           // 0-100
  logs: ProcessingLog[];
  assignedDevice?: USBDevice;
  error?: string;
  qualityReport?: QualityReport;
}

export interface SearchResult {
  found: boolean;
  url: string;
  destinationPath: string;
  metadata: Record<string, any>;
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
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface QualityReport {
  passed: boolean;
  totalFiles: number;
  verifiedFiles: number;
  missingFiles: { name: string; expectedPath: string; originalPath: string }[];
  corruptedFiles: { name: string; path: string; reason: string }[];
  sizeDiscrepancies: { name: string; expectedSize: number; actualSize: number; difference: number }[];
  errors: string[];
  verificationTime: number; // ms
  timestamp: Date;
}

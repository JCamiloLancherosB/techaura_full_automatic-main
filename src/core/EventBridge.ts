import { EventEmitter } from 'events';
import { ProcessingJob } from '../models/ProcessingJob';
import { USBDevice } from '../../types/processing';

class SystemEvents extends EventEmitter {
    // Emitir cuando cambia el progreso de un trabajo
    notifyProgress(job: ProcessingJob) {
        this.emit('jobProgress', job);
    }

    // Emitir cuando cambia el estado de las USBs
    notifyUSBStatus(devices: USBDevice[]) {
        this.emit('usbUpdate', devices);
    }

    // Emitir logs en tiempo real
    notifyLog(jobId: string, message: string) {
        this.emit('log', { jobId, message, timestamp: new Date() });
    }
}

export const systemEvents = new SystemEvents();
import fs from 'fs';
import path from 'path';

export interface PreflightReport {
  ok: boolean;
  reasons: string[];
  requiredBytes?: number;
  availableBytes?: number;
}

export class ProcessingValidators {
  static ensurePathsExist(paths: string[]): string[] {
    const errors: string[] = [];
    for (const p of paths) {
      if (!fs.existsSync(p)) errors.push(`Ruta no existe: ${p}`);
    }
    return errors;
  }

  static estimateContentSizeBytes(fileList: string[]): number {
    let total = 0;
    for (const f of fileList) {
      try {
        const s = fs.statSync(f);
        if (s.isFile()) total += s.size;
      } catch {
        continue;
      }
    }
    return total;
  }

  static preflightDeviceCapacity(availableBytes: number, requiredBytes: number, overheadRatio = 1.03): PreflightReport {
    const needed = Math.ceil(requiredBytes * overheadRatio);
    if (availableBytes < needed) {
      return { ok: false, reasons: [`Espacio insuficiente: requerido ${needed}B, disponible ${availableBytes}B`], requiredBytes: needed, availableBytes };
    }
    return { ok: true, reasons: [], requiredBytes: needed, availableBytes };
  }

  static noDuplicateFilenames(targetRoot: string, fileList: string[]): string[] {
    const names = new Set<string>();
    const errors: string[] = [];
    for (const f of fileList) {
      const base = path.basename(f);
      const key = base.toLowerCase();
      if (names.has(key)) errors.push(`Duplicado en lote: ${base}`);
      names.add(key);
      const dest = path.join(targetRoot, base);
      if (fs.existsSync(dest)) errors.push(`Ya existe en USB destino: ${base}`);
    }
    return errors;
  }
}

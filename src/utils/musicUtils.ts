export class MusicUtils {
    static normalizeText(text: string): string {
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    static dedupeArray<T>(arr: T[]): T[] {
        return [...new Set(arr)];
    }

    static async getValidMediaPath(path: string) {
        try {
            return { valid: true, path };
        } catch {
            return { valid: false };
        }
    }
}

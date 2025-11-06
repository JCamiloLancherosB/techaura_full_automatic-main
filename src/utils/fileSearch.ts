import fs from 'fs/promises';
import path from 'path';

export async function buscarArchivosPorNombre(dir: string, nombre: string): Promise<string[]> {
    const resultados: string[] = [];
    async function search(currentDir: string) {
        const items = await fs.readdir(currentDir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(currentDir, item.name);
            if (item.isDirectory()) {
                await search(fullPath);
            } else {
                // Búsqueda insensible a mayúsculas/minúsculas y acentos
                if (item.name.normalize("NFD").toLowerCase().includes(nombre.normalize("NFD").toLowerCase())) {
                    resultados.push(fullPath);
                }
            }
        }
    }
    await search(dir);
    return resultados;
}

export async function copiarSinDuplicados(origenes: string[], destino: string, archivosYaCopiados: Set<string>) {
    await fs.mkdir(destino, { recursive: true });
    for (const origen of origenes) {
        const nombre = path.basename(origen);
        if (!archivosYaCopiados.has(nombre)) {
            await fs.copyFile(origen, path.join(destino, nombre));
            archivosYaCopiados.add(nombre);
        }
    }
}

export async function copiarCarpetaCompleta(origen: string, destino: string, archivosYaCopiados: Set<string>) {
    await fs.mkdir(destino, { recursive: true });
    const items = await fs.readdir(origen, { withFileTypes: true });
    for (const item of items) {
        const origenItem = path.join(origen, item.name);
        const destinoItem = path.join(destino, item.name);
        if (item.isDirectory()) {
            await copiarCarpetaCompleta(origenItem, destinoItem, archivosYaCopiados);
        } else {
            if (!archivosYaCopiados.has(item.name)) {
                await fs.copyFile(origenItem, destinoItem);
                archivosYaCopiados.add(item.name);
            }
        }
    } 
}
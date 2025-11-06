declare module 'node-fetch' {
    import { RequestInit, Response } from 'node-fetch';
    export default function fetch(url: string, options?: RequestInit): Promise<Response>;
}

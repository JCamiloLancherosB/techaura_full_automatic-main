export class UserStateManager {
    private static states = new Map<string, any>();

    static async get(phone: string): Promise<any> {
        return this.states.get(phone) || {};
    }

    static async save(userState: any): Promise<void> {
        if (userState.phone) {
            this.states.set(userState.phone, userState);
        }
    }
}

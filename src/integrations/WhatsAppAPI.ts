// src/integrations/WhatsAppAPI.ts

export default class WhatsAppAPI {
    private apiUrl: string;
    private apiToken: string;
    private phoneNumberId: string;

    constructor() {
        this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0';
        this.apiToken = process.env.WHATSAPP_API_TOKEN || '';
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    }

    async sendMessage(phoneNumber: string, message: string): Promise<void> {
        try {
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            const payload = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'text',
                text: {
                    body: message
                }
            };

            const response = await fetch(`${this.apiUrl}/${this.phoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`WhatsApp API error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json() as { messages?: Array<{ id: string }> }; // ✅ CORREGIDO
            
            if (result.messages && result.messages.length > 0) {
                console.log(`✅ Mensaje enviado a ${formattedPhone}: ${result.messages[0].id}`);
            }

        } catch (error) {
            console.error(`❌ Error enviando mensaje WhatsApp:`, error);
            throw error;
        }
    }

    private formatPhoneNumber(phoneNumber: string): string {
        let cleaned = phoneNumber.replace(/\D/g, '');
        
        if (cleaned.length === 10 && cleaned.startsWith('3')) {
            cleaned = '57' + cleaned;
        }
        
        return cleaned;
    }
}

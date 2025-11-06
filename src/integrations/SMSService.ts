import twilio from 'twilio';

export default class SMSService {
    private client: twilio.Twilio;
    private fromNumber: string;

    constructor() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        const authToken = process.env.TWILIO_AUTH_TOKEN || '';
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
        
        this.client = twilio(accountSid, authToken);
    }

    async sendSMS(phoneNumber: string, message: string): Promise<void> {
        try {
            console.log(`📱 Enviando SMS a ${phoneNumber}`);
            
            const result = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: phoneNumber
            });
            
            console.log(`✅ SMS enviado: ${result.sid}`);
            
        } catch (error) {
            console.error('❌ Error enviando SMS:', error);
            throw error;
        }
    }
}

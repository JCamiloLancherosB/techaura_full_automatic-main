import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

interface EmailOptions {
    to: string[];
    subject: string;
    body: string;
    priority?: 'low' | 'medium' | 'high';
}

interface EmailWithAttachmentOptions extends EmailOptions {
    attachments: string[];
}

export default class EmailService {
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || ''
            }
        });
    }

    /**
     * Enviar email simple
     */
    async sendEmail(options: EmailOptions): Promise<void> {
        try {
            console.log(`📧 Enviando email a ${options.to.join(', ')}`);
            
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM || 'noreply@techaura.com',
                to: options.to.join(', '),
                subject: options.subject,
                text: options.body,
                html: this.formatHTMLBody(options.body),
                priority: this.getPriority(options.priority)
            });
            
            console.log('✅ Email enviado exitosamente');
            
        } catch (error) {
            console.error('❌ Error enviando email:', error);
            throw error;
        }
    }

    /**
     * Enviar email con archivos adjuntos
     */
    async sendEmailWithAttachment(options: EmailWithAttachmentOptions): Promise<void> {
        try {
            console.log(`📧 Enviando email con adjuntos a ${options.to.join(', ')}`);
            
            // Validar que los archivos existan
            const attachments = this.prepareAttachments(options.attachments);

            await this.transporter.sendMail({
                from: process.env.SMTP_FROM || 'noreply@techaura.com',
                to: options.to.join(', '),
                subject: options.subject,
                text: options.body,
                html: this.formatHTMLBody(options.body),
                priority: this.getPriority(options.priority),
                attachments: attachments
            });
            
            console.log('✅ Email con adjuntos enviado exitosamente');
            
        } catch (error) {
            console.error('❌ Error enviando email con adjuntos:', error);
            throw error;
        }
    }

    /**
     * Enviar email HTML personalizado
     */
    async sendHTMLEmail(options: EmailOptions & { html: string }): Promise<void> {
        try {
            console.log(`📧 Enviando email HTML a ${options.to.join(', ')}`);
            
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM || 'noreply@techaura.com',
                to: options.to.join(', '),
                subject: options.subject,
                text: options.body,
                html: options.html,
                priority: this.getPriority(options.priority)
            });
            
            console.log('✅ Email HTML enviado exitosamente');
            
        } catch (error) {
            console.error('❌ Error enviando email HTML:', error);
            throw error;
        }
    }

    /**
     * Enviar email con template
     */
    async sendTemplateEmail(
        to: string[],
        template: 'invoice' | 'welcome' | 'order_confirmation' | 'job_completed',
        data: any
    ): Promise<void> {
        try {
            const emailContent = this.getTemplate(template, data);
            
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM || 'noreply@techaura.com',
                to: to.join(', '),
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html,
                priority: 'normal'
            });
            
            console.log(`✅ Email con template '${template}' enviado exitosamente`);
            
        } catch (error) {
            console.error('❌ Error enviando email con template:', error);
            throw error;
        }
    }

    /**
     * Verificar conexión SMTP
     */
    async verifyConnection(): Promise<boolean> {
        try {
            await this.transporter.verify();
            console.log('✅ Conexión SMTP verificada');
            return true;
        } catch (error) {
            console.error('❌ Error verificando conexión SMTP:', error);
            return false;
        }
    }

    // ============================================
    // 🛠️ MÉTODOS PRIVADOS
    // ============================================

    /**
     * Preparar archivos adjuntos
     */
    private prepareAttachments(filePaths: string[]): any[] {
        const attachments: any[] = [];

        for (const filePath of filePaths) {
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️ Archivo no encontrado: ${filePath}`);
                continue;
            }

            attachments.push({
                filename: path.basename(filePath),
                path: filePath,
                contentType: this.getContentType(filePath)
            });
        }

        return attachments;
    }

    /**
     * Obtener tipo de contenido
     */
    private getContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        
        const contentTypes: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.txt': 'text/plain',
            '.csv': 'text/csv',
            '.zip': 'application/zip'
        };

        return contentTypes[ext] || 'application/octet-stream';
    }

    /**
     * Formatear cuerpo HTML
     */
    private formatHTMLBody(body: string): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 10px 10px 0 0;
        }
        .content {
            background: #f9f9f9;
            padding: 20px;
            border: 1px solid #ddd;
        }
        .footer {
            background: #333;
            color: white;
            padding: 15px;
            text-align: center;
            font-size: 12px;
            border-radius: 0 0 10px 10px;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: Arial, sans-serif;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎵 TechAura</h1>
        <p>USBs Personalizadas de Calidad</p>
    </div>
    <div class="content">
        <pre>${body}</pre>
    </div>
    <div class="footer">
        <p>© ${new Date().getFullYear()} TechAura - Todos los derechos reservados</p>
        <p>WhatsApp: ${process.env.PHONE_NUMBER || '+57 XXX XXX XXXX'}</p>
    </div>
</body>
</html>
        `.trim();
    }

    /**
     * Obtener prioridad
     */
    private getPriority(priority?: 'low' | 'medium' | 'high'): 'high' | 'normal' | 'low' {
        if (priority === 'high') return 'high';
        if (priority === 'low') return 'low';
        return 'normal';
    }

    /**
     * Obtener template de email
     */
    private getTemplate(template: string, data: any): { subject: string; text: string; html: string } {
        const templates: Record<string, any> = {
            invoice: {
                subject: `Factura ${data.invoiceNumber} - TechAura`,
                text: this.getInvoiceText(data),
                html: this.getInvoiceHTML(data)
            },
            welcome: {
                subject: '¡Bienvenido a TechAura! 🎵',
                text: this.getWelcomeText(data),
                html: this.getWelcomeHTML(data)
            },
            order_confirmation: {
                subject: `Confirmación de pedido ${data.orderId}`,
                text: this.getOrderConfirmationText(data),
                html: this.getOrderConfirmationHTML(data)
            },
            job_completed: {
                subject: '¡Tu USB está lista! 🎉',
                text: this.getJobCompletedText(data),
                html: this.getJobCompletedHTML(data)
            }
        };

        return templates[template] || {
            subject: 'Notificación de TechAura',
            text: JSON.stringify(data),
            html: this.formatHTMLBody(JSON.stringify(data))
        };
    }

    // ============================================
    // 📧 TEMPLATES DE EMAIL
    // ============================================

    private getInvoiceText(data: any): string {
        return `
Factura: ${data.invoiceNumber}
Cliente: ${data.customerName}
Fecha: ${new Date(data.date).toLocaleDateString('es-CO')}

Detalle:
${data.items.map((item: any) => `• ${item.description}: $${item.price.toLocaleString('es-CO')}`).join('\n')}

Total: $${data.total.toLocaleString('es-CO')}

¡Gracias por tu compra!
        `.trim();
    }

    private getInvoiceHTML(data: any): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; }
        .invoice { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 20px; text-align: center; }
        .items { margin: 20px 0; }
        .item { padding: 10px; border-bottom: 1px solid #ddd; }
        .total { font-size: 20px; font-weight: bold; text-align: right; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="invoice">
        <div class="header">
            <h1>🧾 FACTURA</h1>
            <p>${data.invoiceNumber}</p>
        </div>
        <div style="padding: 20px;">
            <p><strong>Cliente:</strong> ${data.customerName}</p>
            <p><strong>Fecha:</strong> ${new Date(data.date).toLocaleDateString('es-CO')}</p>
            <div class="items">
                <h3>Detalle:</h3>
                ${data.items.map((item: any) => `
                    <div class="item">
                        <span>${item.description}</span>
                        <span style="float: right;">$${item.price.toLocaleString('es-CO')}</span>
                    </div>
                `).join('')}
            </div>
            <div class="total">
                Total: $${data.total.toLocaleString('es-CO')}
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();
    }

    private getWelcomeText(data: any): string {
        return `¡Hola ${data.name}! Bienvenido a TechAura. Estamos emocionados de tenerte con nosotros.`;
    }

    private getWelcomeHTML(data: any): string {
        return this.formatHTMLBody(`¡Hola ${data.name}! 🎉\n\nBienvenido a TechAura.\n\nEstamos emocionados de tenerte con nosotros.`);
    }

    private getOrderConfirmationText(data: any): string {
        return `Tu pedido ${data.orderId} ha sido confirmado. Te notificaremos cuando esté listo.`;
    }

    private getOrderConfirmationHTML(data: any): string {
        return this.formatHTMLBody(`✅ Tu pedido ${data.orderId} ha sido confirmado.\n\nTe notificaremos cuando esté listo.`);
    }

    private getJobCompletedText(data: any): string {
        return `¡Tu USB está lista! El pedido ${data.orderId} ha sido completado exitosamente.`;
    }

    private getJobCompletedHTML(data: any): string {
        return this.formatHTMLBody(`🎉 ¡Tu USB está lista!\n\nEl pedido ${data.orderId} ha sido completado exitosamente.`);
    }
}

import { businessDB } from "../mysql-database";
import { ProcessingJob, JobStatus } from "../models/ProcessingJob";
import { Customer } from "../models/Customer";
import { Order } from "../models/Order";
import WhatsAppAPI from "../integrations/WhatsAppAPI";
import EmailService from "../integrations/EmailService";
import SMSService from "../integrations/SMSService";
import { outboundGate } from "./OutboundGate";

interface NotificationChannel {
    whatsapp: boolean;
    email: boolean;
    sms: boolean;
}

interface NotificationTemplate {
    title: string;
    message: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
}

export default class NotificationService {
    private whatsappAPI: WhatsAppAPI;
    private emailService: EmailService;
    private smsService: SMSService;

    // Configuración de canales por tipo de notificación
    private readonly NOTIFICATION_CHANNELS: Record<string, NotificationChannel> = {
        job_created: { whatsapp: true, email: true, sms: false },
        status_update: { whatsapp: true, email: false, sms: false },
        payment_reminder: { whatsapp: true, email: true, sms: true },
        job_completed: { whatsapp: true, email: true, sms: false },
        job_failed: { whatsapp: true, email: true, sms: false },
        job_cancelled: { whatsapp: true, email: true, sms: false },
        missing_content: { whatsapp: true, email: true, sms: false },
        invoice: { whatsapp: true, email: true, sms: false }
    };

    constructor() {
        this.whatsappAPI = new WhatsAppAPI();
        this.emailService = new EmailService();
        this.smsService = new SMSService();
    }

    // ============================================
    // 📋 NOTIFICACIONES DE TRABAJOS (JOBS)
    // ============================================

    /**
     * Notificar creación de trabajo
     */
    async sendJobCreated(customer: Customer, job: ProcessingJob): Promise<void> {
        console.log(`📧 Notificación: Trabajo creado para ${customer.name} - ${job.id}`);

        try {
            const template = this.buildJobCreatedTemplate(customer, job);
            await this.sendMultiChannel('job_created', customer, template, job);
            
            await this.logNotification({
                jobId: job.id,
                customerId: customer.id,
                type: 'job_created',
                channels: this.NOTIFICATION_CHANNELS.job_created,
                message: template.message,
                status: 'sent'
            });

        } catch (error) {
            console.error('❌ Error enviando notificación de trabajo creado:', error);
            await this.handleNotificationError('job_created', customer, job, error);
        }
    }

    /**
     * Notificar actualización de estado
     */
    async sendStatusUpdate(job: ProcessingJob, status: JobStatus): Promise<void> {
        console.log(`📧 Notificación: Estado actualizado ${job.id} - ${status}`);

        try {
            const customer = await this.getCustomerByJobId(job.id);
            if (!customer) {
                console.warn(`⚠️ Cliente no encontrado para job ${job.id}`);
                return;
            }

            const template = this.buildStatusUpdateTemplate(customer, job, status);
            await this.sendMultiChannel('status_update', customer, template, job);

            await this.logNotification({
                jobId: job.id,
                customerId: customer.id,
                type: 'status_update',
                channels: this.NOTIFICATION_CHANNELS.status_update,
                message: template.message,
                status: 'sent'
            });

        } catch (error) {
            console.error('❌ Error enviando actualización de estado:', error);
        }
    }

    /**
     * Notificar recordatorio de pago
     */
    async sendPaymentReminder(job: ProcessingJob): Promise<void> {
        console.log(`📧 Recordatorio de pago: ${job.id}`);

        try {
            const customer = await this.getCustomerByJobId(job.id);
            if (!customer) return;

            const template = this.buildPaymentReminderTemplate(customer, job);
            await this.sendMultiChannel('payment_reminder', customer, template, job);

            await this.logNotification({
                jobId: job.id,
                customerId: customer.id,
                type: 'payment_reminder',
                channels: this.NOTIFICATION_CHANNELS.payment_reminder,
                message: template.message,
                status: 'sent'
            });

        } catch (error) {
            console.error('❌ Error enviando recordatorio de pago:', error);
        }
    }

    /**
     * Notificar trabajo completado
     */
    async sendJobCompleted(job: ProcessingJob): Promise<void> {
        console.log(`📧 Notificación: Trabajo completado ${job.id}`);

        try {
            const customer = await this.getCustomerByJobId(job.id);
            if (!customer) return;

            const template = this.buildJobCompletedTemplate(customer, job);
            await this.sendMultiChannel('job_completed', customer, template, job);

            // Enviar reporte de calidad si existe
            if (job.contentPlan) {
                const qualityTemplate = this.buildQualityReportTemplate(customer, job);
                await this.sendWhatsApp(customer.phone, qualityTemplate.message);
            }

            await this.logNotification({
                jobId: job.id,
                customerId: customer.id,
                type: 'job_completed',
                channels: this.NOTIFICATION_CHANNELS.job_completed,
                message: template.message,
                status: 'sent'
            });

        } catch (error) {
            console.error('❌ Error enviando notificación de completado:', error);
        }
    }

    /**
     * Notificar trabajo fallido
     */
    async sendJobFailed(job: ProcessingJob, error: any): Promise<void> {
        console.log(`📧 Notificación: Trabajo fallido ${job.id} - ${error.message}`);

        try {
            const customer = await this.getCustomerByJobId(job.id);
            if (!customer) return;

            const template = this.buildJobFailedTemplate(customer, job, error);
            await this.sendMultiChannel('job_failed', customer, template, job);

            // Notificar equipo interno
            await this.notifyInternalTeam(job, error.message);

            await this.logNotification({
                jobId: job.id,
                customerId: customer.id,
                type: 'job_failed',
                channels: this.NOTIFICATION_CHANNELS.job_failed,
                message: template.message,
                status: 'sent'
            });

        } catch (error) {
            console.error('❌ Error enviando notificación de fallo:', error);
        }
    }

    /**
     * Notificar trabajo cancelado
     */
    async sendJobCancelled(job: ProcessingJob): Promise<void> {
        console.log(`📧 Notificación: Trabajo cancelado ${job.id}`);

        try {
            const customer = await this.getCustomerByJobId(job.id);
            if (!customer) return;

            const template = this.buildJobCancelledTemplate(customer, job);
            await this.sendMultiChannel('job_cancelled', customer, template, job);

            await this.logNotification({
                jobId: job.id,
                customerId: customer.id,
                type: 'job_cancelled',
                channels: this.NOTIFICATION_CHANNELS.job_cancelled,
                message: template.message,
                status: 'sent'
            });

        } catch (error) {
            console.error('❌ Error enviando notificación de cancelación:', error);
        }
    }

    /**
     * Notificar contenido faltante
     */
    async sendMissingContentAlert(customer: Customer, job: ProcessingJob, missingContent: string[]): Promise<void> {
        console.log(`📧 Alerta contenido faltante: ${job.id}`, missingContent);

        try {
            const template = this.buildMissingContentTemplate(customer, job, missingContent);
            await this.sendMultiChannel('missing_content', customer, template, job);

            await this.logNotification({
                jobId: job.id,
                customerId: customer.id,
                type: 'missing_content',
                channels: this.NOTIFICATION_CHANNELS.missing_content,
                message: template.message,
                status: 'sent'
            });

        } catch (error) {
            console.error('❌ Error enviando alerta de contenido faltante:', error);
        }
    }

    /**
     * Enviar factura
     */
    async sendInvoice(customer: Customer, invoice: any): Promise<void> {
        console.log(`📧 Enviando factura: ${invoice.invoiceNumber} a ${customer.name}`);

        try {
            const template = this.buildInvoiceTemplate(customer, invoice);
            await this.sendMultiChannel('invoice', customer, template);

            // Enviar PDF de factura por email si está disponible y el cliente tiene email
            if (invoice.pdfPath && customer.email) {
                await this.emailService.sendEmailWithAttachment({
                    to: [customer.email],
                    subject: `Factura ${invoice.invoiceNumber} - TechAura`,
                    body: template.message,
                    attachments: [invoice.pdfPath]
                });
            }

            await this.logNotification({
                jobId: invoice.orderId,
                customerId: customer.id,
                type: 'invoice',
                channels: this.NOTIFICATION_CHANNELS.invoice,
                message: template.message,
                status: 'sent'
            });

        } catch (error) {
            console.error('❌ Error enviando factura:', error);
        }
    }

    // ============================================
    // 📨 MÉTODOS DE ENVÍO POR CANAL
    // ============================================

    /**
     * Enviar por múltiples canales
     */
    private async sendMultiChannel(
        type: string,
        customer: Customer,
        template: NotificationTemplate,
        job?: ProcessingJob
    ): Promise<void> {
        const channels = this.NOTIFICATION_CHANNELS[type];

        const promises: Promise<void>[] = [];

        if (channels.whatsapp && customer.phone) {
            promises.push(this.sendWhatsApp(customer.phone, template.message));
        }

        if (channels.email && customer.email) {
            promises.push(this.sendEmail(customer.email, template.title, template.message));
        }

        if (channels.sms && customer.phone) {
            promises.push(this.sendSMS(customer.phone, template.message));
        }

        await Promise.allSettled(promises);
    }

    /**
     * Enviar por WhatsApp usando OutboundGate
     */
    private async sendWhatsApp(phone: string, message: string): Promise<void> {
        try {
            // Send through OutboundGate with notification context
            const result = await outboundGate.sendMessage(
                phone,
                message,
                {
                    phone,
                    messageType: 'notification',
                    priority: 'high',
                    bypassTimeWindow: true // Notifications can be sent outside business hours
                }
            );
            
            if (result.sent) {
                console.log(`✅ WhatsApp notification sent to ${phone} via OutboundGate`);
            } else {
                console.warn(`⚠️ WhatsApp notification blocked for ${phone}: ${result.reason}`);
                throw new Error(`Notification blocked: ${result.reason}`);
            }
        } catch (error) {
            console.error(`❌ Error enviando WhatsApp a ${phone}:`, error);
            throw error;
        }
    }

    /**
     * Enviar por Email
     */
    private async sendEmail(email: string, subject: string, body: string): Promise<void> {
        try {
            await this.emailService.sendEmail({
                to: [email],
                subject: subject,
                body: body,
                priority: 'medium'
            });
            console.log(`✅ Email enviado a ${email}`);
        } catch (error) {
            console.error(`❌ Error enviando email a ${email}:`, error);
            throw error;
        }
    }

    /**
     * Enviar por SMS
     */
    private async sendSMS(phone: string, message: string): Promise<void> {
        try {
            await this.smsService.sendSMS(phone, message);
            console.log(`✅ SMS enviado a ${phone}`);
        } catch (error) {
            console.error(`❌ Error enviando SMS a ${phone}:`, error);
            throw error;
        }
    }

    // ============================================
    // 📝 CONSTRUCCIÓN DE TEMPLATES
    // ============================================

    private buildJobCreatedTemplate(customer: Customer, job: ProcessingJob): NotificationTemplate {
        return {
            title: 'Trabajo de procesamiento creado',
            message: [
                `🎵 ¡Hola ${customer.name}!`,
                ``,
                `✅ Hemos recibido tu pedido y ya comenzamos a procesar tu USB personalizada.`,
                ``,
                `📋 *Detalles del pedido:*`,
                `• ID: ${job.id}`,
                `• Orden: ${job.orderId}`,
                `• Capacidad: ${job.capacity}`,
                `• Tipo: ${this.getContentTypeDescription(job.contentType)}`,
                `• Prioridad: ${job.priority}/10`,
                ``,
                `📱 Te mantendremos informado del progreso.`,
                ``,
                `¡Gracias por elegirnos! 🎶`
            ].join('\n'),
            priority: 'medium'
        };
    }

    private buildStatusUpdateTemplate(customer: Customer, job: ProcessingJob, status: JobStatus): NotificationTemplate {
        const statusDescriptions: Record<JobStatus, string> = {
            pending: '⏳ En espera',
            queued: '📋 En cola',
            preparing: '📦 Preparando contenido',
            awaiting_payment: '💰 Esperando pago',
            payment_pending: '💳 Pago pendiente',
            awaiting_usb: '💾 Esperando USB disponible',
            processing: '⚙️ Procesando',
            copying: '📋 Copiando archivos',
            verifying: '🔍 Verificando integridad',
            completed: '✅ Completado',
            failed: '❌ Fallido',
            cancelled: '🚫 Cancelado',
            paused: '⏸️ Pausado',
            error: '⚠️ Error'
        };

        return {
            title: 'Actualización de estado',
            message: [
                `📊 *Actualización de tu pedido* ${customer.name}`,
                ``,
                `Estado: ${statusDescriptions[status]}`,
                `Progreso: ${job.progress}%`,
                job.statusMessage ? `• ${job.statusMessage}` : '',
                ``,
                `ID: ${job.id}`,
                `Última actualización: ${new Date().toLocaleString('es-CO')}`
            ].filter(line => line !== '').join('\n'),
            priority: 'low'
        };
    }

    private buildPaymentReminderTemplate(customer: Customer, job: ProcessingJob): NotificationTemplate {
        return {
            title: 'Recordatorio de pago',
            message: [
                `💰 Hola ${customer.name},`,
                ``,
                `Tu pedido está listo para ser procesado, pero aún no hemos recibido el pago.`,
                ``,
                `📋 *Detalles:*`,
                `• Pedido: ${job.orderId}`,
                `• ID: ${job.id}`,
                ``,
                `💳 *Métodos de pago disponibles:*`,
                `• Transferencia bancaria`,
                `• Nequi / Daviplata`,
                `• Efectivo contra entrega`,
                ``,
                `📱 Responde este mensaje para confirmar tu pago.`,
                ``,
                `¡Gracias! 🙏`
            ].join('\n'),
            priority: 'high'
        };
    }

    private buildJobCompletedTemplate(customer: Customer, job: ProcessingJob): NotificationTemplate {
        const processingTime = job.completedAt && job.createdAt ?
            Math.floor((job.completedAt.getTime() - job.createdAt.getTime()) / 1000 / 60) : 0;

        return {
            title: 'Trabajo completado',
            message: [
                `🎉 ¡Excelente noticia ${customer.name}!`,
                ``,
                `✅ Tu USB personalizada está lista`,
                ``,
                `📋 *Resumen:*`,
                `• Pedido: ${job.orderId}`,
                `• Archivos: ${job.contentPlan?.finalContent.length || 0}`,
                `• Tamaño total: ${this.formatBytes(job.contentPlan?.totalSize || 0)}`,
                `• Tiempo de procesamiento: ${processingTime} minutos`,
                ``,
                `📦 *Próximos pasos:*`,
                `Tu USB será enviada en las próximas horas.`,
                `Te enviaremos el código de seguimiento cuando esté en camino.`,
                ``,
                `🎵 ¡Disfruta tu contenido personalizado!`
            ].join('\n'),
            priority: 'high'
        };
    }

    private buildJobFailedTemplate(customer: Customer, job: ProcessingJob, error: any): NotificationTemplate {
        return {
            title: 'Error en procesamiento',
            message: [
                `😔 Hola ${customer.name},`,
                ``,
                `Lamentamos informarte que hemos tenido un inconveniente procesando tu pedido.`,
                ``,
                `📋 *Detalles:*`,
                `• Pedido: ${job.orderId}`,
                `• ID: ${job.id}`,
                `• Error: ${job.failureReason || error.message}`,
                ``,
                `🔧 *¿Qué sigue?*`,
                `Nuestro equipo técnico está revisando el problema.`,
                `Te contactaremos en las próximas 2 horas con una solución.`,
                ``,
                `💬 Si tienes preguntas, responde este mensaje.`,
                ``,
                `¡Gracias por tu paciencia! 🙏`
            ].join('\n'),
            priority: 'urgent'
        };
    }

    private buildJobCancelledTemplate(customer: Customer, job: ProcessingJob): NotificationTemplate {
        return {
            title: 'Trabajo cancelado',
            message: [
                `🚫 Hola ${customer.name},`,
                ``,
                `Tu pedido ha sido cancelado.`,
                ``,
                `📋 *Detalles:*`,
                `• Pedido: ${job.orderId}`,
                `• ID: ${job.id}`,
                `• Razón: ${job.failureReason || 'Cancelado por solicitud'}`,
                ``,
                `💬 Si tienes preguntas o deseas hacer un nuevo pedido, contáctanos.`,
                ``,
                `¡Esperamos verte pronto! 👋`
            ].join('\n'),
            priority: 'medium'
        };
    }

    private buildMissingContentTemplate(customer: Customer, job: ProcessingJob, missingContent: string[]): NotificationTemplate {
        return {
            title: 'Contenido faltante',
            message: [
                `⚠️ Hola ${customer.name},`,
                ``,
                `Hemos detectado que algunos archivos solicitados no están disponibles:`,
                ``,
                ...missingContent.slice(0, 10).map(item => `• ${item}`),
                missingContent.length > 10 ? `... y ${missingContent.length - 10} más` : '',
                ``,
                `🔧 *Opciones:*`,
                `1. Reemplazar con contenido similar`,
                `2. Esperar a que descarguemos el contenido`,
                `3. Modificar tu selección`,
                ``,
                `💬 Responde con tu preferencia.`
            ].filter(line => line !== '').join('\n'),
            priority: 'high'
        };
    }

    private buildQualityReportTemplate(customer: Customer, job: ProcessingJob): NotificationTemplate {
        if (!job.contentPlan) {
            return { title: '', message: '', priority: 'low' };
        }

        return {
            title: 'Reporte de calidad',
            message: [
                `📊 *Reporte de Calidad*`,
                ``,
                `✅ Archivos copiados: ${job.contentPlan.finalContent.length}`,
                `📦 Tamaño total: ${this.formatBytes(job.contentPlan.totalSize)}`,
                `⏱️ Tiempo estimado de copia: ${Math.floor(job.contentPlan.estimatedCopyTime / 60)} min`,
                ``,
                job.contentPlan.missingContent.length > 0 ?
                    `⚠️ Contenido faltante: ${job.contentPlan.missingContent.length} archivos` : '',
                ``,
                `🎯 *Calidad: EXCELENTE*`,
                ``,
                `Tu USB está lista para el envío 📦`
            ].filter(line => line !== '').join('\n'),
            priority: 'medium'
        };
    }

    private buildInvoiceTemplate(customer: Customer, invoice: any): NotificationTemplate {
        return {
            title: `Factura ${invoice.invoiceNumber}`,
            message: [
                `🧾 *FACTURA - TECHAURA*`,
                ``,
                `Cliente: ${customer.name}`,
                `Factura: ${invoice.invoiceNumber}`,
                `Fecha: ${new Date(invoice.date).toLocaleDateString('es-CO')}`,
                ``,
                `📋 *Detalle:*`,
                ...invoice.items.map((item: any) =>
                    `• ${item.description}: $${item.price.toLocaleString('es-CO')}`
                ),
                ``,
                `💰 *Total: $${invoice.total.toLocaleString('es-CO')}*`,
                ``,
                `¡Gracias por tu compra! 🎵`
            ].join('\n'),
            priority: 'medium'
        };
    }

    // ============================================
    // 🚨 NOTIFICACIONES INTERNAS
    // ============================================

    private async notifyInternalTeam(job: ProcessingJob, errorMessage: string): Promise<void> {
        try {
            const internalMessage = [
                `🚨 *ERROR EN PROCESAMIENTO*`,
                ``,
                `📋 Job: ${job.id}`,
                `📦 Pedido: ${job.orderId}`,
                `👤 Cliente: ${job.customerId}`,
                `❌ Error: ${errorMessage}`,
                `⏰ Hora: ${new Date().toLocaleString('es-CO')}`,
                ``,
                `🔧 Requiere atención inmediata`
            ].join('\n');

            // Enviar a grupo interno de WhatsApp usando OutboundGate
            const internalGroupId = process.env.INTERNAL_WHATSAPP_GROUP || '';
            if (internalGroupId) {
                try {
                    await outboundGate.sendMessage(
                        internalGroupId,
                        internalMessage,
                        {
                            phone: internalGroupId,
                            messageType: 'notification',
                            priority: 'high',
                            bypassTimeWindow: true,
                            bypassRateLimit: true // Internal notifications bypass rate limits
                        }
                    );
                } catch (error) {
                    console.error('Error sending internal WhatsApp notification:', error);
                }
            }

            // Enviar email al equipo técnico
            await this.emailService.sendEmail({
                to: [process.env.TECH_EMAIL || 'tech@techaura.com'],
                subject: `Error en procesamiento - Job ${job.id}`,
                body: internalMessage,
                priority: 'high'
            });

        } catch (error) {
            console.error('❌ Error notificando equipo interno:', error);
        }
    }

    // ============================================
    // 🛠️ UTILIDADES
    // ============================================

    private async getCustomerByJobId(jobId: string): Promise<Customer | null> {
        try {
            // Implementar lógica para obtener cliente desde BD
            // Por ahora retorna null
            return null;
        } catch (error) {
            console.error('❌ Error obteniendo cliente:', error);
            return null;
        }
    }

    private getContentTypeDescription(contentType: string): string {
        const types: Record<string, string> = {
            music: '🎵 Solo música',
            videos: '🎥 Videos musicales',
            movies: '🎬 Películas',
            mixed: '🎭 Contenido mixto'
        };
        return types[contentType] || contentType;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private async logNotification(data: any): Promise<void> {
        try {
            await businessDB.insertNotification({
                ...data,
                sentAt: new Date(),
                status: data.status || 'sent'
            });
        } catch (error) {
            console.error('❌ Error registrando notificación:', error);
        }
    }

    private async handleNotificationError(type: string, customer: Customer, job: ProcessingJob, error: any): Promise<void> {
        console.error(`❌ Error en notificación ${type}:`, error);

        await this.logNotification({
            jobId: job.id,
            customerId: customer.id,
            type: type,
            channels: this.NOTIFICATION_CHANNELS[type],
            message: `Error: ${error.message}`,
            status: 'failed'
        });
    }

    // ============================================
    // 📊 NOTIFICACIONES DE PROCESAMIENTO (COMPATIBILIDAD)
    // ============================================

    async sendProcessingStarted(job: ProcessingJob): Promise<void> {
        const customer = await this.getCustomerByJobId(job.id);
        if (customer) {
            await this.sendJobCreated(customer, job);
        }
    }

    async sendProcessingCompleted(job: ProcessingJob): Promise<void> {
        await this.sendJobCompleted(job);
    }

    async sendProcessingError(job: ProcessingJob, errorMessage: string): Promise<void> {
        await this.sendJobFailed(job, { message: errorMessage });
    }

    async sendProgressUpdate(job: ProcessingJob): Promise<void> {
        // Solo enviar actualizaciones en hitos importantes (25%, 50%, 75%)
        if (job.progress % 25 === 0 && job.progress > 0 && job.progress < 100) {
            await this.sendStatusUpdate(job, job.status);
        }
    }
}

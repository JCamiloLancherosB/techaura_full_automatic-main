import { Customer } from '../models/Customer';
import { Order } from '../models/Order';
import { ProcessingJob } from '../models/ProcessingJob';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * MYSQL SSOT ENFORCEMENT - DatabaseService (SQLite) is BLOCKED
 * 
 * This class is no longer used in production.
 * All database operations must use the MySQL adapter (mysql-database.ts).
 * 
 * If you see this error, it means code is trying to use SQLite instead of MySQL.
 * Please refactor to use the MySQL adapter.
 */
export default class DatabaseService {
    private db: Database.Database;

    constructor() {
        // BLOCK SQLite usage - MySQL SSOT enforcement
        const errorMessage = 
            `❌ ERROR CRÍTICO: MySQL SSOT enforcement\n` +
            `\n` +
            `   DatabaseService (SQLite) está BLOQUEADO.\n` +
            `   Este sistema solo permite MySQL como base de datos.\n` +
            `\n` +
            `   ❌ NO USAR: DatabaseService (SQLite)\n` +
            `   ✅ USAR: mysql-database.ts (MySQL adapter)\n` +
            `\n` +
            `   Por favor, refactoriza el código para usar el adapter MySQL:\n` +
            `   - import { businessDB } from './mysql-database'\n` +
            `   - businessDB.saveCustomer(...)\n` +
            `   - businessDB.getOrderById(...)\n` +
            `\n` +
            `   Archivos a revisar:\n` +
            `   - src/services/ProcessingOrchestrator.ts\n` +
            `   - Cualquier archivo que importe DatabaseService\n`;
        
        console.error(errorMessage);
        throw new Error('DatabaseService (SQLite) is blocked - use MySQL adapter (mysql-database.ts) instead');
    }

    private initializeTables(): void {
        // Tabla de clientes
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT,
                address TEXT,
                city TEXT,
                country TEXT DEFAULT 'Colombia',
                preferences TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_interaction TEXT NOT NULL,
                last_order_date TEXT,
                total_orders INTEGER DEFAULT 0,
                total_spent REAL DEFAULT 0,
                vip_status INTEGER DEFAULT 0
            )
        `);

        // Tabla de órdenes
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL,
                content_type TEXT NOT NULL,
                capacity TEXT NOT NULL,
                preferences TEXT,
                price REAL NOT NULL,
                status TEXT NOT NULL,
                payment_status TEXT NOT NULL,
                delivery_date TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT,
                notes TEXT,
                FOREIGN KEY (customer_id) REFERENCES customers(id)
            )
        `);

        // Tabla de trabajos
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                content_type TEXT NOT NULL,
                capacity TEXT NOT NULL,
                preferences TEXT,
                content_list TEXT,
                delivery_date TEXT,
                priority INTEGER DEFAULT 5,
                notes TEXT,
                status TEXT NOT NULL,
                progress INTEGER DEFAULT 0,
                status_message TEXT,
                last_update TEXT NOT NULL,
                content_plan TEXT,
                assigned_usb TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                failed_at TEXT,
                processing_time INTEGER,
                failure_reason TEXT,
                retry_count INTEGER DEFAULT 0,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (customer_id) REFERENCES customers(id)
            )
        `);

        // Tabla de facturas
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS invoices (
                invoice_number TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                date TEXT NOT NULL,
                items TEXT NOT NULL,
                total REAL NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
        `);

        // Tabla de métricas
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                total_jobs_processed INTEGER,
                total_jobs_failed INTEGER,
                total_bytes_processed INTEGER,
                average_processing_time REAL,
                total_revenue REAL,
                active_usbs INTEGER
            )
        `);

        // Tabla de reportes diarios
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS daily_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                total_jobs INTEGER,
                total_revenue REAL,
                average_processing_time REAL,
                content_types TEXT
            )
        `);

        // ✅ Crear índices para mejorar performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
            CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
            CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
        `);
    }

    // ============================================
    // CLIENTES
    // ============================================

    async getCustomerById(id: string): Promise<Customer | null> {
        const stmt = this.db.prepare('SELECT * FROM customers WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;

        return new Customer({
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            address: row.address,
            city: row.city,
            country: row.country,
            preferences: row.preferences ? JSON.parse(row.preferences) : [],
            notes: row.notes,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            lastInteraction: new Date(row.last_interaction),
            lastOrderDate: row.last_order_date ? new Date(row.last_order_date) : undefined,
            totalOrders: row.total_orders,
            totalSpent: row.total_spent,
            vipStatus: row.vip_status === 1
        });
    }

    async getCustomerByPhone(phone: string): Promise<Customer | null> {
        const stmt = this.db.prepare('SELECT * FROM customers WHERE phone = ?');
        const row = stmt.get(phone) as any;
        
        if (!row) return null;

        return this.getCustomerById(row.id);
    }

    async saveCustomer(customer: Customer): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO customers (
                id, name, phone, email, address, city, country, preferences, notes,
                created_at, updated_at, last_interaction, last_order_date,
                total_orders, total_spent, vip_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            customer.id,
            customer.name,
            customer.phone,
            customer.email || null,
            customer.address || null,
            customer.city || null,
            customer.country,
            JSON.stringify(customer.preferences),
            customer.notes || null,
            customer.createdAt.toISOString(),
            customer.updatedAt.toISOString(),
            customer.lastInteraction.toISOString(),
            customer.lastOrderDate?.toISOString() || null,
            customer.totalOrders,
            customer.totalSpent,
            customer.vipStatus ? 1 : 0
        );
    }

    async getAllCustomers(): Promise<Customer[]> {
        const stmt = this.db.prepare('SELECT * FROM customers ORDER BY created_at DESC');
        const rows = stmt.all() as any[];
        
        const customers: Customer[] = [];
        for (const row of rows) {
            const customer = await this.getCustomerById(row.id);
            if (customer) customers.push(customer);
        }
        
        return customers;
    }

    // ============================================
    // ÓRDENES
    // ============================================

    async getOrderById(id: string): Promise<Order | null> {
        const stmt = this.db.prepare('SELECT * FROM orders WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;

        return new Order({
            id: row.id,
            customerId: row.customer_id,
            contentType: row.content_type,
            capacity: row.capacity,
            preferences: JSON.parse(row.preferences || '[]'),
            price: row.price,
            status: row.status,
            paymentStatus: row.payment_status,
            deliveryDate: row.delivery_date ? new Date(row.delivery_date) : undefined,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
            notes: row.notes
        });
    }

    async saveOrder(order: Order): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO orders (
                id, customer_id, content_type, capacity, preferences, price,
                status, payment_status, delivery_date, created_at, updated_at,
                completed_at, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            order.id,
            order.customerId,
            order.contentType,
            order.capacity,
            JSON.stringify(order.preferences),
            order.price,
            order.status,
            order.paymentStatus,
            order.deliveryDate?.toISOString() || null,
            order.createdAt.toISOString(),
            order.updatedAt.toISOString(),
            order.completedAt?.toISOString() || null,
            order.notes || null
        );
    }

    async getOrdersByCustomer(customerId: string): Promise<Order[]> {
        const stmt = this.db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC');
        const rows = stmt.all(customerId) as any[];
        
        const orders: Order[] = [];
        for (const row of rows) {
            const order = await this.getOrderById(row.id);
            if (order) orders.push(order);
        }
        
        return orders;
    }

    // ============================================
    // TRABAJOS
    // ============================================

    async saveJob(job: ProcessingJob): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO jobs (
                id, order_id, customer_id, content_type, capacity, preferences,
                content_list, delivery_date, priority, notes, status, progress,
                status_message, last_update, content_plan, assigned_usb,
                created_at, started_at, completed_at, failed_at, processing_time,
                failure_reason, retry_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const data = job.toJSON();

        stmt.run(
            data.id,
            data.orderId,
            data.customerId,
            data.contentType,
            data.capacity,
            JSON.stringify(data.preferences),
            JSON.stringify(data.contentList),
            data.deliveryDate?.toISOString() || null,
            data.priority,
            data.notes || null,
            data.status,
            data.progress,
            data.statusMessage || null,
            data.lastUpdate.toISOString(),
            data.contentPlan ? JSON.stringify(data.contentPlan) : null,
            data.assignedUSB || null,
            data.createdAt.toISOString(),
            data.startedAt?.toISOString() || null,
            data.completedAt?.toISOString() || null,
            data.failedAt?.toISOString() || null,
            data.processingTime || null,
            data.failureReason || null,
            data.retryCount
        );
    }

    async updateJob(job: ProcessingJob): Promise<void> {
        await this.saveJob(job);
    }

    async getPendingJobs(): Promise<ProcessingJob[]> {
        const stmt = this.db.prepare(`
            SELECT * FROM jobs 
            WHERE status IN ('pending', 'queued', 'awaiting_payment', 'awaiting_usb')
            ORDER BY priority DESC, created_at ASC
        `);

        const rows = stmt.all() as any[];
        return rows.map(row => this.rowToJob(row));
    }

    async getJobById(id: string): Promise<ProcessingJob | null> {
        const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return this.rowToJob(row);
    }

    private rowToJob(row: any): ProcessingJob {
        const job = new ProcessingJob({
            id: row.id,
            orderId: row.order_id,
            customerId: row.customer_id,
            contentType: row.content_type,
            capacity: row.capacity,
            preferences: JSON.parse(row.preferences || '[]'),
            contentList: JSON.parse(row.content_list || '[]'),
            deliveryDate: row.delivery_date ? new Date(row.delivery_date) : undefined,
            priority: row.priority,
            notes: row.notes
        });

        job.status = row.status;
        job.progress = row.progress;
        job.statusMessage = row.status_message;
        job.lastUpdate = new Date(row.last_update);
        job.contentPlan = row.content_plan ? JSON.parse(row.content_plan) : undefined;
        job.assignedUSB = row.assigned_usb;
        job.createdAt = new Date(row.created_at);
        job.startedAt = row.started_at ? new Date(row.started_at) : undefined;
        job.completedAt = row.completed_at ? new Date(row.completed_at) : undefined;
        job.failedAt = row.failed_at ? new Date(row.failed_at) : undefined;
        job.processingTime = row.processing_time;
        job.failureReason = row.failure_reason;
        job.retryCount = row.retry_count;

        return job;
    }

    // ============================================
    // FACTURAS
    // ============================================

    async saveInvoice(invoice: any): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO invoices (
                invoice_number, order_id, customer_id, customer_name,
                date, items, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            invoice.invoiceNumber,
            invoice.orderId,
            invoice.customerId,
            invoice.customerName,
            invoice.date.toISOString(),
            JSON.stringify(invoice.items),
            invoice.total
        );
    }

    async getInvoiceByOrderId(orderId: string): Promise<any | null> {
        const stmt = this.db.prepare('SELECT * FROM invoices WHERE order_id = ?');
        const row = stmt.get(orderId) as any;
        
        if (!row) return null;

        return {
            invoiceNumber: row.invoice_number,
            orderId: row.order_id,
            customerId: row.customer_id,
            customerName: row.customer_name,
            date: new Date(row.date),
            items: JSON.parse(row.items),
            total: row.total
        };
    }

    // ============================================
    // MÉTRICAS Y REPORTES
    // ============================================

    async saveMetrics(metrics: any): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT INTO metrics (
                timestamp, total_jobs_processed, total_jobs_failed,
                total_bytes_processed, average_processing_time,
                total_revenue, active_usbs
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            new Date().toISOString(),
            metrics.totalJobsProcessed,
            metrics.totalJobsFailed,
            metrics.totalBytesProcessed,
            metrics.averageProcessingTime,
            metrics.totalRevenue,
            metrics.activeUSBs
        );
    }

    async getLatestMetrics(): Promise<any | null> {
        const stmt = this.db.prepare('SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 1');
        const row = stmt.get() as any;
        
        if (!row) return null;

        return {
            timestamp: new Date(row.timestamp),
            totalJobsProcessed: row.total_jobs_processed,
            totalJobsFailed: row.total_jobs_failed,
            totalBytesProcessed: row.total_bytes_processed,
            averageProcessingTime: row.average_processing_time,
            totalRevenue: row.total_revenue,
            activeUSBs: row.active_usbs
        };
    }

    async saveDailyReport(report: any): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO daily_reports (
                date, total_jobs, total_revenue, average_processing_time, content_types
            ) VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(
            report.date.toISOString(),
            report.totalJobs,
            report.totalRevenue,
            report.averageProcessingTime,
            JSON.stringify(report.contentTypes)
        );
    }

    async getDailyReport(date: Date): Promise<any | null> {
        const dateStr = date.toISOString().split('T')[0];
        const stmt = this.db.prepare('SELECT * FROM daily_reports WHERE date LIKE ?');
        const row = stmt.get(`${dateStr}%`) as any;
        
        if (!row) return null;

        return {
            date: new Date(row.date),
            totalJobs: row.total_jobs,
            totalRevenue: row.total_revenue,
            averageProcessingTime: row.average_processing_time,
            contentTypes: JSON.parse(row.content_types)
        };
    }

    // ============================================
    // UTILIDADES
    // ============================================

    /**
     * Ejecutar query personalizado
     */
    query(sql: string, params: any[] = []): any[] {
        const stmt = this.db.prepare(sql);
        return stmt.all(...params) as any[];
    }

    /**
     * Ejecutar transacción
     */
    transaction(callback: () => void): void {
        const transaction = this.db.transaction(callback);
        transaction();
    }

    /**
     * Hacer backup de la base de datos
     */
    async backup(backupPath: string): Promise<void> {
        await this.db.backup(backupPath);
        console.log(`✅ Backup creado en: ${backupPath}`);
    }

    /**
     * Cerrar conexión
     */
    close(): void {
        this.db.close();
        console.log('✅ Base de datos cerrada');
    }
}

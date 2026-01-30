import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const ORDERS_FILE = path.join(DATA_DIR, 'pending_orders.json');

interface PersistedOrder {
  odooOrderId: number;
  recipientPhone: string;
  customerName: string;
  orderNumber: string;
  productType: string;
  capacity: string;
  genres?: string[];
  artists?: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export class OrderPersistence {
  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  savePendingOrders(orders: Map<number, any>): boolean {
    try {
      this.ensureDataDir();
      const data = Array.from(orders.entries()).map(([id, order]) => ({
        ...order,
        odooOrderId: id,
        updatedAt: new Date().toISOString()
      }));
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving orders:', error);
      return false;
    }
  }

  loadPendingOrders(): Map<number, any> {
    try {
      if (!fs.existsSync(ORDERS_FILE)) {
        return new Map();
      }
      const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
      
      // Validate each order before adding to map
      const validOrders = data.filter((order: PersistedOrder) => {
        if (!order.odooOrderId || !order.recipientPhone) {
          console.warn('Skipping invalid order: missing required fields');
          return false;
        }
        return true;
      });
      
      return new Map(validOrders.map((order: PersistedOrder) => [order.odooOrderId, order]));
    } catch (error) {
      console.error('Error loading orders:', error);
      return new Map();
    }
  }
}

export const orderPersistence = new OrderPersistence();

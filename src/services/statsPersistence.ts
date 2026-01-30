import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const STATS_FILE = path.join(DATA_DIR, 'sales_stats.json');

interface DailyStat {
  date: string;
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  productTypes: Record<string, number>;
}

export class StatsPersistence {
  private stats: {
    daily: DailyStat[];
    totals: {
      allTimeOrders: number;
      allTimeRevenue: number;
      allTimeCompleted: number;
    };
  } = { daily: [], totals: { allTimeOrders: 0, allTimeRevenue: 0, allTimeCompleted: 0 } };

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(STATS_FILE)) {
        this.stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  save(): boolean {
    try {
      const dir = path.dirname(STATS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving stats:', error);
      return false;
    }
  }

  recordOrder(order: any): void {
    const today = new Date().toISOString().split('T')[0];
    let dailyStat = this.stats.daily.find(s => s.date === today);
    
    if (!dailyStat) {
      dailyStat = {
        date: today,
        totalOrders: 0,
        completedOrders: 0,
        totalRevenue: 0,
        productTypes: {}
      };
      this.stats.daily.push(dailyStat);
    }
    
    dailyStat.totalOrders++;
    this.stats.totals.allTimeOrders++;
    
    // Mantener solo últimos 90 días
    this.stats.daily = this.stats.daily.slice(-90);
    
    this.save();
  }

  recordCompletion(order: any, revenue: number): void {
    const today = new Date().toISOString().split('T')[0];
    const dailyStat = this.stats.daily.find(s => s.date === today);
    
    if (dailyStat) {
      dailyStat.completedOrders++;
      dailyStat.totalRevenue += revenue;
    }
    
    this.stats.totals.allTimeCompleted++;
    this.stats.totals.allTimeRevenue += revenue;
    
    this.save();
  }

  getStats(): typeof this.stats {
    return this.stats;
  }
}

export const statsPersistence = new StatsPersistence();

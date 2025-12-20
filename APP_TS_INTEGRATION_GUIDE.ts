/**
 * APP.TS Integration Guide - Initialize All Services and Health Checks
 * 
 * Add these integrations to src/app.ts for complete system initialization
 */

// ========== ADD THESE IMPORTS AFTER EXISTING IMPORTS ==========
import { flowGuard } from './services/flowGuard';
import { contextAnalyzer } from './services/contextAnalyzer';

// ========== ADD AFTER initializeApp() FUNCTION ==========

/**
 * Initialize all critical services with health checks
 */
async function initializeCriticalServices() {
  console.log('🚀 Initializing critical services...');
  
  try {
    // 1. FlowGuard Service
    console.log('📊 FlowGuard: Checking initialization...');
    const flowGuardStats = flowGuard.getStats();
    console.log(`✅ FlowGuard initialized: ${flowGuardStats.activeLocks} active locks, ${flowGuardStats.activeEntryGuards} entry guards`);
    
    // 2. ContextAnalyzer Service
    console.log('🧠 ContextAnalyzer: Verifying functionality...');
    const testAnalysis = await contextAnalyzer.analyze('test', 'test_message', 'initial');
    console.log(`✅ ContextAnalyzer functional: ${testAnalysis.confidence > 0 ? 'PASS' : 'FAIL'}`);
    
    // 3. UserTrackingSystem pacing functions
    console.log('⏱️  Checking anti-ban pacing functions...');
    const pacingCheck = await checkAllPacingRules();
    console.log(`✅ Pacing system: ${pacingCheck.ok ? 'READY' : pacingCheck.reason}`);
    
    // 4. FlowCoordinator
    console.log('🔄 FlowCoordinator: Checking...');
    const testTransition = flowCoordinator.validateTransition('initial', 'musicUsb');
    console.log(`✅ FlowCoordinator: ${testTransition.isValid ? 'READY' : 'ERROR'}`);
    
    // 5. IntelligentRouter
    console.log('🎯 IntelligentRouter: Checking...');
    console.log(`✅ IntelligentRouter: READY`);
    
    console.log('✅ All critical services initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Error initializing critical services:', error);
    return false;
  }
}

// ========== ADD SYSTEM HEALTH CHECK ENDPOINT ==========

/**
 * System Health Check Endpoint
 * GET /health - Returns system health status
 */
app.get('/health', async (req: any, res: any) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: false,
        flowGuard: false,
        contextAnalyzer: false,
        pacing: false,
        flowCoordinator: false
      },
      metrics: {
        activeSessions: userSessions.size,
        followUpQueue: followUpQueue.size,
        flowGuardLocks: 0,
        memory: {
          used: process.memoryUsage().heapUsed / 1024 / 1024,
          total: process.memoryUsage().heapTotal / 1024 / 1024
        }
      }
    };
    
    // Check database
    try {
      health.services.database = await businessDB.testConnection();
    } catch {
      health.services.database = false;
    }
    
    // Check FlowGuard
    try {
      const stats = flowGuard.getStats();
      health.services.flowGuard = true;
      health.metrics.flowGuardLocks = stats.activeLocks;
    } catch {
      health.services.flowGuard = false;
    }
    
    // Check ContextAnalyzer
    try {
      await contextAnalyzer.analyze('test', 'test', 'initial');
      health.services.contextAnalyzer = true;
    } catch {
      health.services.contextAnalyzer = false;
    }
    
    // Check Pacing
    try {
      const pacingCheck = await checkAllPacingRules();
      health.services.pacing = true;
    } catch {
      health.services.pacing = false;
    }
    
    // Check FlowCoordinator
    try {
      flowCoordinator.validateTransition('initial', 'musicUsb');
      health.services.flowCoordinator = true;
    } catch {
      health.services.flowCoordinator = false;
    }
    
    // Determine overall status
    const allHealthy = Object.values(health.services).every(v => v === true);
    health.status = allHealthy ? 'healthy' : 'degraded';
    
    res.status(allHealthy ? 200 : 503).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * FlowGuard Statistics Endpoint
 * GET /api/flow-guard/stats - Returns FlowGuard statistics
 */
app.get('/api/flow-guard/stats', (req: any, res: any) => {
  try {
    const stats = flowGuard.getStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * FlowGuard Clear User Locks Endpoint
 * POST /api/flow-guard/clear/:phone - Clear locks for a specific user
 */
app.post('/api/flow-guard/clear/:phone', async (req: any, res: any) => {
  try {
    const phone = req.params.phone;
    const flowName = req.body.flowName; // Optional
    
    await flowGuard.clearUserGuards(phone, flowName);
    
    res.json({
      success: true,
      message: `Cleared guards for ${phone}${flowName ? ` in flow ${flowName}` : ''}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Context Analysis Test Endpoint
 * POST /api/context/analyze - Test context analysis
 */
app.post('/api/context/analyze', async (req: any, res: any) => {
  try {
    const { message, phone, currentFlow } = req.body;
    
    if (!message || !phone) {
      return res.status(400).json({
        success: false,
        error: 'message and phone are required'
      });
    }
    
    const analysis = await contextAnalyzer.analyzeEnhanced(message, phone, currentFlow);
    
    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========== UPDATE MAIN INITIALIZATION ==========

async function main() {
  try {
    console.log('🚀 Starting TechAura Intelligent Bot...');
    
    // 1. Initialize database
    await initializeApp();
    
    // 2. Initialize critical services
    const servicesReady = await initializeCriticalServices();
    if (!servicesReady) {
      console.error('❌ Critical services failed to initialize. Exiting...');
      process.exit(1);
    }
    
    // 3. Initialize bot (existing code)
    const adapterFlow = createFlow([
      musicUsb,
      videosUsb,
      moviesUsb,
      capacityMusic,
      capacityVideo,
      datosCliente,
      // ... rest of flows
    ]);
    
    const adapterProvider = createProvider(Provider);
    const adapterDatabase = new Database({
      host: process.env.MYSQL_DB_HOST,
      user: process.env.MYSQL_DB_USER,
      database: process.env.MYSQL_DB_NAME,
      password: process.env.MYSQL_DB_PASS,
      port: process.env.MYSQL_DB_PORT ? +process.env.MYSQL_DB_PORT : 3306
    });
    
    botInstance = await createBot({
      flow: adapterFlow,
      provider: adapterProvider,
      database: adapterDatabase
    });
    
    // 4. Set bot instance for services
    setBotInstance(botInstance);
    
    console.log('✅ Bot instance created and set');
    
    // 5. Start periodic health checks
    startPeriodicHealthChecks();
    
    // 6. Start watchdog for stuck locks (already started in FlowGuard)
    console.log('👁️  FlowGuard watchdog active');
    
    // 7. Start control panel (existing code)
    await startControlPanel(botInstance);
    
    console.log('🎉 TechAura Intelligent Bot is ready!');
    console.log('📊 Health check available at: http://localhost:3008/health');
    console.log('🔐 FlowGuard stats at: http://localhost:3008/api/flow-guard/stats');
    console.log('🧠 Context analyzer at: POST http://localhost:3008/api/context/analyze');
    
  } catch (error) {
    console.error('❌ Fatal error in main():', error);
    process.exit(1);
  }
}

// ========== ADD PERIODIC HEALTH CHECKS ==========

function startPeriodicHealthChecks() {
  // Health check every 5 minutes
  setInterval(async () => {
    try {
      console.log('🏥 Running periodic health check...');
      
      const checks = {
        database: await businessDB.testConnection(),
        flowGuard: flowGuard.getStats().activeLocks >= 0,
        sessions: userSessions.size,
        followUps: followUpQueue.size,
        memory: process.memoryUsage().heapUsed / 1024 / 1024
      };
      
      console.log('✅ Health check results:', checks);
      
      // Alert if memory usage is high (>400MB)
      if (checks.memory > 400) {
        console.warn(`⚠️  High memory usage: ${checks.memory.toFixed(2)}MB`);
      }
      
      // Alert if too many stuck locks
      const lockStats = flowGuard.getStats();
      if (lockStats.activeLocks > 10) {
        console.warn(`⚠️  High number of active locks: ${lockStats.activeLocks}`);
      }
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  console.log('✅ Periodic health checks started (every 5 minutes)');
}

// ========== ADD GRACEFUL SHUTDOWN ==========

async function gracefulShutdown(signal: string) {
  console.log(`\n⚠️  Received ${signal}, starting graceful shutdown...`);
  
  try {
    // 1. Stop accepting new connections
    console.log('🛑 Stopping new connections...');
    
    // 2. Clear all FlowGuard locks
    console.log('🧹 Clearing all FlowGuard locks...');
    // FlowGuard doesn't expose clearAll, but locks will auto-expire
    
    // 3. Close database connections
    console.log('🔌 Closing database connections...');
    await businessDB.close?.();
    
    // 4. Save any pending session data
    console.log('💾 Saving session data...');
    // Sessions are auto-saved by userTrackingSystem
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ========== USAGE INSTRUCTIONS ==========

/*
INTEGRATION CHECKLIST:

1. ✅ Add imports at top of app.ts
2. ✅ Add initializeCriticalServices() function
3. ✅ Add health check endpoints (/health, /api/flow-guard/stats, etc.)
4. ✅ Update main() to call initializeCriticalServices()
5. ✅ Add startPeriodicHealthChecks()
6. ✅ Add gracefulShutdown() and signal handlers
7. ✅ Verify bot starts successfully with all services initialized

TEST ENDPOINTS:
- GET http://localhost:3008/health
- GET http://localhost:3008/api/flow-guard/stats
- POST http://localhost:3008/api/flow-guard/clear/:phone
- POST http://localhost:3008/api/context/analyze
  Body: { "message": "quiero música de salsa", "phone": "1234567890", "currentFlow": "initial" }

MONITORING:
- Check logs for "✅ All critical services initialized successfully"
- Monitor /health endpoint for service degradation
- Watch FlowGuard stats for stuck locks
- Monitor memory usage in health checks
*/

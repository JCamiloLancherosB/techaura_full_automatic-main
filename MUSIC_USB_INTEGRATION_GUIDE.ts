/**
 * Music USB Flow - Enhanced with FlowGuard, ContextAnalyzer, and Anti-Ban Pacing
 * 
 * Key improvements:
 * 1. FlowGuard integration to prevent duplicate intros
 * 2. Anti-ban pacing with rate limiting and delays
 * 3. Context-aware flow decisions
 * 4. Proper shipping handoff with validation
 * 5. Lock management with auto-cleanup
 * 
 * Apply these changes to src/flows/musicUsb.ts
 * 
 * IMPORTANT: This is a guide file showing the pattern to apply.
 * When integrating into the actual musicUsb.ts file:
 * - Keep existing imports that are already there
 * - Add only the new imports (FlowGuard, ContextAnalyzer, pacing functions)
 * - UserStateManager, MusicUtils, etc. already exist in musicUsb.ts
 * - EnhancedMusicFlow already exists in musicUsb.ts imports
 */

// ========== ADD THESE IMPORTS AT THE TOP ==========
import { flowGuard, createMessageHash } from '../services/flowGuard';
import { contextAnalyzer } from '../services/contextAnalyzer';
import { 
  checkRateLimit, 
  randomDelay, 
  waitForFollowUpDelay,
  checkAllPacingRules,
  getUserSession,
  updateUserSession,
  getUserCollectedData
} from './userTrackingSystem';
import { flowHelper } from '../services/flowIntegrationHelper';
import datosClienteFlow from './datosCliente';
import capacityMusicFlow from './capacityMusic';
import { EnhancedMusicFlow } from './enhancedMusicFlow';
import { UserStateManager, MusicUtils, DemoManager, IntentDetector, musicData, sendPricingTable, suggestUpsell, persistOrderProgress } from './musicUsb'; // Import all needed utilities from original file

// ========== REPLACE THE MAIN FLOW ENTRY ACTION ==========
const musicUsb = addKeyword(['Hola, me interesa la USB con música.'])
  .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
    const phoneNumber = ctx.from;
    const messageHash = createMessageHash(ctx.body || '');
    
    // === STEP 1: FlowGuard Check ===
    const guardCheck = await flowGuard.canEnterFlow(
      phoneNumber,
      'musicUsb',
      'entry',
      messageHash
    );
    
    if (!guardCheck.canProceed) {
      console.log(`🛡️ FlowGuard blocked entry for ${phoneNumber}: ${guardCheck.reason}`);
      if (guardCheck.reason === 'awaiting_user_input') {
        // Silent skip - user is in awaiting state
        return;
      }
      if (guardCheck.reason === 'user_locked') {
        // User is processing, skip silently
        return;
      }
      return; // Duplicate entry - skip silently
    }
    
    // === STEP 2: Acquire Lock ===
    const lockResult = await flowGuard.acquireLock(phoneNumber, 'musicUsb', 'intro');
    if (!lockResult.success) {
      console.log(`⛔ Could not acquire lock for ${phoneNumber}`);
      return;
    }
    
    const lockId = lockResult.lockId;
    
    try {
      await updateUserSession(phoneNumber, ctx.body, 'musicUsb', 'entry', false, {
        messageType: 'music_flow_entry',
        confidence: 0.95
      });
      
      // === STEP 3: Anti-Ban Pacing Check ===
      const pacingCheck = await checkAllPacingRules();
      if (!pacingCheck.ok) {
        console.log(`⏸️ Pacing blocked send for ${phoneNumber}: ${pacingCheck.reason}`);
        await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
        return;
      }
      
      const session = (await getUserSession(phoneNumber)) as UserSession;
      session.currentFlow = 'musicUsb';
      session.isActive = true;
      
      // Mark entry as handled
      flowGuard.markEntryHandled(phoneNumber, 'musicUsb', messageHash);
      
      // === STEP 4: Set Awaiting Stage ===
      await flowGuard.setUserStage(phoneNumber, 'musicUsb', 'sending_intro');
      
      // === STEP 5: Send Welcome with Anti-Ban Delays ===
      if (checkRateLimit()) {
        await randomDelay();  // 2-15s random delay
        await waitForFollowUpDelay();  // 3s baseline
        await EnhancedMusicFlow.sendWelcome(phoneNumber, session, flowDynamic);
      } else {
        console.log(`⚠️ Rate limit reached, skipping welcome for ${phoneNumber}`);
      }
      
      await MusicUtils.delay(400);
      
      // === STEP 6: Send Playlist with Anti-Ban Delays ===
      const playlist = musicData.playlistsData[0];
      let playlistMedia: string | null = null;
      if (playlist.img) {
        const mediaResult = await MusicUtils.getValidMediaPath(musicData.playlistImages[playlist.img]);
        if (mediaResult.valid) playlistMedia = mediaResult.path;
      }
      
      if (checkRateLimit()) {
        await randomDelay();
        await waitForFollowUpDelay();
        if (playlistMedia) {
          await flowDynamic([{ body: `🎵 Playlist Top: ${playlist.name}`, media: playlistMedia }]);
        } else {
          await flowDynamic([`🎵 Playlist Top: ${playlist.name}`]);
        }
      } else {
        console.log(`⚠️ Rate limit reached, skipping playlist for ${phoneNumber}`);
      }
      
      await MusicUtils.delay(400);
      
      // === STEP 7: Send Demos with Batch Cool-Down ===
      const strategicGenres = ['reggaeton', 'salsa', 'bachata'];
      const demos = await DemoManager.getRandomSongsByGenres(strategicGenres, 2);
      
      if (demos.length > 0 && checkRateLimit()) {
        await randomDelay();
        await waitForFollowUpDelay();
        await flowDynamic(['👂 Escucha cómo suena tu USB:']);
        
        for (let i = 0; i < demos.length; i++) {
          const demo = demos[i];
          if (checkRateLimit()) {
            await randomDelay();
            await flowDynamic([{ body: `🎵 ${demo.name}`, media: demo.filePath }]);
            await MusicUtils.delay(200);
            
            // Batch cool-down every 2 demos (not needed for 2, but good practice)
            if ((i + 1) % 2 === 0 && i < demos.length - 1) {
              console.log(`⏸️ Batch cool-down after ${i + 1} demos`);
              await MusicUtils.delay(3000);  // 3s cool-down
            }
          } else {
            console.log(`⚠️ Rate limit reached, skipping demo ${i + 1} for ${phoneNumber}`);
          }
        }
      }
      
      // === STEP 8: Send Personalization Prompt ===
      if (checkRateLimit()) {
        await randomDelay();
        await waitForFollowUpDelay();
        await flowDynamic([
          '🎵 ¡Tu música, a tu medida! Dime qué te gusta:\n\n' +
          '• Escribe 1-2 géneros (ej: "salsa y vallenato")\n' +
          '• O tu artista favorito (ej: "Karol G")\n' +
          '• O responde "OK" para nuestra selección Crossover (lo mejor de todo)\n\n' +
          '💡 Sin relleno ni repeticiones - solo lo que realmente quieres escuchar.'
        ]);
      }
      
      // === STEP 9: Set Awaiting State ===
      session.conversationData = session.conversationData || {};
      (session.conversationData as any).stage = 'personalization';
      (session.conversationData as any).welcomeSentAt = Date.now();
      (session.conversationData as any).musicGenresPromptAt = Date.now();
      
      await flowGuard.setUserStage(phoneNumber, 'musicUsb', 'awaiting_music_input');
      
      // Save user state
      const userState = await UserStateManager.getOrCreate(phoneNumber);
      userState.customizationStage = 'initial';
      userState.conversionStage = 'awareness';
      userState.interactionCount = (userState.interactionCount || 0) + 1;
      userState.touchpoints = [...(userState.touchpoints || []), 'music_entry'];
      await UserStateManager.save(userState);
      
      // === STEP 10: Release Lock ===
      await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
      
    } catch (error) {
      console.error(`❌ Error in musicUsb entry for ${phoneNumber}:`, error);
      await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
      
      if (checkRateLimit()) {
        await randomDelay();
        await flowDynamic(['⚠️ Ocurrió un error. Por favor intenta nuevamente o escribe "música".']);
      }
    }
  })
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const phoneNumber = ctx.from;
    const userInput = ctx.body?.trim() || '';
    
    // === STEP 1: Context Analysis ===
    const analysis = await contextAnalyzer.analyzeEnhanced(userInput, phoneNumber, 'musicUsb');
    
    console.log(`🎯 musicUsb: ${analysis.primaryIntent.type} (${(analysis.primaryIntent.confidence * 100).toFixed(0)}%) -> ${analysis.suggestedFlow}`);
    
    // === STEP 2: Check if Need Clarification ===
    if (analysis.needsClarification && analysis.clarificationPrompt) {
      if (checkRateLimit()) {
        await randomDelay();
        await waitForFollowUpDelay();
        await flowDynamic([analysis.clarificationPrompt]);
      }
      return;
    }
    
    // === STEP 3: Acquire Lock for Processing ===
    const lockResult = await flowGuard.acquireLock(phoneNumber, 'musicUsb', 'processing_response');
    if (!lockResult.success) {
      console.log(`⛔ Could not acquire lock for processing ${phoneNumber}`);
      return;
    }
    
    const lockId = lockResult.lockId;
    
    try {
      const session = (await getUserSession(phoneNumber)) as UserSession;
      
      await updateUserSession(phoneNumber, userInput, 'musicUsb', 'processing_preference_response', false, {
        metadata: { 
          userMessage: userInput,
          intent: analysis.primaryIntent.type,
          confidence: analysis.primaryIntent.confidence
        }
      });
      
      // === STEP 4: Handle Objections ===
      const lowerInput = userInput.toLowerCase();
      if (/caro|costoso|mucho|precio alto|no s[eé]|dud|no est[oó]y segur/i.test(lowerInput)) {
        await updateUserSession(phoneNumber, userInput, 'musicUsb', 'objection_handling', false, {
          metadata: { objectionType: 'price_concern' }
        });
        
        if (checkRateLimit()) {
          await randomDelay();
          await waitForFollowUpDelay();
          await EnhancedMusicFlow.handleObjection(phoneNumber, userInput, session, flowDynamic);
        }
        
        await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
        return;
      }
      
      // === STEP 5: Handle Direct Price Request ===
      if (/(precio|cu[aá]nto|vale|cost[oó]s?)/i.test(userInput) || analysis.primaryIntent.type === 'pricing') {
        if (checkRateLimit()) {
          await randomDelay();
          await waitForFollowUpDelay();
          await flowDynamic(['💰 Con gusto! Te muestro las opciones de capacidad con sus precios:']);
          await randomDelay();
          await sendPricingTable(flowDynamic);
        }
        
        await flowGuard.setUserStage(phoneNumber, 'musicUsb', 'viewing_prices');
        await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
        
        // === VALIDATED TRANSITION TO CAPACITY ===
        const transitionValid = await flowHelper.validateFlowTransition(session, 'musicUsb', 'capacityMusic');
        if (transitionValid) {
          return gotoFlow(capacityMusicFlow);
        } else {
          console.warn(`⚠️ Invalid transition to capacityMusic for ${phoneNumber}`);
          if (checkRateLimit()) {
            await flowDynamic(['Por favor, selecciona una opción de capacidad del menú anterior.']);
          }
        }
        return;
      }
      
      // === STEP 6: Handle Capacity Selection ===
      const detectedCap = IntentDetector.extractCapacitySelection(userInput);
      if (detectedCap || analysis.entities.capacity) {
        const capacity = detectedCap || analysis.entities.capacity;
        
        if (checkRateLimit()) {
          await randomDelay();
          await waitForFollowUpDelay();
          await flowDynamic([`✅ Perfecto, ${capacity}. Confirmemos tu elección:`]);
          await MusicUtils.delay(250);
          await sendPricingTable(flowDynamic);
        }
        
        await flowGuard.setUserStage(phoneNumber, 'musicUsb', 'capacity_selected');
        await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
        
        // === VALIDATED TRANSITION TO CAPACITY ===
        const transitionValid = await flowHelper.validateFlowTransition(session, 'musicUsb', 'capacityMusic');
        if (transitionValid) {
          return gotoFlow(capacityMusicFlow);
        }
        return;
      }
      
      // === STEP 7: Handle OK/Continue ===
      if (userInput.toLowerCase() === 'ok' || analysis.primaryIntent.type === 'confirmation') {
        session.currentFlow = 'recommendedPlaylist';
        
        if (checkRateLimit()) {
          await randomDelay();
          await sendPricingTable(flowDynamic);
        }
        
        await flowGuard.setUserStage(phoneNumber, 'musicUsb', 'ready_for_capacity');
        await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
        
        // === VALIDATED TRANSITION TO CAPACITY ===
        const transitionValid = await flowHelper.validateFlowTransition(session, 'musicUsb', 'capacityMusic');
        if (transitionValid) {
          return gotoFlow(capacityMusicFlow);
        }
        return;
      }
      
      // === STEP 8: Extract Preferences ===
      const userGenres = IntentDetector.extractGenres(userInput);
      const userArtists = IntentDetector.extractArtists(userInput, userGenres);
      const moodKeywords = IntentDetector.extractMoodKeywords(userInput);
      
      // Also use ContextAnalyzer extraction
      const preferences = await contextAnalyzer.extractPreferences(userInput, session);
      
      if (userGenres.length > 0 || userArtists.length > 0 || moodKeywords.length > 0 || preferences.musicGenres.length > 0) {
        const userState = await UserStateManager.getOrCreate(phoneNumber);
        
        // Merge preferences from both detectors
        const allGenres = MusicUtils.dedupeArray([
          ...(userState.selectedGenres || []), 
          ...userGenres,
          ...preferences.musicGenres
        ]);
        const allArtists = MusicUtils.dedupeArray([
          ...(userState.mentionedArtists || []), 
          ...userArtists,
          ...preferences.artists
        ]);
        const allMoods = MusicUtils.dedupeArray([
          ...(userState.moodPreferences || []), 
          ...moodKeywords
        ]);
        
        userState.selectedGenres = allGenres;
        userState.mentionedArtists = allArtists;
        userState.moodPreferences = allMoods;
        userState.customizationStage = 'advanced_personalizing';
        userState.conversionStage = 'personalization';
        userState.personalizationCount = (userState.personalizationCount || 0) + 1;
        userState.touchpoints = [...(userState.touchpoints || []), 'advanced_personalization'];
        await UserStateManager.save(userState);
        
        // Persist to session
        await persistOrderProgress(phoneNumber, {
          finalizedGenres: allGenres,
          finalizedArtists: allArtists,
          finalizedMoods: allMoods
        });
        
        await updateUserSession(phoneNumber, userInput, 'musicUsb', 'preferences_collected', false, {
          metadata: {
            genres: allGenres,
            artists: allArtists,
            moods: allMoods,
            personalizationComplete: true
          }
        });
        
        // Check collected data to avoid redundancy
        const collectedData = getUserCollectedData(session);
        console.log(`📊 Music flow - Data collected: ${collectedData.completionPercentage}% complete`);
        
        // Build confirmation
        const confirmationParts = [
          '🎵 Listo! Armamos tu USB con esa música que te gusta:',
          `✅ Géneros: ${allGenres.join(', ') || 'Variados'}`,
          `✅ Artistas: ${allArtists.join(', ') || 'Los mejores'}`,
        ];
        
        if (collectedData.hasCapacity && collectedData.capacity) {
          confirmationParts.push(`💾 Capacidad: ${collectedData.capacity}`);
        }
        
        confirmationParts.push(
          '',
          '💡 Todo organizado en carpetas por género y artista para fácil navegación.',
          ''
        );
        
        if (!collectedData.hasCapacity) {
          confirmationParts.push('Escribe "OK" para ver las opciones de capacidad y elegir la tuya.');
        } else {
          confirmationParts.push('¿Listo para confirmar tu pedido? Escribe "OK"');
        }
        
        if (checkRateLimit()) {
          await randomDelay();
          await waitForFollowUpDelay();
          await flowDynamic([confirmationParts.join('\n')]);
          await MusicUtils.delay(250);
          await suggestUpsell(phoneNumber, flowDynamic, userState);
        }
        
        await flowGuard.setUserStage(phoneNumber, 'musicUsb', 'awaiting_capacity_confirmation');
        await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
        return;
      }
      
      // === STEP 9: Handle Buying Intent ===
      const buyingIntent = IntentDetector.detectBuyingIntent(userInput);
      if (buyingIntent.intent === 'high' || buyingIntent.intent === 'medium') {
        if (checkRateLimit()) {
          await randomDelay();
          await waitForFollowUpDelay();
          await flowDynamic([
            buyingIntent.intent === 'high' 
              ? '🚀 ¡Me encanta tu energía! Veamos las opciones para que elijas tu USB:'
              : '🛒 Perfecto! Te muestro las capacidades disponibles para que elijas la ideal:'
          ]);
          
          await MusicUtils.delay(buyingIntent.intent === 'high' ? 300 : 800);
          await sendPricingTable(flowDynamic);
        }
        
        await flowGuard.setUserStage(phoneNumber, 'musicUsb', 'ready_to_purchase');
        await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
        
        // === VALIDATED TRANSITION TO CAPACITY ===
        const transitionValid = await flowHelper.validateFlowTransition(session, 'musicUsb', 'capacityMusic');
        if (transitionValid) {
          return gotoFlow(capacityMusicFlow);
        }
        return;
      }
      
      // === STEP 10: Fallback ===
      const userState = await UserStateManager.getOrCreate(phoneNumber);
      userState.unrecognizedResponses = (userState.unrecognizedResponses || 0) + 1;
      userState.touchpoints = [...(userState.touchpoints || []), 'unrecognized_response'];
      await UserStateManager.save(userState);
      
      if (checkRateLimit()) {
        await randomDelay();
        await waitForFollowUpDelay();
        await flowDynamic([
          '🙋 Para seguir: escribe 1 género o artista (ej: "salsa", "Bad Bunny") o responde "OK" para ver capacidades y precios.'
        ]);
      }
      
      await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
      
    } catch (error) {
      console.error(`❌ Error processing response in musicUsb for ${phoneNumber}:`, error);
      await flowGuard.releaseLock(phoneNumber, 'musicUsb', lockId);
    }
  });

export default musicUsb;

// ========== ADD SHIPPING HANDOFF IN CAPACITYMUSIC.TS ==========
// After user selects capacity, add this before order finalization:

/*
// In capacityMusic.ts after capacity is selected:

// === ENSURE SHIPPING DATA COLLECTION ===
const collectedData = getUserCollectedData(session);
if (!collectedData.hasShippingInfo) {
  // Validate transition to shipping flow
  const transitionValid = await flowHelper.validateFlowTransition(session, 'capacityMusic', 'datosCliente');
  if (transitionValid) {
    console.log(`✅ Transitioning ${phoneNumber} to shipping data collection`);
    return gotoFlow(datosClienteFlow);
  } else {
    console.warn(`⚠️ Invalid transition to datosCliente for ${phoneNumber}`);
    if (checkRateLimit()) {
      await randomDelay();
      await flowDynamic(['Para completar tu pedido, necesito tus datos de envío. Por favor, proporciónalos.']);
    }
    return;
  }
}
*/

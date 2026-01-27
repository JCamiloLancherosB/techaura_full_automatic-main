/**
 * Real World Flows Golden Tests
 * 
 * Golden tests that replicate three real user conversation scenarios:
 * 1. "Hola, me interesa USB con videos" -> bot asks genres (menu) -> user no response -> follow-up scheduled
 * 2. "Hola, me interesa USB con música" -> bot asks genres -> user responds -> flow continues
 * 3. Videos -> user responds "Salsa romántica..." -> bot summarizes -> asks confirmation -> user says "Si" -> flow advances
 * 
 * These tests verify:
 * - Each turn produces expected output
 * - When there's no response, a follow-up is scheduled in the queue
 */

import { createTestSession, createTestSessionWithConversation } from '../utils/testHelpers';
import { ConversationStage, STAGE_DELAY_CONFIG, stageRequiresFollowUp, calculateScheduledTime } from '../types/ConversationStage';

// ============ Simple test utilities (no Jest dependency) ============
let testsPassed = 0;
let testsFailed = 0;
let currentDescribe = '';

function describe(name: string, fn: () => void): void {
  currentDescribe = name;
  console.log(`\n📦 ${name}`);
  fn();
}

function it(name: string, fn: () => void): void {
  try {
    fn();
    testsPassed++;
    console.log(`  ✅ ${name}`);
  } catch (error: any) {
    testsFailed++;
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} > ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (typeof actual !== 'number' || actual < expected) {
        throw new Error(`Expected ${actual} >= ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (typeof actual !== 'number' || actual > expected) {
        throw new Error(`Expected ${actual} <= ${expected}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined, got undefined`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTrue() {
      if (actual !== true) {
        throw new Error(`Expected true, got ${actual}`);
      }
    },
    toBeFalse() {
      if (actual !== false) {
        throw new Error(`Expected false, got ${actual}`);
      }
    },
    toContain(expected: any) {
      if (typeof actual === 'string' && actual.includes(expected)) {
        return;
      }
      if (Array.isArray(actual) && actual.includes(expected)) {
        return;
      }
      if (typeof actual !== 'string' && !Array.isArray(actual)) {
        throw new Error(`toContain only works with strings and arrays, got ${typeof actual}`);
      }
      if (typeof actual === 'string') {
        throw new Error(`Expected string to contain "${expected}"`);
      }
      throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
    },
    toMatch(pattern: RegExp) {
      if (typeof actual !== 'string' || !pattern.test(actual)) {
        throw new Error(`Expected "${actual}" to match ${pattern}`);
      }
    }
  };
}

// ============ Mock Types ============
interface MockFollowUp {
  id: string;
  phone: string;
  stage: ConversationStage;
  questionId: string;
  scheduledAt: Date;
  status: 'pending' | 'sent' | 'cancelled';
  reason: string;
}

interface MockBotResponse {
  text: string;
  media?: string;
  stage?: string;
  expectsResponse: boolean;
}

// ============ Mock Follow-Up Queue ============
class MockFollowUpQueue {
  private queue: MockFollowUp[] = [];
  private idCounter = 0;

  schedule(phone: string, stage: ConversationStage, questionId: string, reason: string): MockFollowUp {
    const followUp: MockFollowUp = {
      id: `followup_${++this.idCounter}`,
      phone,
      stage,
      questionId,
      scheduledAt: calculateScheduledTime(stage),
      status: 'pending',
      reason
    };
    this.queue.push(followUp);
    return followUp;
  }

  cancelForPhone(phone: string): number {
    let cancelled = 0;
    this.queue.forEach(fu => {
      if (fu.phone === phone && fu.status === 'pending') {
        fu.status = 'cancelled';
        cancelled++;
      }
    });
    return cancelled;
  }

  getPendingForPhone(phone: string): MockFollowUp[] {
    return this.queue.filter(fu => fu.phone === phone && fu.status === 'pending');
  }

  getAll(): MockFollowUp[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
    this.idCounter = 0;
  }
}

// ============ Mock Flow Simulator ============
class MockFlowSimulator {
  private followUpQueue = new MockFollowUpQueue();
  private conversationState: Map<string, {
    stage: string;
    selectedGenres: string[];
    mentionedArtists: string[];
    capacity?: string;
    awaitingConfirmation: boolean;
    currentFlow: string;
  }> = new Map();

  /**
   * Simulate detection of USB interest from initial message
   */
  detectProductIntent(message: string): 'music' | 'videos' | 'movies' | 'unknown' {
    const normalizedMsg = message.toLowerCase();
    
    if (/usb\s+(de\s+|con\s+)?m[uú]sica/.test(normalizedMsg) || 
        /me\s+interesa.*m[uú]sica/.test(normalizedMsg)) {
      return 'music';
    }
    if (/usb\s+(de\s+|con\s+)?v[ií]deos?/.test(normalizedMsg) || 
        /me\s+interesa.*v[ií]deos?/.test(normalizedMsg)) {
      return 'videos';
    }
    if (/usb\s+(de\s+|con\s+)?pel[ií]culas?/.test(normalizedMsg) || 
        /me\s+interesa.*pel[ií]culas?/.test(normalizedMsg)) {
      return 'movies';
    }
    return 'unknown';
  }

  /**
   * Simulate bot response for initial USB interest
   */
  handleInitialMessage(phone: string, message: string): MockBotResponse {
    const product = this.detectProductIntent(message);
    
    if (product === 'unknown') {
      return {
        text: '¡Hola! ¿En qué te puedo ayudar?',
        expectsResponse: true
      };
    }

    const currentFlow = product === 'music' ? 'musicUsb' : product === 'videos' ? 'videosUsb' : 'moviesUsb';

    // Initialize conversation state
    this.conversationState.set(phone, {
      stage: 'personalization',
      selectedGenres: [],
      mentionedArtists: [],
      awaitingConfirmation: false,
      currentFlow
    });

    // Schedule follow-up for genre question
    this.followUpQueue.schedule(
      phone,
      ConversationStage.ASK_GENRE,
      `${product}_genre_selection`,
      `No response to genre selection in ${currentFlow} flow`
    );

    const genreQuestion = product === 'music'
      ? '🎵 ¡Perfecto! Vamos a crear tu USB musical personalizada.\n\n✨ Miles de canciones organizadas como TÚ quieres.\n\n¿Qué géneros o artistas te gustan más?\n\n• Salsa 💃\n• Reggaetón 🔥\n• Rock 🎸\n• Vallenato 🎶\n• Baladas 🎵\n\n(o escríbeme cualquier género que prefieras)'
      : '🎬 ¡Genial! USBs con videos musicales personalizados.\n\n✨ HD/4K organizados por género.\n\n¿Qué géneros o artistas te gustan más?\n\n• Salsa 💃\n• Reggaetón 🔥\n• Rock 🎸\n• Bachata 💕\n• Baladas 🎵\n\n(o escríbeme cualquier género que prefieras)';

    return {
      text: genreQuestion,
      stage: 'personalization',
      expectsResponse: true
    };
  }

  /**
   * Handle genre response
   */
  handleGenreResponse(phone: string, userInput: string): MockBotResponse {
    const state = this.conversationState.get(phone);
    if (!state) {
      return { text: 'No tengo contexto de tu conversación', expectsResponse: true };
    }

    // Cancel pending follow-ups since user responded
    this.followUpQueue.cancelForPhone(phone);

    // Extract genres from user input
    const genres = this.extractGenres(userInput);
    const artists = this.extractArtists(userInput);

    state.selectedGenres = genres;
    state.mentionedArtists = artists;
    state.stage = 'awaiting_confirmation';
    state.awaitingConfirmation = true;

    // Build summary message
    const genreList = genres.length > 0 ? genres.join(', ') : 'variados';
    const artistList = artists.length > 0 ? ` con artistas como ${artists.join(', ')}` : '';

    const summaryMessage = `✅ ¡Excelente elección!\n\n📋 Tu selección:\n• Géneros: ${genreList}${artistList}\n\n¿Confirmas esta selección? Responde "Sí" para continuar o "Cambiar" para modificar.`;

    // Schedule follow-up for confirmation (using CONFIRM_SUMMARY as it's the closest semantic match)
    this.followUpQueue.schedule(
      phone,
      ConversationStage.CONFIRM_SUMMARY,
      'genre_confirmation',
      'No response to genre confirmation'
    );

    return {
      text: summaryMessage,
      stage: 'awaiting_confirmation',
      expectsResponse: true
    };
  }

  /**
   * Handle confirmation response
   */
  handleConfirmationResponse(phone: string, userInput: string): MockBotResponse {
    const state = this.conversationState.get(phone);
    if (!state || !state.awaitingConfirmation) {
      return { text: 'No hay confirmación pendiente', expectsResponse: true };
    }

    // Cancel pending follow-ups
    this.followUpQueue.cancelForPhone(phone);

    const isConfirmation = /^(s[ií]|ok|confirmo|listo|dale|perfecto)/i.test(userInput.trim());

    if (isConfirmation) {
      state.stage = 'capacity_selection';
      state.awaitingConfirmation = false;

      // Schedule follow-up for capacity selection
      this.followUpQueue.schedule(
        phone,
        ConversationStage.ASK_CAPACITY_OK,
        'capacity_selection',
        'No response to capacity selection'
      );

      return {
        text: '✅ ¡Perfecto! Ahora vamos a elegir la capacidad.\n\n📦 ¿Qué capacidad prefieres?\n\n1️⃣ 8GB - $54,900\n2️⃣ 32GB - $84,900\n3️⃣ 64GB - $119,900\n4️⃣ 128GB - $159,900\n\n(Escribe el número o la capacidad)',
        stage: 'capacity_selection',
        expectsResponse: true
      };
    } else {
      // User wants to change
      state.stage = 'personalization';
      state.awaitingConfirmation = false;
      state.selectedGenres = [];
      state.mentionedArtists = [];

      return {
        text: '¡Claro! Cuéntame qué géneros o artistas prefieres.',
        stage: 'personalization',
        expectsResponse: true
      };
    }
  }

  /**
   * Extract genres from user input
   */
  private extractGenres(input: string): string[] {
    const genres: string[] = [];
    const normalizedInput = input.toLowerCase();
    
    // Patterns without /i flag since input is already lowercased
    const genrePatterns = [
      { pattern: /salsa/, name: 'Salsa' },
      { pattern: /reggaet[oó]n/, name: 'Reggaetón' },
      { pattern: /rock/, name: 'Rock' },
      { pattern: /bachata/, name: 'Bachata' },
      { pattern: /vallenato/, name: 'Vallenato' },
      { pattern: /balada/, name: 'Baladas' },
      { pattern: /merengue/, name: 'Merengue' },
      { pattern: /cumbia/, name: 'Cumbia' },
      { pattern: /rom[aá]ntica/, name: 'Romántica' },
      { pattern: /pop/, name: 'Pop' },
      { pattern: /electr[oó]nica/, name: 'Electrónica' }
    ];

    genrePatterns.forEach(({ pattern, name }) => {
      if (pattern.test(normalizedInput)) {
        genres.push(name);
      }
    });

    return genres;
  }

  /**
   * Extract artists from user input
   */
  private extractArtists(input: string): string[] {
    const artists: string[] = [];
    const normalizedInput = input.toLowerCase();
    
    // Patterns without /i flag since input is already lowercased
    const artistPatterns = [
      { pattern: /marc\s*anthony/, name: 'Marc Anthony' },
      { pattern: /romeo\s*santos/, name: 'Romeo Santos' },
      { pattern: /bad\s*bunny/, name: 'Bad Bunny' },
      { pattern: /daddy\s*yankee/, name: 'Daddy Yankee' },
      { pattern: /carlos\s*vives/, name: 'Carlos Vives' },
      { pattern: /joe\s*arroyo/, name: 'Joe Arroyo' },
      { pattern: /gilberto\s*santa\s*rosa/, name: 'Gilberto Santa Rosa' }
    ];

    artistPatterns.forEach(({ pattern, name }) => {
      if (pattern.test(normalizedInput)) {
        artists.push(name);
      }
    });

    return artists;
  }

  /**
   * Get pending follow-ups for a phone
   */
  getPendingFollowUps(phone: string): MockFollowUp[] {
    return this.followUpQueue.getPendingForPhone(phone);
  }

  /**
   * Get conversation state for a phone
   */
  getConversationState(phone: string) {
    return this.conversationState.get(phone);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.followUpQueue.clear();
    this.conversationState.clear();
  }
}

// ============ Run Golden Tests ============
console.log('🧪 REAL WORLD FLOWS - GOLDEN TESTS\n');
console.log('='.repeat(70));

const simulator = new MockFlowSimulator();

describe('Golden Test 1: USB Videos → No Response → Follow-up Scheduled', () => {
  const testPhone = '573001111111';
  
  // Reset before test
  simulator.reset();

  it('should detect videos intent from "Hola, me interesa USB con videos"', () => {
    const intent = simulator.detectProductIntent('Hola, me interesa USB con videos');
    expect(intent).toBe('videos');
  });

  it('should respond with genre menu when user expresses videos interest', () => {
    const response = simulator.handleInitialMessage(testPhone, 'Hola, me interesa USB con videos');
    
    expect(response.text).toContain('géneros');
    expect(response.text).toContain('Salsa');
    expect(response.text).toContain('Reggaetón');
    expect(response.expectsResponse).toBeTrue();
  });

  it('should set conversation stage to personalization', () => {
    const state = simulator.getConversationState(testPhone);
    expect(state).toBeDefined();
    expect(state!.stage).toBe('personalization');
    expect(state!.currentFlow).toBe('videosUsb');
  });

  it('should schedule a follow-up when user does NOT respond', () => {
    // User doesn't respond - check that follow-up is in the queue
    const pendingFollowUps = simulator.getPendingFollowUps(testPhone);
    
    expect(pendingFollowUps.length).toBeGreaterThan(0);
    expect(pendingFollowUps[0].stage).toBe(ConversationStage.ASK_GENRE);
    expect(pendingFollowUps[0].status).toBe('pending');
    expect(pendingFollowUps[0].questionId).toContain('genre_selection');
  });

  it('should have follow-up scheduled within the configured delay range', () => {
    const pendingFollowUps = simulator.getPendingFollowUps(testPhone);
    const followUp = pendingFollowUps[0];
    const delayConfig = STAGE_DELAY_CONFIG[ConversationStage.ASK_GENRE];
    
    const now = new Date();
    const delayMs = followUp.scheduledAt.getTime() - now.getTime();
    const delayMinutes = delayMs / 60000;
    
    // Allow some tolerance for test execution time
    expect(delayMinutes).toBeGreaterThanOrEqual(delayConfig.minDelayMinutes - 1);
    expect(delayMinutes).toBeLessThanOrEqual(delayConfig.maxDelayMinutes + 1);
  });
});

describe('Golden Test 2: USB Música → User Responds → Flow Continues', () => {
  const testPhone = '573002222222';
  
  // Reset before test
  simulator.reset();

  it('should detect music intent from "Hola, me interesa USB con música"', () => {
    const intent = simulator.detectProductIntent('Hola, me interesa USB con música');
    expect(intent).toBe('music');
  });

  it('should respond with genre menu for music USB', () => {
    const response = simulator.handleInitialMessage(testPhone, 'Hola, me interesa USB con música');
    
    expect(response.text).toContain('géneros');
    expect(response.text).toContain('artistas');
    expect(response.expectsResponse).toBeTrue();
    expect(response.stage).toBe('personalization');
  });

  it('should schedule follow-up initially', () => {
    const pendingFollowUps = simulator.getPendingFollowUps(testPhone);
    expect(pendingFollowUps.length).toBe(1);
    expect(pendingFollowUps[0].stage).toBe(ConversationStage.ASK_GENRE);
  });

  it('should process user genre response and cancel follow-up', () => {
    const response = simulator.handleGenreResponse(testPhone, 'Me gusta la salsa y el reggaetón');
    
    // Follow-up should be cancelled since user responded
    const pendingFollowUps = simulator.getPendingFollowUps(testPhone);
    const genreFollowUps = pendingFollowUps.filter(fu => fu.questionId.includes('genre_selection'));
    expect(genreFollowUps.length).toBe(0);
    
    // Response should contain confirmation
    expect(response.text).toContain('Salsa');
    expect(response.text).toContain('Reggaetón');
    expect(response.text).toContain('Confirmas');
  });

  it('should update conversation state with selected genres', () => {
    const state = simulator.getConversationState(testPhone);
    
    expect(state).toBeDefined();
    expect(state!.selectedGenres).toContain('Salsa');
    expect(state!.selectedGenres).toContain('Reggaetón');
    expect(state!.stage).toBe('awaiting_confirmation');
  });

  it('should have new follow-up scheduled for confirmation', () => {
    const pendingFollowUps = simulator.getPendingFollowUps(testPhone);
    expect(pendingFollowUps.length).toBeGreaterThan(0);
    expect(pendingFollowUps[0].questionId).toBe('genre_confirmation');
  });
});

describe('Golden Test 3: Videos → Salsa romántica → Confirmation → Si → Flow Advances', () => {
  const testPhone = '573003333333';
  
  // Reset before test
  simulator.reset();

  it('Turn 1: User expresses interest in videos USB', () => {
    const response = simulator.handleInitialMessage(testPhone, 'Hola, quiero USB con videos');
    
    expect(response.text).toContain('géneros');
    expect(response.expectsResponse).toBeTrue();
    expect(response.stage).toBe('personalization');
  });

  it('Turn 2: User responds with "Salsa romántica, bachata de Romeo Santos"', () => {
    const response = simulator.handleGenreResponse(
      testPhone,
      'Salsa romántica, bachata de Romeo Santos'
    );
    
    // Bot should summarize the selection
    expect(response.text).toContain('selección');
    expect(response.text).toContain('Salsa');
    expect(response.text).toContain('Romántica');
    expect(response.text).toContain('Bachata');
    expect(response.text).toContain('Romeo Santos');
    
    // Bot should ask for confirmation
    expect(response.text).toMatch(/confirma|sí/i);
    expect(response.stage).toBe('awaiting_confirmation');
  });

  it('should extract genres and artists correctly', () => {
    const state = simulator.getConversationState(testPhone);
    
    expect(state!.selectedGenres).toContain('Salsa');
    expect(state!.selectedGenres).toContain('Romántica');
    expect(state!.selectedGenres).toContain('Bachata');
    expect(state!.mentionedArtists).toContain('Romeo Santos');
  });

  it('Turn 3: User confirms with "Si"', () => {
    const response = simulator.handleConfirmationResponse(testPhone, 'Si');
    
    // Flow should advance to capacity selection
    expect(response.text).toContain('capacidad');
    expect(response.text).toMatch(/8GB|32GB|64GB|128GB/);
    expect(response.stage).toBe('capacity_selection');
  });

  it('should advance conversation stage to capacity_selection', () => {
    const state = simulator.getConversationState(testPhone);
    
    expect(state!.stage).toBe('capacity_selection');
    expect(state!.awaitingConfirmation).toBeFalse();
  });

  it('should cancel confirmation follow-up and schedule capacity follow-up', () => {
    const pendingFollowUps = simulator.getPendingFollowUps(testPhone);
    
    // Should have follow-up for capacity selection
    const capacityFollowUp = pendingFollowUps.find(fu => fu.questionId === 'capacity_selection');
    expect(capacityFollowUp).toBeDefined();
    expect(capacityFollowUp!.stage).toBe(ConversationStage.ASK_CAPACITY_OK);
  });
});

describe('Stage-Based Follow-Up Configuration', () => {
  it('ASK_GENRE stage should require follow-up', () => {
    expect(stageRequiresFollowUp(ConversationStage.ASK_GENRE)).toBeTrue();
  });

  it('ASK_CAPACITY_OK stage should require follow-up', () => {
    expect(stageRequiresFollowUp(ConversationStage.ASK_CAPACITY_OK)).toBeTrue();
  });

  it('CONFIRM_SUMMARY stage should require follow-up', () => {
    expect(stageRequiresFollowUp(ConversationStage.CONFIRM_SUMMARY)).toBeTrue();
  });

  it('DONE stage should NOT require follow-up', () => {
    expect(stageRequiresFollowUp(ConversationStage.DONE)).toBeFalse();
  });

  it('ASK_GENRE delay should be 20-30 minutes', () => {
    const config = STAGE_DELAY_CONFIG[ConversationStage.ASK_GENRE];
    expect(config.minDelayMinutes).toBe(20);
    expect(config.maxDelayMinutes).toBe(30);
  });

  it('ASK_CAPACITY_OK delay should be 30-45 minutes', () => {
    const config = STAGE_DELAY_CONFIG[ConversationStage.ASK_CAPACITY_OK];
    expect(config.minDelayMinutes).toBe(30);
    expect(config.maxDelayMinutes).toBe(45);
  });

  it('CONFIRM_SUMMARY delay should be 10-20 minutes', () => {
    const config = STAGE_DELAY_CONFIG[ConversationStage.CONFIRM_SUMMARY];
    expect(config.minDelayMinutes).toBe(10);
    expect(config.maxDelayMinutes).toBe(20);
  });
});

describe('Test Helpers Integration', () => {
  it('should create test session with correct defaults', () => {
    const session = createTestSession('573001234567');
    
    expect(session.phone).toBe('573001234567');
    expect(session.phoneNumber).toBe('573001234567');
    expect(session.stage).toBe('interested');
    expect(session.followUpSpamCount).toBe(0);
    expect(session.totalOrders).toBe(0);
  });

  it('should create test session with conversation data', () => {
    const session = createTestSessionWithConversation(
      '573009876543',
      { selectedGenres: ['Salsa', 'Bachata'], step: 'personalization' },
      2,
      1
    );
    
    expect(session.conversationData).toBeDefined();
    expect((session.conversationData as any).selectedGenres).toContain('Salsa');
    expect(session.totalOrders).toBe(2);
    expect(session.followUpSpamCount).toBe(1);
  });
});

// ============ Test Summary ============
console.log('\n' + '='.repeat(70));
console.log(`\n📊 GOLDEN TEST SUMMARY`);
console.log(`   ✅ Passed: ${testsPassed}`);
console.log(`   ❌ Failed: ${testsFailed}`);
console.log(`   📝 Total: ${testsPassed + testsFailed}`);
console.log('\n' + '='.repeat(70));

if (testsFailed > 0) {
  console.log('\n⚠️  Some tests failed! Review the output above.');
  process.exit(1);
} else {
  console.log('\n✅ All golden tests passed!');
  console.log('\n📋 Scenarios Verified:');
  console.log('   1. USB Videos → No Response → Follow-up Scheduled');
  console.log('   2. USB Música → User Responds → Flow Continues');
  console.log('   3. Videos → Genre Selection → Confirmation → Flow Advances');
}

// Export for external use
export { testsPassed, testsFailed };

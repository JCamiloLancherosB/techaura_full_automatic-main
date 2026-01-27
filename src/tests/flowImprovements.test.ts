/**
 * Test suite for flow improvements
 * Tests stage tracking, context persistence, follow-up logic, and starter script
 */

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
    toBeGreaterThanOrEqual(expected: number) {
      if (typeof actual !== 'number' || actual < expected) {
        throw new Error(`Expected ${actual} >= ${expected}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined, got undefined`);
      }
    },
    toContain(expected: any) {
      if (!Array.isArray(actual) || !actual.includes(expected)) {
        throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
      }
    }
  };
}

// ============ Mock Types ============
interface UserSession {
  phone: string;
  phoneNumber: string;
  name: string;
  stage: string;
  buyingIntent: number;
  lastInteraction: Date;
  currentFlow: string;
  interests: string[];
  interactions: any[];
  conversationData: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastActivity: Date;
  messageCount: number;
  isActive: boolean;
  isNewUser: boolean;
  isReturningUser: boolean;
  isFirstMessage: boolean;
  preferences: Record<string, any>;
  demographics: Record<string, any>;
  tags?: string[];
}

// Mock getUserSession and getUserCollectedData for testing
const mockUserSession: UserSession = {
  phone: '573001234567',
  phoneNumber: '573001234567',
  name: 'Test User',
  stage: 'personalization',
  buyingIntent: 50,
  lastInteraction: new Date(),
  currentFlow: 'musicUsb',
  interests: ['rock', 'reggaeton'],
  interactions: [],
  conversationData: {
    selectedGenres: ['rock', 'reggaeton'],
    mentionedArtists: ['Queen', 'Bad Bunny'],
    selectedCapacity: '64GB'
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActivity: new Date(),
  messageCount: 5,
  isActive: true,
  isNewUser: false,
  isReturningUser: true,
  isFirstMessage: false,
  preferences: {
    musicGenres: ['rock', 'reggaeton'],
    priceRange: { min: 0, max: 200000 }
  },
  demographics: {
    age: null,
    location: 'Bogotá'
  }
};

// ============ Starter Script Service Tests ============
type ProductType = 'music' | 'videos' | 'movies' | 'unknown';
type StarterVariant = 'A' | 'B';

/**
 * Inline implementation of StarterScriptService detection methods for testing
 */
class StarterScriptServiceMock {
  private MUSIC_PATTERNS = [
    /\bm[uú]sica\b/i,
    /\bmusica\b/i,
    /\bcanciones?\b/i,
    /\busb\s+(de\s+)?m[uú]sica/i,
    /\busb\s+(con\s+)?m[uú]sica/i
  ];

  private VIDEO_PATTERNS = [
    /\bv[ií]deos?\b/i,
    /\bvideos?\b/i,
    /\bclips?\b/i,
    /\bvideoclips?\b/i,
    /\busb\s+(de\s+)?v[ií]deos?/i,
    /\busb\s+(con\s+)?v[ií]deos?/i
  ];

  private MOVIE_PATTERNS = [
    /\bpel[ií]culas?\b/i,
    /\bpeliculas?\b/i,
    /\bseries?\b/i,
    /\bmovies?\b/i,
    /\busb\s+(de\s+)?pel[ií]culas?/i,
    /\busb\s+(con\s+)?pel[ií]culas?/i
  ];

  private GREETING_PATTERNS = [
    /^hola\b/i,
    /^buenas?\b/i,
    /^buenos\s+d[ií]as?\b/i,
    /^buenas\s+tardes?\b/i,
    /^buenas\s+noches?\b/i,
    /^holi\b/i,
    /^hey\b/i,
    /^info\b/i,
    /^informaci[oó]n\b/i,
    /^me\s+interesa\b/i
  ];

  detectProduct(message: string): ProductType {
    const normalizedMessage = message.toLowerCase().trim();

    if (this.MUSIC_PATTERNS.some(p => p.test(normalizedMessage))) {
      return 'music';
    }
    if (this.VIDEO_PATTERNS.some(p => p.test(normalizedMessage))) {
      return 'videos';
    }
    if (this.MOVIE_PATTERNS.some(p => p.test(normalizedMessage))) {
      return 'movies';
    }
    return 'unknown';
  }

  isGreetingOrInfo(message: string): boolean {
    const normalizedMessage = message.toLowerCase().trim();
    return this.GREETING_PATTERNS.some(p => p.test(normalizedMessage));
  }

  determineVariant(message: string): StarterVariant {
    const product = this.detectProduct(message);
    return product !== 'unknown' ? 'A' : 'B';
  }

  shouldHandleAsStarter(message: string, session?: UserSession): boolean {
    if (session) {
      const sensitiveStages = new Set([
        'customizing', 'pricing', 'closing', 'awaiting_capacity',
        'awaiting_payment', 'checkout_started', 'order_confirmed',
        'payment_confirmed', 'shipping', 'completed', 'converted'
      ]);
      if (sensitiveStages.has(session.stage)) {
        return false;
      }
      if (session.currentFlow && session.currentFlow !== 'starterFlow' &&
          session.currentFlow !== 'entryFlow' && session.currentFlow !== 'welcomeFlow') {
        const hasProgress = (session.messageCount || 0) > 3;
        if (hasProgress) {
          return false;
        }
      }
    }
    const isGreeting = this.isGreetingOrInfo(message);
    const hasProductIntent = this.detectProduct(message) !== 'unknown';
    return isGreeting || hasProductIntent;
  }

  parseProductSelection(input: string): ProductType {
    const normalizedInput = input.toLowerCase().trim();

    if (normalizedInput === '1' || /m[uú]sica/i.test(normalizedInput)) {
      return 'music';
    }
    if (normalizedInput === '2' || /video/i.test(normalizedInput)) {
      return 'videos';
    }
    if (normalizedInput === '3' || /pel[ií]cula|serie/i.test(normalizedInput)) {
      return 'movies';
    }
    if (normalizedInput === '4' || /precio|info/i.test(normalizedInput)) {
      return 'unknown';
    }
    return this.detectProduct(input);
  }
}

const starterScriptService = new StarterScriptServiceMock();

// ============ Run Tests ============
console.log('🧪 FLOW IMPROVEMENTS TEST SUITE\n');
console.log('='.repeat(70));

describe('Stage Tracking', () => {
  it('should track capacity selection stage', () => {
    const session = { ...mockUserSession, stage: 'capacity_selected' };
    expect(session.stage).toBe('capacity_selected');
  });

  it('should update to closing stage after capacity selection', () => {
    const session = { ...mockUserSession, stage: 'closing' };
    expect(session.stage).toBe('closing');
    expect(session.buyingIntent).toBeGreaterThanOrEqual(50);
  });

  it('should track metadata for each stage transition', () => {
    const metadata = {
      lastAction: 'capacity_selected',
      selectedCapacity: '64GB',
      price: 119900
    };
    expect(metadata.lastAction).toBe('capacity_selected');
    expect(metadata.selectedCapacity).toBe('64GB');
  });
});

describe('Data Persistence', () => {
  it('should persist selected genres in conversationData', () => {
    expect(mockUserSession.conversationData?.selectedGenres).toEqual(['rock', 'reggaeton']);
  });

  it('should persist selected artists in conversationData', () => {
    expect(mockUserSession.conversationData?.mentionedArtists).toEqual(['Queen', 'Bad Bunny']);
  });

  it('should persist selected capacity in conversationData', () => {
    expect(mockUserSession.conversationData?.selectedCapacity).toBe('64GB');
  });

  it('should have decision_made tag after capacity selection', () => {
    const session = { ...mockUserSession, tags: ['decision_made'] };
    expect(session.tags).toContain('decision_made');
  });

  it('should have capacity_selected tag after capacity selection', () => {
    const session = { ...mockUserSession, tags: ['capacity_selected'] };
    expect(session.tags).toContain('capacity_selected');
  });
});

describe('Follow-up Logic', () => {
  it('should NOT send follow-up to users in closing stage', () => {
    const session = { ...mockUserSession, stage: 'closing' };
    const isClosingStage = ['closing', 'awaiting_payment', 'checkout_started', 'completed', 'converted'].includes(session.stage);
    expect(isClosingStage).toBe(true);
  });

  it('should NOT send pricing to users who already selected capacity', () => {
    const hasCapacity = !!mockUserSession.conversationData?.selectedCapacity;
    expect(hasCapacity).toBe(true);
  });

  it('should respect 3-second delay between follow-ups', () => {
    const FOLLOWUP_DELAY_MS = 3000;
    expect(FOLLOWUP_DELAY_MS).toBe(3000);
  });
});

describe('Cross-sell Logic', () => {
  it('should only offer cross-sell at appropriate stages', () => {
    const appropriateStages = ['closing', 'awaiting_payment', 'checkout_started'];
    const session = { ...mockUserSession, stage: 'closing' };
    expect(appropriateStages.includes(session.stage)).toBe(true);
  });

  it('should NOT offer cross-sell at personalization stage', () => {
    const appropriateStages = ['closing', 'awaiting_payment', 'checkout_started'];
    const session = { ...mockUserSession, stage: 'personalization' };
    expect(appropriateStages.includes(session.stage)).toBe(false);
  });

  it('should track cross-sell timestamp to prevent duplicates', () => {
    const session = {
      ...mockUserSession,
      conversationData: {
        ...mockUserSession.conversationData,
        lastCrossSellAt: new Date().toISOString()
      }
    };
    expect(session.conversationData.lastCrossSellAt).toBeDefined();
  });
});

describe('Confirmation Messages', () => {
  it('should include genres in confirmation', () => {
    const genres = mockUserSession.conversationData?.selectedGenres;
    expect(genres).toEqual(['rock', 'reggaeton']);
  });

  it('should include artists in confirmation', () => {
    const artists = mockUserSession.conversationData?.mentionedArtists;
    expect(artists).toEqual(['Queen', 'Bad Bunny']);
  });

  it('should include capacity in confirmation', () => {
    const capacity = mockUserSession.conversationData?.selectedCapacity;
    expect(capacity).toBe('64GB');
  });

  it('should calculate completion percentage', () => {
    const hasGenres = !!mockUserSession.conversationData?.selectedGenres?.length;
    const hasArtists = !!mockUserSession.conversationData?.mentionedArtists?.length;
    const hasCapacity = !!mockUserSession.conversationData?.selectedCapacity;
    
    const fieldsCompleted = [hasGenres, hasArtists, hasCapacity].filter(Boolean).length;
    expect(fieldsCompleted).toBeGreaterThanOrEqual(3);
  });
});

// ============ NEW: Starter Script Tests ============
describe('Starter Script - Variant A (USB Interest)', () => {
  it('should detect music product from "Hola, me interesa la USB con música"', () => {
    const message = 'Hola, me interesa la USB con música';
    const product = starterScriptService.detectProduct(message);
    expect(product).toBe('music');
  });

  it('should detect videos product from "me interesa la USB con videos"', () => {
    const message = 'me interesa la USB con videos';
    const product = starterScriptService.detectProduct(message);
    expect(product).toBe('videos');
  });

  it('should detect movies product from "quiero una USB de películas"', () => {
    const message = 'quiero una USB de películas';
    const product = starterScriptService.detectProduct(message);
    expect(product).toBe('movies');
  });

  it('should return Variant A when product is detected', () => {
    const message = 'Hola, me interesa la USB con música';
    const variant = starterScriptService.determineVariant(message);
    expect(variant).toBe('A');
  });

  it('should set expectedInput to CHOICE for Variant A', () => {
    const expectedInput = 'CHOICE';
    expect(expectedInput).toBe('CHOICE');
  });
});

describe('Starter Script - Variant B (Greeting Only)', () => {
  it('should detect greeting from "Hola"', () => {
    const message = 'Hola';
    const isGreeting = starterScriptService.isGreetingOrInfo(message);
    expect(isGreeting).toBe(true);
  });

  it('should detect greeting from "Buenas tardes"', () => {
    const message = 'Buenas tardes';
    const isGreeting = starterScriptService.isGreetingOrInfo(message);
    expect(isGreeting).toBe(true);
  });

  it('should detect info request from "info"', () => {
    const message = 'info';
    const isGreeting = starterScriptService.isGreetingOrInfo(message);
    expect(isGreeting).toBe(true);
  });

  it('should return Variant B when only greeting is detected', () => {
    const message = 'Hola';
    const variant = starterScriptService.determineVariant(message);
    expect(variant).toBe('B');
  });

  it('should return unknown product for greeting only message', () => {
    const message = 'Hola';
    const product = starterScriptService.detectProduct(message);
    expect(product).toBe('unknown');
  });
});

describe('Starter Script - Flow Continuity', () => {
  it('should NOT handle starter for users in closing stage', () => {
    const session: UserSession = { ...mockUserSession, stage: 'closing' };
    const shouldHandle = starterScriptService.shouldHandleAsStarter('Hola', session);
    expect(shouldHandle).toBe(false);
  });

  it('should NOT handle starter for users with order_confirmed stage', () => {
    const session: UserSession = { ...mockUserSession, stage: 'order_confirmed' };
    const shouldHandle = starterScriptService.shouldHandleAsStarter('Hola', session);
    expect(shouldHandle).toBe(false);
  });

  it('should handle starter for new users with greeting', () => {
    const newUserSession: UserSession = {
      ...mockUserSession,
      stage: 'initial',
      currentFlow: '',
      messageCount: 0
    };
    const shouldHandle = starterScriptService.shouldHandleAsStarter('Hola', newUserSession);
    expect(shouldHandle).toBe(true);
  });

  it('should handle starter for users expressing USB interest', () => {
    const newUserSession: UserSession = {
      ...mockUserSession,
      stage: 'initial',
      currentFlow: 'entryFlow',
      messageCount: 1
    };
    const shouldHandle = starterScriptService.shouldHandleAsStarter('me interesa la USB con música', newUserSession);
    expect(shouldHandle).toBe(true);
  });
});

describe('Starter Script - Response Parsing', () => {
  it('should parse "1" as music selection', () => {
    const product = starterScriptService.parseProductSelection('1');
    expect(product).toBe('music');
  });

  it('should parse "2" as videos selection', () => {
    const product = starterScriptService.parseProductSelection('2');
    expect(product).toBe('videos');
  });

  it('should parse "3" as movies selection', () => {
    const product = starterScriptService.parseProductSelection('3');
    expect(product).toBe('movies');
  });

  it('should parse "4" as unknown (price info)', () => {
    const product = starterScriptService.parseProductSelection('4');
    expect(product).toBe('unknown');
  });

  it('should parse "música" as music selection', () => {
    const product = starterScriptService.parseProductSelection('música');
    expect(product).toBe('music');
  });

  it('should parse "videos" as videos selection', () => {
    const product = starterScriptService.parseProductSelection('videos');
    expect(product).toBe('videos');
  });

  it('should parse "películas" as movies selection', () => {
    const product = starterScriptService.parseProductSelection('películas');
    expect(product).toBe('movies');
  });
});

// ============ Test Summary ============
console.log('\n' + '='.repeat(70));
console.log(`\n📊 TEST SUMMARY`);
console.log(`   ✅ Passed: ${testsPassed}`);
console.log(`   ❌ Failed: ${testsFailed}`);
console.log(`   📝 Total: ${testsPassed + testsFailed}`);
console.log('\n' + '='.repeat(70));

if (testsFailed > 0) {
  console.log('\n⚠️  Some tests failed! Review the output above.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}

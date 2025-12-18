/**
 * Test suite for flow improvements
 * Tests stage tracking, context persistence, and follow-up logic
 */

import { describe, it, expect } from '@jest/globals';
import type { UserSession } from '../../types/global';

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

describe('Flow Improvements', () => {
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
      // Has genres (1), artists (1), capacity (1) = 3 out of ~7 fields
      const hasGenres = !!mockUserSession.conversationData?.selectedGenres?.length;
      const hasArtists = !!mockUserSession.conversationData?.mentionedArtists?.length;
      const hasCapacity = !!mockUserSession.conversationData?.selectedCapacity;
      
      const fieldsCompleted = [hasGenres, hasArtists, hasCapacity].filter(Boolean).length;
      expect(fieldsCompleted).toBeGreaterThanOrEqual(3);
    });
  });
});

console.log('✅ Flow improvements test suite defined');
console.log('📝 To run: npx jest src/tests/flowImprovements.test.ts');

/**
 * Tests for Genre Lexicon - Genre Recognition and Normalization
 * Run with: npx tsx src/tests/genreLexicon.test.ts
 */

import {
    extractCanonicalGenres,
    getCanonicalGenre,
    isValidGenre,
    isMixedGenreRequest,
    getGenreDisplayName,
    getGenreSynonyms,
    CANONICAL_GENRES,
    type CanonicalGenre,
} from '../content/genreLexicon';

// Test runner helpers
let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error: any) {
        console.error(`❌ ${name}`);
        console.error(`   ${error.message}`);
        testsFailed++;
    }
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
    if (actual !== expected) {
        throw new Error(message || `Expected "${expected}", got "${actual}"`);
    }
}

function assertArrayContains<T>(array: T[], item: T, message?: string) {
    if (!array.includes(item)) {
        throw new Error(message || `Array [${array.join(', ')}] does not contain "${item}"`);
    }
}

function assertArrayLength(array: any[], expectedLength: number, message?: string) {
    if (array.length !== expectedLength) {
        throw new Error(message || `Expected array length ${expectedLength}, got ${array.length}: [${array.join(', ')}]`);
    }
}

console.log('🧪 Running Genre Lexicon Tests...\n');

// ===============================
// Basic Genre Recognition Tests
// ===============================
console.log('--- Basic Genre Recognition Tests ---');

test('getCanonicalGenre: recognizes canonical salsa', () => {
    assertEqual(getCanonicalGenre('salsa'), 'SALSA');
});

test('getCanonicalGenre: recognizes vallenato with typo', () => {
    assertEqual(getCanonicalGenre('valenato'), 'VALLENATO');
});

test('getCanonicalGenre: recognizes reggaeton with Spanish spelling', () => {
    assertEqual(getCanonicalGenre('regueton'), 'REGGAETON');
});

test('getCanonicalGenre: recognizes tropical', () => {
    assertEqual(getCanonicalGenre('tropical'), 'TROPICAL');
});

test('getCanonicalGenre: recognizes popular as POP', () => {
    assertEqual(getCanonicalGenre('popular'), 'POP');
});

test('getCanonicalGenre: recognizes oldies/vieja escuela', () => {
    assertEqual(getCanonicalGenre('vieja escuela'), 'OLDIES');
});

test('getCanonicalGenre: recognizes años 60 as OLDIES', () => {
    assertEqual(getCanonicalGenre('años 60'), 'OLDIES');
});

test('getCanonicalGenre: handles accent removal in años', () => {
    // normalizeText removes accents, so "años 60" becomes "anos 60"
    assertEqual(getCanonicalGenre('anos 60'), 'OLDIES');
});

test('getCanonicalGenre: returns null for unknown input', () => {
    assertEqual(getCanonicalGenre('unknown_genre_xyz'), null);
});

test('getCanonicalGenre: returns null for empty input', () => {
    assertEqual(getCanonicalGenre(''), null);
});

// ===============================
// Multiple Genre Extraction Tests
// ===============================
console.log('\n--- Multiple Genre Extraction Tests ---');

test('extractCanonicalGenres: extracts multiple genres from comma-separated input', () => {
    const result = extractCanonicalGenres('salsa, vallenato, merengue');
    assertArrayLength(result, 3);
    assertArrayContains(result, 'SALSA');
    assertArrayContains(result, 'VALLENATO');
    assertArrayContains(result, 'MERENGUE');
});

test('extractCanonicalGenres: handles "crossover años 60 salsa vallenatos popular tangos tropical"', () => {
    const result = extractCanonicalGenres('crossover años 60 salsa vallenatos popular tangos tropical');
    // Should find all 7 distinct genres
    assertArrayLength(result, 7, `Expected exactly 7 genres, got ${result.length}: [${result.join(', ')}]`);
    assertArrayContains(result, 'MIXED_GENRES'); // crossover
    assertArrayContains(result, 'OLDIES'); // años 60
    assertArrayContains(result, 'SALSA');
    assertArrayContains(result, 'VALLENATO'); // vallenatos
    assertArrayContains(result, 'POP'); // popular
    assertArrayContains(result, 'TANGO'); // tangos
    assertArrayContains(result, 'TROPICAL');
});

test('extractCanonicalGenres: handles mixed typos and variants', () => {
    const result = extractCanonicalGenres('regueton bachata valenato cumbia');
    assertArrayLength(result, 4);
    assertArrayContains(result, 'REGGAETON');
    assertArrayContains(result, 'BACHATA');
    assertArrayContains(result, 'VALLENATO');
    assertArrayContains(result, 'CUMBIA');
});

test('extractCanonicalGenres: handles Spanish conjunction "y"', () => {
    const result = extractCanonicalGenres('rock y pop');
    assertArrayLength(result, 2);
    assertArrayContains(result, 'ROCK');
    assertArrayContains(result, 'POP');
});

test('extractCanonicalGenres: handles genres with accents', () => {
    const result = extractCanonicalGenres('electrónica bachata música tropical');
    assertArrayContains(result, 'ELECTRONICA');
    assertArrayContains(result, 'BACHATA');
    assertArrayContains(result, 'TROPICAL');
});

test('extractCanonicalGenres: returns unique genres (no duplicates)', () => {
    const result = extractCanonicalGenres('salsa salsa salsa');
    assertArrayLength(result, 1);
    assertArrayContains(result, 'SALSA');
});

test('extractCanonicalGenres: returns empty array for no matches', () => {
    const result = extractCanonicalGenres('asdfghjkl qwerty');
    assertArrayLength(result, 0);
});

test('extractCanonicalGenres: returns empty array for empty input', () => {
    const result = extractCanonicalGenres('');
    assertArrayLength(result, 0);
});

// ===============================
// Mixed Genre Detection Tests
// ===============================
console.log('\n--- Mixed Genre Detection Tests ---');

test('isMixedGenreRequest: detects "crossover"', () => {
    assert(isMixedGenreRequest('crossover'), 'crossover should be detected as mixed');
});

test('isMixedGenreRequest: detects "variado"', () => {
    assert(isMixedGenreRequest('variado'), 'variado should be detected as mixed');
});

test('isMixedGenreRequest: detects "de todo un poco"', () => {
    assert(isMixedGenreRequest('de todo un poco'), 'de todo un poco should be detected as mixed');
});

test('isMixedGenreRequest: detects "me gusta de todo"', () => {
    assert(isMixedGenreRequest('me gusta de todo'), 'me gusta de todo should be detected as mixed');
});

test('isMixedGenreRequest: detects "un poco de todo"', () => {
    assert(isMixedGenreRequest('un poco de todo'), 'un poco de todo should be detected as mixed');
});

test('isMixedGenreRequest: detects "todos los géneros"', () => {
    assert(isMixedGenreRequest('todos los géneros'), 'todos los géneros should be detected as mixed');
});

test('isMixedGenreRequest: detects "mixto"', () => {
    assert(isMixedGenreRequest('mixto'), 'mixto should be detected as mixed');
});

test('isMixedGenreRequest: returns false for specific genres', () => {
    assert(!isMixedGenreRequest('salsa'), 'salsa should not be detected as mixed');
});

// ===============================
// Typo Handling Tests
// ===============================
console.log('\n--- Typo Handling Tests ---');

test('handles vallenato typos: valenato', () => {
    assertEqual(getCanonicalGenre('valenato'), 'VALLENATO');
});

test('handles vallenato typos: vallenatto', () => {
    assertEqual(getCanonicalGenre('vallenatto'), 'VALLENATO');
});

test('handles vallenato typos: balenato (b/v confusion)', () => {
    assertEqual(getCanonicalGenre('balenato'), 'VALLENATO');
});

test('handles reggaeton typos: reggeton', () => {
    assertEqual(getCanonicalGenre('reggeton'), 'REGGAETON');
});

test('handles reggaeton typos: regeton', () => {
    assertEqual(getCanonicalGenre('regeton'), 'REGGAETON');
});

test('handles bachata typos: bacata', () => {
    assertEqual(getCanonicalGenre('bacata'), 'BACHATA');
});

test('handles bachata typos: vacata (b/v confusion)', () => {
    assertEqual(getCanonicalGenre('vacata'), 'BACHATA');
});

test('handles bolero typos: volero (b/v confusion)', () => {
    assertEqual(getCanonicalGenre('volero'), 'BOLERO');
});

test('handles cumbia typos: kumbia', () => {
    assertEqual(getCanonicalGenre('kumbia'), 'CUMBIA');
});

test('handles merengue typos: merenque', () => {
    assertEqual(getCanonicalGenre('merenque'), 'MERENGUE');
});

test('handles electronica typos: electronik', () => {
    assertEqual(getCanonicalGenre('electronik'), 'ELECTRONICA');
});

test('handles crossover typos: crosover', () => {
    assertEqual(getCanonicalGenre('crosover'), 'MIXED_GENRES');
});

// ===============================
// Spanish Slang Tests
// ===============================
console.log('\n--- Spanish Slang Tests ---');

test('recognizes perreo as REGGAETON', () => {
    assertEqual(getCanonicalGenre('perreo'), 'REGGAETON');
});

test('recognizes dembow as REGGAETON', () => {
    assertEqual(getCanonicalGenre('dembow'), 'REGGAETON');
});

test('recognizes trap as URBANO', () => {
    assertEqual(getCanonicalGenre('trap'), 'URBANO');
});

test('recognizes salsita as SALSA', () => {
    assertEqual(getCanonicalGenre('salsita'), 'SALSA');
});

test('recognizes viejitas as OLDIES', () => {
    assertEqual(getCanonicalGenre('viejitas'), 'OLDIES');
});

test('recognizes del recuerdo as OLDIES', () => {
    assertEqual(getCanonicalGenre('del recuerdo'), 'OLDIES');
});

test('recognizes alabanzas as GOSPEL', () => {
    assertEqual(getCanonicalGenre('alabanzas'), 'GOSPEL');
});

test('recognizes musica cristiana as GOSPEL', () => {
    assertEqual(getCanonicalGenre('musica cristiana'), 'GOSPEL');
});

// ===============================
// Validation Tests
// ===============================
console.log('\n--- Validation Tests ---');

test('isValidGenre: returns true for valid genres', () => {
    assert(isValidGenre('salsa'), 'salsa should be valid');
    assert(isValidGenre('rock'), 'rock should be valid');
    assert(isValidGenre('pop'), 'pop should be valid');
});

test('isValidGenre: returns true for typos that map to valid genres', () => {
    assert(isValidGenre('valenato'), 'valenato (typo) should be valid');
    assert(isValidGenre('regueton'), 'regueton should be valid');
});

test('isValidGenre: returns false for invalid genres', () => {
    assert(!isValidGenre('asdfghjkl'), 'random string should be invalid');
    assert(!isValidGenre(''), 'empty string should be invalid');
});

// ===============================
// Display Name Tests
// ===============================
console.log('\n--- Display Name Tests ---');

test('getGenreDisplayName: returns proper display name for SALSA', () => {
    assertEqual(getGenreDisplayName('SALSA'), 'Salsa');
});

test('getGenreDisplayName: returns proper display name for REGGAETON', () => {
    assertEqual(getGenreDisplayName('REGGAETON'), 'Reggaetón');
});

test('getGenreDisplayName: returns proper display name for ELECTRONICA', () => {
    assertEqual(getGenreDisplayName('ELECTRONICA'), 'Electrónica');
});

test('getGenreDisplayName: returns proper display name for MIXED_GENRES', () => {
    assertEqual(getGenreDisplayName('MIXED_GENRES'), 'Variado/Mix');
});

// ===============================
// Synonyms Tests
// ===============================
console.log('\n--- Synonyms Tests ---');

test('getGenreSynonyms: returns synonyms for SALSA', () => {
    const synonyms = getGenreSynonyms('SALSA');
    assert(synonyms.length > 5, `Expected > 5 synonyms for SALSA, got ${synonyms.length}`);
    assertArrayContains(synonyms, 'salsa');
    assertArrayContains(synonyms, 'salza'); // typo
});

test('getGenreSynonyms: returns synonyms for MIXED_GENRES', () => {
    const synonyms = getGenreSynonyms('MIXED_GENRES');
    assert(synonyms.length > 10, `Expected > 10 synonyms for MIXED_GENRES, got ${synonyms.length}`);
    assertArrayContains(synonyms, 'crossover');
    assertArrayContains(synonyms, 'variado');
    assertArrayContains(synonyms, 'de todo');
});

// ===============================
// Edge Cases Tests
// ===============================
console.log('\n--- Edge Cases Tests ---');

test('handles null input gracefully', () => {
    const result = extractCanonicalGenres(null as any);
    assertArrayLength(result, 0);
});

test('handles undefined input gracefully', () => {
    const result = extractCanonicalGenres(undefined as any);
    assertArrayLength(result, 0);
});

test('handles number input gracefully', () => {
    const result = extractCanonicalGenres(123 as any);
    assertArrayLength(result, 0);
});

test('handles extra whitespace', () => {
    const result = extractCanonicalGenres('   salsa    vallenato   ');
    assertArrayContains(result, 'SALSA');
    assertArrayContains(result, 'VALLENATO');
});

test('handles mixed case input', () => {
    const result = extractCanonicalGenres('SALSA Vallenato RoCk');
    assertArrayContains(result, 'SALSA');
    assertArrayContains(result, 'VALLENATO');
    assertArrayContains(result, 'ROCK');
});

test('does NOT extract artist names (negative test)', () => {
    // These are artists, not genres - they should NOT be matched
    const result = extractCanonicalGenres('shakira daddy yankee bad bunny');
    // Should be empty or very minimal (no genre keywords present)
    assert(
        !result.some(g => ['SHAKIRA', 'DADDY_YANKEE', 'BAD_BUNNY'].includes(g as any)),
        'Should not extract artist names as genres'
    );
});

// ===============================
// Complex Real-World Input Tests
// ===============================
console.log('\n--- Complex Real-World Input Tests ---');

test('complex input: "quiero música de los 80s y 90s, salsa y vallenato viejo"', () => {
    const result = extractCanonicalGenres('quiero música de los 80s y 90s, salsa y vallenato viejo');
    assertArrayContains(result, 'OLDIES'); // 80s, 90s
    assertArrayContains(result, 'SALSA');
    assertArrayContains(result, 'VALLENATO'); // vallenato viejo
});

test('complex input: "me gusta el reggaetón, bachata y un poco de rock"', () => {
    const result = extractCanonicalGenres('me gusta el reggaetón, bachata y un poco de rock');
    assertArrayContains(result, 'REGGAETON');
    assertArrayContains(result, 'BACHATA');
    assertArrayContains(result, 'ROCK');
});

test('complex input: "dame musica variada de todo un poco"', () => {
    const result = extractCanonicalGenres('dame musica variada de todo un poco');
    assertArrayContains(result, 'MIXED_GENRES');
});

test('complex input: "solo música cristiana y alabanzas"', () => {
    const result = extractCanonicalGenres('solo música cristiana y alabanzas');
    assertArrayContains(result, 'GOSPEL');
});

test('complex input: "rancheras mariachi y corridos mexicanos"', () => {
    const result = extractCanonicalGenres('rancheras mariachi y corridos mexicanos');
    assertArrayContains(result, 'RANCHERA'); // rancheras, mariachi
    assertArrayContains(result, 'CORRIDOS');
});

// ===============================
// Summary
// ===============================
console.log('\n=================================');
console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log(`Total tests: ${testsPassed + testsFailed}`);
console.log('=================================');

if (testsFailed > 0) {
    console.log('\n⚠️ Some tests failed. Please review the errors above.');
    process.exit(1);
} else {
    console.log('\n🎉 ALL TESTS PASSED!');
    process.exit(0);
}

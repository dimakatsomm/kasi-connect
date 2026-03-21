import { parseOrderText, detectLanguage, normalise, detectCategories } from '../src/services/nlpService';
import type { CategoryKeywordEntry } from '../src/types';

describe('NLP Service — parseOrderText', () => {
  describe('English orders', () => {
    test('parses simple item with quantity', () => {
      const result = parseOrderText('2 breads');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ quantity: 2, name: 'breads' });
    });

    test('parses "give me" opener', () => {
      const result = parseOrderText('give me 2 cokes');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ quantity: 2, name: 'cokes' });
    });

    test('parses "I want" opener', () => {
      const result = parseOrderText('I want 3 pies');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ quantity: 3, name: 'pies' });
    });

    test('parses number word quantity', () => {
      const result = parseOrderText('two breads');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ quantity: 2, name: 'breads' });
    });

    test('parses multiple items with "and"', () => {
      const result = parseOrderText('2 breads and milk');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ quantity: 2, name: 'breads' });
      expect(result[1]).toMatchObject({ quantity: 1, name: 'milk' });
    });

    test('parses comma-separated items', () => {
      const result = parseOrderText('3 cokes, 2 pies, 1 chips');
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ quantity: 3, name: 'cokes' });
      expect(result[1]).toMatchObject({ quantity: 2, name: 'pies' });
      expect(result[2]).toMatchObject({ quantity: 1, name: 'chips' });
    });

    test('defaults to quantity 1 when no number given', () => {
      const result = parseOrderText('milk');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ quantity: 1, name: 'milk' });
    });

    test('handles "a" as quantity 1', () => {
      const result = parseOrderText('a coke');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ quantity: 1, name: 'coke' });
    });
  });

  describe('Sepedi / Setswana orders', () => {
    test('parses "ke kgopela" opener', () => {
      const result = parseOrderText('ke kgopela two breads le milk');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ quantity: 2, name: 'breads' });
      expect(result[1]).toMatchObject({ quantity: 1, name: 'milk' });
    });

    test('parses "ke batla" opener with "le" conjunction', () => {
      const result = parseOrderText('ke batla pap le wors');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ quantity: 1, name: 'pap' });
      expect(result[1]).toMatchObject({ quantity: 1, name: 'wors' });
    });

    test('parses "nka kopa" opener', () => {
      const result = parseOrderText('nka kopa 2 bread le 1 milk');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ quantity: 2, name: 'bread' });
      expect(result[1]).toMatchObject({ quantity: 1, name: 'milk' });
    });
  });

  describe('isiZulu orders', () => {
    test('parses "ngifuna" opener', () => {
      const result = parseOrderText('ngifuna pap and wors');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ quantity: 1, name: 'pap' });
      expect(result[1]).toMatchObject({ quantity: 1, name: 'wors' });
    });

    test('parses "ngicela" opener', () => {
      const result = parseOrderText('ngicela 2 pies');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ quantity: 2, name: 'pies' });
    });
  });

  describe('Mixed language', () => {
    test('handles mixed English/Zulu order', () => {
      const result = parseOrderText('ngifuna 2 breads and a coke');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ quantity: 2, name: 'breads' });
      expect(result[1]).toMatchObject({ quantity: 1, name: 'coke' });
    });
  });

  describe('Edge cases', () => {
    test('returns empty array for empty string', () => {
      expect(parseOrderText('')).toHaveLength(0);
    });

    test('returns empty array for null', () => {
      // Function accepts null/undefined gracefully
      expect(parseOrderText(null)).toHaveLength(0);
    });

    test('strips noise words like "please"', () => {
      const result = parseOrderText('please give me a milk');
      expect(result.some((r) => r.name === 'please')).toBe(false);
    });

    test('handles digits only', () => {
      const result = parseOrderText('2 pap');
      expect(result[0]).toMatchObject({ quantity: 2, name: 'pap' });
    });
  });
});

describe('NLP Service — detectLanguage', () => {
  test('detects Zulu', () => {
    expect(detectLanguage('ngifuna pap and wors')).toBe('zulu');
  });

  test('detects Sepedi', () => {
    expect(detectLanguage('ke kgopela two breads le milk')).toBe('sepedi');
  });

  test('detects English', () => {
    expect(detectLanguage('I want 2 pies please')).toBe('english');
  });

  test('returns unknown for unrecognised text', () => {
    expect(detectLanguage('xyzzy foo bar')).toBe('unknown');
  });
});

describe('NLP Service — normalise', () => {
  test('lowercases text', () => {
    expect(normalise('MILK')).toBe('milk');
  });

  test('strips punctuation', () => {
    expect(normalise('bread, milk!')).toBe('bread milk');
  });

  test('collapses whitespace', () => {
    expect(normalise('  two   breads  ')).toBe('two breads');
  });
});

describe('NLP Service — detectCategories', () => {
  const entries: CategoryKeywordEntry[] = [
    { categoryId: 'cat-food', subCategoryId: null, keywords: ['food', 'ukudla', 'dijo', 'kos'] },
    { categoryId: 'cat-drinks', subCategoryId: null, keywords: ['drinks', 'drink', 'iziphuzo', 'dino'] },
    { categoryId: 'cat-food', subCategoryId: 'sub-kota', keywords: ['kota', 'spatlho', 'quarter'] },
    { categoryId: 'cat-drinks', subCategoryId: 'sub-soft', keywords: ['cold drink', 'cooldrink', 'fizzy', 'soft drink', 'coke'] },
    { categoryId: 'cat-drinks', subCategoryId: 'sub-water', keywords: ['water', 'amanzi'] },
  ];

  test('detects category by English keyword', () => {
    const result = detectCategories('I want some food', entries);
    expect(result).toContain('cat-food');
  });

  test('detects category by isiZulu keyword', () => {
    const result = detectCategories('ngifuna iziphuzo', entries);
    expect(result).toContain('cat-drinks');
  });

  test('detects sub-category keyword', () => {
    const result = detectCategories('give me a cold drink', entries);
    expect(result).toContain('sub-soft');
  });

  test('detects water sub-category by Zulu keyword', () => {
    const result = detectCategories('ngicela amanzi', entries);
    expect(result).toContain('sub-water');
  });

  test('returns empty array when no keywords match', () => {
    const result = detectCategories('xyzzy foo bar', entries);
    expect(result).toHaveLength(0);
  });

  test('handles empty text', () => {
    const result = detectCategories('', entries);
    expect(result).toHaveLength(0);
  });

  test('detects multiple categories in one text', () => {
    const result = detectCategories('I want food and a drink', entries);
    expect(result).toContain('cat-food');
    expect(result).toContain('cat-drinks');
  });
});

import { describe, it, expect } from 'vitest';
import { extractSheetId, inferDiscipline, parseTitleBlockText } from './sheetIndexer';

describe('extractSheetId', () => {
  it('extracts standard sheet IDs', () => {
    expect(extractSheetId('A101')?.sheetId).toBe('A101');
    expect(extractSheetId('M201')?.sheetId).toBe('M201');
    expect(extractSheetId('E001')?.sheetId).toBe('E001');
  });

  it('handles separators', () => {
    expect(extractSheetId('A-101')?.sheetId).toBe('A101');
    expect(extractSheetId('M.201')?.sheetId).toBe('M201');
  });

  it('returns null for invalid IDs', () => {
    expect(extractSheetId('INVALID')).toBeNull();
    expect(extractSheetId('123')).toBeNull();
  });
});

describe('inferDiscipline', () => {
  it('maps prefixes to disciplines', () => {
    expect(inferDiscipline('A101')).toBe('Architectural');
    expect(inferDiscipline('S201')).toBe('Structural');
    expect(inferDiscipline('M301')).toBe('Mechanical');
    expect(inferDiscipline('E101')).toBe('Electrical');
    expect(inferDiscipline('P101')).toBe('Plumbing');
  });

  it('returns Unknown for unmapped prefixes', () => {
    expect(inferDiscipline('Z999')).toBe('Unknown');
  });
});

describe('parseTitleBlockText', () => {
  it('extracts sheet ID from multiline text', () => {
    const text = `PROJECT NAME
FIRST FLOOR PLAN
A101`;
    const result = parseTitleBlockText(text);
    expect(result.sheetId).toBe('A101');
  });

  it('returns null for empty text', () => {
    expect(parseTitleBlockText('')).toEqual({ sheetId: null, sheetTitle: null, confidence: 0 });
  });
});

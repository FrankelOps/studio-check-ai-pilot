import { describe, it, expect } from 'vitest';
import { IssueObjectSchemaV1 } from './issueObject';

describe('IssueObjectSchemaV1', () => {
  const validIssue = {
    issue_id: '550e8400-e29b-41d4-a716-446655440000',
    pattern_id: 'P1',
    pattern_version: '1.0.0',
    phase_context: 'CD',
    finding: {
      title: 'Missing Sheet Reference',
      summary: 'Sheet A101 references missing sheet A102',
      description: 'Full description here',
    },
    location_context: {
      primary_sheet: 'A101',
    },
    evidence: [{
      sheet_id: 'A101',
      snippet_text: 'SEE SHEET A102',
      extraction_method: 'vision',
      confidence: 0.95,
    }],
    risk: {
      severity: 'MEDIUM',
      impact_type: 'Coordination',
      rationale: 'Missing reference may cause issues',
    },
    recommendation: {
      action: 'Add missing sheet or fix reference',
    },
    quality: {
      confidence_overall: 0.9,
    },
    trace: {
      model: 'gpt-4o-mini',
      run_id: '550e8400-e29b-41d4-a716-446655440001',
    },
    created_at: '2024-01-01T00:00:00.000Z',
  };

  it('accepts valid issue object', () => {
    const result = IssueObjectSchemaV1.safeParse(validIssue);
    expect(result.success).toBe(true);
  });

  it('rejects empty evidence array', () => {
    const invalid = { ...validIssue, evidence: [] };
    const result = IssueObjectSchemaV1.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects missing primary_sheet', () => {
    const invalid = { ...validIssue, location_context: {} };
    const result = IssueObjectSchemaV1.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects missing pattern_id', () => {
    const invalid = { ...validIssue, pattern_id: '' };
    const result = IssueObjectSchemaV1.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects objects containing page field', () => {
    const invalid = { ...validIssue, page: 1 };
    const result = IssueObjectSchemaV1.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects objects containing page_number field', () => {
    const invalid = { ...validIssue, page_number: 5 };
    const result = IssueObjectSchemaV1.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects nested page fields in evidence', () => {
    const invalid = {
      ...validIssue,
      evidence: [{
        ...validIssue.evidence[0],
        page: 1, // FORBIDDEN
      }],
    };
    const result = IssueObjectSchemaV1.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDraft, isStepComplete, loadDraft, maxReachableIndex, reducer, saveDraft, type Draft } from '../../src/booking/draft';

const filled = (): Draft => {
  let d = emptyDraft();
  d = reducer(d, { type: 'selectService', id: 'svc-1' });
  d = reducer(d, { type: 'setLocation', value: 'workshop' });
  d = reducer(d, { type: 'selectSlot', slot: { start: '2026-11-03T08:00:00.000Z', end: '2026-11-03T11:00:00.000Z' } });
  for (const [field, value] of [
    ['customer_name', 'Anna Andersson'],
    ['customer_email', 'anna@example.se'],
    ['customer_phone', '0701234567'],
  ] as const) {
    d = reducer(d, { type: 'setDetail', field, value });
  }
  return d;
};

describe('booking draft reducer', () => {
  it('creates a unique idempotency key per draft and keeps it across edits', () => {
    const a = emptyDraft();
    const b = emptyDraft();
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    const edited = reducer(reducer(a, { type: 'setDetail', field: 'customer_name', value: 'X' }), { type: 'goTo', step: 'details' });
    expect(edited.idempotencyKey).toBe(a.idempotencyKey);
  });

  it('clears the chosen time when the service changes (different duration)', () => {
    const d = filled();
    expect(reducer(d, { type: 'selectService', id: 'svc-1' }).slot).not.toBeNull();
    expect(reducer(d, { type: 'selectService', id: 'svc-2' }).slot).toBeNull();
  });

  it('keeps customer details when going back and forth between steps', () => {
    let d = filled();
    d = reducer(d, { type: 'goTo', step: 'service' });
    d = reducer(d, { type: 'goTo', step: 'summary' });
    expect(d.details.customer_name).toBe('Anna Andersson');
  });

  it('reset produces a fresh draft with a new key', () => {
    const d = filled();
    const r = reducer(d, { type: 'reset' });
    expect(r.serviceId).toBeNull();
    expect(r.idempotencyKey).not.toBe(d.idempotencyKey);
  });
});

describe('step progression', () => {
  it('only allows navigating as far as the completed steps', () => {
    const d = emptyDraft();
    expect(maxReachableIndex(d)).toBe(0);
    expect(maxReachableIndex(reducer(d, { type: 'selectService', id: 's' }))).toBe(1);
    expect(maxReachableIndex(filled())).toBe(4);
  });

  it('requires a valid address for mobile appointments', () => {
    let d = reducer(filled(), { type: 'setLocation', value: 'customer_address' });
    expect(isStepComplete(d, 'location')).toBe(false);
    expect(maxReachableIndex(d)).toBe(1);
    d = reducer(d, { type: 'setAddress', field: 'service_address', value: 'Gatan 1' });
    d = reducer(d, { type: 'setAddress', field: 'service_postal_code', value: '211 15' });
    d = reducer(d, { type: 'setAddress', field: 'service_city', value: 'Malmö' });
    expect(isStepComplete(d, 'location')).toBe(true);
  });

  it('treats invalid contact details as incomplete', () => {
    const d = reducer(filled(), { type: 'setDetail', field: 'customer_email', value: 'not-an-email' });
    expect(isStepComplete(d, 'details')).toBe(false);
  });
});

describe('persistence', () => {
  beforeEach(() => sessionStorage.clear());

  it('restores a saved draft after a refresh', () => {
    const d = filled();
    saveDraft(d);
    const restored = loadDraft();
    expect(restored.idempotencyKey).toBe(d.idempotencyKey);
    expect(restored.details.customer_email).toBe('anna@example.se');
  });

  it('discards stale, corrupt or tampered drafts', () => {
    sessionStorage.setItem('crescor-booking-draft', '{not json');
    expect(loadDraft().serviceId).toBeNull();
    sessionStorage.setItem('crescor-booking-draft', JSON.stringify({ ...filled(), savedAt: Date.now() - 4 * 3600_000 }));
    expect(loadDraft().serviceId).toBeNull();
    sessionStorage.setItem('crescor-booking-draft', JSON.stringify({ ...filled(), step: 'hacked' }));
    expect(loadDraft().serviceId).toBeNull();
  });
});

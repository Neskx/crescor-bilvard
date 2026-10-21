import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { StepDetails } from '../../src/booking/steps/StepDetails';
import { StepService } from '../../src/booking/steps/StepService';
import { emptyDraft, detailErrors } from '../../src/booking/draft';
import { formatPrice } from '../../src/lib/format';
import { buildIcs } from '../../src/booking/ics';
import type { Addon, Service } from '../../src/types';

const services: Service[] = [
  { id: 'a', slug: 'a', name: 'Biltvätt', description: 'Tvätt', duration_minutes: 180, price: 1495, price_type: 'from', image_key: null },
  { id: 'b', slug: 'b', name: 'Polering', description: 'Lack', duration_minutes: 300, price: null, price_type: 'on_request', image_key: null },
];

const addons: Addon[] = [
  { id: 'x', slug: 'x', name: 'Keramiskt sprayvax', description: '', price: 100 },
  { id: 'y', slug: 'y', name: 'Fläckborttagning', description: '', price: 50 },
];

describe('StepService', () => {
  it('shows durations and prices and blocks continuing until a service is chosen', async () => {
    const onSelect = vi.fn();
    const onNext = vi.fn();
    render(
      <StepService
        services={services}
        addons={[]}
        selectedId={null}
        selectedAddonIds={[]}
        onSelect={onSelect}
        onToggleAddon={() => {}}
        onNext={onNext}
        titleRef={createRef()}
      />,
    );
    expect(screen.getByText(/ca 3 tim/)).toBeInTheDocument();
    expect(screen.getByText('Pris enligt offert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fortsätt/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Polering/ }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('lists add-ons with prices and sums the chosen ones', async () => {
    const onToggleAddon = vi.fn();
    render(
      <StepService
        services={[services[0]]}
        addons={addons}
        selectedId="a"
        selectedAddonIds={['x', 'y']}
        onSelect={() => {}}
        onToggleAddon={onToggleAddon}
        onNext={() => {}}
        titleRef={createRef()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /Keramiskt sprayvax/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('150 kr')).toBeInTheDocument();
    expect(screen.getByText(/Totalt: Från 1\s645 kr/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Fläckborttagning/ }));
    expect(onToggleAddon).toHaveBeenCalledWith('y');
  });
});

describe('StepDetails', () => {
  it('shows accessible errors for required fields and does not advance', async () => {
    const onNext = vi.fn();
    const d = emptyDraft();
    render(<StepDetails details={d.details} errors={detailErrors(d)} onChange={() => {}} onBack={() => {}} onNext={onNext} titleRef={createRef()} />);
    await userEvent.click(screen.getByRole('button', { name: /Fortsätt/ }));
    expect(onNext).not.toHaveBeenCalled();
    const name = screen.getByLabelText('Namn');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Ange ditt namn.');
    expect(name).toHaveFocus();
  });
});

describe('helpers', () => {
  it('formats prices in Swedish', () => {
    expect(formatPrice(1495, 'from')).toBe('Från 1 495 kr');
    expect(formatPrice(800, 'fixed')).toBe('800 kr');
    expect(formatPrice(800, 'on_request')).toBeNull();
  });

  it('builds a valid iCalendar file with escaped text', () => {
    const ics = buildIcs({ reference: 'CB-ABC234', title: 'Helrekond, Crescor', start: '2026-11-03T07:00:00Z', end: '2026-11-03T13:00:00Z', location: 'Gata 1; Malmö' });
    expect(ics).toContain('DTSTART:20261103T070000Z');
    expect(ics).toContain('SUMMARY:Helrekond\\, Crescor');
    expect(ics).toContain('LOCATION:Gata 1\\; Malmö');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});

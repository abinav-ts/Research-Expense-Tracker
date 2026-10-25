import { describe, expect, it } from 'vitest';
import { payeeKey, suggestCategory } from '../../src/shared/categoriser.ts';

describe('REQ-CAP-14: category suggestion', () => {
  it('REQ-CAP-14: IRCTC suggests Rail / bus, Uber suggests Local transport', () => {
    expect(suggestCategory('IRCTC')).toEqual({ source: 'keyword', categories: ['rail_bus'] });
    expect(suggestCategory('Uber')).toEqual({ source: 'keyword', categories: ['local_transport'] });
  });

  it('REQ-CAP-14: a person\'s name gets no suggestion', () => {
    expect(suggestCategory('R. Kumar')).toEqual({ source: 'none', categories: [] });
    expect(suggestCategory('')).toEqual({ source: 'none', categories: [] });
  });

  it('REQ-CAP-14: hotels, restaurants, airlines and conferences map to their categories', () => {
    expect(suggestCategory('HOTEL SAMPLE').categories).toEqual(['accommodation']);
    expect(suggestCategory('Cafe Sample').categories).toEqual(['meals']);
    expect(suggestCategory('Zomato').categories).toEqual(['meals']);
    expect(suggestCategory('Air India').categories).toEqual(['airfare']);
    expect(suggestCategory('Lisbon Computing Society').categories).toEqual(['registration']);
    expect(suggestCategory('VFS Global visa fee').categories).toEqual(['visa_insurance']);
  });

  it('REQ-CAP-14: matches whole words only ("business" is not "bus", "Olive" is not "Ola")', () => {
    expect(suggestCategory('Business Centre').categories).toEqual([]);
    expect(suggestCategory('Olive Garden').categories).toEqual([]);
  });

  it('REQ-CAP-14: the remembered choice wins over the keyword table', () => {
    const memory = new Map([[payeeKey('CAFE SAMPLE'), 'other' as const]]);
    expect(suggestCategory('Cafe  Sample', memory)).toEqual({ source: 'remembered', categories: ['other'] });
    expect(suggestCategory('Cafe Sample').categories).toEqual(['meals']);
  });

  it('REQ-CAP-14: a remembered payee with no keyword is still pre-selected next time', () => {
    const memory = { [payeeKey('R. Kumar')]: 'local_transport' as const };
    expect(suggestCategory('r kumar', memory)).toEqual({ source: 'remembered', categories: ['local_transport'] });
  });

  it('REQ-CAP-14: aggregators like MakeMyTrip offer two candidate chips instead of one choice', () => {
    expect(suggestCategory('MakeMyTrip')).toEqual({ source: 'keyword', categories: ['airfare', 'accommodation'] });
    expect(suggestCategory('Booking.com').categories).toHaveLength(2);
  });
});

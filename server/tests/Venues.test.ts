import { describe, it, expect } from 'vitest';
import { VenuesEnv, maskEmail } from '@models/Venues.js';
import { EnvSchema } from '@models/EnvValidation.js';

const exampleMuseum = {
    id: 'example-museum',
    name: 'Example Museum',
    alertEmails: ['staff@example.org'],
    timezone: 'Europe/Stockholm',
    openingHours: { days: ['wed', 'thu', 'fri', 'sat', 'sun'], from: '12:00', to: '16:00' },
};

describe('COUNCIL_VENUES', () => {
    it('parses a venue list from JSON', () => {
        expect(VenuesEnv.parse(JSON.stringify([exampleMuseum]))).toEqual([exampleMuseum]);
    });

    it.each([
        ['invalid JSON', '[{'],
        ['no recipients', JSON.stringify([{ ...exampleMuseum, alertEmails: [] }])],
        ['an invalid address', JSON.stringify([{ ...exampleMuseum, alertEmails: ['not-an-email'] }])],
        ['an unknown time zone', JSON.stringify([{ ...exampleMuseum, timezone: 'Europe/Atlantis' }])],
        ['closing before opening', JSON.stringify([{ ...exampleMuseum, openingHours: { ...exampleMuseum.openingHours, from: '17:00', to: '10:00' } }])],
        ['an unknown weekday', JSON.stringify([{ ...exampleMuseum, openingHours: { ...exampleMuseum.openingHours, days: ['someday'] } }])],
        ['duplicate ids', JSON.stringify([exampleMuseum, exampleMuseum])],
    ])('rejects %s', (_name, raw) => {
        expect(VenuesEnv.safeParse(raw).success).toBe(false);
    });

    it('treats blank mail and bridge settings in .env as unset', () => {
        const env = EnvSchema.parse({
            COUNCIL_DB_URL: 'mongodb://localhost:27017',
            COUNCIL_DB_PREFIX: 'test',
            COUNCIL_OPENAI_API_KEY: 'x',
            INWORLD_API_KEY: 'x',
            COUNCIL_BREVO_API_KEY: '',
            COUNCIL_MAIL_FROM: '',
            COUNCIL_BRIDGE_KEY: ' ',
            COUNCIL_VENUES: '',
        });
        expect(env.COUNCIL_BREVO_API_KEY).toBeUndefined();
        expect(env.COUNCIL_MAIL_FROM).toBeUndefined();
        expect(env.COUNCIL_BRIDGE_KEY).toBeUndefined();
        expect(env.COUNCIL_VENUES).toBeUndefined();
    });
});

describe('maskEmail', () => {
    it.each([
        ['staff@museum.org', 's***@museum.org'],
        ['a@b.se', 'a***@b.se'],
        ['broken', '***'],
    ])('%s → %s', (email, masked) => {
        expect(maskEmail(email)).toBe(masked);
    });
});

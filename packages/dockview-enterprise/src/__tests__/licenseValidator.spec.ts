import {
    fnv1a,
    isValidLicense,
    parseLicenseKey,
    validateLicense,
} from '../licenseValidator';

// A REAL key minted by the issuer (`dockview-licencing`, `yarn generate-licence
// --company "Acme Trading Ltd" --app-name "Acme Terminal" --email ops@acme.com
// --plan team --valid-until 2027-07-01 --dry-run`). This is the cross-repo
// golden fixture: if the issuer's FNV-1a / field-encoding / date format ever
// drifts from this verifier, these tests fail loudly. Do not hand-edit.
const GOLDEN_KEY =
    '[KeyId:MR27GM5Z9RCLP1]_[Company:Acme_Trading_Ltd]_[Plan:team]_[AppName:Acme_Terminal]_[Email:ops@acme.com]_[ValidFrom:01_Jul_2026]_[ValidUntil:01_Jul_2027]__5220d8253176bad4';

const GOLDEN_BODY = GOLDEN_KEY.slice(0, GOLDEN_KEY.lastIndexOf('__'));

// Independent oracle: FNV-1a 64-bit computed over Node's own canonical UTF-8
// encoding, using BigInt (a different arithmetic path than the verifier's
// two-32-bit-halves impl). Lets us assert `fnv1a`, and therefore `utf8Bytes`,
// is byte-identical to a standard encoder across the 1/2/3/4-byte ranges,
// including surrogate pairs, without needing an issuer-minted fixture.
function fnv1aReference(input: string): string {
    let h = 0xcbf29ce484222325n;
    for (const b of Buffer.from(input, 'utf8')) {
        h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return h.toString(16).padStart(16, '0');
}

describe('fnv1a', () => {
    test('empty input is the FNV-1a 64-bit offset basis', () => {
        expect(fnv1a('')).toBe('cbf29ce484222325');
    });

    test('always 16 lowercase hex chars', () => {
        for (const s of ['a', 'hello', GOLDEN_BODY, '日本語']) {
            expect(fnv1a(s)).toMatch(/^[0-9a-f]{16}$/);
        }
    });

    test('cross-repo golden: matches the issuer checksum for the real body', () => {
        expect(fnv1a(GOLDEN_BODY)).toBe('5220d8253176bad4');
    });

    test('a single-byte change flips the digest', () => {
        expect(fnv1a(GOLDEN_BODY)).not.toBe(fnv1a(GOLDEN_BODY + ' '));
    });

    test('utf8 encoding matches a standard encoder across byte-lengths', () => {
        // 1-byte (ASCII), 2-byte (Latin-1 supplement), 3-byte (CJK), and
        // 4-byte (astral / surrogate-pair emoji) code points, plus a mix.
        for (const s of [
            'A',
            'é',
            'ñ',
            '£',
            '日本語',
            '😀',
            '𐀀',
            'Acmé_Trådîng_🚀',
        ]) {
            expect(fnv1a(s)).toBe(fnv1aReference(s));
        }
    });
});

describe('parseLicenseKey', () => {
    test('decodes every field of the golden key', () => {
        const p = parseLicenseKey(GOLDEN_KEY)!;
        expect(p).not.toBeNull();
        expect(p.keyId).toBe('MR27GM5Z9RCLP1');
        expect(p.company).toBe('Acme_Trading_Ltd');
        expect(p.plan).toBe('team');
        expect(p.appName).toBe('Acme_Terminal');
        expect(p.email).toBe('ops@acme.com');
        expect(p.validFrom).toEqual(new Date(Date.UTC(2026, 6, 1)));
        expect(p.validUntil).toEqual(new Date(Date.UTC(2027, 6, 1)));
    });

    test('null on checksum mismatch (tampered suffix)', () => {
        const tampered = GOLDEN_KEY.replace(/.$/, '0');
        expect(parseLicenseKey(tampered)).toBeNull();
    });

    test('null on tampered body kept with the old checksum', () => {
        const tampered = GOLDEN_KEY.replace('2027', '2099');
        expect(parseLicenseKey(tampered)).toBeNull();
    });

    test('null when the __ delimiter / checksum is missing (truncated)', () => {
        expect(parseLicenseKey(GOLDEN_BODY)).toBeNull();
    });

    test('null on a non-hex checksum', () => {
        expect(parseLicenseKey(`${GOLDEN_BODY}__zzzzzzzzzzzzzzzz`)).toBeNull();
    });

    test('survives zero-width / CRLF noise pasted around the key', () => {
        const noisy = `\uFEFF ${GOLDEN_KEY.slice(0, 10)}\u200B${GOLDEN_KEY.slice(
            10
        )}\r\n`;
        expect(parseLicenseKey(noisy)).not.toBeNull();
    });

    // Build a valid-checksum key with an arbitrary ValidUntil so the date
    // parser's branches can be exercised through the public API.
    const keyWithValidUntil = (validUntil: string): string => {
        const body =
            `[KeyId:K]_[Company:C]_[Plan:team]_[AppName:A]_[Email:e@x.com]` +
            `_[ValidFrom:01_Jul_2026]_[ValidUntil:${validUntil}]`;
        return `${body}__${fnv1a(body)}`;
    };

    test('date field with an unknown month name parses to null', () => {
        expect(
            parseLicenseKey(keyWithValidUntil('01_Zzz_2027'))!.validUntil
        ).toBeNull();
    });

    test('date field with an impossible calendar day parses to null', () => {
        // 31 Feb overflows into March, so it is rejected.
        expect(
            parseLicenseKey(keyWithValidUntil('31_Feb_2027'))!.validUntil
        ).toBeNull();
    });

    test('date field with a malformed shape parses to null', () => {
        expect(
            parseLicenseKey(keyWithValidUntil('2027-07-01'))!.validUntil
        ).toBeNull();
    });

    test('a well-formed date parses to the matching UTC calendar day', () => {
        const d = parseLicenseKey(keyWithValidUntil('29_Feb_2028'))!.validUntil;
        expect(d).toEqual(new Date(Date.UTC(2028, 1, 29))); // leap day
    });
});

describe('validateLicense', () => {
    const inWindow = new Date(Date.UTC(2026, 11, 1)); // 2026-12-01

    test('missing when key is undefined / empty / whitespace', () => {
        expect(validateLicense(undefined, inWindow)).toBe('missing');
        expect(validateLicense('', inWindow)).toBe('missing');
        expect(validateLicense('   ', inWindow)).toBe('missing');
    });

    test('valid within the window', () => {
        expect(validateLicense(GOLDEN_KEY, inWindow)).toBe('valid');
    });

    test('valid on the ValidUntil boundary day (inclusive)', () => {
        expect(
            validateLicense(GOLDEN_KEY, new Date(Date.UTC(2027, 6, 1)))
        ).toBe('valid');
        // ...even late in that UTC day.
        expect(
            validateLicense(
                GOLDEN_KEY,
                new Date(Date.UTC(2027, 6, 1, 23, 59, 59))
            )
        ).toBe('valid');
    });

    test('expired when the build was released after ValidUntil', () => {
        expect(
            validateLicense(GOLDEN_KEY, new Date(Date.UTC(2027, 6, 2)))
        ).toBe('expired');
    });

    test('lenient: a build released before ValidFrom still counts as valid', () => {
        expect(
            validateLicense(GOLDEN_KEY, new Date(Date.UTC(2026, 0, 1)))
        ).toBe('valid');
    });

    test('invalid on tampered checksum / body / truncation', () => {
        expect(validateLicense(GOLDEN_KEY.replace(/.$/, '0'), inWindow)).toBe(
            'invalid'
        );
        expect(
            validateLicense(GOLDEN_KEY.replace('2027', '2099'), inWindow)
        ).toBe('invalid');
        expect(validateLicense(GOLDEN_BODY, inWindow)).toBe('invalid');
    });

    test('invalid when ValidUntil is absent from an otherwise-checksummed key', () => {
        const body = '[KeyId:X]_[Company:Y]';
        const key = `${body}__${fnv1a(body)}`;
        expect(parseLicenseKey(key)).not.toBeNull(); // checksum is fine...
        expect(validateLicense(key, inWindow)).toBe('invalid'); // ...but no window
    });
});

describe('isValidLicense', () => {
    test('only valid is licensed; expired / invalid / missing are not', () => {
        expect(isValidLicense('valid')).toBe(true);
        expect(isValidLicense('expired')).toBe(false);
        expect(isValidLicense('invalid')).toBe(false);
        expect(isValidLicense('missing')).toBe(false);
    });
});

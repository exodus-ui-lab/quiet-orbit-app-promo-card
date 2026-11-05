// Masked destinations are the only user-derived value the API ever returns or logs.

const BULLET = '•';
const VISIBLE_PHONE_DIGITS = 3;
// Common calling codes; anything else is assumed to be a three-digit code.
const COUNTRY_CODES = new Set(
  '1 7 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 96 97 98'.split(' '),
);

function countryCodeLength(digits) {
  if (COUNTRY_CODES.has(digits.slice(0, 2))) return 2;
  if (COUNTRY_CODES.has(digits.slice(0, 1))) return 1;
  return 3;
}

/** "+4791234532" → "+47 ••• •• 532" (hidden digits in groups of three). */
export function maskPhone(e164) {
  const digits = e164.slice(1);
  const codeLength = countryCodeLength(digits);
  const hidden = BULLET.repeat(digits.length - codeLength - VISIBLE_PHONE_DIGITS).match(/.{1,3}/g).join(' ');
  return `+${digits.slice(0, codeLength)} ${hidden} ${digits.slice(-VISIBLE_PHONE_DIGITS)}`;
}

/** "sanna@example.com" → "s•••@example.com". */
export function maskEmail(email) {
  const [local, domain] = email.split('@');
  const [first] = local;
  return `${first}${BULLET.repeat(3)}@${domain}`;
}

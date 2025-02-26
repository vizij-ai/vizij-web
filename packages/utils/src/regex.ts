/**
 * Regular expression for validating email addresses.
 *
 * @remarks
 * This regex validates email addresses following RFC 5322 standards.
 * It checks for:
 * - Local part (before @) allowing letters, numbers, and special characters
 * - Domain part (after @) requiring at least one dot and valid characters
 * - Case-insensitive matching
 *
 * @example
 * ```typescript
 * EMAIL.test('user@example.com')  // Returns true
 * EMAIL.test('invalid.email')     // Returns false
 * ```
 */
export const EMAIL =
  /^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@(([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{2,})$/i;

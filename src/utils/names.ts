/** Customer / ledger names are always stored and shown in ALL CAPS, with tidy spacing. */
export const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ').toUpperCase();

/** Use on text inputs so the name turns into CAPS while typing (keeps trailing spaces so you can type a space). */
export const capsWhileTyping = (value: string): string => value.replace(/\s+/g, ' ').toUpperCase();

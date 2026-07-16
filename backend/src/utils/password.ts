import bcrypt from "bcrypt";

// Set work factor to 12 as required by Senior Backend Architect
const SALT_ROUNDS = 12;

/**
 * Hashes a plain-text password using bcrypt.
 * @param password The plain text password.
 * @returns A promise resolving to the hashed password.
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compares a plain-text password with a hashed password.
 * @param password The plain text password.
 * @param hash The hashed password stored in the database.
 * @returns A promise resolving to a boolean indicating a match.
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

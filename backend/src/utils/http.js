import { z } from 'zod';

// Sends a 400 with field-level messages from a failed Zod parse
export function validationError(res, error) {
  return res.status(400).json({
    error: 'Invalid input',
    details: error.issues.map((i) => ({
      field: i.path.join('.') || '(body)',
      message: i.message,
    })),
  });
}

const idSchema = z.coerce.number().int().positive().max(2147483647);

// Returns a valid id number, or null if the value is not a valid id
export function parseId(value) {
  const result = idSchema.safeParse(value);
  return result.success ? result.data : null;
}
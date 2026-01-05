/**
 * Error Handler Utility
 * 
 * Maps database errors to user-friendly messages to prevent
 * information leakage about internal schema and structure.
 */

interface SupabaseError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

// Map of PostgreSQL error codes to user-friendly messages
const ERROR_CODE_MESSAGES: Record<string, string> = {
  // Unique constraint violations
  '23505': 'This item already exists. Please use a different value.',
  // Foreign key violations  
  '23503': 'Cannot complete this action. This item is referenced by other records.',
  // Not null violations
  '23502': 'Please fill in all required fields.',
  // Check constraint violations
  '23514': 'The provided data is invalid. Please check your input.',
  // Invalid text representation
  '22P02': 'Invalid data format. Please check your input.',
  // String data right truncation
  '22001': 'The input is too long. Please shorten your entry.',
  // Numeric value out of range
  '22003': 'The number provided is out of range.',
  // Division by zero
  '22012': 'Invalid calculation. Please check your values.',
  // Insufficient privilege
  '42501': 'You do not have permission to perform this action.',
  // Connection exception
  '08000': 'Connection error. Please try again.',
  // Serialization failure (concurrency)
  '40001': 'This record was modified by another user. Please refresh and try again.',
};

// Pattern-based error matching for messages
const ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /row-level security/i, message: 'Access denied. You do not have permission for this action.' },
  { pattern: /violates.*constraint/i, message: 'The data provided conflicts with existing records.' },
  { pattern: /duplicate key/i, message: 'This item already exists.' },
  { pattern: /foreign key/i, message: 'Cannot complete action. Related records exist.' },
  { pattern: /not null/i, message: 'Please fill in all required fields.' },
  { pattern: /invalid input/i, message: 'Invalid data provided. Please check your input.' },
  { pattern: /permission denied/i, message: 'You do not have permission for this action.' },
  { pattern: /authentication/i, message: 'Please log in to continue.' },
  { pattern: /network|connection|timeout/i, message: 'Connection error. Please check your internet and try again.' },
];

/**
 * Converts a database error to a user-friendly message.
 * Logs the full error for debugging while returning a safe message to users.
 * 
 * @param error - The error object from Supabase or other sources
 * @param defaultMessage - Fallback message if no specific mapping is found
 * @returns A user-friendly error message
 */
export function getUserFriendlyError(
  error: unknown,
  defaultMessage: string = 'An error occurred. Please try again.'
): string {
  // Log the full error for debugging (only in development or to console)
  console.error('Database operation error:', error);

  if (!error) {
    return defaultMessage;
  }

  // Handle Supabase/PostgreSQL errors
  const supabaseError = error as SupabaseError;
  
  // Check for PostgreSQL error codes first
  if (supabaseError.code && ERROR_CODE_MESSAGES[supabaseError.code]) {
    return ERROR_CODE_MESSAGES[supabaseError.code];
  }

  // Check error message against patterns
  const errorMessage = supabaseError.message || String(error);
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return message;
    }
  }

  // For Error objects without specific handling
  if (error instanceof Error) {
    // Check if it's a user-facing message (doesn't contain technical details)
    const technicalPatterns = [
      /postgres/i,
      /supabase/i,
      /sql/i,
      /table/i,
      /column/i,
      /schema/i,
      /constraint/i,
      /function/i,
      /trigger/i,
    ];
    
    const isTechnical = technicalPatterns.some(pattern => 
      pattern.test(error.message)
    );
    
    if (!isTechnical) {
      return error.message;
    }
  }

  return defaultMessage;
}

/**
 * Specific error handlers for common operations
 */
export const ErrorMessages = {
  // CRUD operations
  create: {
    success: (item: string) => `${item} created successfully`,
    error: (item: string) => `Failed to create ${item}. Please try again.`,
    duplicate: (item: string) => `This ${item} already exists.`,
  },
  update: {
    success: (item: string) => `${item} updated successfully`,
    error: (item: string) => `Failed to update ${item}. Please try again.`,
  },
  delete: {
    success: (item: string) => `${item} deleted successfully`,
    error: (item: string) => `Failed to delete ${item}. Please try again.`,
    inUse: (item: string) => `Cannot delete ${item}. It is being used by other records.`,
  },
  load: {
    error: (item: string) => `Failed to load ${item}. Please refresh the page.`,
  },
  // Auth operations
  auth: {
    unauthorized: 'Please log in to continue.',
    forbidden: 'You do not have permission for this action.',
    sessionExpired: 'Your session has expired. Please log in again.',
  },
  // Network operations
  network: {
    error: 'Connection error. Please check your internet and try again.',
    timeout: 'Request timed out. Please try again.',
  },
};

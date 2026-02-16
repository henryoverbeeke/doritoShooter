// Development Mode Configuration
// This file makes it clear when we're in development mode

// Check environment variable first, then fall back to dev mode detection
export const IS_DEV_MODE = 
  import.meta.env.VITE_IS_DEV_MODE === 'true' || 
  import.meta.env.DEV === true;

// Log dev mode status on import
if (IS_DEV_MODE) {
  console.log('🔧 DEVELOPMENT MODE: ENABLED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

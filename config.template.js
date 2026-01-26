// Supabase Configuration Template
// 
// INSTRUCTIONS:
// 1. Copy this file and rename it to "config.js"
// 2. Follow SUPABASE_SETUP.md to get your credentials
// 3. Replace the values below with your actual Supabase credentials
// 4. Save the file
//
// Your credentials can be found in:
// Supabase Dashboard → Settings → API
//
// NOTE: The anon key is safe to use in frontend code - it's designed for this!

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; 
// Example: 'https://abcdefghijklmnop.supabase.co'

const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
// Example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

// Do not modify below this line
let supabase = null;

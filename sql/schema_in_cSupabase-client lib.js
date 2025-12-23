import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key', {
  // Provide a custom schema. Defaults to "public".
  db: { schema: 'other_schema' }
})

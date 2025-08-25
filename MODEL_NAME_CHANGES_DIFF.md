# Model Name Changes - Unified Diff

All instances of the invalid model name `'gpt-4.1-2025-04-14'` have been replaced with the current, working model name `'gpt-4o'`.

## Files Updated

### 1. `supabase/functions/chat-analysis/index.ts`
```diff
-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',
```

### 2. `supabase/functions/regenerate-summary/index.ts`
```diff
-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',
```

### 3. `supabase/functions/format-transcript/index.ts`
```diff
-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',
```

### 4. `supabase/functions/transcribe-audio/index.ts` (2 occurrences)
```diff
-             model: 'gpt-4.1-2025-04-14',
+             model: 'gpt-4o',
```

### 5. `supabase/functions/analyze-document/index.ts` (6 occurrences)
```diff
-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',

-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',

-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',

-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',

-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',

-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',
```

### 6. `supabase/functions/chat-designlog/index.ts`
```diff
-           model: 'gpt-4.1-2025-04-14',
+           model: 'gpt-4o',
```

### 7. `supabase/functions/process-designlog/index.ts` (2 occurrences)
```diff
-         model: 'gpt-4.1-2025-04-14',
+         model: 'gpt-4o',

-               model: 'gpt-4.1-2025-04-14',
+               model: 'gpt-4o',
```

## Summary

- **Total Files Updated**: 7
- **Total Model Name Changes**: 12
- **Old Model Name**: `'gpt-4.1-2025-04-14'` (invalid)
- **New Model Name**: `'gpt-4o'` (current, working)

All OpenAI API calls now use the current, documented model name `gpt-4o` instead of the invalid `gpt-4.1-2025-04-14`. This should resolve the API parameter errors you were experiencing.

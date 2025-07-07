import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, projectId, transcribedText } = await req.json();
    
    if (!fileId || !projectId) {
      throw new Error('Missing required parameters');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let text = transcribedText;

    // If no transcribed text provided, get file content
    if (!text) {
      // Get file details
      const { data: fileData, error: fileError } = await supabaseClient
        .from('uploaded_files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (fileError) throw fileError;

      // Download file content
      const { data: fileContent, error: downloadError } = await supabaseClient.storage
        .from('project-files')
        .download(fileData.file_path);

      if (downloadError) throw downloadError;

      // Convert file to text (simplified - you might want to use a PDF parser for PDFs)
      text = await fileContent.text();
    }

    // Process with OpenAI using the specific DesignLog prompt
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant trained for architecture and construction design decision tracking. Your task is to extract and summarize design decisions, owner requirements, open questions, and action items from project meetings, notes, or documents.

GOAL: Identify and log:
- **Owner Requirement:** Any owner-stated preference, request, or constraint.
- **Design Decision:** Any choice made by the design team, including rationale if provided.
- **Open Question:** Any unresolved issue, pending item, or decision requiring follow-up.
- **Action Item:** Any task, follow-up, or deliverable assigned to someone with a deadline.

RULES:
- For each item, provide:
  • Type: (Owner Requirement / Design Decision / Open Question / Action Item)
  • Date: (if provided in source, format as YYYY-MM-DD)
  • Meeting/Event: (if provided in source)
  • Summary: Concise statement of decision/requirement/question/task.
  • Rationale/Context: Why this was decided or requested, if known.
  • Tags: Relevant keywords for categorization (e.g., "materials", "lighting", "budget", "schedule")
  • For Action Items only:
    - assigned_to: Name of person responsible (if mentioned)
    - due_date: Deadline if specified (format as YYYY-MM-DD)
    - priority: low/medium/high/urgent (infer from context)
- Only include relevant items. Skip generic discussion not tied to a decision or requirement.
- Format output as valid JSON array.

OUTPUT FORMAT:
[
  {
    "type": "Owner Requirement",
    "date": "2025-04-10",
    "meeting_event": "Design Review #2",
    "summary": "Owner requested natural wood finish on lobby ceiling.",
    "rationale": "To create a warmer, inviting aesthetic.",
    "tags": ["materials", "lobby", "aesthetics"]
  },
  {
    "type": "Action Item",
    "date": "2025-04-10",
    "meeting_event": "Design Review #2",
    "summary": "Provide wood finish samples and cost estimates for lobby ceiling.",
    "rationale": "Owner needs to see options before final selection.",
    "tags": ["materials", "lobby", "samples"],
    "assigned_to": "Sarah (architect)",
    "due_date": "2025-04-17",
    "priority": "high"
  }
]`
          },
          {
            role: 'user',
            content: `Extract design decisions, owner requirements, open questions, and action items from this content:\n\n${text}`
          }
        ],
        temperature: 0.3
      }),
    });

    if (!openAIResponse.ok) {
      throw new Error(`OpenAI API error: ${openAIResponse.statusText}`);
    }

    const aiResult = await openAIResponse.json();
    const extractedContent = aiResult.choices[0].message.content;

    // Parse the JSON response
    let designLogEntries;
    try {
      // Remove any markdown code block formatting
      const cleanContent = extractedContent.replace(/```json\n?|\n?```/g, '');
      designLogEntries = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', extractedContent);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate and save entries to database
    const savedEntries = [];
    for (const entry of designLogEntries) {
      if (!entry.type || !entry.summary) {
        console.warn('Skipping invalid entry:', entry);
        continue;
      }

      // Validate type
      const validTypes = ['Owner Requirement', 'Design Decision', 'Open Question', 'Action Item'];
      if (!validTypes.includes(entry.type)) {
        console.warn('Invalid type, skipping entry:', entry);
        continue;
      }

      // Parse date if provided
      let parsedDate = null;
      if (entry.date) {
        try {
          parsedDate = new Date(entry.date).toISOString().split('T')[0];
        } catch (dateError) {
          console.warn('Invalid date format:', entry.date);
        }
      }

      // Insert into database - separate handling for Action Items
      if (entry.type === 'Action Item') {
        // Parse due date if provided
        let parsedDueDate = null;
        if (entry.due_date) {
          try {
            parsedDueDate = new Date(entry.due_date).toISOString().split('T')[0];
          } catch (dateError) {
            console.warn('Invalid due date format:', entry.due_date);
          }
        }

        // Insert action item
        const { data: actionItem, error: actionError } = await supabaseClient
          .from('action_items')
          .insert({
            project_id: projectId,
            decision_id: null, // Will link to design log entry if needed
            description: entry.summary,
            assigned_to_name: entry.assigned_to || null,
            due_date: parsedDueDate,
            priority: entry.priority || 'medium',
            status: 'open'
          })
          .select()
          .single();

        if (actionError) {
          console.error('Failed to save action item:', actionError);
          continue;
        }

        savedEntries.push({ ...actionItem, type: 'Action Item' });
      } else {
        // Insert design log entry
        const { data: savedEntry, error: insertError } = await supabaseClient
          .from('design_logs')
          .insert({
            project_id: projectId,
            file_id: fileId,
            type: entry.type,
            date: parsedDate,
            meeting_event: entry.meeting_event || null,
            summary: entry.summary,
            rationale: entry.rationale || null,
            tags: entry.tags || []
          })
          .select()
          .single();

        if (insertError) {
          console.error('Failed to save entry:', insertError);
          continue;
        }

        savedEntries.push(savedEntry);
      }
    }

    console.log(`Successfully processed ${savedEntries.length} design log entries and action items`);

    return new Response(
      JSON.stringify({
        success: true,
        entriesFound: designLogEntries.length,
        entriesSaved: savedEntries.length,
        entries: savedEntries
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in process-designlog function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
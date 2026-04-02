import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

// Types based on audits/schema/audit-output.schema.json
interface IngestPayload {
  project_id: string;
  synthesizer_payload: any;
}

serve(async (req) => {
  // CORS Headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST' } })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Need admin bypass for complex upserts
    )

    const payload: IngestPayload = await req.json()
    const { project_id, synthesizer_payload } = payload

    if (synthesizer_payload.kind !== 'synthesizer_output') {
      throw new Error("Invalid payload: Expected 'synthesizer_output' kind.")
    }

    const runId = synthesizer_payload.run_id || crypto.randomUUID()

    // 1. Upsert the Audit Run
    const { error: runError } = await supabaseClient
      .from('audit_runs')
      .upsert({
        id: runId.replace('synthesized--', ''), // Clean ID
        project_id: project_id,
        kind: 'deep_audit',
        status: 'completed',
        summary_stats: synthesizer_payload.rollups?.by_severity || {},
        completed_at: new Date().toISOString()
      })

    if (runError) throw runError;

    // 2. Upsert Findings (Batch process)
    const findingsToUpsert = synthesizer_payload.findings.map((f: any) => ({
      id: f.finding_id,
      project_id: project_id,
      run_id: runId.replace('synthesized--', ''),
      agent_name: 'synthesizer', // Canonical writer
      severity: f.severity,
      priority: f.priority,
      type: f.type,
      status: f.status,
      title: f.title,
      description: f.description,
      file_path: f.proof_hooks?.[0]?.file || null,
      proof_hooks: f.proof_hooks || [],
      suggested_fix: f.suggested_fix || {},
      history: f.history || [],
      updated_at: new Date().toISOString()
    }))

    if (findingsToUpsert.length > 0) {
      const { error: findingsError } = await supabaseClient
        .from('findings')
        .upsert(findingsToUpsert, { onConflict: 'id' }) // Upsert on canonical f-xxx ID

      if (findingsError) throw findingsError;
    }

    // 3. Log Orchestration Event
    await supabaseClient.from('orchestration_events').insert({
      run_id: runId.replace('synthesized--', ''),
      entity_type: 'run',
      entity_id: runId.replace('synthesized--', ''),
      event_type: 'audit_ingested',
      payload: { finding_count: findingsToUpsert.length }
    })

    return new Response(
      JSON.stringify({ success: true, ingested_findings: findingsToUpsert.length }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 400 }
    )
  }
})
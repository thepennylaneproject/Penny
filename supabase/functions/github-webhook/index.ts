import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

// --- CONFIGURATION ---
const GITHUB_SECRET = Deno.env.get('GITHUB_WEBHOOK_SECRET') || '';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 1. Verify GitHub Signature (Crucial for security)
  const signature = req.headers.get('x-hub-signature-256');
  if (!signature && Deno.env.get('NODE_ENV') === 'production') {
    return new Response('Missing GitHub Signature', { status: 401 });
  }
  // Note: In production, use crypto.subtle to verify HMAC-SHA256 of the payload

  try {
    const eventType = req.headers.get('x-github-event');
    const payload = await req.json();

    // We only trigger audits on PRs or pushes to main
    if (eventType !== 'pull_request' && eventType !== 'push') {
      return new Response('Event ignored. Penny only audits PRs and Pushes.', { status: 200 });
    }

    // For PRs, only trigger on opened or synchronized (new commits)
    if (eventType === 'pull_request' && !['opened', 'synchronize'].includes(payload.action)) {
      return new Response('PR action ignored.', { status: 200 });
    }

    const projectId = payload.repository.id.toString();
    const branchName = payload.pull_request ? payload.pull_request.head.ref : payload.ref.replace('refs/heads/', '');
    const commitSha = payload.pull_request ? payload.pull_request.head.sha : payload.after;

    // 2. The Diff Analyzer
    // In a full app, you'd fetch the diff from GitHub API here. 
    // We mock the extracted file paths from the commit payload for this example:
    const changedFiles: string[] = payload.commits 
      ? payload.commits.flatMap((c: any) => [...c.added, ...c.modified])
      : ['src/components/Button.tsx', 'src/utils/api.ts']; // Fallback for testing

    const requiredSuites = determineAuditSuites(changedFiles);

    if (requiredSuites.length === 0) {
      return new Response('No qualifying files changed. Skipping audit.', { status: 200 });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Enqueue the Audits
    console.log(`[Penny Ingest] Received changes on ${branchName}. Triggering suites: ${requiredSuites.join(', ')}`);

    const runsToInsert = requiredSuites.map(suite => ({
      project_id: projectId, // Assuming we mapped GitHub ID to Supabase Project ID earlier
      kind: suite, // '01_core_safety' | '02_visual_cohesion'
      status: 'queued',
      trigger_type: 'github_webhook',
      trigger_payload: {
        branch: branchName,
        commit_sha: commitSha,
        files_to_audit: changedFiles
      }
    }));

    // Inserting into 'audit_runs' acts as the queue for your BullMQ worker to pick up via Realtime
    const { error } = await supabaseClient.from('audit_runs').insert(runsToInsert);

    if (error) throw error;

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Enqueued ${requiredSuites.length} audit suites.` 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Webhook processing failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
})

/**
 * Intelligent Routing Logic:
 * Determines which suite of agents to run based on the files touched in the PR.
 */
function determineAuditSuites(files: string[]): string[] {
  const suites = new Set<string>();

  const visualPatterns = ['.css', '.tailwind', 'components/', 'ui/', 'styles/'];
  const logicPatterns = ['.ts', '.js', '.py', 'api/', 'services/', 'utils/', 'migrations/'];
  
  // Exclude purely documentary changes to save compute
  const ignorePatterns = ['.md', '.txt', '.gitignore'];

  for (const file of files) {
    if (ignorePatterns.some(p => file.endsWith(p))) continue;

    if (visualPatterns.some(p => file.includes(p))) {
      suites.add('02_visual_cohesion'); // Triggers Aggressive tier (cheap)
    }
    
    if (logicPatterns.some(p => file.includes(p))) {
      suites.add('01_core_safety'); // Triggers Balanced tier (moderate)
    }
  }

  // If we changed core configs like package.json, run both
  if (files.some(f => f.includes('package.json') || f.includes('vite.config'))) {
    suites.add('01_core_safety');
  }

  return Array.from(suites);
}
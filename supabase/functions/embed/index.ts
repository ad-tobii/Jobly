// Supabase Edge Function: embed
//
// Turns text into a vector. Called by the backend workers via
// `supabase.functions.invoke('embed', { body: { input } })`.
//
// Deploy with:
//   supabase functions deploy embed
//
// Uses Supabase's built-in gte-small model, which produces 384-dimension
// vectors. That size must match cv_chunks.embedding and the match_cv_chunks
// signature in backend/db/schema.sql — change all three together if you
// swap the model.

// @ts-expect-error — Supabase.ai is provided by the edge runtime, not npm.
const session = new Supabase.ai.Session('gte-small')

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let input: unknown
  try {
    ;({ input } = await req.json())
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  if (typeof input !== 'string' || !input.trim()) {
    return Response.json({ error: 'input must be a non-empty string' }, { status: 400 })
  }

  try {
    const embedding = await session.run(input, {
      mean_pool: true,
      normalize: true,
    })
    return Response.json({ embedding })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Embedding failed'
    return Response.json({ error: message }, { status: 500 })
  }
})

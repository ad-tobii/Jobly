import { Worker } from 'bullmq';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import supabase from '../config/supabase.js';
import redis from '../config/redis.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── AI-powered section extraction ─────────────────────────────────────────────

async function extractSections(text) {
  const chat = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a CV parser. Extract and structure the CV into clean sections.
Return ONLY valid JSON — no markdown, no preamble:
{
  "sections": [
    {
      "section_type": "string (one of: summary, experience, education, skills, projects, certifications, languages, interests, other)",
      "content": "string (full text content of this section, preserving all detail)"
    }
  ]
}

Rules:
- Preserve ALL content — do not summarize, truncate, or omit anything
- Map any header variant to the closest standard section_type (e.g. "Selected Projects" → "projects", "Technical Skills" → "skills", "Professional Summary" → "summary")
- If a section doesn't fit any standard type, use "other"
- Keep bullets, dates, company names, and all detail intact
- One object per section`,
      },
      {
        role: 'user',
        content: `Parse this CV into sections:\n\n${text.slice(0, 30000)}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 4000,
  });

  const raw = chat.choices[0].message.content.trim();
  try {
    return JSON.parse(raw).sections;
  } catch {
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]).sections;
    }
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned).sections;
  }
}

// ── Chunk within each section ─────────────────────────────────────────────────

function chunkSection(content, sectionType, chunkSize = 400, overlap = 50) {
  const words = content.split(/\s+/);
  if (words.length <= chunkSize) {
    return [{ content, section_type: sectionType, chunk_index: 0 }];
  }

  const chunks = [];
  let i = 0;
  let chunkIndex = 0;
  while (i < words.length) {
    chunks.push({
      content: words.slice(i, i + chunkSize).join(' '),
      section_type: sectionType,
      chunk_index: chunkIndex,
    });
    i += chunkSize - overlap;
    chunkIndex++;
  }
  return chunks;
}

// ── Embeddings ────────────────────────────────────────────────────────────────

async function embedText(text) {
  const { data, error } = await supabase.functions.invoke('embed', {
    body: { input: text },
  });

  if (error) {
    console.error('Embed error full:', JSON.stringify(error));
    throw new Error(`Embedding failed: ${error.message}`);
  }
  return data.embedding;
}

// ── CV health scoring ─────────────────────────────────────────────────────────

async function scoreCVWithGroq(text) {
  const chat = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a senior technical recruiter and CV coach. 
Analyse the CV provided and return ONLY valid JSON — no preamble, no markdown fences, no explanation. 
Return exactly this shape:
{
  "score": <integer 0-100>,
  "summary": "<2 sentence overall assessment>",
  "strengths": ["<specific strength>", "<specific strength>", "<specific strength>"],
  "weaknesses": ["<specific weakness>", "<specific weakness>"],
  "suggestions": ["<actionable suggestion>", "<actionable suggestion>", "<actionable suggestion>"]
}`,
      },
      {
        role: 'user',
        content: `Here is the CV to review:\n\n${text.slice(0, 30000)}`,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const raw = chat.choices[0].message.content.trim();

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

const cvWorker = new Worker(
  'cv-queue',
  async (job) => {
    const { cv_id, user_id, source_type, file_buffer, raw_text, skip_quality_checks } = job.data;

    console.log(`[cvWorker] Starting CV ${cv_id} | source: ${source_type}`);

    try {
    // ── Step 1: Extract text ──────────────────────────────────────────────────

    let text = '';

    if (source_type === 'file') {
      const buffer = Buffer.from(file_buffer, 'base64');
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else {
      text = raw_text;
    }

    if (!text || text.trim().length < 50) {
      throw new Error(`[cvWorker] CV ${cv_id} — extracted text too short or empty`);
    }

    console.log(`[cvWorker] Text extracted — ${text.length} characters`);

    // ── Step 2: Persist raw_text on CV record (for file uploads) ─────────────

    if (source_type === 'file') {
      const { error } = await supabase
        .from('cvs')
        .update({ raw_text: text })
        .eq('id', cv_id);

      if (error) throw new Error(`[cvWorker] Failed to save raw_text: ${error.message}`);
    }

    // ── NEW STEP 3: Validity Check ───────────────────────────────────

    if (!skip_quality_checks) {
      try {
        const validityChat = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are a document classifier. Determine if the provided text 
is a CV or resume — a professional document listing a person's 
work experience, education, skills, and/or projects.
Return ONLY valid JSON:
{
  "valid": <boolean>,
  "reason": "<one sentence explanation>"
}
Be strict: random text, cover letters alone, academic papers, 
job descriptions, and gibberish are NOT valid CVs.`
            },
            {
              role: 'user',
              content: text.slice(0, 3000)
            }
          ],
          temperature: 0.1,
        });

        const validityResult = JSON.parse(validityChat.choices[0].message.content.trim());
        if (validityResult.valid === false) {
          await supabase.from('cvs').update({ status: 'invalid', rejection_reason: validityResult.reason }).eq('id', cv_id);
          console.log(`[cvWorker] CV ${cv_id} rejected — not a valid CV: ${validityResult.reason}`);
          return; // Do not continue pipeline
        }
      } catch (err) {
        console.error(`[cvWorker] Validity check failed:`, err.message);
      }

      // ── NEW STEP 4: Quality Assessment ───────────────────────────────

      try {
        const qualityChat = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are an expert CV quality assessor. Evaluate this CV purely 
on its sufficiency for AI-powered job tailoring. Consider:
- Depth of experience descriptions (vague duties vs specific achievements)
- Presence of quantifiable results or impact
- Specificity of skills and tools mentioned
- Enough content to work with for tailoring

Score 0-100 and assign a tier:
- strong (>=70): sufficient detail for high-quality tailoring
- salvageable (40-69): workable but would benefit from enhancement
- unsalvageable (<40): too thin, vague, or incomplete to tailor effectively

Return ONLY valid JSON:
{
  "score": <integer 0-100>,
  "tier": "strong" | "salvageable" | "unsalvageable",
  "summary": "<2 sentence assessment explaining the tier>",
  "key_weaknesses": ["<specific weakness>", "<specific weakness>"]
}`
            },
            {
              role: 'user',
              content: text.slice(0, 4000)
            }
          ],
          temperature: 0.2,
        });

        const qualityResult = JSON.parse(qualityChat.choices[0].message.content.trim());
        
        if (qualityResult.tier === 'unsalvageable') {
          await supabase.from('cvs').update({
            status: 'unsalvageable',
            quality_tier: 'unsalvageable',
            quality_summary: qualityResult.summary
          }).eq('id', cv_id);
          console.log(`[cvWorker] CV ${cv_id} unsalvageable — score: ${qualityResult.score}`);
          return; // Do not continue pipeline
        } else if (qualityResult.tier === 'salvageable') {
          await supabase.from('cvs').update({
            status: 'needs_enhancement',
            quality_tier: 'salvageable',
            quality_summary: qualityResult.summary
          }).eq('id', cv_id);
          console.log(`[cvWorker] CV ${cv_id} needs enhancement — score: ${qualityResult.score}`);
          return; // Stop here, wait for user decision
        } else {
          await supabase.from('cvs').update({
            quality_tier: 'strong',
            quality_summary: qualityResult.summary
          }).eq('id', cv_id);
          console.log(`[cvWorker] CV ${cv_id} quality: strong — score: ${qualityResult.score}`);
        }
      } catch (err) {
        console.error(`[cvWorker] Quality assessment failed:`, err.message);
      }
    }

    // ── Step 5: AI section extraction (was Step 3) ────────────────────────────────────────

    const sections = await extractSections(text);
    console.log(`[cvWorker] ${sections.length} sections extracted: ${sections.map(s => s.section_type).join(', ')}`);

    // ── Step 6: Chunk each section (was Step 4) ────────────────────────────────────────────

    const allChunks = sections.flatMap((section) =>
      chunkSection(section.content, section.section_type)
    );
    console.log(`[cvWorker] ${allChunks.length} chunks created`);

    if (allChunks.length === 0) {
      throw new Error(`[cvWorker] CV ${cv_id} — chunking produced no output`);
    }

    // ── Step 7: Embed + store (was Step 5) ─────────────────────────────────────────────────

    const chunkRows = await Promise.all(
      allChunks.map(async (chunk, i) => {
        let embedding;
        try {
          embedding = await embedText(chunk.content);
        } catch (err) {
          console.error(`[cvWorker] Embedding failed for chunk ${i} (${chunk.section_type}):`, err.message);
          throw err;
        }

        return {
          cv_id,
          user_id,
          content: chunk.content,
          embedding,
          section_type: chunk.section_type,
          metadata: {
            source_type,
            chunk_index: chunk.chunk_index ?? 0,
          },
        };
      })
    );

    // ── Step 8: Insert all chunks (was Step 6) ─────────────────────────────────────────────

    const { error: chunkError } = await supabase.from('cv_chunks').insert(chunkRows);
    if (chunkError) throw new Error(`[cvWorker] cv_chunks insert failed: ${chunkError.message}`);

    console.log(`[cvWorker] ${chunkRows.length} chunks stored in cv_chunks`);

    // ── Step 9: Score CV with Groq (was Step 7) ────────────────────────────────────────────

    let feedback;
    try {
      feedback = await scoreCVWithGroq(text);
    } catch (err) {
      console.error(`[cvWorker] Groq scoring failed:`, err.message);
      feedback = {
        score: null,
        summary: 'Scoring unavailable.',
        strengths: [],
        weaknesses: [],
        suggestions: [],
      };
    }

    console.log(`[cvWorker] CV scored — ${feedback.score ?? 'N/A'}/100`);

    // ── Step 10: Update CV record with score + feedback (was Step 8) ────────────────────────

    const { error: updateError } = await supabase
      .from('cvs')
      .update({
        cv_health_score: feedback.score,
        cv_health_feedback: feedback,
        status: 'ready',
      })
      .eq('id', cv_id);

    if (updateError) throw new Error(`[cvWorker] CV update failed: ${updateError.message}`);

    console.log(`[cvWorker] CV ${cv_id} fully processed ✓`);
    } catch (err) {
      await supabase.from('cvs').update({ status: 'failed' }).eq('id', cv_id);
      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

// ── Worker event hooks ────────────────────────────────────────────────────────

cvWorker.on('completed', (job) => {
  console.log(`[cvWorker] Job ${job.id} completed`);
});

cvWorker.on('failed', (job, err) => {
  console.error(`[cvWorker] Job ${job.id} failed — ${err.message}`);
});

cvWorker.on('error', (err) => {
  console.error(`[cvWorker] Worker error:`, err);
});

export default cvWorker;
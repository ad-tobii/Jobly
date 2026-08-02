import Groq from 'groq-sdk';

// Constructed on first use, not at import time: the SDK throws when the key is
// absent, which would make this module unimportable (and untestable) without a
// fully populated environment.
let groqClient = null;

function getGroq() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

export function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Formatter returned invalid JSON');
  }
}

export function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

export async function formatJobForRendering({ title, company, location, description }) {
  const sourceText = String(description || '').trim();
  if (!sourceText) {
    return {
      about_role: [],
      responsibilities: [],
      experience_requirements: [],
    };
  }

  try {
    const chat = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You restructure job descriptions for frontend rendering.
Return ONLY valid JSON with this exact shape:
{
  "about_role": ["paragraph string", "..."],
  "responsibilities": ["bullet string", "..."],
  "experience_requirements": ["bullet string", "..."]
}

Rules:
- Preserve the meaning and important details from the original job description.
- Do not invent responsibilities, requirements, technologies, benefits, location details, seniority, or company facts.
- Use "about_role" for a concise role overview. Prefer 1-3 short paragraphs.
- Use "responsibilities" only for duties, ownership areas, deliverables, and day-to-day work. Write each as a bullet-ready sentence.
- Use "experience_requirements" only for required or preferred skills, years of experience, tools, technologies, qualifications, and domain experience. Write each as a bullet-ready sentence.
- If the original description does not contain enough evidence for a section, return an empty array for that section.
- Remove duplicate bullets and boilerplate while keeping specific requirements.
- Keep wording clear for UI display, but do not summarize away important constraints or technologies.`,
        },
        {
          role: 'user',
          content: `JOB TITLE: ${title || 'Unknown'}\nCOMPANY: ${company || 'Unknown'}\nLOCATION: ${location || 'Unknown'}\n\nORIGINAL JOB DESCRIPTION:\n${sourceText.slice(0, 12000)}`,
        },
      ],
      temperature: 0.1,
    });

    const parsed = parseJson(chat.choices[0].message.content.trim());
    return {
      about_role: normalizeStringArray(parsed.about_role),
      responsibilities: normalizeStringArray(parsed.responsibilities),
      experience_requirements: normalizeStringArray(parsed.experience_requirements),
    };
  } catch (err) {
    console.error('[jobFormatter] Failed to format job description:', err.message);
    return {
      about_role: [sourceText.slice(0, 1200)],
      responsibilities: [],
      experience_requirements: [],
    };
  }
}

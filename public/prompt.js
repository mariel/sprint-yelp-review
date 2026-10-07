export function buildArtPrompt({ title, description, scene, cast }) {
  const clean = value => String(value || '').trim().slice(0, 240);
  return [
    'Create a wide, polished cover illustration for a sprint retrospective app where the sprint is a restaurant.',
    'Show a small cast of entirely original, friendly 3D cartoon animal adventurers working or celebrating together in a cozy neighborhood restaurant.',
    'Give them soft felt-and-clay textures, rounded expressive features, colorful aprons, playful poses, and the energetic imagination of a backyard make-believe adventure.',
    'Do not depict, imitate, or include any existing television or franchise characters. No text, logos, watermarks, or UI.',
    'Use a cinematic wide composition with a clear focal point and space on the left for white interface text. Warm golden light, vibrant coral, teal, butter yellow, and cream.',
    `Sprint: ${clean(title)}.`,
    clean(description) ? `Sprint story: ${clean(description)}.` : '',
    clean(scene) ? `Moment to depict: ${clean(scene)}.` : '',
    clean(cast) ? `Original character and mood notes: ${clean(cast)}.` : '',
  ].filter(Boolean).join(' ');
}

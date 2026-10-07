export function buildArtPrompt({ title, review, rating, next, scene, cast }) {
  const clean = (value, limit = 240) => String(value || '').trim().slice(0, limit);
  return [
    'Create a polished illustration for one personal sprint retrospective review, imagining the sprint as a restaurant called Maison Bleu.',
    'Show a small cast of entirely original, friendly 3D cartoon animal adventurers acting out the feeling of this review in a cozy neighborhood restaurant.',
    'Give them soft felt-and-clay textures, rounded expressive features, colorful aprons, playful poses, and the energetic imagination of a backyard make-believe adventure.',
    'Do not depict, imitate, or include any existing television or franchise characters. No text, logos, watermarks, or UI.',
    'Use a cinematic wide composition with a clear focal point. Let the mood reflect the review, including frustrations when present, without making the characters scary. Warm golden light, vibrant coral, teal, butter yellow, and cream.',
    `Sprint: ${clean(title)}.`,
    clean(review) ? `Reviewer experience: ${clean(review, 1400)}.` : '',
    Number.isInteger(Number(rating)) && Number(rating) >= 1 && Number(rating) <= 5 ? `Rating: ${rating} out of 5 stars.` : '',
    clean(next) ? `Next sprint idea: ${clean(next, 300)}.` : '',
    clean(scene) ? `Moment or detail to depict: ${clean(scene)}.` : '',
    clean(cast) ? `Original character and mood notes: ${clean(cast)}.` : '',
  ].filter(Boolean).join(' ');
}

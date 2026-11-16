// J364: current prose uses one shard format. Public identifiers and checked code stay byte-identical.
const terms = /\b(?:first[-_ ]party|third[-_ ]party|trusted|hybrid|(?:code|data) shards?)\b/giu;
const code = /(```[\s\S]*?```|`[^`]*`|https?:\/\/[^\s)]+|\]\([^\s)]+\))/gu;

/** Modernize explanatory prose while preserving fenced examples and inline API/wire literals exactly. */
export function documentationProse(text) {
  return text.split(code).map((part, index) => index % 2 === 1 ? part : part.replace(terms, word => {
    const replacement = /^(?:code|data)/iu.test(word) ? /s$/u.test(word) ? 'shards' : 'shard'
      : /^third/iu.test(word) ? 'external' : 'legacy';
    return /^[A-Z]/u.test(word) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
  })).join('');
}

export interface SanitizerConfig {
  healHyphens?: boolean;
  healDiacritics?: boolean;
  cleanPunctuation?: boolean;
}

const DEFAULT_CONFIG: Required<SanitizerConfig> = {
  healHyphens: true,
  healDiacritics: true,
  cleanPunctuation: true,
};

const NON_STANDARD_SPACE = /[\u00A0\u2000-\u200B\u202F\u205F\u3000\t]/g;
const EOL_HYPHEN = /(\p{L}+)-[ \u00A0]*\n[ \u00A0]*(\p{L}+)/gu;
const LETTER_SPACE_COMBINING_MARK = /(\p{L})\s+(\p{M}+)/gu;
const TYPESET_DIACRITIC_SPLIT = /(\p{L}+)\s+([čćžšđČĆŽŠĐ]\p{L}*)/gu;
const SPACE_BEFORE_PUNCTUATION = / +([.,!?;:])/g;
const MULTIPLE_SPACES = / {2,}/g;

const TYPESET_PREFIX_BLOCKLIST = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'that', 'this', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our',
  'you', 'your', 'he', 'him', 'his', 'she', 'her', 'i', 'me', 'my', 'not', 'no', 'so', 'as',
  'by', 'with', 'from', 'into', 'about', 'than', 'then', 'when', 'where', 'which', 'who',
  'u', 'i', 'je', 'su', 'da', 'na', 'za', 'po', 'od', 'do', 'se', 'kao', 'ili', 'ali',
  'ne', 'ni', 'već', 'biti', 'bio', 'bila', 'bilo', 'sam', 'smo', 'ste', 'su', 'sam',
  'samo', 'još', 'tako', 'koji', 'koja', 'koje', 'što', 'sta', 'šta', 'gde', 'gdje',
  'ima', 'nije', 'nisu', 'bila', 'bili', 'bile', 'bio', 'će', 'cu', 'ću', 'nakon',
  'pre', 'bez', 'kod', 'pri', 'iz', 'kroz', 'preko', 'među', 'između', 'jer', 'ako',
  'dok', 'kad', 'kada', 'te', 'ta', 'to', 'tu', 'taj', 'ta', 'ti', 'ih', 'im', 'mi',
  'vi', 'on', 'ona', 'ono', 'oni', 'one', 'ga', 'ju', 'joj', 'mu', 'nam', 'vam',
  'igre', 'igra', 'film', 'filma', 'filmu', 'batman', 'lego', 'warner', 'sve', 'svi',
  'svoj', 'svoja', 'svoje', 'svom', 'svim', 'jedan', 'jedna', 'jedno', 'jedne',
  'dosta', 'mnogo', 'malo', 'vrlo', 'svega', 'svak', 'svaka', 'svaki', 'svako',
]);

const TYPESET_SUFFIX_BLOCKLIST = new Set([
  'čak', 'često', 'čovek', 'čovjek', 'čiji', 'čija', 'čije', 'čime', 'čemu', 'čega',
  'član', 'članak', 'članova', 'članovi', 'članica', 'članice', 'čita', 'čitati',
  'čini', 'čine', 'činio', 'činila', 'čini', 'čitav', 'čitava', 'čitavo',
  'će', 'ćemo', 'ćete', 'ćeš', 'ću', 'ćemo', 'ćete',
  'što', 'šta', 'sta', 'širok', 'šire', 'širi', 'šta', 'što',
  'želi', 'žele', 'želio', 'želj', 'život', 'želja', 'želi', 'želi',
  'đak', 'đaci', 'đavo',
]);

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}]/gu, '');
}

function shouldMergeTypesetSplit(prefix: string, suffix: string): boolean {
  const prefixNorm = normalizeWord(prefix);
  const suffixNorm = normalizeWord(suffix);

  if (!prefixNorm || !suffixNorm) return false;
  if (TYPESET_PREFIX_BLOCKLIST.has(prefixNorm)) return false;
  if (TYPESET_SUFFIX_BLOCKLIST.has(suffixNorm)) return false;

  if (!/^\p{Ll}+$/u.test(prefixNorm)) return false;
  if (!/^[čćžšđ]\p{Ll}+$/u.test(suffixNorm)) return false;
  if (prefixNorm.length < 3 || prefixNorm.length > 8) return false;

  return true;
}

function resolveConfig(config?: SanitizerConfig): Required<SanitizerConfig> {
  return { ...DEFAULT_CONFIG, ...config };
}

function normalizeUnicodeAndSpaces(text: string): string {
  return text.normalize('NFKC').replace(NON_STANDARD_SPACE, ' ');
}

function healEndOfLineHyphenation(text: string): string {
  return text.replace(EOL_HYPHEN, (_match, prefix: string, suffix: string) => {
    if (/^\p{Ll}/u.test(suffix)) {
      return prefix + suffix;
    }
    return `${prefix}-${suffix}`;
  });
}

function healStandardDiacritics(text: string): string {
  return text.replace(LETTER_SPACE_COMBINING_MARK, (match, letter: string, marks: string) => {
    const welded = (letter + marks).normalize('NFC');
    return welded === letter + marks ? match : welded;
  });
}

function healTypesetDiacritics(text: string): string {
  return text.replace(TYPESET_DIACRITIC_SPLIT, (match, prefix: string, suffix: string) => {
    return shouldMergeTypesetSplit(prefix, suffix) ? prefix + suffix : match;
  });
}

function cleanPunctuationAndWhitespace(text: string): string {
  return text
    .replace(SPACE_BEFORE_PUNCTUATION, '$1')
    .replace(MULTIPLE_SPACES, ' ')
    .trim();
}

export function sanitizeText(rawText: string, config?: SanitizerConfig): string {
  const options = resolveConfig(config);

  let text = normalizeUnicodeAndSpaces(rawText);

  if (options.healHyphens) {
    text = healEndOfLineHyphenation(text);
  }

  if (options.healDiacritics) {
    text = healStandardDiacritics(text);
    text = healTypesetDiacritics(text);
  }

  if (options.cleanPunctuation) {
    text = cleanPunctuationAndWhitespace(text);
  }

  return text;
}

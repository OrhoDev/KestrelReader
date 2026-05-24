export interface OrpAnalysis {
  word: string;
  orpIndex: number;
  prefix: string;
  focalChar: string;
  suffix: string;
}

export function calculateOrp(word: string): OrpAnalysis {
  const len = word.length;
  let orpIndex = 0;

  if (len <= 1) {
    orpIndex = 0;
  } else if (len <= 5) {
    orpIndex = 1;
  } else if (len <= 9) {
    orpIndex = 2;
  } else if (len <= 13) {
    orpIndex = 3;
  } else {
    orpIndex = 4;
  }

  return {
    word,
    orpIndex,
    prefix: word.substring(0, orpIndex),
    focalChar: word.charAt(orpIndex),
    suffix: word.substring(orpIndex + 1)
  };
}

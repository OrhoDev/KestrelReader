import mammoth from 'mammoth';

export async function parseDocx(file: File): Promise<{ title: string; author: string; text: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value.trim();
  if (!text) throw new Error('No readable text in that DOCX file.');

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  return {
    title: baseName,
    author: 'Unknown',
    text,
  };
}

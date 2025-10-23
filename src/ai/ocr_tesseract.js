import Tesseract from 'tesseract.js';

export async function ocrImageToText(imagePath, lang = 'eng') {
  const { data } = await Tesseract.recognize(imagePath, lang);
  return data?.text || '';
}

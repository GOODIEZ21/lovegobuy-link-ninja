/** Shared category symbols for the catalogue and category management. */
export function categoryEmoji(name: string): string {
  const category = name.trim().toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  if (category === 'wszystkie') return '🗂️';
  if (category.includes('nie ciuch')) return '🧩';
  if (category.includes('klapki')) return '🩴';
  if (category.includes('buty')) return '👟';
  if (category.includes('spodenki')) return '🩳';
  if (category.includes('spodnie')) return '👖';
  if (category.includes('bluzy')) return '🧥';
  if (category.includes('koszulki')) return '👕';
  if (category.includes('przeciwdeszczowe')) return '🌧️';
  if (category.includes('kurtki')) return '🧥';
  if (/plecak|torby|torebki/.test(category)) return '🎒';
  if (category.includes('portfele')) return '👛';
  if (category.includes('zegarki')) return '⌚';
  if (category.includes('elektronika')) return '🎧';
  if (category.includes('lego')) return '🧱';
  if (category.includes('do pokoju')) return '🛋️';
  if (category.includes('zestawy')) return '👚';
  if (category.includes('akcesoria')) return '🧢';
  return '📦';
}
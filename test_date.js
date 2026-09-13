const d = new Date('2026-09-12T18:30:00.123456'); // no Z
console.log('Parsed naive string:', d.toISOString());

const d2 = new Date('2026-09-12T18:30:00.123Z'); // with Z
console.log('Parsed Z string:', d2.toISOString());

// If we parse the naive string and append 'Z':
const d3 = new Date('2026-09-12T18:30:00.123456' + 'Z');
console.log('Parsed with appended Z:', d3.toISOString());

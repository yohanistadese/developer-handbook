const files = import.meta.glob(['/**/*.md', '!/node_modules/**', '!/dist/**'], { query: '?raw', import: 'default' });
const assets = import.meta.glob(['/**/*.{png,jpg,jpeg,gif,svg,webp}', '!/node_modules/**', '!/dist/**'], {
  query: '?url',
  import: 'default',
  eager: true,
});

export function toRoute(path) {
  return path
    .replace(/(^|\/)(README\.md|index\.html)$/i, '$1')
    .replace(/\.md$/i, '')
    .replace(/(.)\/$/, '$1');
}

const docs = new Map(Object.entries(files).map(([file, load]) => [toRoute(file), { file, load }]));

export function findDoc(route) {
  return docs.get(route);
}

export function resolveAsset(path) {
  return assets[path];
}

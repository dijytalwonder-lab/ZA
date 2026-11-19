// Inlines dist-web/assets/*.js + *.css into one play.html that works from file://
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('dist-web');
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/, (m, p) => {
  const js = fs.readFileSync(path.join(dir, p), 'utf8').replace(/<\/script>/g, '<\\/script>');
  return `<script type="module">\n${js}\n</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/, (m, p) => {
  const css = fs.readFileSync(path.join(dir, p), 'utf8');
  return `<style>\n${css}\n</style>`;
});
// the module script must run after <body> exists -> move it to the end of <body>
const sm = html.match(/<script type="module">[\s\S]*?<\/script>/);
if (sm) {
  // NOTE: use function replacers - the minified JS contains "$&" / "$'" which String.replace would expand.
  html = html.replace(sm[0], () => '');
  html = html.replace('</body>', () => sm[0] + '\n</body>');
}
fs.writeFileSync(path.join(dir, 'play.html'), html);
console.log('play.html written:', (html.length / 1024).toFixed(0), 'KB');

const urls = [
  'http://localhost:8123/',
  'http://localhost:8123/src/app/browser.js',
  'http://localhost:8123/src/app/index.js',
  'http://localhost:8123/src/modules/debugview/index.js',
];

for (const url of urls) {
  const res = await fetch(url);
  console.log('URL', url, 'STATUS', res.status, 'CONTENT-TYPE', res.headers.get('content-type'));
  const text = await res.text();
  console.log(text.slice(0, 200).replace(/\n/g, ' '));
}

// build.js
// 说明：
//   将浏览器端代码（含 mediasoup-client）打包成单文件 public/app.js
//   这样前端不依赖任何 CDN，且浏览器可直接加载。

const path = require('path');
const esbuild = require('esbuild');

async function main() {
  const entry = path.join(__dirname, 'src', 'app.js');
  const outdir = path.join(__dirname, 'public');

  await esbuild.build({
    entryPoints: [entry],
    outfile: path.join(outdir, 'app.js'),
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    sourcemap: false,
    minify: false,
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });

  console.log('[build] public/app.js generated');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


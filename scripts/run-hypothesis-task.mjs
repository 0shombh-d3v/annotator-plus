import { fileURLToPath } from 'node:url';

const task = process.argv[2];
if (!['build', 'test'].includes(task)) {
  throw new Error('Expected a Hypothesis task: build or test');
}
if (task === 'build') process.env.NODE_ENV = 'production';

const vendor = new URL('../vendor/hypothesis-client/', import.meta.url);
process.chdir(fileURLToPath(vendor));

const { default: gulp } = await import(new URL('node_modules/gulp/index.js', vendor));
await import(new URL('gulpfile.js', vendor));
await new Promise((resolve, reject) => {
  gulp.series(task)(error => (error ? reject(error) : resolve()));
});

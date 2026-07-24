import { execSync } from 'child_process';

console.log('[BUILD] Building frontend with Vite...');
execSync('npx vite build', { stdio: 'inherit' });

console.log('[BUILD] Building server with esbuild...');
execSync('npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs', { stdio: 'inherit' });

console.log('[BUILD] Done.');

// Exercise the real caption extraction handler and FFmpeg with isolated media.
// Authentication is stubbed here; production localRoute still enforces project ownership.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const esbuild = require(process.env.ESBUILD_MODULE || 'esbuild');
const root = path.resolve(__dirname, '../../..');
const localRequire = createRequire(path.join(root, 'studios/vcut/package.json'));
const ffmpeg = localRequire('ffmpeg-static');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcut-caption-check-'));
  const previous = process.env.VEASNA_WORKSPACE_ROOT;
  process.env.VEASNA_WORKSPACE_ROOT = tmp;
  try {
    const { createProject, createClip } = await import(pathToFileURL(path.join(root, 'packages/vcut/src/project/createProject.ts')));
    for (const hosted of [false, true]) {
      const outfile = path.join(tmp, `route-${hosted}.cjs`);
      await esbuild.build({ entryPoints: [path.join(root, 'studios/vcut/app/api/vcut/captions/route.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'test-boundaries', setup(build) {
        build.onResolve({ filter: /\/_(?:lib)\/(auth|localOnly|ffmpeg)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'boundary' }));
        build.onLoad({ filter: /.*/, namespace: 'boundary' }, ({ path: name }) => ({ contents: name === 'auth'
          ? `export const VCUT_HOSTED=${hosted}; export async function requireSessionUser(){return {id:'11111111-1111-4111-8111-111111111111'};}`
          : name === 'localOnly' ? 'export const localRoute=handler=>handler;'
          : `import {execFile} from 'node:child_process'; export const ffmpegBinary=()=>${JSON.stringify(ffmpeg)}; export const ffmpegAvailable=()=>({available:true}); export function runFfmpeg(args){return {done:new Promise((resolve,reject)=>execFile(ffmpegBinary(),args,{timeout:30000},err=>err?reject(err):resolve()))};}` }));
      } }] });
      const { POST } = require(outfile);
      for (const libraryBacked of hosted ? [true, false] : [false]) {
        const id = `caption-${hosted}-${libraryBacked}`, dir = path.join(tmp, '.vcut', id);
        const mediaDir = libraryBacked ? path.join(tmp, '.vcut', 'users', '11111111-1111-4111-8111-111111111111', 'media') : path.join(dir, 'media');
        fs.mkdirSync(mediaDir, { recursive: true });
        const relPath = `${id}.wav`;
        execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(mediaDir, relPath)]);
        const project = createProject(id);
        project.assets = [{ id: 'voiceover', kind: 'audio', name: 'Voiceover.wav', relPath, duration: 1, hasAudio: true, sizeBytes: 1, importedAt: Date.now(), hiddenFromLibrary: true, ...(libraryBacked ? { libraryMediaId: 'voiceover' } : {}) }];
        project.sequence.tracks[1].clips = [createClip({ assetId: 'voiceover', sourceIn: 0, sourceOut: 1, timelineStart: 0 })];
        fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(project));
        const response = await POST(new Request(`http://localhost/api/vcut/captions?projectId=${id}`, { method: 'POST', body: '{}' }));
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.deepEqual(result.ranges, [{ start: 0, end: 1 }]); assert.deepEqual(result.durations, [1]);
        assert.ok(Buffer.from(result.audioBase64, 'base64').length > 1000);
        console.log(`PASS real FFmpeg: ${hosted ? 'hosted' : 'desktop'} ${libraryBacked ? 'account-library voiceover' : 'project-local audio'}`);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.VEASNA_WORKSPACE_ROOT; else process.env.VEASNA_WORKSPACE_ROOT = previous;
    // Extraction cleanup uses asynchronous unlink; let those callbacks finish before directory removal.
    await new Promise(r => setTimeout(r, 100));
    if (path.dirname(path.resolve(tmp)) === path.resolve(os.tmpdir()) && path.basename(tmp).startsWith('vcut-caption-check-')) fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

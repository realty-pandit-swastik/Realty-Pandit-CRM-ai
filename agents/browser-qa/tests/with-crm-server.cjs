// Own a local Vite server only when one is not already running. Keeps browser
// verification reproducible even when the terminal harness reaps detached jobs.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const frontend = path.resolve(__dirname, '../../frontend');
async function main() {
  let server;
  try {
    let running=false;
    try { running=(await fetch('http://127.0.0.1:5173/',{signal:AbortSignal.timeout(2000)})).ok; } catch {}
    if(!running) {
      const { createServer }=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')));
      server=await createServer({root:frontend,configFile:path.join(frontend,'vite.config.ts'),server:{host:'127.0.0.1',port:5173,strictPort:true}});
      await server.listen();
    }
    const [script,...args]=process.argv.slice(2);
    if(!script) throw new Error('Usage: node tests/with-crm-server.cjs tests/<browser-test.cjs> [arguments]');
    const code=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[script,...args],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});
      child.on('error',reject);
      child.on('exit',code=>resolve(code??1));
    });
    process.exitCode=code;
  } finally { if(server) await server.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});

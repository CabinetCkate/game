import {defineConfig, loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export default defineConfig(({mode}) => {
 const root = fileURLToPath(new URL('../', import.meta.url));
 const local = loadEnv(mode, root, 'API_');
 const port = process.env.API_PORT || local.API_PORT || '5080';
 const target = process.env.API_PROXY_TARGET || local.API_PROXY_TARGET || `http://localhost:${port}`;
 const portIndex = process.argv.indexOf('--port');
 const websitePort = portIndex >= 0 ? process.argv[portIndex + 1] : '8080';
 const bindingPath = join(root, 'artifacts', `local-api-${websitePort}.json`);
 const activeTarget = () => {
  try {
   const binding = JSON.parse(readFileSync(bindingPath, 'utf8'));
   const url = new URL(binding.url);
   if (!Number.isInteger(binding.pid) || binding.pid <= 0 || !['http:', 'https:'].includes(url.protocol) ||
       !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return target;
   process.kill(binding.pid, 0); // Ignore files left by a stopped debug session.
   return url.origin;
  } catch { return target; }
 };
 let apiProxy;
 // Watch the shared .env as well, so API_PORT changes refresh the proxy.
 return {envDir:root,server:{proxy:{'/api':{target,changeOrigin:true,ws:true,
  configure(proxy) { apiProxy = proxy; },
  bypass(_request, _response, options) {
   // Vite invokes this for HTTP and WebSocket requests, including a reused website.
   options.target = activeTarget();
   apiProxy.options.target = options.target;
   const url = new URL(options.target);
   // Visual Studio may bind HTTPS with its local development certificate.
   options.secure = !(url.protocol === 'https:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
   apiProxy.options.secure = options.secure;
  }
 }}}};
});

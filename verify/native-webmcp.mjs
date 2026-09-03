// Native Chrome WebMCP transport smoke test. Node 22.13+; no npm dependencies.
// Never substitutes the in-page JavaScript API for WebMCP.invokeTool.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const value = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
const chromePath = value('--chrome') || process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome');
const profile = await mkdtemp(join(tmpdir(), 'living-evidence-native-'));
let chrome, server;
const sockets = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await pause(50);
  }
  throw new Error(`Timed out: ${label}`);
}
async function connect(url) {
  const socket = new WebSocket(url);
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let counter = 0;
  const pending = new Map(), events = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const promise = pending.get(message.id);
      if (!promise) return;
      clearTimeout(promise.timer);
      pending.delete(message.id);
      if (message.error) promise.reject(new Error(JSON.stringify(message.error)));
      else promise.resolve(message.result);
    } else events.push(message);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const invoke = async (tool, input = {}, expected = 'Completed') => {
    const { invocationId } = await send('WebMCP.invokeTool', { frameId: tool.frameId, toolName: tool.name, input });
    const event = await until(() => events.find((e) => e.method === 'WebMCP.toolResponded' && e.params.invocationId === invocationId), tool.name);
    assert.equal(event.params.status, expected, JSON.stringify(event.params));
    assert.ok(events.some((e) => e.method === 'WebMCP.toolInvoked' && e.params.invocationId === invocationId), 'native invocation event');
    let output = event.params.output;
    if (typeof output === 'string') { try { output = JSON.parse(output); } catch { /* Return unstructured output unchanged. */ } }
    return { invocationId, status: event.params.status, output };
  };
  return { send, events, evaluate, invoke, socket };
}

const report = { checked_at: new Date().toISOString(), transport: 'Chrome DevTools Protocol WebMCP domain (native)', mocked: false, surfaces: [] };
try {
  let base = value('--url');
  if (!base) {
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain', '.png': 'image/png', '.pdf': 'application/pdf' };
    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
        const filename = resolve(root, extname(relative) ? relative : `${relative}.html`);
        if (!filename.startsWith(root + sep)) { response.writeHead(403).end(); return; }
        response.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream' }).end(await readFile(filename));
      } catch { response.writeHead(404).end('Not found'); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  if (!base.endsWith('/')) base += '/';
  report.base_url = base;
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--enable-experimental-web-platform-features', '--enable-features=WebMCPTesting,DevToolsWebMCPSupport', 'about:blank',
  ], { stdio: 'ignore' });
  let launchError;
  chrome.on('error', (error) => { launchError = error; });
  const port = await until(async () => {
    if (launchError) throw launchError;
    try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { return null; }
  }, 'Chrome startup; pass --chrome /path/to/Chrome if needed');
  const endpoint = `http://127.0.0.1:${port}`;
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  report.browser = version.Browser;
  const protocol = await (await fetch(`${endpoint}/json/protocol`)).json();
  assert.ok(protocol.domains.some((d) => d.domain === 'WebMCP'), 'Chrome must expose native WebMCP; no fallback allowed');
  for (const [route, count, overview] of [
    ['', 15, 'get_document_overview'], ['workspace.html', 18, 'get_document_overview'],
    ['atlas.html', 10, 'atlas_overview'], ['board.html', 11, 'board_overview'],
  ]) {
    const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
    const client = await connect(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('WebMCP.enable');
    const url = new URL(route, base).href;
    await client.send('Page.navigate', { url });
    const registry = () => new Map(client.events.filter((e) => e.method === 'WebMCP.toolsAdded').flatMap((e) => e.params.tools).map((t) => [t.name, t]));
    await until(() => registry().size >= count, `${route || '/'}: ${count} registered tools`);
    const tools = registry();
    assert.equal(tools.size, count);
    for (const tool of tools.values()) {
      assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `${tool.name}: schema exposed ${JSON.stringify(tool)}`);
      const branches = tool.inputSchema.oneOf || [tool.inputSchema];
      for (const branch of branches) assert.equal(branch.additionalProperties, false, `${tool.name}: closed schema`);
      assert.ok(tool.description?.length, `${tool.name}: description`);
    }
    const oriented = await client.invoke(tools.get(overview));
    assert.ok(oriented.output && typeof oriented.output === 'object');
    const result = { url, discovered_tools: tools.size, tools: [...tools.keys()], overview: { name: overview, status: oriented.status } };
    if (!route) {
      const checked = await client.invoke(tools.get('evaluate_claim'), { claim_id: 'c-textbook' });
      assert.equal(checked.output.rule_outcome, 'failed');
      assert.equal(checked.output.outcome_type, 'document_registered_rule');
      const badge = await until(() => client.evaluate('document.querySelector(\'[data-claim="c-textbook"] .le-chip\')?.textContent'), 'visible claim badge');
      assert.match(badge, /rule failed/);
      const ledger = await client.invoke(tools.get('get_audit_log'));
      const claimEntry = ledger.output.entries.findLast((e) => e.tool === 'evaluate_claim');
      assert.equal(claimEntry.actor, 'agent');
      assert.equal(ledger.output.chain.valid, true);
      const before = ledger.output.entries.length;
      await client.invoke(tools.get('evaluate_claim'), { claim_id: 'does-not-exist' }, 'Error');
      const after = await client.invoke(tools.get('get_audit_log'));
      assert.equal(after.output.entries.length, before, 'invalid claim must not mutate ledger');
      result.claim_check = { tool: 'evaluate_claim', input: { claim_id: 'c-textbook' }, status: checked.status, outcome: checked.output.rule_outcome, badge, actor: claimEntry.actor, invalid_input_rejected: true };
      // Only assert the optional v0.2 quick-start mirror when this deployment has it.
      if (await client.evaluate('!!document.getElementById("quickstart")')) {
        await until(() => client.evaluate('document.querySelector("[data-quick-outcome]")?.textContent.includes("Registered rule failed")'), 'quick-start mirrors native call');
        result.quickstart_mirrored_native_call = true;
      }
    }
    report.surfaces.push(result);
    console.log(`PASS ${url}: ${count} native tools; ${overview} completed${!route ? '; claim badge + agent ledger + invalid-input check passed' : ''}`);
    client.socket.close();
    await fetch(`${endpoint}/json/close/${target.id}`);
  }
  report.passed = true;
  if (value('--report')) await writeFile(resolve(value('--report')), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS native WebMCP in ${report.browser}; no polyfill or direct handler invocation.`);
} catch (error) {
  console.error(`FAIL native WebMCP: ${error.stack || error}`);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.close();
  if (chrome && chrome.exitCode === null && chrome.pid) {
    const exited = new Promise((resolve) => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    await Promise.race([exited, pause(3000)]);
    if (chrome.exitCode === null) { chrome.kill('SIGKILL'); await exited; }
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}

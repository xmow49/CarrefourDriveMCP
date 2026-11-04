#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from 'dotenv';
import { createServer } from './server.js';
import { startKeepAlive } from './services/keepalive.service.js';
import { browserService } from './services/browser.service.js';
import { runCli } from './cli.js';
import { logger } from './utils/logger.js';

config();

export { createServer };

/** `--http` or MCP_TRANSPORT=http: serve Streamable HTTP; otherwise stdio. */
function wantsHttp(): boolean {
  return process.argv.includes('--http') || (process.env.MCP_TRANSPORT ?? '').toLowerCase() === 'http';
}

async function main(): Promise<void> {
  const cliCode = await runCli(process.argv.slice(2));
  if (cliCode !== null) process.exit(cliCode);

  if (wantsHttp()) {
    // Imported lazily so the stdio path never loads express.
    const { startHttpServer } = await import('./http/server.js');
    await startHttpServer();
  } else {
    const { server, toolCount } = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[carrefour-drive] MCP server ready — ${toolCount} API tools loaded\n`);
  }

  // Both the SSO and the store sessions die when idle; see keepalive.service.ts.
  startKeepAlive();

  // The browser is a child process; leaving it behind would lock the profile.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      browserService.shutdown().finally(() => process.exit(0));
    });
  }
}

main().catch((error) => {
  logger.error('Failed to start server', { error: String(error) });
  process.stderr.write(`[carrefour-drive] fatal: ${String(error)}\n`);
  process.exit(1);
});

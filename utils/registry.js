/**
 * utils/registry.js
 * Curated list of popular MCP servers + npm keyword search fallback.
 */

export const CURATED = [
  {
    name:        'filesystem',
    package:     '@modelcontextprotocol/server-filesystem',
    description: 'Read, write and navigate local files and directories',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '<path>'],
  },
  {
    name:        'memory',
    package:     '@modelcontextprotocol/server-memory',
    description: 'Persistent key-value memory store for agents',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    name:        'github',
    package:     '@modelcontextprotocol/server-github',
    description: 'Search repos, read files, create issues and PRs on GitHub',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-github'],
    env:         { GITHUB_PERSONAL_ACCESS_TOKEN: 'vault:github-pat' },
  },
  {
    name:        'gitlab',
    package:     '@modelcontextprotocol/server-gitlab',
    description: 'Interact with GitLab repositories, MRs and issues',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-gitlab'],
    env:         { GITLAB_PERSONAL_ACCESS_TOKEN: 'vault:gitlab-pat', GITLAB_API_URL: 'https://gitlab.com/api/v4' },
  },
  {
    name:        'postgres',
    package:     '@modelcontextprotocol/server-postgres',
    description: 'Query and inspect PostgreSQL databases',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-postgres', '<connection-string>'],
  },
  {
    name:        'sqlite',
    package:     '@modelcontextprotocol/server-sqlite',
    description: 'Query and modify SQLite databases',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '<path>'],
  },
  {
    name:        'puppeteer',
    package:     '@modelcontextprotocol/server-puppeteer',
    description: 'Browser automation — navigate, screenshot, scrape pages',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'],
  },
  {
    name:        'brave-search',
    package:     '@modelcontextprotocol/server-brave-search',
    description: 'Web and local search via the Brave Search API',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env:         { BRAVE_API_KEY: 'vault:brave-api-key' },
  },
  {
    name:        'google-maps',
    package:     '@modelcontextprotocol/server-google-maps',
    description: 'Geocoding, directions and place search via Google Maps',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-google-maps'],
    env:         { GOOGLE_MAPS_API_KEY: 'vault:google-maps-api-key' },
  },
  {
    name:        'slack',
    package:     '@modelcontextprotocol/server-slack',
    description: 'Read channels, post messages, search Slack workspaces',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-slack'],
    env:         { SLACK_BOT_TOKEN: 'vault:slack-bot-token', SLACK_TEAM_ID: '' },
  },
  {
    name:        'fetch',
    package:     '@modelcontextprotocol/server-fetch',
    description: 'Fetch any URL and return its content as markdown',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-fetch'],
  },
  {
    name:        'sequential-thinking',
    package:     '@modelcontextprotocol/server-sequential-thinking',
    description: 'Step-by-step reasoning tool for complex problem solving',
    command:     'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  },
  {
    name:        'vektor-slipstream',
    package:     'vektor-slipstream',
    description: 'VEKTOR Slipstream — persistent agent memory & tools',
    command:     'node',
    args:        ['<vektor-path>/vektor.mjs', 'mcp'],
    env:         { VEKTOR_LICENCE_KEY: 'vault:vektor-licence-key' },
  },
  {
    name:        'context7',
    package:     '@upstash/context7-mcp',
    description: 'Up-to-date library docs injected into context',
    command:     'npx', args: ['-y', '@upstash/context7-mcp'],
  },
  {
    name:        'exa',
    package:     'exa-mcp-server',
    description: 'Neural web search via Exa AI',
    command:     'npx', args: ['-y', 'exa-mcp-server'],
    env:         { EXA_API_KEY: 'vault:exa-api-key' },
  },
];

/**
 * Search the curated registry by keyword.
 * @param {string} query
 * @returns {Array} matching entries
 */
export function searchCurated(query) {
  const q = query.toLowerCase();
  return CURATED.filter(s =>
    s.name.includes(q) ||
    s.package.includes(q) ||
    s.description.toLowerCase().includes(q)
  );
}

/**
 * Search npm for packages with the 'mcp' keyword.
 * Falls back gracefully if network is unavailable.
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchNpm(query) {
  try {
    const url = `https://registry.npmjs.org/-/v1/search?text=keywords:mcp+${encodeURIComponent(query)}&size=8`;
    const res = await fetch(url, { headers: { 'User-Agent': 'vek-sync/0.3.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.objects ?? []).map(o => ({
      name:        o.package.name,
      package:     o.package.name,
      description: o.package.description ?? '',
      command:     'npx',
      args:        ['-y', o.package.name],
    }));
  } catch {
    return [];
  }
}

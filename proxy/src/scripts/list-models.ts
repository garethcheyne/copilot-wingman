import 'dotenv/config';
import { pool } from '../db/client.js';
import { decrypt } from '../services/crypto.js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';
const result = await pool.query(`SELECT encrypted_token FROM gh_connections WHERE status = 'active' LIMIT 1`);
const buf = Buffer.isBuffer(result.rows[0].encrypted_token) ? result.rows[0].encrypted_token : Buffer.from(result.rows[0].encrypted_token as string, 'hex');
const githubToken = decrypt(buf, ENCRYPTION_KEY);
const jwtRes = await fetch('https://api.github.com/copilot_internal/v2/token', { headers: { Authorization: `token ${githubToken}`, 'User-Agent': 'GithubCopilot/1.300.0', 'Editor-Version': 'vscode/1.100.0', 'Editor-Plugin-Version': 'copilot-chat/0.28.0', Accept: 'application/json' }});
const jwt = (await jwtRes.json() as any).token;
const modelsRes = await fetch('https://api.githubcopilot.com/models', { headers: { Authorization: `Bearer ${jwt}`, 'User-Agent': 'GithubCopilot/1.300.0', 'Copilot-Integration-Id': 'vscode-chat', Accept: 'application/json' }});
const models = await modelsRes.json() as any;
console.log(JSON.stringify(models.data.map((m: any) => ({ id: m.id, name: m.name, vendor: m.vendor, category: m.model_picker_category, preview: m.preview, endpoints: m.supported_endpoints })), null, 2));
await pool.end();

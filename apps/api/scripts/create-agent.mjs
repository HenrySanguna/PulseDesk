// One-off script to provision an Agent — there is no signup endpoint by
// design (02-add-dual-auth: agents are provisioned, not self-registered).
// Talks to Postgres directly (not through @pulsedesk/db's Prisma client,
// which is generated as raw .ts and isn't runnable standalone by plain
// `node` outside the Nx/webpack build pipeline).
//
// Usage (run from the repo root):
//   DATABASE_URL="<neon-connection-string>" node apps/api/scripts/create-agent.mjs <email> <password> [role]
//
// role defaults to ADMIN (AGENT | SUPERVISOR | ADMIN).

import pg from 'pg';
import * as argon2 from 'argon2';

const [, , email, password, role = 'ADMIN'] = process.argv;

if (!email || !password) {
  console.error('Usage: DATABASE_URL=... node apps/api/scripts/create-agent.mjs <email> <password> [role]');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

const result = await client.query(
  `INSERT INTO "Agent" (id, email, "passwordHash", role, "updatedAt")
   VALUES (gen_random_uuid(), $1, $2, $3, now())
   RETURNING id, email, role`,
  [email, passwordHash, role],
);

console.log('Created agent:', result.rows[0]);

await client.end();

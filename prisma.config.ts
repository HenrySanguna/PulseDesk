import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

type Env = {
  DATABASE_URL: string;
};

// Single Prisma project for the whole workspace, owned by `libs/db`.
// Schema lives under `libs/db/prisma/schema` (prismaSchemaFolder, GA since
// 6.7) so future domain models can be split into sibling `.prisma` files.
export default defineConfig({
  schema: 'libs/db/prisma/schema',
  migrations: {
    path: 'libs/db/prisma/migrations',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
});

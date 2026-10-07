import { neon } from '@neondatabase/serverless';

let client;
let schemaReady;

export function hasSharedDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export async function sharedDb() {
  if (!hasSharedDatabase()) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  if (!schemaReady) {
    schemaReady = (async () => {
      await client`
        CREATE TABLE IF NOT EXISTS sprint_20_reviews (
          id text PRIMARY KEY,
          rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
          name varchar(60) NOT NULL,
          body varchar(1600) NOT NULL,
          tags jsonb NOT NULL DEFAULT '[]'::jsonb,
          next_step varchar(300) NOT NULL DEFAULT '',
          done boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          image_base64 text,
          source_id text UNIQUE,
          delete_token_hash text
        )
      `;
      await client`ALTER TABLE sprint_20_reviews ADD COLUMN IF NOT EXISTS delete_token_hash text`;
    })().catch(error => { schemaReady = null; throw error; });
  }
  await schemaReady;
  return client;
}

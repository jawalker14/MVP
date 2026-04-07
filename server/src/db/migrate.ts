import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  // Migration client — single connection, no pool
  const migrationClient = postgres(connectionString, { max: 1 })
  const db = drizzle(migrationClient)

  console.log('Running migrations...')
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, './migrations'),
  })
  console.log('Migrations complete.')

  await migrationClient.end()
  process.exit(0)
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

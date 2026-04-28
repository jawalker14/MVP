import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

export async function runMigrations(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const isPooler = DATABASE_URL.includes('pooler') || DATABASE_URL.includes('pgbouncer')

  const ssl = isProduction ? 'require' : false
  const prepare = !isPooler

  const migrationClient = postgres(DATABASE_URL, { ssl, prepare, max: 1 })
  const db = drizzle(migrationClient)

  console.log('Running migrations...')
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, './migrations'),
  })
  console.log('Migrations complete.')

  await migrationClient.end()
}

if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch((err) => {
    console.error('Migration failed:', err)
    console.error('DATABASE_URL set:', !!process.env.DATABASE_URL)
    console.error('NODE_ENV:', process.env.NODE_ENV)
    if (err instanceof Error) {
      console.error('Error message:', err.message)
      console.error('Error stack:', err.stack)
    }
    process.exit(1)
  })
}

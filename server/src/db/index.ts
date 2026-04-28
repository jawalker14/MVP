import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const isProduction = process.env.NODE_ENV === 'production'
const isPooler = DATABASE_URL.includes('pooler') || DATABASE_URL.includes('pgbouncer')

const ssl = isProduction ? 'require' : false
const prepare = !isPooler

const queryClient = postgres(DATABASE_URL, {
  ssl,
  prepare,
  max: 10,
  connect_timeout: 10,
  idle_timeout: 20,
})

console.log(`DB pool ready (ssl=${isProduction}, prepare=${prepare})`)

export const db = drizzle(queryClient, { schema })
export type DB = typeof db

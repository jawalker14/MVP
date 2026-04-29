import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
import { flagOverdueForAll } from '../services/overdue'

async function main() {
  const count = await flagOverdueForAll()
  console.log(`[overdue-cron] flipped ${count} invoices to overdue`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[overdue-cron] failed:', err)
  process.exit(1)
})
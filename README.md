# InvoiceKasi

Mobile-first invoicing PWA for South African township and informal economy businesses.

Create an invoice on your phone in under 60 seconds. Send it via WhatsApp with a payment link.

## Stack

- **Client**: React + TypeScript + Vite + Tailwind CSS v4 + PWA
- **Server**: Node.js + Express + TypeScript + Drizzle ORM
- **Database**: PostgreSQL 16
- **Payments**: Yoco (SA-local payment gateway)

## Getting Started

### Prerequisites

- Node.js 20+
- Docker Desktop

### Setup

```bash
# 1. Start the database
docker-compose up -d

# 2. Install dependencies
cd shared && npm install && cd ..
cd server && npm install && cd ..
cd client && npm install && cd ..

# 3. Run migrations
cd server && npm run db:migrate && cd ..

# 4. Start development servers (two terminals)
cd server && npm run dev
cd client && npm run dev
```

Client runs at http://localhost:5173  
API runs at http://localhost:3001

## Project Structure

```
invoicekasi/
├── client/       React + TypeScript PWA
├── server/       Express + TypeScript API
├── shared/       Shared Zod schemas and types
└── docker-compose.yml
```

## Free Tier Limits

- 10 invoices/month
- 5 clients

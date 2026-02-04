# Backend Service (Node.js + Express)

This is the main API service for the application.

## Structure
- `src/controllers`: Request handlers (Input/Output logic)
- `src/services`: Business logic (Database calls, complex operations)
- `src/routes`: API Route definitions
- `src/models`: Database Schemas (Mongoose)
- `src/middleware`: Express middleware
- `src/utils`: Helper functions

## Setup
1. `npm install`
2. Create a `.env` file (see `.env.example`)
3. `npm run dev`

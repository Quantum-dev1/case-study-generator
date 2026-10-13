# Bluefin Dispatch

Dispatch console and driver app for Bluefin Freight. Replaces the spreadsheet-based morning planning
process with route optimisation, live vehicle tracking and automatic customer notifications.

## Components

- `apps/console` — web dispatch console (Next.js, TypeScript). Drag-and-drop route board, live map.
- `apps/driver` — Flutter driver app for Android and iOS. Proof of delivery with photo and signature,
  offline mode for rural routes.
- `services/api` — NestJS API on PostgreSQL with PostGIS for geospatial queries.
- `services/optimizer` — Python service using Google OR-Tools (vehicle routing with time windows).
- `services/notify` — sends customer ETA messages by SMS and email; message text is drafted by an LLM
  from a fixed template and the live ETA, then checked against the template before sending.

## Infrastructure

Docker images deployed to AWS (ECS Fargate, RDS for PostgreSQL). GPS pings arrive every 30 seconds
from the driver app; positions older than 5 minutes are shown as stale on the map.

## Integrations

- Telematics feed from the existing in-cab units (REST, polled every 60 seconds).
- Accounting export as CSV at the end of each day.

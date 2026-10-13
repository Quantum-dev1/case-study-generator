# Fact-check report

- Statements checked: **23**
- Numbers checked: **27**
- Passed: **20**
- Citation corrected: **1**
- Removed: **2**

## Flagged statements

- **REMOVED** (results): Planning is 83% faster than before.
  - number "83%" not found in any source
- **RECITED** (results): On-time delivery rose from 81% to 94%.
  - "81%" found in S11, citation added
- **REMOVED** (results): The empty-mile share fell from 18% to 11%, saving an estimated $210,000 a year in fuel.
  - number "$210,000" not found in any source

## All statements

| Section | Status | Numbers | Sources | Statement |
| --- | --- | --- | --- | --- |
| summary | ok | 3, 64 | S10, S2, S6, S14 | A dispatch console, a driver app and a route optimiser replaced spreadsheet planning and phone-based dispatch across 3 depots and 64 trucks. |
| challenge | ok | 64, 3, 340 | S10 | A regional freight carrier runs 64 trucks from 3 depots and completes about 340 deliveries per day. |
| challenge | ok | 5, 2.5 | S10 | Every morning, 5 dispatchers rebuilt the next day's routes in three shared spreadsheets, a process that took about 2.5 hours and often sent trucks out late. |
| challenge | ok | 81%, 18% | S11 | Late departures cascaded into missed delivery windows: the on-time rate was 81%, and trucks ran empty on 18% of route kilometres. |
| challenge | ok | 120 | S10, S17 | With no visibility for customers, the office fielded around 120 "where is my truck?" calls a day, and dispatchers spent their time on the phone instead of planning. |
| challenge | ok | — | S11 | Paper proof of delivery meant disputes took days to resolve. |
| solution | ok | — | S2, S6, S3 | A web dispatch console with a drag-and-drop route board and a live map of every truck. |
| solution | ok | — | S2, S14, S6, S15 | A route optimiser that respects customer time windows and driver hours and suggests backhauls for return legs, while dispatchers keep the final say. |
| solution | ok | — | S2, S14, S12 | A driver app with photo and signature proof of delivery and an offline mode for rural routes with poor coverage. |
| solution | ok | — | S2 | Automatic ETA messages to customers by SMS and email, with LLM-drafted text checked against a fixed template before sending. |
| solution | ok | 9, 3, 14 | S14, S13 | A pilot at one depot came first: the MVP was live after 9 weeks and all 3 depots after 14 weeks. |
| results | ok | 25, 2.5 | S10, S15 | Morning planning now takes about 25 minutes for the whole fleet, down from about 2.5 hours. |
| results | removed | 83% | — | Planning is 83% faster than before. |
| results | recited | 81%, 94% | S15, S11 | On-time delivery rose from 81% to 94%. |
| results | ok | 120, 30 | S8, S18 | Customer status calls fell from 120 to about 30 per day. |
| results | removed | 18%, 11%, $210,000 | — | The empty-mile share fell from 18% to 11%, saving an estimated $210,000 a year in fuel. |
| results | ok | 61, 64 | S14 | 61 of 64 drivers were using the app within two weeks of the all-depot rollout. |
| stack | ok | — | S2 | Next.js and TypeScript — web dispatch console |
| stack | ok | — | S2 | Flutter — Android and iOS driver app |
| stack | ok | — | S2 | NestJS, PostgreSQL and PostGIS — API and geospatial queries |
| stack | ok | — | S2 | Python and Google OR-Tools — vehicle routing with time windows |
| stack | ok | — | S3, S6 | Docker on AWS ECS Fargate with RDS for PostgreSQL — hosting |
| quote | ok | — | S18 | For the first time in years, my dispatchers go home on time and the phones are quiet. |

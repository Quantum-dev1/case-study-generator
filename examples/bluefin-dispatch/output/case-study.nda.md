# A regional freight carrier cut morning dispatch planning from 2.5 hours to 25 minutes

_Client: a regional freight carrier (name withheld under NDA) · Delivered by Lumen Works_

**A dispatch console, a driver app and a route optimiser replaced spreadsheet planning and phone-based dispatch across 3 depots and 64 trucks.**[^1][^2][^3][^4]

## Challenge

A regional freight carrier runs 64 trucks from 3 depots and completes about 340 deliveries per day.[^1] Every morning, 5 dispatchers rebuilt the next day's routes in three shared spreadsheets, a process that took about 2.5 hours and often sent trucks out late.[^1] Late departures cascaded into missed delivery windows: the on-time rate was 81%, and trucks ran empty on 18% of route kilometres.[^5] With no visibility for customers, the office fielded around 120 "where is my truck?" calls a day, and dispatchers spent their time on the phone instead of planning.[^1][^6] Paper proof of delivery meant disputes took days to resolve.[^5]

## Solution

- A web dispatch console with a drag-and-drop route board and a live map of every truck.[^2][^3][^7]
- A route optimiser that respects customer time windows and driver hours and suggests backhauls for return legs, while dispatchers keep the final say.[^2][^3][^4][^8]
- A driver app with photo and signature proof of delivery and an offline mode for rural routes with poor coverage.[^2][^4][^9]
- Automatic ETA messages to customers by SMS and email, with LLM-drafted text checked against a fixed template before sending.[^2]
- A pilot at one depot came first: the MVP was live after 9 weeks and all 3 depots after 14 weeks.[^4][^10]

## Results

- Morning planning now takes about 25 minutes for the whole fleet, down from about 2.5 hours.[^1][^8]
- On-time delivery rose from 81% to 94%.[^5][^8]
- Customer status calls fell from 120 to about 30 per day.[^11][^12]
- 61 of 64 drivers were using the app within two weeks of the all-depot rollout.[^4]

> “For the first time in years, my dispatchers go home on time and the phones are quiet.”
> — Client executive[^12]

## Stack

- Next.js and TypeScript — web dispatch console[^2]
- Flutter — Android and iOS driver app[^2]
- NestJS, PostgreSQL and PostGIS — API and geospatial queries[^2]
- Python and Google OR-Tools — vehicle routing with time windows[^2]
- Docker on AWS ECS Fargate with RDS for PostgreSQL — hosting[^3][^7]

---

_Every statement is linked to the project material it comes from. Numbers were verified against the sources._

[^1]: **S10** · notes/discovery-notes.md, lines 5–11 — “A regional freight carrier runs 64 trucks from 3 depots and completes about 340 deliveries per day.”
[^2]: **S2** · README.md, lines 6–14 — “`apps/console` — web dispatch console (Next.js, TypeScript). Drag-and-drop route board, live map.”
[^3]: **S6** · history/dispatch-platform.gitlog, lines 1–17 — “2025-04-03 bc7350f feat(console): stop reassignment between trucks”
[^4]: **S14** · notes/launch-retro.md, lines 8–13 — “Pilot at one depot first: drivers gave feedback on the app daily, and 61 of 64 drivers were using it”
[^5]: **S11** · notes/discovery-notes.md, lines 13–18 — “1. Late departures cascade into missed delivery windows (on-time rate 81% last quarter).”
[^6]: **S17** · transcripts/2025-02-11-kickoff-call.vtt, 00:00:04–00:01:13 — “[00:00:27] Dispatch lead: And then the phones start. Customers call to ask where their delivery is, drivers call because a stop changed. We spend the day on the phone instead of planning.”
[^7]: **S3** · README.md, lines 16–19 — “Docker images deployed to AWS (ECS Fargate, RDS for PostgreSQL). GPS pings arrive every 30 seconds”
[^8]: **S15** · notes/launch-retro.md, lines 15–19 — “On-time delivery rate reached 94%.”
[^9]: **S12** · notes/discovery-notes.md, lines 20–24 — “Rural routes have poor coverage, so the driver app has to work offline.”
[^10]: **S13** · notes/launch-retro.md, lines 1–6 — “Route optimiser and customer notifications added in weeks 10–14; all 3 depots live after 14 weeks.”
[^11]: **S8** · metrics/kpis.csv, lines 2–6 — “metric: Customer status calls per day; before: 120; after: 30; unit: calls; measured: Jun 2025 vs Sep 2025”
[^12]: **S18** · transcripts/2025-09-02-results-review.txt, 00:00:05–00:01:30 — “[00:00:52] Dispatch lead: Way down. We counted last week and it was about 30 a day, mostly people changing delivery instructions.”

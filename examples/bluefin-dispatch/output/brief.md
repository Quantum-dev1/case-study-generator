---
project: Bluefin Dispatch: dispatch console and driver app
client: Bluefin Freight
approved: false
---

# Case study brief: Bluefin Dispatch: dispatch console and driver app

> **Review before writing.** Every fact below was extracted from your materials and cites its sources.
> - Untick `[ ]` anything that must not appear in the case study; tick `[x]` to include.
> - Edit wording freely. Keep the `(S1, S2)` source list at the end of the line.
> - Add your own statements as `- [x] Your statement (editor)`; they are cited as editor notes.
> - Facts with a WARNING were unticked automatically: their numbers or quotes were not found in the cited sources.
> - When done, set `approved: true` above (or pass `--approve`) and run `case-study write <this folder>`.

## Challenge

- [x] F1: 5 dispatchers built the next day's routes every morning in three shared spreadsheets. (S10)
- [x] F2: Morning planning took about 2.5 hours, and trucks often left late because routes were not final. (S10)
- [x] F3: Drivers received their stops on a printed sheet; changes during the day went by phone call. (S10)
- [x] F4: Customers had no visibility, and the office took around 120 "where is my truck?" calls per day. (S10)
- [x] F5: Late departures cascaded into missed delivery windows; the on-time rate was 81% in the last quarter before the project. (S11)
- [x] F6: Trucks returned to the depot empty on 18% of route kilometres. (S11)
- [x] F7: Proof of delivery was paper-based, and disputes took days to resolve. (S11)
- [x] F8: Dispatchers spent the day on the phone with customers and drivers instead of planning. (S17)
- [x] F9: Half of the billing disputes were about delivery signatures nobody could find. (S17)

## Solution

- [x] F10: A web dispatch console with a drag-and-drop route board and a live map of all trucks. (S2, S6)
- [x] F11: A driver app for Android and iOS with photo and signature proof of delivery and an offline mode that syncs when the signal returns. (S2, S14)
- [x] F12: A route optimiser that plans vehicle routes within customer time windows and driver hours, while dispatchers can still move stops by hand. (S2, S14)
- [x] F13: The optimiser suggests backhauls for return legs. (S6, S15)
- [x] F14: Customers receive ETA messages by SMS and email; the LLM-drafted text is checked against a fixed template before sending. (S2)
- [x] F15: The driver app sends GPS pings every 30 seconds, and positions older than 5 minutes are shown as stale. (S3)
- [x] F16: The rollout started with a pilot at one depot, where drivers gave feedback on the app daily. (S14)

## Results

- [x] F17: The MVP went live at the first depot after 9 weeks, and all 3 depots were live after 14 weeks. (S13)
- [x] F18: Morning planning is down to about 25 minutes for the whole fleet. (S15)
- [x] F19: The on-time delivery rate reached 94%. (S15)
- [x] F20: The empty-mile share fell to 11%. (S15)
- [x] F21: 61 of 64 drivers were using the app within two weeks of the all-depot rollout. (S14)
- [x] F22: Customer status calls fell from 120 to 30 per day. (S8)
- [ ] F23: Customer status calls fell by 75% after launch. (S8) <!-- WARNING: number "75%" not found in cited sources -->
- [x] F24: The on-time rate went from 81 to 94 percent. (S18)
- [x] F25: Customer calls are down to about 30 a day, mostly about changing delivery instructions. (S18)

## Stack

- [x] F26: Next.js and TypeScript for the web dispatch console. (S2)
- [x] F27: Flutter for the Android and iOS driver app. (S2)
- [x] F28: NestJS API on PostgreSQL with PostGIS for geospatial queries. (S2)
- [x] F29: Python service using Google OR-Tools for vehicle routing with time windows. (S2)
- [x] F30: Docker images on AWS ECS Fargate with RDS for PostgreSQL. (S3, S6)

## Context

- [x] F31: Bluefin runs 64 trucks from 3 depots and completes about 340 deliveries per day. (S10)
- [x] F32: The existing in-cab telematics units had to stay, because their contract runs until 2027. (S12)
- [x] F33: Rural routes have poor coverage, so the driver app had to work offline. (S12)
- [x] F34: Go-live was required before the peak season in October. (S12)
- [x] F35: Repository history: 29 commits between 2025-02-12 and 2025-05-20 by 4 contributors. (S5)
- [x] F36: The telematics vendor's API documentation was incomplete, which cost the team a week. (S16)
- [x] F37: The accounting export is still a manual step and is next on the list. (S18)

## Quotes

- [x] F38: "Every morning we rebuild the same puzzle from scratch in three spreadsheets, and by the time the trucks leave it's already wrong." — Dana Whitfield (S17)
- [x] F39: "For the first time in years, my dispatchers go home on time and the phones are quiet." — Dana Whitfield (S18)
- [ ] F40: "Planning is done before the first coffee now." — Marco Reyes (S18) <!-- WARNING: quote is not verbatim in the cited source -->

## Notes for the writer

<!-- Optional guidance for the writer: audience, angle, what to emphasise. -->

Operations leaders at mid-size logistics companies. Lead with the business outcome; keep it under 400 words.

## Sources

| ID | Location | Excerpt |
| --- | --- | --- |
| S1 | README.md, lines 1–4 | # Bluefin Dispatch Dispatch console and driver app for Bluefin Freight. Replaces the spre… |
| S2 | README.md, lines 6–14 | ## Components - `apps/console` — web dispatch console (Next.js, TypeScript). Drag-and-dro… |
| S3 | README.md, lines 16–19 | ## Infrastructure Docker images deployed to AWS (ECS Fargate, RDS for PostgreSQL). GPS pi… |
| S4 | README.md, lines 21–24 | ## Integrations - Telematics feed from the existing in-cab units (REST, polled every 60 s… |
| S5 | history/dispatch-platform.gitlog (summary), line 1 | Repository history: 29 commits between 2025-02-12 and 2025-05-20 by 4 contributors. |
| S6 | history/dispatch-platform.gitlog, lines 1–17 | 2025-05-20 cfb0b0c release: all depots live 2025-05-15 e1a5e1a fix(driver): signature can… |
| S7 | history/dispatch-platform.gitlog, lines 18–29 | 2025-03-20 5b7897c fix(api): handle missing odometer field in telematics payload 2025-03-… |
| S8 | metrics/kpis.csv, lines 2–6 | metric: Morning route planning time; before: 150; after: 25; unit: minutes; measured: Jun… |
| S9 | notes/discovery-notes.md, lines 1–3 | # Discovery notes — Bluefin Freight Week 1–2 discovery, on site at the main depot. |
| S10 | notes/discovery-notes.md, lines 5–11 | ## How dispatch works today - Bluefin runs 64 trucks from 3 depots and completes about 34… |
| S11 | notes/discovery-notes.md, lines 13–18 | ## Pain points named by the client 1. Late departures cascade into missed delivery window… |
| S12 | notes/discovery-notes.md, lines 20–24 | ## Constraints - Must keep the existing in-cab telematics units (contract runs until 2027… |
| S13 | notes/launch-retro.md, lines 1–6 | # Launch retrospective ## Timeline - Kickoff 11 February 2025. MVP (console + driver app,… |
| S14 | notes/launch-retro.md, lines 8–13 | ## What went well - Pilot at one depot first: drivers gave feedback on the app daily, and… |
| S15 | notes/launch-retro.md, lines 15–19 | ## Numbers after the first full month (September 2025) - Morning planning is down to abou… |
| S16 | notes/launch-retro.md, lines 21–23 | ## What we would do differently - Start the telematics integration earlier; the vendor AP… |
| S17 | transcripts/2025-02-11-kickoff-call.vtt, 00:00:04–00:01:13 | [00:00:04] Priya Nair: Thanks for making the time. Can you walk us through a typical morn… |
| S18 | transcripts/2025-09-02-results-review.txt, 00:00:05–00:01:30 | [00:00:05] Priya Nair: We pulled the numbers for the first full month after rollout. Want… |

# Ofgem PEL fetch log

All times UTC.

## 2026-06-18 — URL discovery

Publication page: https://www.ofgem.gov.uk/publications/boiler-upgrade-scheme-product-eligibility

Confirmed latest file (via HEAD probe):
- URL: https://www.ofgem.gov.uk/sites/default/files/2026-05/BUS-external-PEL.xlsx
- HTTP status: 200
- Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- Last-Modified: Thu, 21 May 2026 09:00:46 GMT
- File size: ~256 KB
- 2026-06-18T10:01:30.693Z dry-run: probe OK — https://www.ofgem.gov.uk/sites/default/files/2026-05/BUS-external-PEL.xlsx HTTP 200 256KB last-modified=Thu, 21 May 2026 09:00:46 GMT
- 2026-06-18T10:03:40.876Z download start: https://www.ofgem.gov.uk/sites/default/files/2026-05/BUS-external-PEL.xlsx → raw/--download/BUS-external-PEL.xlsx
- 2026-06-18T10:03:41.291Z download complete: 256.1 KB saved to raw/--download/BUS-external-PEL.xlsx
- 2026-06-18T10:03:41.293Z wrote _meta.json (snapshot=--download, complete=true, 256.1KB)
- 2026-06-18T10:09:51.813Z download start: https://www.ofgem.gov.uk/sites/default/files/2026-05/BUS-external-PEL.xlsx → raw/2026-06/BUS-external-PEL.xlsx
- 2026-06-18T10:09:52.701Z download complete: 256.1 KB saved to raw/2026-06/BUS-external-PEL.xlsx
- 2026-06-18T10:09:52.703Z wrote _meta.json (snapshot=2026-06, complete=true, 256.1KB)
- 2026-06-18T10:11:02.394Z parse start: snapshot=2026-06, sheets=[Instructions, PEL]
- 2026-06-18T10:11:02.416Z parse complete: snapshot=2026-06 records=4596 active=0 expired=0 duplicates=0 malformed=0 keyLeak=false
- 2026-06-18T10:12:24.611Z parse start: snapshot=2026-06, sheets=[Instructions, PEL]
- 2026-06-18T10:12:24.648Z parse complete: snapshot=2026-06 records=4596 active=4596 expired=0 duplicates=5 malformed=0 keyLeak=false
- 2026-06-18T10:36:38.187Z parse start: snapshot=2026-06, sheets=[Instructions, PEL]
- 2026-06-18T10:36:38.232Z parse complete: snapshot=2026-06 records=4596 listed_no_expiry=2294 active_with_expiry=2145 expiry_imminent=157 expired=0 duplicates=5 malformed=0 keyLeak=false
- 2026-06-18T15:45:25.820Z parse start: snapshot=2026-06, sheets=[Instructions, PEL]
- 2026-06-18T15:45:25.875Z parse complete: snapshot=2026-06 records=4596 listed_no_expiry=2294 active_with_expiry=2145 expiry_imminent=157 expired=0 duplicates=5 malformed=0 keyLeak=false
- 2026-06-18T20:22:27.461Z parse start: snapshot=2026-06, sheets=[Instructions, PEL]
- 2026-06-18T20:22:27.518Z parse complete: snapshot=2026-06 records=4596 listed_no_expiry=2294 active_with_expiry=2145 expiry_imminent=157 expired=0 duplicates=5 malformed=0 keyLeak=false
- 2026-06-18T20:23:10.503Z parse start: snapshot=2026-06, sheets=[Instructions, PEL]
- 2026-06-18T20:23:10.554Z parse complete: snapshot=2026-06 records=4596 listed_no_expiry=2294 active_with_expiry=2145 expiry_imminent=157 expired=0 duplicates=5 malformed=0 keyLeak=false
- 2026-07-07T00:53:40.822Z app build: snapshot=2026-06 → public/data/products-gb.json (4422 items; biomass excluded=174; suffixed variant ids=15; commercial dataset empty by policy). Validations: fieldCount=92 PASS, provenance PASS, source_id unique PASS, no price keys PASS.
- 2026-07-07 match: PEL 2026-06 ↔ BAFA seed 2026-07 → matching/2026-06/pel-bafa-matches.json (matched=584: exact=419, token_subsequence=165; ambiguous rejected=45; brand overlap 42/137). Rebuilt app datasets with BAFA_REFERENCE overlay: products-gb.json=4369, products-commercial-gb.json=53 (capacity-segmented), enriched=584, fieldCount=96, all validations PASS.
- 2026-07-07 eprel match: PEL 2026-06 ↔ EPREL 2026-07 (45,623 regs) → matching/2026-06/pel-eprel-matches.json (matched=1428: exact=801, token_subsequence=627; ambiguous rejected=98). Rebuilt app datasets v1.2: eprel_linked=1428, performance_source EPREL=1093, BAFA_REFERENCE=584 (precedence), total perf coverage 1677/4422 (38%), fieldCount=99, all validations PASS.
- 2026-07-12 union build v2.0: GB catalogue = PEL 4,422 (listed_in_snapshot → "On Ofgem PEL") + European reference 6,664 (DE-derived, not_in_latest_snapshot → "Not on PEL"; 508 PEL-matched bafa_ids excluded to avoid duplicate hardware) = 11,086 items (residential 9,088 / commercial 1,998). Perf coverage 7,248 (65%), EPREL links 3,032. All validations PASS (99 fields, shape parity across both record classes).
- 2026-07-29T23:50:32.149Z download start: https://www.ofgem.gov.uk/sites/default/files/2026-05/BUS-external-PEL.xlsx → raw/2026-07/BUS-external-PEL.xlsx
- 2026-07-29T23:50:32.257Z download complete: 257.1 KB saved to raw/2026-07/BUS-external-PEL.xlsx
- 2026-07-29T23:50:32.258Z wrote _meta.json (snapshot=2026-07, complete=true, 257.1KB)
- 2026-07-30T00:00:32.775Z parse start: snapshot=2026-07, sheets=[Instructions, PEL]
- 2026-07-30T00:00:32.837Z parse complete: snapshot=2026-07 records=4683 listed_no_expiry=2165 active_with_expiry=2355 expiry_imminent=160 expired=3 duplicates=5 malformed=0 keyLeak=false
- 2026-09-01T08:45:20.624Z download start: https://www.ofgem.gov.uk/sites/default/files/2026-05/BUS-external-PEL.xlsx → raw/2026-09/BUS-external-PEL.xlsx
- 2026-09-01T08:45:20.751Z download complete: 251.1 KB saved to raw/2026-09/BUS-external-PEL.xlsx
- 2026-09-01T08:45:20.751Z wrote _meta.json (snapshot=2026-09, complete=true, 251.1KB)
- 2026-09-01T08:55:21.248Z parse start: snapshot=2026-09, sheets=[Instructions, PEL]
- 2026-09-01T08:55:21.313Z parse complete: snapshot=2026-09 records=4547 listed_no_expiry=2173 active_with_expiry=2361 expiry_imminent=13 expired=0 duplicates=5 malformed=0 keyLeak=false

# BAFA fetch log

All times UTC. Source: BAFA Wärmepumpen Database (Bundesamt für Wirtschaft und Ausfuhrkontrolle).
API endpoint: https://elan1.bafa.bund.de/zvi-api/wep/waermepumpen

## Fetch mode

The BAFA API requires active-funding date filters to return results:
  foerderungAb=le="<today>";foerderungBis=ge="<today>";einzelabnahme==false;pumpentyp==LUFT_WASSER

Confirmed 2026-06-19: removing date filters returns HTTP 400 "Eine Suche mit diesen
Filterkriterien ist nicht möglich". foerderungAb/foerderungBis are filter-only parameters
and are NOT returned in API response items.

Implication: snapshots represent "active listing at time of fetch" only. Absence from a
later snapshot is a candidate for delisting but cannot be confirmed as such with certainty.
Use safe wording: "missing_from_latest_snapshot" / "delisted_candidate".

## 2026-03-19 — Bootstrap snapshot (migrated from scraper/bafa-luft-wasser.json)

Original extraction: 2026-03-19T12:07:14.787Z
Records: 6,514
Format: pre-Phase-2 cleaned (English field names from bafa-scraper.cjs cleanItem())
Migrated to: data_sources/bafa/raw/2026-03/ (gitignored)
Migration date: 2026-06-19
Note: foerderungAb/foerderungBis null in this snapshot (API does not return these fields)

## API scope investigation (2026-06-19)

- Active-filter mode (foerderungAb/Bis + pumpentyp==LUFT_WASSER): HTTP 200, total=6887
- Unfiltered mode (pumpentyp==LUFT_WASSER only): HTTP 400 (filters are mandatory)
- foerderungAb/foerderungBis in API response items: NOT present (filter params only)
- All raw API field names confirmed: abtauungArt, abtauungGeprueft, anlagennummer,
  antriebsart, anzahlVerdichter, artEeAnzeige, artikelnummer, copBeiA10W35,
  copBeiA2W35B0W35W10W35, copBeiA7W35, copBeiAMinus7W35, eeAnzeige, effizienzKuehlen,
  einzelabnahme, etas35C, etas55C, geraetebezeichnung, gtinEan, heizleistungPdesignh35C,
  heizleistungPdesignh55C, heizleistungPrated35C, heizleistungPrated55C, kaeltemittel1,
  kaeltemittel2, kaeltemittel3, kaeltemittel4, kuehlleistung, leistungsregelungArt,
  markeHersteller, maxElektrischeLeistungsaufnahme, mengeKaeltemittel1, mengeKaeltemittel2,
  mengeKaeltemittel3, mengeKaeltemittel4, netzdienlichkeit, netzdienlichkeitArt,
  pumpentyp, schallemissionAussen, schallemissionInnen, scop, seer, temperaturdifferenz,
  uuid, waermemengenzaehler, waermequelle, webseite
- 2026-06-19T05:16:24.058Z dry-run: probe OK — snapshot=2026-06 filter="foerderungAb=le="2026-06-19";foerderungBis=ge="2026-06-19";einzelabnahme==false;pumpentyp==LUFT_WASSER" total=6887
- 2026-06-19T05:16:26.210Z parse start: snapshot=2026-03 format=pre-phase2-cleaned raw_items=6514
- 2026-06-19T05:16:26.358Z parse complete: snapshot=2026-03 records=6514 malformed=0 duplicates=0 missing_hash=0 manufacturers=199
- 2026-06-19T05:16:33.715Z fetch start: snapshot=2026-06 filter="foerderungAb=le="2026-06-19";foerderungBis=ge="2026-06-19";e..." total=6887 pages=69
- 2026-06-19T05:17:14.733Z fetch complete: snapshot=2026-06 records=6887 total_available=6887 time=41s size=10463.7KB
- 2026-06-19T05:17:21.336Z parse start: snapshot=2026-06 format=raw_api raw_items=6887
- 2026-06-19T05:17:21.482Z parse complete: snapshot=2026-06 records=6887 malformed=0 duplicates=0 missing_hash=0 manufacturers=227
- 2026-06-19T05:17:28.423Z diff start: from=2026-03 (6514) to=2026-06 (6887)
- 2026-06-19T05:17:28.440Z diff complete: from=2026-03 to=2026-06 still_listed=6238 changed_specs=786 newly_listed=649 missing_from_latest=276
- 2026-06-19T05:32:57.842Z dry-run: probe OK — snapshot=2026-06 filter="foerderungAb=le="2026-06-19";foerderungBis=ge="2026-06-19";einzelabnahme==false;pumpentyp==LUFT_WASSER" total=6887
- 2026-06-19T05:33:03.435Z parse start: snapshot=2026-03 format=pre-phase2-cleaned raw_items=6514
- 2026-06-19T05:33:03.655Z parse complete: snapshot=2026-03 records=6514 malformed=0 duplicates=0 missing_hash=0 manufacturers=199
- 2026-06-19T05:33:03.811Z parse start: snapshot=2026-06 format=raw_api raw_items=6887
- 2026-06-19T05:33:03.939Z parse complete: snapshot=2026-06 records=6887 malformed=0 duplicates=0 missing_hash=0 manufacturers=227
- 2026-06-19T05:33:06.278Z diff start: from=2026-03 (6514) to=2026-06 (6887)
- 2026-06-19T05:33:06.334Z diff complete: from=2026-03 to=2026-06 still_listed=6238 changed_specs=786 newly_listed=649 missing_from_latest=276

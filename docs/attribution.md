# Source attribution and project assets

| Source or asset | Use in HydroGrid | Attribution and terms |
| --- | --- | --- |
| OpenStreetMap | Bounded and dated central Bengaluru roads and landmarks. HydroGrid derives graph connectivity from the extract. The public exercise uses separate fictional roads and sites. | © OpenStreetMap contributors. The extract and derived geographic database are offered under ODbL 1.0. [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) · [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/) · [Extract bounds, JSON and reproduction](../frontend/public/geography/README.md) |
| Open-Meteo | Current weather model values for central Bengaluru, shown with source time. These are gridded estimates. | Weather data by Open-Meteo, CC BY 4.0. The free API terms limit use and rate. [Service terms](https://open-meteo.com/en/terms) · [Data license](https://creativecommons.org/licenses/by/4.0/) |
| National Disaster Management Authority | SACHET Karnataka RSS bulletins. The app shows their original issue and expiry information when supplied. | The issuing agencies remain the authority for notice validity and instructions. [Official NDMA SACHET feeds](https://sachet.ndma.gov.in/CapFeed) |
| Bengaluru Traffic Police via India Urban Data Exchange | Enrolled access to the traffic connector. Credentialed resource queries display source time and staleness. The OpenStreetMap route calculation runs independently. | Query access under IUDX terms. Review provider conditions before any redistribution. [IUDX Resource APIs](https://docs.iudx.org.in/docs/consumer/consumer_data_access_apis/) · [HydroGrid access and recency scope](operations.md) |
| Libraries | React, Leaflet, Recharts, Lucide, Spring and other dependencies run the application. | Dependencies retain their respective licenses. Inspect resolved versions in [frontend lockfile](../frontend/package-lock.json), [browser test lockfile](../e2e/package-lock.json), and [Maven build](../backend/pom.xml). |
| HydroGrid visuals | The landing image is an original generated illustration. Gallery images are actual captures of the application and exercise. | [Landing illustration](../frontend/public/hydrogrid-aerial.webp) · [Application captures](showcase.md) |

## Creator and repository copyright

Manu Bharadwaj created and developed HydroGrid. Copyright © 2026 Manu Bharadwaj. All rights reserved in the original project materials he owns. The creator supplied the README portrait. Third-party software and data remain governed by their respective licenses and provider terms. [Project copyright notice](../COPYRIGHT.md) · [Creator profile](https://github.com/Manu577228)

## Acknowledgments

Thanks to OpenStreetMap contributors, the public data providers, and the maintainers of the dependencies listed in the build manifests. Codex supported analysis, implementation, verification and documentation. Manu Bharadwaj made the project decisions and is responsible for the submission. [Codex evidence index](judging.md)

# Bengaluru streets

The road geometry and landmark data are © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) and distributed under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

`bengaluru-v1.json` was built from a [bounded OpenStreetMap API 0.6 extract](https://api.openstreetmap.org/api/0.6/map?bbox=77.589,12.965,77.614,12.985) captured on 2026-11-26 at 19:44 UTC. It covers central Bengaluru from 12.965° to 12.985° N and 77.589° to 77.614° E. The downloadable JSON contains the road geometry, landmark locations and routing graph used by the preview.

The road preview uses mapped geometry, public motorcar access, one-way streets and resolved turn restrictions. Landmark coordinates use mapped entrances or locations, or the mean of vertices around a mapped site. The route starts and ends at nearby connected road vertices. Coverage is bounded and based on the capture date. The preview has no live traffic, road closure, water depth or emergency clearance data.

To regenerate the extract from the repository root, download the bounded XML once with a contactable user agent under the [OpenStreetMap API usage policy](https://operations.osmfoundation.org/policies/api/), record the capture time in UTC, and run the generator using the downloaded file and that timestamp.

```sh
curl --fail --user-agent 'HydroGrid/1.0 (+https://github.com/Manu577228/HydroGrid)' \
  --output bengaluru.osm 'https://api.openstreetmap.org/api/0.6/map?bbox=77.589,12.965,77.614,12.985'
python3 deploy/build-street-network.py bengaluru.osm --captured-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

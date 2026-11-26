# HydroGrid dispatch benchmark

100 synthetic reports, 15 units, 40% flood intensity, and 30% network disruption. The replay horizon is 120 minutes.

| Seed | Strategy | Offline reports | Average response (min) | Critical served | Fleet utilization | Unserved |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 42 | FIFO | 27 | 32.03 | 10/10 | 88.94% | 12 |
| 42 | HydroGrid | 27 | 29.27 | 10/10 | 85.72% | 11 |
| 1337 | FIFO | 31 | 33.72 | 13/14 | 90.33% | 13 |
| 1337 | HydroGrid | 31 | 34.16 | 14/14 | 91.06% | 12 |
| 7 | FIFO | 25 | 30.24 | 15/15 | 87.94% | 7 |
| 7 | HydroGrid | 25 | 28.21 | 15/15 | 86.61% | 11 |

The Docker release generated these results. Seed 1337 serves one additional critical incident with a slightly higher mean response time. Seed 7 has a lower mean response time and four more unserved incidents. The response metric excludes unserved reports, so read the columns together.

Reproduce both strategies on all three seeds with `node deploy/benchmark.mjs` from the repository root while HydroGrid is running.

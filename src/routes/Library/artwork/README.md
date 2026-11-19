# Category artwork

Two original generated artwork sets: `playful` (tactile humorous characters) and
`serious` (editorial record-sleeve still lifes). The user can choose either set;
the preference is stored per account on the current browser. Playful is default.

Each WebP file is a 1536 × 1024 atlas of six square cells, three columns by two
rows. `../views/categoryArtwork.ts` maps the 22 styles, seven collections and one
custom fallback to the cells. The browser positions the full image behind a
clipped square, keeping the generated pixels intact. Category names/captions
remain live accessible text. Factual filter dimensions retain functional icons.

Art was generated with the built-in image tool, using the approved serious and
playful six-card concept sheets as style references. Production prompts and
original PNGs are retained in the owner's OneDrive project. Delivery copies are
WebP quality88/method6 encodings at the original dimensions, about5 MB total;
there is no external image service or runtime AI call. Only the active theme's
visible card images are used; the files receive normal build asset hashes.

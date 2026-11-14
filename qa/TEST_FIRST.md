# Executed test-first slices

1. Wrote src/domain.test.ts; attempted npm test -- src/domain.test.ts. Failed because Vitest was not installed. This was an environment failure, not a behavior result.
2. Wrote tests/domain.test.mjs importing the not-yet-created domain module; executed node --test tests/domain.test.mjs. Failed with ERR_MODULE_NOT_FOUND. Implemented domain.mjs; reran: 7 passed.
3. Wrote tests/server.test.mjs importing the not-yet-created local server; executed it. Failed with ERR_MODULE_NOT_FOUND. Implemented local-server.mjs; reran: 1 passed.
4. Added tests/data.test.mjs with a missing decodeTerrain export. Red run saved in test-data-red.txt. Implemented decodeTerrain. Full run exposed a collinear-polygon assertion failure (13 passed / 1 failed). Added planar-degeneracy validation. Full run: 14 passed.

This establishes test-first domain and runtime slices, not a fully test-first browser UI. Browser interaction tests were prepared after UI implementation and could not be executed. No painted or real interaction results are claimed.

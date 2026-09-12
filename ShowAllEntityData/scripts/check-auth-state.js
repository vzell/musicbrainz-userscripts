// Reports whether the saved Playwright MusicBrainz session is usable.
const { inspectAuthState } = require('../tests/support/authState.js');
const r = inspectAuthState();
console.log(JSON.stringify(r, null, 2));

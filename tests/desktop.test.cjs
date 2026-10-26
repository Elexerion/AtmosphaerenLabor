const {test} = require('node:test');
const assert = require('node:assert/strict');
const {profileURL, soundingResponse} = require('../desktop/sounding.cjs');
const params = (s='10035', d='2026-10-26', h='00') => new URLSearchParams({station:s,date:d,hour:h});
test('only the selected station and real UTC dates can be requested', () => {
  assert.match(profileURL(params()), /data\/10035\/2026-10-26\/00.json$/);
  for (const args of [['10184'],['10035','2026-02-30'],['10035','../main'],['10035','2026-10-26','06']]) assert.throws(() => profileURL(params(...args)));
});
test('offline, TLS errors and missing measurements produce errors', async () => {
  const missing = await soundingResponse(params(), async()=>new Response('',{status:404}));
  assert.equal(missing.status,404);
  for (const message of ['offline','certificate invalid']) {
    const response=await soundingResponse(params(), async()=>{throw Error(message)});
    assert.equal(response.status,502); assert.match(await response.text(), new RegExp(message));
  }
});
test('a successful JSON response is forwarded with its content type', async()=>{
  const response=await soundingResponse(params(),async()=>new Response('{"levels":[]}'));
  assert.equal(response.status,200); assert.match(response.headers.get('content-type'),/json/);
});

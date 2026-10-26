const DATA_BASE = 'https://raw.githubusercontent.com/Elexerion/AtmosphaerenLabor/data/';

function profileURL(params) {
  const station = params.get('station'), date = params.get('date'), hour = params.get('hour');
  if (station !== '10035') throw Error('Automatischer DWD-Abruf ist zunächst für Schleswig (10035) verfügbar. Andere Stationen bitte per CSV importieren.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !['00', '12'].includes(hour) ||
      new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw Error('Ungültiger UTC-Meldetermin.');
  return DATA_BASE + station + '/' + date + '/' + hour + '.json';
}

async function soundingResponse(params, fetcher = fetch) {
  try {
    const upstream = await fetcher(profileURL(params), {signal: AbortSignal.timeout(30000), redirect: 'error'});
    if (upstream.status === 404) return new Response('Für diesen Meldetermin ist kein geprüftes DWD-Profil veröffentlicht. Bitte einen anderen Termin wählen oder CSV importieren.', {status: 404});
    if (!upstream.ok) throw Error('Datenquelle HTTP ' + upstream.status);
    const body = await upstream.text();
    if (body.length > 4 * 1024 * 1024) throw Error('Messdatei zu groß.');
    return new Response(body, {headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
  } catch (error) {
    return new Response('DWD-Abruf fehlgeschlagen: ' + error.message, {status: 502});
  }
}
module.exports = {profileURL, soundingResponse};

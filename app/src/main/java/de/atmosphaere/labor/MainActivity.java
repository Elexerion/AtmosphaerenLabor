package de.atmosphaere.labor;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.net.Uri;
import android.content.Intent;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String DATA = "https://raw.githubusercontent.com/Elexerion/AtmosphaerenLabor/data/";
    private WebView web;
    private ValueCallback<Uri[]> chooser;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                try { startActivityForResult(params.createIntent(), 1); return true; }
                catch (Exception error) { chooser = null; callback.onReceiveValue(null); return false; }
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
                if ("https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost())) return null;
                try {
                    if (!"https".equals(uri.getScheme()) || !"GET".equals(request.getMethod())) return text(403, "Nicht erlaubt");
                    if ("/index.html".equals(uri.getPath())) return new WebResourceResponse("text/html", "UTF-8", getAssets().open("index.html"));
                    if ("/api/sounding".equals(uri.getPath())) return sounding(uri);
                    return text(404, "Nicht gefunden");
                } catch (Exception error) {
                    return text(502, "DWD-Abruf fehlgeschlagen: " + error.getMessage() + ". Internetverbindung und Zertifikate prüfen; CSV-Import bleibt verfügbar.");
                }
            }
        });
        web.loadUrl("https://" + HOST + "/index.html");
    }

    private WebResourceResponse sounding(Uri uri) throws IOException {
        String station = uri.getQueryParameter("station"), date = uri.getQueryParameter("date"), hour = uri.getQueryParameter("hour");
        if (!"10035".equals(station)) return text(400, "Automatischer DWD-Abruf ist zunächst für Schleswig (10035) verfügbar. Andere Stationen bitte per CSV importieren.");
        if (date == null || !date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") || !("00".equals(hour) || "12".equals(hour))) return text(400, "Ungültiger UTC-Meldetermin");
        try { LocalDate.parse(date); } catch (Exception error) { return text(400, "Ungültiges Datum"); }
        HttpURLConnection connection = (HttpURLConnection) new URL(DATA + station + "/" + date + "/" + hour + ".json").openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(25000);
        connection.setInstanceFollowRedirects(false);
        try {
            int status = connection.getResponseCode();
            if (status == 404) return text(404, "Für diesen Meldetermin ist kein geprüftes DWD-Profil veröffentlicht. Bitte anderen Termin wählen oder CSV importieren.");
            if (status != 200) return text(502, "Datenquelle HTTP " + status);
            try (InputStream stream = connection.getInputStream(); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192];
                int count;
                while ((count = stream.read(chunk)) != -1) {
                    if (buffer.size() + count > 4 * 1024 * 1024) return text(502, "Messdatei zu groß");
                    buffer.write(chunk, 0, count);
                }
                return new WebResourceResponse("application/json", "UTF-8", 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(buffer.toByteArray()));
            }
        } finally { connection.disconnect(); }
    }

    private WebResourceResponse text(int status, String message) {
        return new WebResourceResponse("text/plain", "UTF-8", status, "Request failed", Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 1 && chooser != null) { chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); chooser = null; }
    }
    @Override protected void onDestroy() {
        if (chooser != null) { chooser.onReceiveValue(null); chooser = null; }
        web.destroy();
        super.onDestroy();
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}

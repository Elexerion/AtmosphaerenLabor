package de.atmosphaere.labor;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 private static final String ORIGIN="https://appassets.androidplatform.net";
 private WebView web;
 private ValueCallback<Uri[]> fileCallback;
 private static final int FILE_REQUEST=401;
 private final Map<String,byte[]> cache=new ConcurrentHashMap<>();
 @Override public void onCreate(Bundle state){super.onCreate(state);
  web=new WebView(this);web.setBackgroundColor(Color.rgb(11,18,32));setContentView(web);
  web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
  web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(true);
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){
    if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=cb;
    try {startActivityForResult(params.createIntent(),FILE_REQUEST);return true;}
    catch(Exception e){fileCallback=null;cb.onReceiveValue(null);return false;}
   }
  });
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
    Uri u=req.getUrl();if(!"appassets.androidplatform.net".equals(u.getHost()))return null;
    String path=u.getPath();
    if("/api/sounding".equals(path))return sounding(u);
    if("/index.html".equals(path)||"/".equals(path)){
     try {return response(200,"text/html",getAssets().open("index.html"));}
     catch(Exception e){return error(404,"HTML nicht gefunden");}
    }
    return error(404,"Unbekannter Pfad");
   }
  });
  web.loadUrl(ORIGIN+"/index.html");
 }
 private WebResourceResponse response(int status,String mime,InputStream stream){
  WebResourceResponse r=new WebResourceResponse(mime,"UTF-8",stream);
  r.setStatusCodeAndReasonPhrase(status,status==200?"OK":"Bad Gateway");
  r.setResponseHeaders(Collections.singletonMap("Cache-Control","no-store"));return r;
 }
 private WebResourceResponse error(int status,String msg){return response(status,"text/plain",new ByteArrayInputStream(msg.getBytes(StandardCharsets.UTF_8)));}
 private WebResourceResponse sounding(Uri uri){
  String station=uri.getQueryParameter("station"),day=uri.getQueryParameter("date"),hour=uri.getQueryParameter("hour");
  if(station==null||!station.matches("[0-9]{5}")||hour==null||!(hour.equals("00")||hour.equals("12")))return error(502,"Ungültige Station oder UTC-Stunde");
  try{if(day==null||!day.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")||LocalDate.parse(day).isAfter(LocalDate.now(java.time.ZoneOffset.UTC)))return error(502,"Ungültiges Messdatum");}
  catch(Exception e){return error(502,"Ungültiges Messdatum");}
  String key=station+":"+day+":"+hour;
  try{
   byte[] data=cache.get(key);
   if(data==null){
    String qs="datetime="+URLEncoder.encode(day+" "+hour+":00:00","UTF-8")+"&id="+station+"&type="+URLEncoder.encode("TEXT:CSV","UTF-8");
    URL url=new URL("https://weather.uwyo.edu/wsgi/sounding?"+qs);
    HttpURLConnection con=(HttpURLConnection)url.openConnection();con.setConnectTimeout(12000);con.setReadTimeout(25000);
    con.setRequestProperty("User-Agent","AtmosphaerenLaborAndroid/1.0 (educational)");
    con.setRequestProperty("Accept","text/csv,text/plain,text/html");
    int status=con.getResponseCode();if(status!=200){con.disconnect();return error(502,"Wyoming HTTP "+status+"; Messung eventuell nicht verfügbar");}
    try(InputStream in=con.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
     byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){out.write(buf,0,n);if(out.size()>3000000)throw new IOException("Antwort zu groß");}data=out.toByteArray();
    }finally{con.disconnect();}
    if(data.length<20)return error(502,"Keine Messdaten empfangen");
    cache.put(key,data);
   }
   return response(200,"text/plain",new ByteArrayInputStream(data));
  }catch(Exception e){return error(502,"Netzwerk- oder Quellenfehler: "+e.getClass().getSimpleName()+" – "+e.getMessage());}
 }
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
  if(request==FILE_REQUEST&&fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}
 }
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){web.destroy();super.onDestroy();}
}

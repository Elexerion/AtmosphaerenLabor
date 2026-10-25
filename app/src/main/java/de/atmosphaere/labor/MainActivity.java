package de.atmosphaere.labor;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.net.Uri;
import android.content.Intent;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
public class MainActivity extends Activity {
 WebView web; ValueCallback<Uri[]> chooser;
 @Override public void onCreate(Bundle b){super.onCreate(b);web=new WebView(this);setContentView(web);
 web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
 web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams p){chooser=cb;try{startActivityForResult(p.createIntent(),1);return true;}catch(Exception e){chooser=null;cb.onReceiveValue(null);return false;}}});
 web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){Uri u=r.getUrl();if("appassets.androidplatform.net".equals(u.getHost()))return false;if("https".equals(u.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}return true;}return true;}@Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){
 Uri u=r.getUrl();if(!"appassets.androidplatform.net".equals(u.getHost()))return null;
 try{if(u.getPath().equals("/index.html"))return new WebResourceResponse("text/html","UTF-8",getAssets().open("index.html"));
 if(u.getPath().equals("/api/sounding")){String station=u.getQueryParameter("station"),date=u.getQueryParameter("date"),hour=u.getQueryParameter("hour");
 if(station==null||!station.matches("[0-9]{5}")||date==null||!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")||hour==null||!(hour.equals("00")||hour.equals("12")))return fail("Ungültige Parameter");
 String q="datetime="+URLEncoder.encode(date+" "+hour+":00:00","UTF-8")+"&id="+station+"&type="+URLEncoder.encode("TEXT:CSV","UTF-8");
 HttpURLConnection c=(HttpURLConnection)new URL("https://weather.uwyo.edu/wsgi/sounding?"+q).openConnection();c.setConnectTimeout(12000);c.setReadTimeout(25000);
 try{return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(c.getInputStream().readAllBytes()));}finally{c.disconnect();}}
 }catch(Exception e){return fail("Fehler: "+e.getMessage());}return fail("Nicht gefunden");
 }});
 web.loadUrl("https://appassets.androidplatform.net/index.html");}
 private WebResourceResponse fail(String s){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8)));}
 @Override protected void onActivityResult(int req,int res,Intent data){super.onActivityResult(req,res,data);if(req==1&&chooser!=null){chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res,data));chooser=null;}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}

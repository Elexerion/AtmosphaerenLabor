package de.atmosphaere.labor;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.net.Uri;
import android.content.Intent;
import android.app.DownloadManager;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.database.Cursor;
import android.os.Environment;
import android.widget.Toast;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
public class MainActivity extends Activity {
 WebView web; ValueCallback<Uri[]> chooser;
 long downloadId=-1;
 final BroadcastReceiver downloadReceiver=new BroadcastReceiver(){@Override public void onReceive(Context context,Intent intent){long id=intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1);if(id!=downloadId)return;DownloadManager dm=(DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE);DownloadManager.Query q=new DownloadManager.Query().setFilterById(id);try(Cursor c=dm.query(q)){if(c!=null&&c.moveToFirst()){int status=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));if(status==DownloadManager.STATUS_SUCCESSFUL){Toast.makeText(MainActivity.this,"Radiosonde heruntergeladen: Downloads öffnen und CSV importieren",Toast.LENGTH_LONG).show();}else if(status==DownloadManager.STATUS_FAILED){int reason=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));Toast.makeText(MainActivity.this,"Radiosonden-Download fehlgeschlagen (Android-Code "+reason+"). Bitte CSV über Chrome laden.",Toast.LENGTH_LONG).show();}}}catch(Exception e){Toast.makeText(MainActivity.this,"Downloadstatus nicht lesbar: "+e.getMessage(),Toast.LENGTH_LONG).show();}}};
 @Override public void onCreate(Bundle b){super.onCreate(b);web=new WebView(this);setContentView(web);registerReceiver(downloadReceiver,new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),Context.RECEIVER_NOT_EXPORTED);
 web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
 web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams p){chooser=cb;try{startActivityForResult(p.createIntent(),1);return true;}catch(Exception e){chooser=null;cb.onReceiveValue(null);return false;}}});
 web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){Uri u=r.getUrl();if("appassets.androidplatform.net".equals(u.getHost()))return false;if("https".equals(u.getScheme())){if("weather.uwyo.edu".equals(u.getHost())&&"/wsgi/sounding".equals(u.getPath())){try{String station=u.getQueryParameter("id"),date=u.getQueryParameter("datetime");if(station==null||!station.matches("[0-9]{5}")||date==null)throw new IllegalArgumentException("Ungültige Messdatenadresse");String filename="Radiosonde_"+station+"_"+date.replaceAll("[^0-9]","")+".csv";DownloadManager.Request download=new DownloadManager.Request(u);download.setTitle(filename);download.setMimeType("text/csv");download.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);download.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,filename);downloadId=((DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(download);Toast.makeText(MainActivity.this,"Download beauftragt – Ergebnis wird geprüft",Toast.LENGTH_LONG).show();}catch(Exception e){Toast.makeText(MainActivity.this,"Download konnte nicht gestartet werden: "+e.getMessage(),Toast.LENGTH_LONG).show();}return true;}try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}return true;}return true;}@Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){
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
 @Override protected void onDestroy(){unregisterReceiver(downloadReceiver);super.onDestroy();}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}

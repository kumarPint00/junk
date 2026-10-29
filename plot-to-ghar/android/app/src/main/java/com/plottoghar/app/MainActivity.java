package com.plottoghar.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_CHOOSER = 501;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " PlotToGharAndroid/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req){
                Uri u=req.getUrl();
                String allowed=Uri.parse(BuildConfig.APP_URL).getHost();
                if("https".equals(u.getScheme()) && allowed!=null && allowed.equalsIgnoreCase(u.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW,u)); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams params){
                if(fileCallback!=null) fileCallback.onReceiveValue(null); fileCallback=cb;
                Intent i=params.createIntent();
                try{ startActivityForResult(i,FILE_CHOOSER); }catch(ActivityNotFoundException e){ fileCallback=null; Toast.makeText(MainActivity.this,"No file picker found",Toast.LENGTH_SHORT).show(); return false; }
                return true;
            }
        });
        web.setDownloadListener((url,userAgent,contentDisposition,mimetype,contentLength)-> startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url))));
        web.loadUrl(BuildConfig.APP_URL);
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==FILE_CHOOSER && fileCallback!=null){ fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data)); fileCallback=null; }
    }
    @Override public void onBackPressed(){ if(web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}

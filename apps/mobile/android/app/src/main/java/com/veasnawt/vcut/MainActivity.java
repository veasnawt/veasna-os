package com.veasnawt.vcut;

import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.view.View;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setOnExitAnimationListener(provider ->
            provider.getView().animate().alpha(0f).setDuration(180).withEndAction(provider::remove).start()
        );
        registerPlugin(FfmpegPlugin.class);
        registerPlugin(AuthCallbackPlugin.class);
        registerPlugin(MicPermissionPlugin.class);
        super.onCreate(savedInstanceState);

        // Keep Capacitor's safe native margins, but paint the exposed inset area like the app.
        int background = Color.rgb(10, 12, 16);
        getWindow().getDecorView().setBackgroundColor(background);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
        if (getBridge() != null) {
            View webView = getBridge().getWebView();
            webView.setBackgroundColor(background);
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            if (webView.getParent() instanceof View) {
                ((View) webView.getParent()).setBackgroundColor(background);
            }
        }
    }
}

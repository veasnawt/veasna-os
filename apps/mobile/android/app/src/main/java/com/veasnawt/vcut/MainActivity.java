package com.veasnawt.vcut;

import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setOnExitAnimationListener(provider ->
            provider.getView().animate().alpha(0f).scaleX(0.98f).scaleY(0.98f).setDuration(220).setInterpolator(new android.view.animation.DecelerateInterpolator()).withEndAction(provider::remove).start()
        );
        registerPlugin(FfmpegPlugin.class);
        registerPlugin(AuthCallbackPlugin.class);
        registerPlugin(MicPermissionPlugin.class);
        super.onCreate(savedInstanceState);

        // Keep Capacitor's safe native margins, but paint the exposed inset area like the app.
        int background = Color.rgb(10, 12, 16);
        // One inset owner: draw the native container behind system bars, then Capacitor margins
        // reserve content space. This avoids decor fitting plus WebView margins counting twice.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setBackgroundDrawable(new ColorDrawable(background));
        getWindow().getDecorView().setBackgroundColor(background);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
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
            // Capacitor's edge-to-edge listener reserves system bars only and consumes IME insets.
            // Include the keyboard in the same single margin owner, so every screen and native
            // HTML dialog receives a genuinely smaller WebView viewport while typing.
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
                Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
                ViewGroup.LayoutParams params = view.getLayoutParams();
                if (params instanceof ViewGroup.MarginLayoutParams) {
                    ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) params;
                    if (margins.leftMargin != insets.left || margins.topMargin != insets.top
                        || margins.rightMargin != insets.right || margins.bottomMargin != insets.bottom) {
                        margins.setMargins(insets.left, insets.top, insets.right, insets.bottom);
                        view.setLayoutParams(margins);
                    }
                }
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(webView);
        }
    }
}

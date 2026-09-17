package com.veasnawt.vcut;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FfmpegPlugin.class);
        registerPlugin(AuthCallbackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

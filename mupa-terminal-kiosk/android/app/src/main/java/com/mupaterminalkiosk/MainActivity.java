package com.mupaterminalkiosk;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import androidx.annotation.Nullable;

import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

public class MainActivity extends ReactActivity {
  @Override
  protected String getMainComponentName() {
    return "MupaTerminalKiosk";
  }

  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new DefaultReactActivityDelegate(
      this,
      getMainComponentName(),
      DefaultNewArchitectureEntryPoint.getFabricEnabled()
    );
  }

  @Override
  protected void onCreate(@Nullable Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setScreenSecure(true);
    applyImmersive();
  }

  @Override
  protected void onResume() {
    super.onResume();
    applyImmersive();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) applyImmersive();
  }

  @Override
  public void onBackPressed() {
    // Kiosk requirement: do nothing.
  }

  private void setScreenSecure(boolean enabled) {
    Window w = getWindow();
    if (enabled) {
      w.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    } else {
      w.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
  }

  private void applyImmersive() {
    Window window = getWindow();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      View decorView = window.getDecorView();
      WindowInsetsController controller = decorView.getWindowInsetsController();
      if (controller == null) return;
      controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
      controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      return;
    }

    View decorView = window.getDecorView();
    int flags =
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION;
    decorView.setSystemUiVisibility(flags);

    decorView.setOnSystemUiVisibilityChangeListener((visibility) -> {
      if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
        decorView.setSystemUiVisibility(flags);
      }
    });
  }
}

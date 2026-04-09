package com.mupaterminalkiosk.kiosk;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;

public class KioskModule extends ReactContextBaseJavaModule {
  private ComponentName getAdminReceiver() {
    return new ComponentName(getReactApplicationContext(), KioskDeviceAdminReceiver.class);
  }

  private @Nullable DevicePolicyManager getDpm(@NonNull Activity activity) {
    return (DevicePolicyManager) activity.getSystemService(Context.DEVICE_POLICY_SERVICE);
  }

  private boolean isDeviceOwner(@NonNull Activity activity) {
    DevicePolicyManager dpm = getDpm(activity);
    if (dpm == null) return false;
    return dpm.isDeviceOwnerApp(activity.getPackageName());
  }

  public KioskModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return "KioskModule";
  }

  @ReactMethod
  public void enterLockTask(Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      Activity activity = getCurrentActivity();
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current Activity");
        return;
      }
      try {
        activity.startLockTask();
        promise.resolve(null);
      } catch (Throwable t) {
        promise.reject("LOCK_TASK_FAILED", t);
      }
    });
  }

  @ReactMethod
  public void exitLockTask(Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      Activity activity = getCurrentActivity();
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current Activity");
        return;
      }
      try {
        activity.stopLockTask();
        promise.resolve(null);
      } catch (Throwable t) {
        promise.reject("UNLOCK_TASK_FAILED", t);
      }
    });
  }

  @ReactMethod
  public void isInLockTaskMode(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.resolve(false);
      return;
    }
    ActivityManager am = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
    if (am == null) {
      promise.resolve(false);
      return;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      int state = am.getLockTaskModeState();
      promise.resolve(state != ActivityManager.LOCK_TASK_MODE_NONE);
      return;
    }
    promise.resolve(false);
  }

  @ReactMethod
  public void isDeviceOwnerApp(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.resolve(false);
      return;
    }
    promise.resolve(isDeviceOwner(activity));
  }

  @ReactMethod
  public void applyDeviceOwnerPolicies(Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      Activity activity = getCurrentActivity();
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current Activity");
        return;
      }
      if (!isDeviceOwner(activity)) {
        promise.resolve(false);
        return;
      }

      DevicePolicyManager dpm = getDpm(activity);
      if (dpm == null) {
        promise.resolve(false);
        return;
      }

      try {
        ComponentName admin = getAdminReceiver();
        String pkg = activity.getPackageName();
        dpm.setLockTaskPackages(admin, new String[] { pkg });
        dpm.setStatusBarDisabled(admin, true);
        dpm.setKeyguardDisabled(admin, true);
        promise.resolve(true);
      } catch (Throwable t) {
        promise.reject("DPM_FAILED", t);
      }
    });
  }

  @ReactMethod
  public void clearDeviceOwnerPolicies(Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      Activity activity = getCurrentActivity();
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current Activity");
        return;
      }
      if (!isDeviceOwner(activity)) {
        promise.resolve(false);
        return;
      }

      DevicePolicyManager dpm = getDpm(activity);
      if (dpm == null) {
        promise.resolve(false);
        return;
      }

      try {
        ComponentName admin = getAdminReceiver();
        dpm.setStatusBarDisabled(admin, false);
        dpm.setKeyguardDisabled(admin, false);
        dpm.setLockTaskPackages(admin, new String[] {});
        promise.resolve(true);
      } catch (Throwable t) {
        promise.reject("DPM_CLEAR_FAILED", t);
      }
    });
  }

  @ReactMethod
  public void setScreenSecure(boolean enabled, Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      Activity activity = getCurrentActivity();
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current Activity");
        return;
      }
      try {
        Window w = activity.getWindow();
        if (enabled) w.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else w.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        promise.resolve(null);
      } catch (Throwable t) {
        promise.reject("SCREEN_SECURE_FAILED", t);
      }
    });
  }

  @ReactMethod
  public void setImmersive(boolean enabled, Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      Activity activity = getCurrentActivity();
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current Activity");
        return;
      }
      try {
        if (!enabled) {
          showSystemBars(activity);
          promise.resolve(null);
          return;
        }
        hideSystemBars(activity);
        promise.resolve(null);
      } catch (Throwable t) {
        promise.reject("IMMERSIVE_FAILED", t);
      }
    });
  }

  private void hideSystemBars(@NonNull Activity activity) {
    Window window = activity.getWindow();
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
  }

  private void showSystemBars(@NonNull Activity activity) {
    Window window = activity.getWindow();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      View decorView = window.getDecorView();
      WindowInsetsController controller = decorView.getWindowInsetsController();
      if (controller == null) return;
      controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
      return;
    }

    View decorView = window.getDecorView();
    decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }
}

# ProGuard rules for PBX Mobile

# Keep Capacitor classes
-keep class com.getcapacitor.** { *; }

# Keep app classes except security (let it be heavily obfuscated)
-keep class com.pbxmobile.app.MainActivity { *; }
-keep class com.pbxmobile.app.PbxMobilePlugin { *; }
-keep class com.pbxmobile.app.QRScannerPlugin { *; }

# AppProtection - keep class name but obfuscate internals
-keepclassmembers class com.pbxmobile.app.AppProtection {
    public static *** performSecurityChecks(***);
    public static *** takeDefensiveAction(***);
}

# IMPORTANT: Keep DECOY classes to confuse reverse engineers
# These classes are fake but must remain in the APK
-keep class com.pbxmobile.app.ApiManager { *; }
-keep class com.pbxmobile.app.DatabaseHelper { *; }
-keep class com.pbxmobile.app.ConfigManager { *; }
-keep class com.pbxmobile.app.CryptoUtils { *; }
-keep class com.pbxmobile.app.AnalyticsTracker { *; }
-keep class com.pbxmobile.app.Ⅰ0O { *; }
-keep class com.pbxmobile.app.O0OI { *; }
-keep class com.pbxmobile.app.lI1O { *; }

# String obfuscator - keep methods but obfuscate names
-keepclassmembers class com.pbxmobile.app.** {
    *** ıl1(***);
    *** l1I(***);
}

# Keep JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep annotations
-keepattributes *Annotation*
-keepattributes Signature

# REMOVE SourceFile and LineNumberTable for better obfuscation
# -keepattributes SourceFile,LineNumberTable

# Keep R8 from removing reflection-based code
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Keep ML Kit Barcode Scanner
-keep class com.google.mlkit.** { *; }

# Keep CameraX
-keep class androidx.camera.** { *; }

# Keep Telecom classes
-keep class android.telecom.** { *; }

# Don't warn about missing classes
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn javax.crypto.**

# Optimization flags for better obfuscation
-optimizationpasses 5
-allowaccessmodification
-repackageclasses ''

# Flatten package hierarchy for more confusion
-flattenpackagehierarchy ''

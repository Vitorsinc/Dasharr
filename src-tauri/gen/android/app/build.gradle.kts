import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// CI compila «Dasharr Dev» (DASHARR_ANDROID_DEV=1): otro identificador y nombre, así que se instala junto a
// Dasharr, como en Windows. La firma sale de DASHARR_KEYSTORE* (un secreto del repositorio); sin ella, la
// APK de release no se firma y CI usa la de depuración.
val devBuild = System.getenv("DASHARR_ANDROID_DEV") == "1"
val keystorePath: String? = System.getenv("DASHARR_KEYSTORE")?.takeIf { it.isNotBlank() }

android {
    signingConfigs {
        if (keystorePath != null) {
            create("dasharr") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("DASHARR_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("DASHARR_KEY_ALIAS")
                keyPassword = System.getenv("DASHARR_KEY_PASSWORD")
            }
        }
    }
    compileSdk = 37
    namespace = "com.vitorsinc.dasharr"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = if (devBuild) "com.vitorsinc.dasharr.dev" else "com.vitorsinc.dasharr"
        manifestPlaceholders["appLabel"] = if (devBuild) "Dasharr Dev" else "Dasharr"
        minSdk = 24
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (keystorePath != null) {
                signingConfig = signingConfigs.getByName("dasharr")
            }
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))

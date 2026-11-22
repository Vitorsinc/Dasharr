package com.vitorsinc.dasharr

import android.app.Activity
import androidx.activity.result.ActivityResult
import androidx.activity.result.IntentSenderRequest
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope

@InvokeArg
class AuthorizeArgs {
  /** false: solo si ya se dio permiso (renovar sin enseñar nada). */
  var interactive: Boolean = false
}

/**
 * Permiso de Google dentro de la app (la hoja de cuentas de Google de Android, sin navegador): devuelve un
 * token de acceso a la carpeta privada de Dasharr en Drive. Google reconoce la app por su nombre de paquete
 * y su firma (los clientes «Android» del proyecto de Google Cloud).
 */
@TauriPlugin
class GoogleAuthPlugin(private val activity: Activity) : Plugin(activity) {
  private val scopes = listOf(
    Scope("https://www.googleapis.com/auth/drive.appdata"),
    Scope("email"),
  )

  @Command
  fun authorize(invoke: Invoke) {
    val args = invoke.parseArgs(AuthorizeArgs::class.java)
    val request = AuthorizationRequest.builder().setRequestedScopes(scopes).build()
    Identity.getAuthorizationClient(activity)
      .authorize(request)
      .addOnSuccessListener { result ->
        val pending = result.pendingIntent
        if (result.hasResolution() && pending != null) {
          if (!args.interactive) {
            invoke.reject("Google pide volver a dar permiso.", "needs_consent")
            return@addOnSuccessListener
          }
          startIntentSenderForResult(invoke, IntentSenderRequest.Builder(pending.intentSender).build(), "onAuthorized")
        } else {
          resolve(invoke, result)
        }
      }
      .addOnFailureListener { e -> invoke.reject(e.message ?: "Google no ha respondido", "failed", e) }
  }

  @ActivityCallback
  fun onAuthorized(invoke: Invoke, result: ActivityResult) {
    if (result.resultCode != Activity.RESULT_OK) {
      invoke.reject("Has cancelado el inicio de sesión.", "cancelled")
      return
    }
    try {
      resolve(invoke, Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(result.data))
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Google no ha respondido", "failed", e)
    }
  }

  private fun resolve(invoke: Invoke, result: AuthorizationResult) {
    val token = result.accessToken
    if (token.isNullOrEmpty()) {
      invoke.reject("Google no ha devuelto permiso.", "failed")
      return
    }
    val out = JSObject()
    out.put("accessToken", token)
    invoke.resolve(out)
  }
}

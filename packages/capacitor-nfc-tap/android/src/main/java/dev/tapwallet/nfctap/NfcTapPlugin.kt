package dev.tapwallet.nfctap

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.TagLostException
import android.nfc.cardemulation.CardEmulation
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream

@CapacitorPlugin(name = "NfcTap")
class NfcTapPlugin : Plugin() {
    private val adapter: NfcAdapter? by lazy { NfcAdapter.getDefaultAdapter(context) }
    private var reading = false
    private var serving = false

    private val hceComponent by lazy { ComponentName(context, TapApduService::class.java) }

    override fun load() {
        TapApduService.onServed = {
            beep()
            notifyListeners("tapServed", JSObject().put("at", System.currentTimeMillis()))
        }
    }

    // ---------- status ----------

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val a = adapter
        val status = when {
            a == null -> "unsupported"
            !a.isEnabled -> "disabled"
            else -> "enabled"
        }
        val hce = context.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
        call.resolve(JSObject().put("status", status).put("hce", hce))
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            activity.startActivity(Intent(Settings.ACTION_NFC_SETTINGS))
        } catch (e: Exception) {
            activity.startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS))
        }
        call.resolve()
    }

    // ---------- receiver (HCE) ----------

    @PluginMethod
    fun setPayload(call: PluginCall) {
        val payload = call.getString("payload")
        if (payload.isNullOrEmpty()) return call.reject("payload is required")
        val bytes = payload.toByteArray(Charsets.UTF_8)
        if (bytes.size > ApduProtocol.MAX_PAYLOAD) return call.reject("payload too large")
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)) {
            return call.reject("This phone can't be tapped (no NFC card emulation)", "HCE_UNSUPPORTED")
        }
        TapApduService.payload = bytes
        serving = true
        activity.runOnUiThread { preferService(true) }
        call.resolve()
    }

    @PluginMethod
    fun clearPayload(call: PluginCall) {
        TapApduService.payload = null
        serving = false
        activity.runOnUiThread { preferService(false) }
        call.resolve()
    }

    private fun preferService(on: Boolean) {
        val a = adapter ?: return
        try {
            val ce = CardEmulation.getInstance(a)
            if (on) ce.setPreferredService(activity, hceComponent) else ce.unsetPreferredService(activity)
        } catch (_: Exception) {
            // Not fatal: the AID is proprietary, so our service is usually picked anyway.
        }
    }

    // ---------- sender (reader) ----------

    @PluginMethod
    fun startReading(call: PluginCall) {
        val a = adapter ?: return call.reject("This phone has no NFC", "NFC_UNSUPPORTED")
        if (!a.isEnabled) return call.reject("NFC is turned off", "NFC_DISABLED")
        reading = true
        activity.runOnUiThread { enableReader() }
        call.resolve()
    }

    @PluginMethod
    fun stopReading(call: PluginCall) {
        reading = false
        activity.runOnUiThread { disableReader() }
        call.resolve()
    }

    private fun enableReader() {
        val a = adapter ?: return
        val flags = NfcAdapter.FLAG_READER_NFC_A or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
            NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS
        val extras = Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250) }
        try {
            a.enableReaderMode(activity, { tag -> onTag(tag) }, flags, extras)
        } catch (e: Exception) {
            emitError("READ_FAILED", "Couldn't start NFC reader: ${e.message}")
        }
    }

    private fun disableReader() {
        try {
            adapter?.disableReaderMode(activity)
        } catch (_: Exception) {
        }
    }

    /** Runs on an NFC binder thread. */
    private fun onTag(tag: Tag) {
        if (!reading) return
        val iso = IsoDep.get(tag)
        if (iso == null) {
            emitError("WRONG_APP", "That isn't a Tap phone. Open Receive on the other phone.")
            return
        }
        try {
            iso.connect()
            iso.timeout = 3000
            val out = ByteArrayOutputStream()
            var resp = iso.transceive(ApduProtocol.selectApdu())
            var index = 0
            while (true) {
                when (ApduProtocol.sw(resp)) {
                    0x9000 -> {}
                    0x6985 -> return emitError("WRONG_APP", "The other phone isn't on the Receive screen yet.")
                    0x6A82 -> return emitError("WRONG_APP", "The other phone doesn't have Tap open on Receive.")
                    else -> return emitError("READ_FAILED", "Unexpected reply from the other phone. Try again.")
                }
                if (resp.size < 3) return emitError("READ_FAILED", "Empty reply. Try again.")
                out.write(resp, 1, resp.size - 3)
                if (out.size() > ApduProtocol.MAX_PAYLOAD) return emitError("READ_FAILED", "Reply too large.")
                if (resp[0] == 0x00.toByte()) break
                index += 1
                if (index > ApduProtocol.MAX_PAYLOAD / ApduProtocol.CHUNK + 1) {
                    return emitError("READ_FAILED", "Too many chunks.")
                }
                resp = iso.transceive(ApduProtocol.getNextApdu(index))
            }
            reading = false
            activity.runOnUiThread { disableReader() }
            beep()
            notifyListeners("payloadRead", JSObject().put("payload", out.toString(Charsets.UTF_8.name())))
        } catch (e: TagLostException) {
            emitError("TAG_LOST", "Lost the connection. Hold the phones still, back to back.")
        } catch (e: Exception) {
            emitError("READ_FAILED", "Couldn't read the other phone. Hold still and try again.")
        } finally {
            try {
                iso.close()
            } catch (_: Exception) {
            }
        }
    }

    private fun emitError(code: String, message: String) {
        notifyListeners("readError", JSObject().put("code", code).put("message", message))
    }

    private fun beep() {
        try {
            val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80)
            tg.startTone(ToneGenerator.TONE_PROP_ACK, 150)
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ tg.release() }, 300)
        } catch (_: Exception) {
        }
    }

    // ---------- lifecycle: reader mode and preferred service only while in the foreground ----------

    override fun handleOnResume() {
        super.handleOnResume()
        if (reading) enableReader()
        if (serving) preferService(true)
    }

    override fun handleOnPause() {
        super.handleOnPause()
        if (reading) disableReader()
        if (serving) preferService(false)
    }

    override fun handleOnDestroy() {
        TapApduService.payload = null
        TapApduService.onServed = null
        super.handleOnDestroy()
    }
}

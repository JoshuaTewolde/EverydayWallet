package dev.tapwallet.nfctap

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

/** HCE "card": serves the current tap payload to a reader phone. */
class TapApduService : HostApduService() {
    companion object {
        /** Set from JS via NfcTapPlugin.setPayload; null = not on the Receive screen. */
        @Volatile var payload: ByteArray? = null
        /** Called (on a binder thread) when a reader fetched the last chunk. */
        @Volatile var onServed: (() -> Unit)? = null
    }

    // Snapshot per reader session so a payload change mid-read can't mix two payloads.
    private var session: ByteArray? = null

    override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
        val cmd = commandApdu ?: return ApduProtocol.SW_UNKNOWN
        if (ApduProtocol.isSelect(cmd)) session = payload
        val result = ApduProtocol.handle(cmd, session)
        if (result.completed) {
            session = null
            onServed?.invoke()
        }
        return result.response
    }

    override fun onDeactivated(reason: Int) {
        session = null
    }
}

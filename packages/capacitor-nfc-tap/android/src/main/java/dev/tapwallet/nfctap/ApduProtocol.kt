package dev.tapwallet.nfctap

/**
 * Tiny APDU protocol between two Tap phones. Pure logic, no Android deps (unit-testable).
 *
 * Reader -> card:
 *   SELECT AID:  00 A4 04 00 Lc <AID> 00     -> chunk 0
 *   GET NEXT:    80 01 P1 P2 00              -> chunk (P1<<8 | P2)
 * Card -> reader, each data response:
 *   [more: 1 byte, 0x01 = more chunks follow, 0x00 = last] [up to CHUNK bytes of UTF-8 JSON] 90 00
 * Errors:
 *   6A 82  unknown command / wrong AID
 *   69 85  app present but not on the Receive screen (no payload set)
 *   6A 86  bad chunk index
 */
object ApduProtocol {
    val AID: ByteArray = hex("F0544150574C5401")
    const val CHUNK = 240
    const val MAX_PAYLOAD = 4096

    val SW_OK = byteArrayOf(0x90.toByte(), 0x00)
    val SW_UNKNOWN = byteArrayOf(0x6A, 0x82.toByte())
    val SW_NOT_READY = byteArrayOf(0x69, 0x85.toByte())
    val SW_BAD_INDEX = byteArrayOf(0x6A, 0x86.toByte())

    fun selectApdu(): ByteArray =
        byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, AID.size.toByte()) + AID + byteArrayOf(0x00)

    fun getNextApdu(index: Int): ByteArray =
        byteArrayOf(0x80.toByte(), 0x01, (index shr 8).toByte(), (index and 0xFF).toByte(), 0x00)

    fun isSelect(cmd: ByteArray): Boolean {
        if (cmd.size < 5 + AID.size) return false
        if (cmd[0] != 0x00.toByte() || cmd[1] != 0xA4.toByte() || cmd[2] != 0x04.toByte()) return false
        val lc = cmd[4].toInt() and 0xFF
        if (lc != AID.size) return false
        return cmd.copyOfRange(5, 5 + lc).contentEquals(AID)
    }

    fun isGetNext(cmd: ByteArray): Boolean =
        cmd.size >= 4 && cmd[0] == 0x80.toByte() && cmd[1] == 0x01.toByte()

    fun chunkCount(payload: ByteArray): Int = maxOf(1, (payload.size + CHUNK - 1) / CHUNK)

    fun chunk(payload: ByteArray, index: Int): ByteArray? {
        val n = chunkCount(payload)
        if (index < 0 || index >= n) return null
        val from = index * CHUNK
        val to = minOf(payload.size, from + CHUNK)
        val more: Byte = if (index < n - 1) 0x01 else 0x00
        return byteArrayOf(more) + payload.copyOfRange(from, to) + SW_OK
    }

    /** Card-side handler. Returns the response and whether this response completed a read. */
    data class Result(val response: ByteArray, val completed: Boolean)

    fun handle(cmd: ByteArray, payload: ByteArray?): Result {
        val index = when {
            isSelect(cmd) -> 0
            isGetNext(cmd) -> ((cmd[2].toInt() and 0xFF) shl 8) or (cmd[3].toInt() and 0xFF)
            else -> return Result(SW_UNKNOWN, false)
        }
        if (payload == null) return Result(SW_NOT_READY, false)
        val resp = chunk(payload, index) ?: return Result(SW_BAD_INDEX, false)
        return Result(resp, index == chunkCount(payload) - 1)
    }

    /** Status word of a response. */
    fun sw(resp: ByteArray): Int =
        if (resp.size < 2) -1
        else ((resp[resp.size - 2].toInt() and 0xFF) shl 8) or (resp[resp.size - 1].toInt() and 0xFF)

    fun hex(s: String): ByteArray = ByteArray(s.length / 2) { i ->
        s.substring(i * 2, i * 2 + 2).toInt(16).toByte()
    }
}

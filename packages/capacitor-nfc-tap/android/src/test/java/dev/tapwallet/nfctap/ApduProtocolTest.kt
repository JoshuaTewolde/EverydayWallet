package dev.tapwallet.nfctap

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApduProtocolTest {
    private fun read(payload: ByteArray): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        var r = ApduProtocol.handle(ApduProtocol.selectApdu(), payload)
        var i = 0
        while (true) {
            assertEquals(0x9000, ApduProtocol.sw(r.response))
            out.write(r.response, 1, r.response.size - 3)
            if (r.response[0] == 0.toByte()) {
                assertTrue(r.completed)
                break
            }
            assertFalse(r.completed)
            i++
            r = ApduProtocol.handle(ApduProtocol.getNextApdu(i), payload)
        }
        return out.toByteArray()
    }

    @Test fun smallPayloadSingleChunk() {
        val p = "{\"v\":1}".toByteArray()
        assertArrayEquals(p, read(p))
    }

    @Test fun largePayloadIsChunkedAndReassembled() {
        val p = ByteArray(1000) { (it % 251).toByte() }
        assertEquals(5, ApduProtocol.chunkCount(p))
        assertArrayEquals(p, read(p))
    }

    @Test fun exactChunkBoundary() {
        val p = ByteArray(ApduProtocol.CHUNK * 2) { 7 }
        assertArrayEquals(p, read(p))
    }

    @Test fun unknownCommand() {
        val r = ApduProtocol.handle(byteArrayOf(0x00, 0xB0.toByte(), 0, 0, 0), "x".toByteArray())
        assertEquals(0x6A82, ApduProtocol.sw(r.response))
    }

    @Test fun wrongAid() {
        val cmd = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, 0x07, 1, 2, 3, 4, 5, 6, 7, 0)
        assertEquals(0x6A82, ApduProtocol.sw(ApduProtocol.handle(cmd, "x".toByteArray()).response))
    }

    @Test fun notReadyWithoutPayload() {
        assertEquals(0x6985, ApduProtocol.sw(ApduProtocol.handle(ApduProtocol.selectApdu(), null).response))
    }

    @Test fun badChunkIndex() {
        val r = ApduProtocol.handle(ApduProtocol.getNextApdu(9), "x".toByteArray())
        assertEquals(0x6A86, ApduProtocol.sw(r.response))
    }
}

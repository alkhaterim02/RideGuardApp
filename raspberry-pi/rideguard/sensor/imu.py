"""IMU interface + MPU-6050 driver + clearly-labelled simulated IMU."""
from __future__ import annotations
import time
from typing import Iterable, Iterator, Optional, Protocol
from rideguard.detection.detector import Sample

# --- MPU-6050 registers (from the public InvenSense register map) ---
REG_SMPLRT_DIV, REG_CONFIG = 0x19, 0x1A
REG_GYRO_CONFIG, REG_ACCEL_CONFIG = 0x1B, 0x1C
REG_ACCEL_XOUT_H, REG_PWR_MGMT_1, REG_WHO_AM_I = 0x3B, 0x6B, 0x75
ACCEL_FS_16G, GYRO_FS_2000 = 0x18, 0x18          # FS_SEL = 3
ACCEL_LSB_PER_G = 2048.0                          # +/-16 g
GYRO_LSB_PER_DPS = 16.4                           # +/-2000 dps
VALID_WHO_AM_I = {0x68, 0x70, 0x72}               # genuine + common clones


class ImuError(Exception):
    pass


class Imu(Protocol):
    simulated: bool
    def read(self) -> Sample: ...


def to_signed16(high: int, low: int) -> int:
    v = (high << 8) | low
    return v - 65536 if v >= 0x8000 else v       # >= (the reviewed repo used '>' and kept 0x8000 positive)


def decode_burst(b: list, t: float) -> Sample:
    """Decode the 14-byte burst starting at ACCEL_XOUT_H (accel, temp, gyro)."""
    if len(b) != 14:
        raise ImuError(f"expected 14 bytes, got {len(b)}")
    r = lambda i: to_signed16(b[i], b[i + 1])
    return Sample(t, r(0) / ACCEL_LSB_PER_G, r(2) / ACCEL_LSB_PER_G, r(4) / ACCEL_LSB_PER_G,
                  r(8) / GYRO_LSB_PER_DPS, r(10) / GYRO_LSB_PER_DPS, r(12) / GYRO_LSB_PER_DPS)


class Mpu6050:
    """Real sensor. `bus` is an smbus2/smbus SMBus (or a test double)."""
    simulated = False

    def __init__(self, bus, address: int = 0x68, clock=time.monotonic):
        self.bus, self.addr, self._clock = bus, address, clock

    def init(self) -> None:
        who = self.bus.read_byte_data(self.addr, REG_WHO_AM_I)
        if who not in VALID_WHO_AM_I:
            raise ImuError(f"unexpected WHO_AM_I 0x{who:02x}")
        w = self.bus.write_byte_data
        w(self.addr, REG_PWR_MGMT_1, 0x01)        # wake, PLL with X gyro
        w(self.addr, REG_SMPLRT_DIV, 4)           # 1 kHz / 5 = 200 Hz (DLPF on)
        w(self.addr, REG_CONFIG, 0x03)            # DLPF ~44 Hz
        w(self.addr, REG_ACCEL_CONFIG, ACCEL_FS_16G)   # crash forces exceed the default +/-2 g
        w(self.addr, REG_GYRO_CONFIG, GYRO_FS_2000)

    def read(self) -> Sample:
        try:
            raw = self.bus.read_i2c_block_data(self.addr, REG_ACCEL_XOUT_H, 14)
        except OSError as e:
            raise ImuError(f"I2C read failed: {e}") from e
        return decode_burst(list(raw), self._clock())


class SimulatedImu:
    """DEMO ONLY: replays scripted samples. Never present its output as live hardware."""
    simulated = True

    def __init__(self, samples: Iterable[Sample]):
        self._it: Iterator[Sample] = iter(samples)

    def read(self) -> Sample:
        try:
            return next(self._it)
        except StopIteration:
            raise ImuError("simulated IMU script exhausted")

import pytest
from rideguard.sensor.imu import (Mpu6050, SimulatedImu, ImuError, decode_burst, to_signed16,
                                  REG_ACCEL_CONFIG, REG_GYRO_CONFIG, ACCEL_FS_16G)
from rideguard.detection.detector import Sample


def burst(ax=0, ay=0, az=0, gx=0, gy=0, gz=0):
    out = []
    for v in (ax, ay, az, 0, gx, gy, gz):
        out += [(v >> 8) & 0xFF, v & 0xFF]
    return out


class Bus:
    def __init__(self, who=0x68, data=None): self.who, self.data, self.w = who, data, {}
    def read_byte_data(self, a, r): return self.who
    def write_byte_data(self, a, r, v): self.w[r] = v
    def read_i2c_block_data(self, a, r, n):
        if self.data is None: raise OSError("nack")
        return self.data


def test_sign_conversion_boundary():
    assert to_signed16(0x80, 0x00) == -32768       # the reviewed repo's '>' rule left this at +32768
    assert to_signed16(0x7F, 0xFF) == 32767
    assert to_signed16(0xFF, 0xFF) == -1


def test_scaling_16g_and_2000dps():
    s = decode_burst([*burst(az=2048, gx=164, ax=-4096)], 1.0)
    assert s.az == pytest.approx(1.0) and s.ax == pytest.approx(-2.0) and s.gx == pytest.approx(10.0)


def test_init_configures_wide_ranges():
    b = Bus(data=burst(az=2048)); Mpu6050(b).init()
    assert b.w[REG_ACCEL_CONFIG] == ACCEL_FS_16G and b.w[REG_GYRO_CONFIG] == 0x18


def test_init_rejects_wrong_device():
    with pytest.raises(ImuError):
        Mpu6050(Bus(who=0x00)).init()


def test_read_wraps_i2c_error():
    with pytest.raises(ImuError):
        Mpu6050(Bus(data=None)).read()


def test_bad_burst_length():
    with pytest.raises(ImuError):
        decode_burst([0] * 5, 0)


def test_simulated_imu_is_flagged_and_exhausts():
    imu = SimulatedImu([Sample(0, 0, 0, 1, 0, 0, 0)])
    assert imu.simulated is True and not Mpu6050(Bus()).simulated
    imu.read()
    with pytest.raises(ImuError):
        imu.read()

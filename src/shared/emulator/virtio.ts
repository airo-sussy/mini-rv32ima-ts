import Device from "./abstract/device";
import { VIRTIO_BASE } from "./bus";

/// The interrupt request of virtio.
export const VIRTIO_IRQ: number = 1;

export const VRING_DESC_SIZE: number = 16;
/// The number of virtio descriptors. It must be a power of two.
export const DESC_NUM: number = 8;

/// Always return 0x74726976.
export const VIRTIO_MAGIC: number = VIRTIO_BASE + 0x000;
/// The version. 1 is legacy.
export const VIRTIO_VERSION: number = VIRTIO_BASE + 0x004;
/// device type; 1 is net, 2 is disk.
export const VIRTIO_DEVICE_ID: number = VIRTIO_BASE + 0x008;
/// Always return 0x554d4551
export const VIRTIO_VENDOR_ID: number = VIRTIO_BASE + 0x00c;
/// Device features.
export const VIRTIO_DEVICE_FEATURES: number = VIRTIO_BASE + 0x010;
/// Driver features.
export const VIRTIO_DRIVER_FEATURES: number = VIRTIO_BASE + 0x020;
/// Page size for PFN, write-only.
export const VIRTIO_GUEST_PAGE_SIZE: number = VIRTIO_BASE + 0x028;
/// Select queue, write-only.
export const VIRTIO_QUEUE_SEL: number = VIRTIO_BASE + 0x030;
/// Max size of current queue, read-only. In QEMU, `VIRTIO_COUNT = 8`.
export const VIRTIO_QUEUE_NUM_MAX: number = VIRTIO_BASE + 0x034;
/// Size of current queue, write-only.
export const VIRTIO_QUEUE_NUM: number = VIRTIO_BASE + 0x038;
/// Physical page number for queue, read and write.
export const VIRTIO_QUEUE_PFN: number = VIRTIO_BASE + 0x040;
/// Notify the queue number, write-only.
export const VIRTIO_QUEUE_NOTIFY: number = VIRTIO_BASE + 0x050;
/// Device status, read and write. Reading from this register returns the current device status flags.
/// Writing non-zero values to this register sets the status flags, indicating the OS/driver
/// progress. Writing zero (0x0) to this register triggers a device reset.
export const VIRTIO_STATUS: number = VIRTIO_BASE + 0x070;

/// Paravirtualized drivers for IO virtualization.
export default class Virtio extends Device {
	private id: number = 0;
	private driver_features: number = 0;
	private page_size: number = 0;
	private queue_sel: number = 0;
	private queue_num: number = 0;
	private queue_pfn: number = 0;
	private queue_notify: number = 9999;
	private status: number = 0;
	private disk: buffer;

	public constructor(diskImage: buffer) {
		super();
		this.disk = diskImage;
	}

	public isInterrupting(): boolean {
		if (this.queue_notify !== 9999) {
			this.queue_notify = 9999;
			return true;
		} else {
			return false;
		}
	}

	/// Load 4 bytes from virtio only if the addr is valid. Otherwise, return 0.
	public load32(address: number): number {
		switch (address) {
			case VIRTIO_MAGIC:
				return 0x74726976;
			case VIRTIO_VERSION:
				return 0x1;
			case VIRTIO_DEVICE_ID:
				return 0x2;
			case VIRTIO_VENDOR_ID:
				return 0x554d4551;
			case VIRTIO_DEVICE_FEATURES:
				return 0;
			case VIRTIO_DRIVER_FEATURES:
				return this.driver_features;
			case VIRTIO_QUEUE_NUM_MAX:
				return 8;
			case VIRTIO_QUEUE_PFN:
				return this.queue_pfn;
			case VIRTIO_STATUS:
				return this.status;
			default:
				return 0;
		}
	}

	/// Store 4 bytes to virtio only if the addr is valid. Otherwise, does nothing.
	public store32(address: number, value: number) {
		switch (address) {
			case VIRTIO_DEVICE_FEATURES:
				this.driver_features = value;
			case VIRTIO_GUEST_PAGE_SIZE:
				this.page_size = value;
			case VIRTIO_QUEUE_SEL:
				this.queue_sel = value;
			case VIRTIO_QUEUE_NUM:
				this.queue_num = value;
			case VIRTIO_QUEUE_PFN:
				this.queue_pfn = value;
			case VIRTIO_QUEUE_NOTIFY:
				this.queue_notify = value;
			case VIRTIO_STATUS:
				this.status = value;
			default:
				break;
		}
	}

	public load(address: number, size: number): number {
		if (size === 32) {
			return this.load32(address);
		} else {
			throw new LoadAccessFault();
		}
	}

	public store(address: number, size: number, value: number): void {
		if (size === 32) {
			this.store32(address, value);
		} else {
			throw new StoreAMOAccessFault();
		}
	}

	public get_new_id(): number {
		// TODO: Fix this, it should be a "wrapping" add.
		this.id = this.id + 1;
		return this.id;
	}

	public desc_addr(): number {
		return this.queue_pfn * this.page_size;
	}

	public read_disk(address: number): number {
		return buffer.readu8(this.disk, address);
	}

	public write_disk(address: number, value: number) {
		buffer.writeu8(this.disk, address, value);
	}

	// disk_access in cpu.ts
}

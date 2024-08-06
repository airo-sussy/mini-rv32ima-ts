/// The address which the core-local interruptor (CLINT) starts. It contains the timer and
/// generates per-hart software interrupts and timer

import Clint from "./clint";
import Device from "./abstract/device";
import Plic from "./plic";
import Uart from "./uart";
import Virtio from "./virtio";
import Dram from "./dram";
import { LoadAccessFault, StoreAMOAccessFault } from "./trap";

/// The address which the core-local interruptor (CLINT) starts. It contains the timer and
/// generates per-hart software interrupts and timer
/// interrupts.
export const CLINT_BASE: number = 0x200_0000;
/// The size of CLINT.
export const CLINT_SIZE: number = 0x10000;

/// The address which the platform-level interrupt controller (PLIC) starts. The PLIC connects all external interrupts in the
/// system to all hart contexts in the system, via the external interrupt source in each hart.
export const PLIC_BASE: number = 0xc00_0000;
/// The size of PLIC.
export const PLIC_SIZE: number = 0x4000000;

/// The address which UART starts, same as QEMU virt machine.
export const UART_BASE: number = 0x1000_0000;
/// The size of UART.
export const UART_SIZE: number = 0x100;

/// The address which virtio starts.
export const VIRTIO_BASE: number = 0x1000_1000;
/// The size of virtio.
export const VIRTIO_SIZE: number = 0x1000;

/// The address which dram starts, same as QEMU virt machine.
export const DRAM_BASE: number = 0x8000_0000;

/// The system bus.
export default class Bus extends Device {
	public clint: Clint;
	public plic: Plic;
	public uart: Uart;
	public virtio: Virtio;
	public dram: Dram;

	public constructor(binary: buffer, diskImage: buffer) {
		super();

		this.clint = new Clint();
		this.plic = new Plic();
		// UART is non-functional until we implement a terminal
		this.uart = new Uart();
		this.virtio = new Virtio(diskImage);
		this.dram = new Dram(binary);
	}

	public load(address: number, size: number): number {
		if (CLINT_BASE <= address && address < CLINT_BASE + CLINT_SIZE) {
			return this.clint.load(address, size);
		}
		if (PLIC_BASE <= address && address < PLIC_BASE + PLIC_SIZE) {
			return this.plic.load(address, size);
		}
		if (UART_BASE <= address && address < UART_BASE + UART_SIZE) {
			return this.uart.load(address, size);
		}
		if (VIRTIO_BASE <= address && address < VIRTIO_BASE + VIRTIO_SIZE) {
			return this.virtio.load(address, size);
		}
		if (DRAM_BASE <= address) {
			return this.dram.load(address, size);
		}

		throw new LoadAccessFault();
	}

	public store(address: number, size: number, value: number): void {
		if (CLINT_BASE <= address && address < CLINT_BASE + CLINT_SIZE) {
			return this.clint.store(address, size, value);
		}
		if (PLIC_BASE <= address && address < PLIC_BASE + PLIC_SIZE) {
			return this.plic.store(address, size, value);
		}
		if (UART_BASE <= address && address < UART_BASE + UART_SIZE) {
			return this.uart.store(address, size, value);
		}
		if (VIRTIO_BASE <= address && address < VIRTIO_BASE + VIRTIO_SIZE) {
			return this.virtio.store(address, size, value);
		}
		if (DRAM_BASE <= address) {
			return this.dram.store(address, size, value);
		}
		throw new StoreAMOAccessFault();
	}
}

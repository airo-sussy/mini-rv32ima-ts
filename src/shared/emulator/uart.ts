//! The uart module contains the implementation of a universal asynchronous receiver-transmitter
//! (UART). The device is 16550a UART, which is used in the QEMU virt machine.
//! See the spec: http://byterunner.com/16550.html

import Device from "./abstract/device";
import { UART_BASE, UART_SIZE } from "./bus";
import { LoadAccessFault, StoreAMOAccessFault } from "./trap";

/// The interrupt request of UART.
export const UART_IRQ: number = 10;

/// Receive holding register (for input bytes).
export const UART_RHR: number = UART_BASE + 0;
/// Transmit holding register (for output bytes).
export const UART_THR: number = UART_BASE + 0;
/// Line control register.
export const UART_LCR: number = UART_BASE + 3;
/// Line status register.
/// LSR BIT 0:
///     0 = no data in receive holding register or FIFO.
///     1 = data has been receive and saved in the receive holding register or FIFO.
/// LSR BIT 5:
///     0 = transmit holding register is full. 16550 will not accept any data for transmission.
///     1 = transmitter hold register (or FIFO) is empty. CPU can load the next character.
export const UART_LSR: number = UART_BASE + 5;

/// The receiver (RX) bit.
export const UART_LSR_RX: number = 1;
/// The transmitter (TX) bit.
export const UART_LSR_TX: number = 1 << 5;

export default class Uart extends Device {
	/// Pair of an array for UART buffer and a conditional variable.
	private uart: buffer = buffer.create(1 * UART_SIZE); // u8 maps to a byte
	/// Bit if an interrupt happens.
	public interrupting: boolean = false;

	public constructor() {
		// TODO: Implement UART https://github.com/d0iasm/rvemu-for-book/blob/main/step10/src/uart.rs
		super();
	}

	public load(address: number, size: number): number {
		throw new LoadAccessFault();
	}

	public store(address: number, size: number, value: number): void {
		throw new StoreAMOAccessFault();
	}

	public isInterrupting() {
		const old = this.interrupting;
		this.interrupting = !this.interrupting;
		return old;
	}
}

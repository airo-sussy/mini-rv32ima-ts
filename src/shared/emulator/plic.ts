//! The plic module contains the platform-level interrupt controller (PLIC).
//! The plic connects all external interrupts in the system to all hart
//! contexts in the system, via the external interrupt source in each hart.
//! It's the global interrupt controller in a RISC-V system.

import { PLIC_BASE } from "./bus";
import Device from "./abstract/device";
import { LoadAccessFault, StoreAMOAccessFault } from "./trap";

/// The address of interrupt pending bits.
export const PLIC_PENDING: number = PLIC_BASE + 0x1000;
/// The address of the regsiters to enable interrupts for S-mode.
export const PLIC_SENABLE: number = PLIC_BASE + 0x2080;
/// The address of the registers to set a priority for S-mode.
export const PLIC_SPRIORITY: number = PLIC_BASE + 0x201000;
/// The address of the claim/complete registers for S-mode.
export const PLIC_SCLAIM: number = PLIC_BASE + 0x201004;

export default class Plic extends Device {
	public pending: number = 0;
	public senable: number = 0;
	public spriority: number = 0;
	public sclaim: number = 0;

	public constructor() {
		super();
	}

	public load32(address: number): number {
		switch (address) {
			case PLIC_PENDING:
				return this.pending;
			case PLIC_SENABLE:
				return this.senable;
			case PLIC_SPRIORITY:
				return this.spriority;
			case PLIC_SCLAIM:
				return this.sclaim;
			default:
				return 0;
		}
	}

	public store32(address: number, value: number) {
		switch (address) {
			case PLIC_PENDING:
				this.pending = value;
				break;
			case PLIC_SENABLE:
				this.senable = value;
				break;
			case PLIC_SPRIORITY:
				this.spriority = value;
				break;
			case PLIC_SCLAIM:
				this.sclaim = value;
				break;
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
}
